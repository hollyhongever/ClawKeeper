# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

import json
from pathlib import Path

from monitor.schemas.observation import Observation


class MockObservationCollector:
    """Loads a deterministic observation stream from JSONL fixtures."""

    def __init__(self, fixture_path: str | Path) -> None:
        self.fixture_path = Path(fixture_path)

    def collect(self) -> list[Observation]:
        observations: list[Observation] = []
        with self.fixture_path.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                payload = json.loads(line)
                observations.append(
                    Observation.from_dict(payload, sequence=len(observations) + 1)
                )
        return observations

