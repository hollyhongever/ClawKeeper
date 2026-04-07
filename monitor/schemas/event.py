# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import uuid4


@dataclass
class DetectionEvent:
    """A structured alert or lifecycle event produced by a detector."""

    task_id: str
    timestamp: datetime
    detector: str
    code: str
    severity: str
    message: str
    category: str
    observation_sequence: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    event_id: str = field(default_factory=lambda: str(uuid4()))

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "task_id": self.task_id,
            "timestamp": self.timestamp.isoformat(),
            "detector": self.detector,
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
            "category": self.category,
            "observation_sequence": self.observation_sequence,
            "metadata": self.metadata,
        }
