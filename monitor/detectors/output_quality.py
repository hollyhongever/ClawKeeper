# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

import re
from typing import Any

from monitor.detectors.base import BaseDetector
from monitor.schemas.event import DetectionEvent
from monitor.schemas.observation import Observation


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


class OutputQualityDetector(BaseDetector):
    """Monitors output length, truncation markers, and repeated output."""

    name = "output_quality"

    def __init__(
        self,
        long_output_threshold: int = 240,
        repeated_output_threshold: int = 3,
    ) -> None:
        self.long_output_threshold = long_output_threshold
        self.repeated_output_threshold = repeated_output_threshold
        self.task_id: str | None = None
        self.last_output_norm: str | None = None
        self.repeated_output_count = 0
        self.max_output_length = 0
        self.latest_summary: str = ""
        self._repeat_alert_emitted = False

    def on_observation(self, observation: Observation) -> list[DetectionEvent]:
        events: list[DetectionEvent] = []
        self.task_id = observation.task_id
        if observation.kind == "summary" and observation.content:
            self.latest_summary = observation.content.strip()
        if observation.kind != "output" or not observation.content:
            return events

        content = observation.content
        normalized = _normalize_text(content)
        self.max_output_length = max(self.max_output_length, len(content))
        if len(content) >= self.long_output_threshold:
            events.append(
                DetectionEvent(
                    task_id=observation.task_id,
                    timestamp=observation.timestamp,
                    detector=self.name,
                    code="long_output",
                    severity="warning",
                    message=f"Output length reached {len(content)} characters.",
                    category="output",
                    observation_sequence=observation.sequence,
                    metadata={"length": len(content)},
                )
            )
        if normalized == self.last_output_norm:
            self.repeated_output_count += 1
        else:
            self.last_output_norm = normalized
            self.repeated_output_count = 1
            self._repeat_alert_emitted = False
        if (
            self.repeated_output_count >= self.repeated_output_threshold
            and not self._repeat_alert_emitted
        ):
            events.append(
                DetectionEvent(
                    task_id=observation.task_id,
                    timestamp=observation.timestamp,
                    detector=self.name,
                    code="repeated_output",
                    severity="warning",
                    message="Near-identical output repeated multiple times.",
                    category="output",
                    observation_sequence=observation.sequence,
                    metadata={"repeat_count": self.repeated_output_count},
                )
            )
            self._repeat_alert_emitted = True
        if content.rstrip().endswith("[TRUNCATED]") or observation.metadata.get("truncated"):
            events.append(
                DetectionEvent(
                    task_id=observation.task_id,
                    timestamp=observation.timestamp,
                    detector=self.name,
                    code="truncated_output",
                    severity="warning",
                    message="Output appears truncated.",
                    category="output",
                    observation_sequence=observation.sequence,
                    metadata={"content_preview": content[:80]},
                )
            )
        if not self.latest_summary:
            self.latest_summary = content.strip()[:160]
        return events

    def finalize(self) -> list[DetectionEvent]:
        return []

    def snapshot(self) -> dict[str, Any]:
        return {
            "max_output_length": self.max_output_length,
            "latest_summary": self.latest_summary,
        }

