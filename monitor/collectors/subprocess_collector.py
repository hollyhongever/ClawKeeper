# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

import subprocess
from datetime import datetime, timezone

from monitor.schemas.observation import Observation


class SubprocessObservationCollector:
    """Collects stdout lines from a local command as observations."""

    def __init__(self, task_id: str, command: list[str], step: str = "subprocess") -> None:
        self.task_id = task_id
        self.command = command
        self.step = step

    def collect(self) -> list[Observation]:
        observations: list[Observation] = [
            Observation(
                task_id=self.task_id,
                timestamp=datetime.now(timezone.utc),
                sequence=1,
                kind="task_start",
                step=self.step,
                metadata={"command": self.command},
            )
        ]
        process = subprocess.Popen(
            self.command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        assert process.stdout is not None
        for line in process.stdout:
            observations.append(
                Observation(
                    task_id=self.task_id,
                    timestamp=datetime.now(timezone.utc),
                    sequence=len(observations) + 1,
                    kind="output",
                    step=self.step,
                    content=line.rstrip(),
                )
            )
        return_code = process.wait()
        observations.append(
            Observation(
                task_id=self.task_id,
                timestamp=datetime.now(timezone.utc),
                sequence=len(observations) + 1,
                kind="task_end",
                step=self.step,
                status="succeeded" if return_code == 0 else "failed",
                metadata={"return_code": return_code},
            )
        )
        return observations

