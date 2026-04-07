# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

from collections import deque
from typing import Any

from monitor.detectors.base import BaseDetector
from monitor.schemas.event import DetectionEvent
from monitor.schemas.observation import Observation


class LoopDetector(BaseDetector):
    """Detects repeated tool calls and repeated observation fingerprints."""

    name = "loop"

    def __init__(
        self,
        repeated_tool_threshold: int = 3,
        repeated_fingerprint_threshold: int = 4,
    ) -> None:
        self.repeated_tool_threshold = repeated_tool_threshold
        self.repeated_fingerprint_threshold = repeated_fingerprint_threshold
        self.task_id: str | None = None
        self.recent_tools: deque[str] = deque(maxlen=repeated_tool_threshold)
        self.last_fingerprint: str | None = None
        self.same_fingerprint_count = 0
        self.max_same_fingerprint_count = 0
        self._tool_alerted_for: str | None = None
        self._fingerprint_alerted = False
        self._loop_alerted_for_tool: str | None = None
        self._recent_tool_steps: deque[str] = deque(maxlen=repeated_tool_threshold)

    def on_observation(self, observation: Observation) -> list[DetectionEvent]:
        events: list[DetectionEvent] = []
        self.task_id = observation.task_id

        if observation.tool_name:
            self.recent_tools.append(observation.tool_name)
            self._recent_tool_steps.append(observation.step or "")
            if len(self.recent_tools) == self.repeated_tool_threshold:
                unique_tools = set(self.recent_tools)
                if len(unique_tools) == 1:
                    tool_name = next(iter(unique_tools))
                    if self._tool_alerted_for != tool_name:
                        events.append(
                            DetectionEvent(
                                task_id=observation.task_id,
                                timestamp=observation.timestamp,
                                detector=self.name,
                                code="repeated_tool_call",
                                severity="warning",
                                message=f"Tool '{tool_name}' was called {self.repeated_tool_threshold} times in a row.",
                                category="workflow",
                                observation_sequence=observation.sequence,
                                metadata={"tool_name": tool_name},
                            )
                        )
                        self._tool_alerted_for = tool_name
                    unique_steps = set(self._recent_tool_steps)
                    if (
                        len(unique_steps) == 1
                        and self._loop_alerted_for_tool != tool_name
                    ):
                        events.append(
                            DetectionEvent(
                                task_id=observation.task_id,
                                timestamp=observation.timestamp,
                                detector=self.name,
                                code="suspected_loop",
                                severity="error",
                                message="Same tool keeps running in the same step; possible dead loop detected.",
                                category="workflow",
                                observation_sequence=observation.sequence,
                                metadata={
                                    "tool_name": tool_name,
                                    "step": observation.step,
                                    "repeat_count": self.repeated_tool_threshold,
                                },
                            )
                        )
                        self._loop_alerted_for_tool = tool_name
        fingerprint = observation.fingerprint()
        if fingerprint == self.last_fingerprint:
            self.same_fingerprint_count += 1
        else:
            self.last_fingerprint = fingerprint
            self.same_fingerprint_count = 1
            self._fingerprint_alerted = False
        self.max_same_fingerprint_count = max(
            self.max_same_fingerprint_count, self.same_fingerprint_count
        )
        if (
            self.same_fingerprint_count >= self.repeated_fingerprint_threshold
            and not self._fingerprint_alerted
        ):
            events.append(
                DetectionEvent(
                    task_id=observation.task_id,
                    timestamp=observation.timestamp,
                    detector=self.name,
                    code="suspected_loop",
                    severity="error",
                    message="Observation pattern repeated without effective change; possible loop detected.",
                    category="workflow",
                    observation_sequence=observation.sequence,
                    metadata={"repeat_count": self.same_fingerprint_count},
                )
            )
            self._fingerprint_alerted = True
        return events

    def finalize(self) -> list[DetectionEvent]:
        return []

    def snapshot(self) -> dict[str, Any]:
        return {
            "max_same_fingerprint_count": self.max_same_fingerprint_count,
            "recent_tools": list(self.recent_tools),
            "recent_tool_steps": list(self._recent_tool_steps),
        }
