# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

from datetime import datetime
from typing import Any

from monitor.detectors.base import BaseDetector
from monitor.schemas.event import DetectionEvent
from monitor.schemas.observation import Observation


class TimeoutDetector(BaseDetector):
    """Detects stalls and total runtime overruns."""

    name = "timeout"

    def __init__(
        self,
        stall_timeout_seconds: int = 120,
        task_timeout_seconds: int = 300,
    ) -> None:
        self.stall_timeout_seconds = stall_timeout_seconds
        self.task_timeout_seconds = task_timeout_seconds
        self.task_id: str | None = None
        self.started_at: datetime | None = None
        self.last_activity_at: datetime | None = None
        self.last_progress_at: datetime | None = None
        self.ended_at: datetime | None = None
        self._stall_emitted = False
        self._task_timeout_emitted = False

    def on_observation(self, observation: Observation) -> list[DetectionEvent]:
        events: list[DetectionEvent] = []
        self.task_id = observation.task_id
        if self.started_at is None:
            self.started_at = observation.timestamp
        if self.last_progress_at is not None:
            stalled_for = (observation.timestamp - self.last_progress_at).total_seconds()
            if (
                stalled_for >= self.stall_timeout_seconds
                and not self._stall_emitted
                and observation.kind != "task_end"
            ):
                events.append(
                    DetectionEvent(
                        task_id=observation.task_id,
                        timestamp=observation.timestamp,
                        detector=self.name,
                        code="stall_detected",
                        severity="warning",
                        message=f"No meaningful progress for {int(stalled_for)} seconds.",
                        category="lifecycle",
                        observation_sequence=observation.sequence,
                        metadata={"stalled_for_seconds": stalled_for},
                    )
                )
                self._stall_emitted = True
        if self.started_at is not None:
            runtime = (observation.timestamp - self.started_at).total_seconds()
            if runtime >= self.task_timeout_seconds and not self._task_timeout_emitted:
                events.append(
                    DetectionEvent(
                        task_id=observation.task_id,
                        timestamp=observation.timestamp,
                        detector=self.name,
                        code="task_timeout",
                        severity="error",
                        message=f"Task runtime exceeded {self.task_timeout_seconds} seconds.",
                        category="lifecycle",
                        observation_sequence=observation.sequence,
                        metadata={"runtime_seconds": runtime},
                    )
                )
                self._task_timeout_emitted = True
        self.last_activity_at = observation.timestamp
        if observation.is_progress_signal():
            self.last_progress_at = observation.timestamp
        if observation.kind == "task_end":
            self.ended_at = observation.timestamp
        return events

    def finalize(self) -> list[DetectionEvent]:
        return []

    def snapshot(self) -> dict[str, Any]:
        runtime_seconds = None
        if self.started_at and self.last_activity_at:
            runtime_seconds = (
                self.last_activity_at - self.started_at
            ).total_seconds()
        return {
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "last_activity_at": self.last_activity_at.isoformat()
            if self.last_activity_at
            else None,
            "last_progress_at": self.last_progress_at.isoformat()
            if self.last_progress_at
            else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "runtime_seconds": runtime_seconds,
            "stall_timeout_seconds": self.stall_timeout_seconds,
            "task_timeout_seconds": self.task_timeout_seconds,
        }

