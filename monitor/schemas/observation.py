# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class Observation:
    """A normalized runtime observation collected from an agent execution."""

    task_id: str
    timestamp: datetime
    sequence: int
    kind: str
    step: str | None = None
    content: str | None = None
    tool_name: str | None = None
    status: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, payload: dict[str, Any], sequence: int) -> "Observation":
        timestamp = datetime.fromisoformat(payload["timestamp"])
        return cls(
            task_id=payload["task_id"],
            timestamp=timestamp,
            sequence=sequence,
            kind=payload["kind"],
            step=payload.get("step"),
            content=payload.get("content"),
            tool_name=payload.get("tool_name"),
            status=payload.get("status"),
            metadata=dict(payload.get("metadata", {})),
        )

    def fingerprint(self) -> str:
        content = (self.content or "").strip().lower()
        return "|".join(
            [
                self.kind,
                self.step or "",
                self.tool_name or "",
                content,
            ]
        )

    def is_progress_signal(self) -> bool:
        if self.kind in {"task_start", "task_end", "summary"}:
            return True
        if self.kind == "tool_call":
            return True
        if self.step and self.metadata.get("step_changed", False):
            return True
        if self.content and self.content.strip():
            return True
        return False
