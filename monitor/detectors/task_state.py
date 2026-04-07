# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

from datetime import datetime
from typing import Any

from monitor.detectors.base import BaseDetector
from monitor.schemas.event import DetectionEvent
from monitor.schemas.observation import Observation


class TaskStateDetector(BaseDetector):
    """Tracks task lifecycle and repeated step stalls."""

    name = "task_state"

    def __init__(self, repeated_step_threshold: int = 4) -> None:
        self.repeated_step_threshold = repeated_step_threshold
        self.task_id: str | None = None
        self.started_at: datetime | None = None
        self.ended_at: datetime | None = None
        self.final_state = "unknown"
        self.latest_step: str | None = None
        self.last_progress_at: datetime | None = None
        self.step_transitions = 0
        self.current_step_repeats = 0
        self._repeat_alert_emitted = False

    def on_observation(self, observation: Observation) -> list[DetectionEvent]:
        events: list[DetectionEvent] = []
        self.task_id = observation.task_id
        if observation.kind == "task_start":
            self.started_at = observation.timestamp
            self.final_state = "running"
            self.latest_step = observation.step
            self.last_progress_at = observation.timestamp
            events.append(
                self._event(
                    observation,
                    code="task_started",
                    severity="info",
                    message=f"Task {observation.task_id} started.",
                    category="lifecycle",
                )
            )
            return events

        if observation.step and observation.step != self.latest_step:
            self.latest_step = observation.step
            self.step_transitions += 1
            self.current_step_repeats = 1
            self._repeat_alert_emitted = False
            self.last_progress_at = observation.timestamp
        elif observation.step:
            self.current_step_repeats += 1
            if (
                self.current_step_repeats >= self.repeated_step_threshold
                and not self._repeat_alert_emitted
            ):
                events.append(
                    self._event(
                        observation,
                        code="step_repetition",
                        severity="warning",
                        message=f"Step '{observation.step}' repeated {self.current_step_repeats} times without transition.",
                        category="workflow",
                        metadata={"repeat_count": self.current_step_repeats},
                    )
                )
                self._repeat_alert_emitted = True

        if observation.is_progress_signal():
            self.last_progress_at = observation.timestamp

        if observation.kind == "task_end":
            self.ended_at = observation.timestamp
            self.final_state = observation.status or "finished"
            severity = "info" if self.final_state == "succeeded" else "error"
            code = "task_finished" if self.final_state == "succeeded" else "task_failed"
            events.append(
                self._event(
                    observation,
                    code=code,
                    severity=severity,
                    message=f"Task ended with status '{self.final_state}'.",
                    category="lifecycle",
                    metadata={"status": self.final_state},
                )
            )
        return events

    def finalize(self) -> list[DetectionEvent]:
        if self.started_at and not self.ended_at:
            return [
                DetectionEvent(
                    task_id=self.task_id or "unknown",
                    timestamp=self.last_progress_at or self.started_at,
                    detector=self.name,
                    code="task_missing_end",
                    severity="error",
                    message="Task stream ended without an explicit task_end event.",
                    category="lifecycle",
                )
            ]
        return []

    def snapshot(self) -> dict[str, Any]:
        return {
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "final_state": self.final_state,
            "latest_step": self.latest_step,
            "step_transitions": self.step_transitions,
            "last_progress_at": self.last_progress_at.isoformat()
            if self.last_progress_at
            else None,
        }

    def _event(
        self,
        observation: Observation,
        *,
        code: str,
        severity: str,
        message: str,
        category: str,
        metadata: dict[str, Any] | None = None,
    ) -> DetectionEvent:
        return DetectionEvent(
            task_id=observation.task_id,
            timestamp=observation.timestamp,
            detector=self.name,
            code=code,
            severity=severity,
            message=message,
            category=category,
            observation_sequence=observation.sequence,
            metadata=metadata or {},
        )

