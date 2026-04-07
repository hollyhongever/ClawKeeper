# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

from collections.abc import Iterable
from typing import Protocol

from monitor.schemas.observation import Observation


class ObservationCollector(Protocol):
    """Collector interface for observation streams."""

    def collect(self) -> Iterable[Observation]:
        ...

