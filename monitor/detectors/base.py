# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from monitor.schemas.event import DetectionEvent
from monitor.schemas.observation import Observation


class BaseDetector(ABC):
    """Shared detector lifecycle."""

    name: str

    @abstractmethod
    def on_observation(self, observation: Observation) -> list[DetectionEvent]:
        raise NotImplementedError

    @abstractmethod
    def finalize(self) -> list[DetectionEvent]:
        raise NotImplementedError

    @abstractmethod
    def snapshot(self) -> dict[str, Any]:
        raise NotImplementedError

