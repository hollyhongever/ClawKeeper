# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from monitor.schemas.event import DetectionEvent


@dataclass
class MonitorReport:
    """Final structured output consumed by UI, push, or logging modules."""

    task_id: str
    final_state: str
    started_at: str | None
    ended_at: str | None
    latest_step: str | None
    summary: str
    events: list[DetectionEvent] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    detector_snapshots: dict[str, dict[str, Any]] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "final_state": self.final_state,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "latest_step": self.latest_step,
            "summary": self.summary,
            "events": [event.to_dict() for event in self.events],
            "metrics": self.metrics,
            "detector_snapshots": self.detector_snapshots,
        }
