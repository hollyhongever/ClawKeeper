# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from monitor.collectors.base import ObservationCollector
from monitor.detectors.base import BaseDetector
from monitor.detectors.loop import LoopDetector
from monitor.detectors.output_quality import OutputQualityDetector
from monitor.detectors.probe_health import ProbeHealthDetector
from monitor.detectors.task_state import TaskStateDetector
from monitor.detectors.timeout import TimeoutDetector
from monitor.schemas.event import DetectionEvent
from monitor.schemas.report import MonitorReport


@dataclass
class MonitorSettings:
    stall_timeout_seconds: int = 120
    task_timeout_seconds: int = 300
    repeated_step_threshold: int = 4
    repeated_tool_threshold: int = 3
    repeated_fingerprint_threshold: int = 4
    long_output_threshold: int = 240
    repeated_output_threshold: int = 3


class MonitorService:
    """Runs detectors over an observation stream and builds a unified report."""

    def __init__(
        self,
        collector: ObservationCollector,
        detectors: list[BaseDetector] | None = None,
        settings: MonitorSettings | None = None,
    ) -> None:
        self.collector = collector
        self.settings = settings or MonitorSettings()
        self.detectors = detectors or self._build_default_detectors(self.settings)

    @staticmethod
    def _build_default_detectors(settings: MonitorSettings) -> list[BaseDetector]:
        return [
            TaskStateDetector(repeated_step_threshold=settings.repeated_step_threshold),
            ProbeHealthDetector(),
            TimeoutDetector(
                stall_timeout_seconds=settings.stall_timeout_seconds,
                task_timeout_seconds=settings.task_timeout_seconds,
            ),
            LoopDetector(
                repeated_tool_threshold=settings.repeated_tool_threshold,
                repeated_fingerprint_threshold=settings.repeated_fingerprint_threshold,
            ),
            OutputQualityDetector(
                long_output_threshold=settings.long_output_threshold,
                repeated_output_threshold=settings.repeated_output_threshold,
            ),
        ]

    def run(self) -> MonitorReport:
        observations = list(self.collector.collect())
        if not observations:
            raise ValueError("Collector returned no observations.")
        events: list[DetectionEvent] = []
        for observation in observations:
            for detector in self.detectors:
                events.extend(detector.on_observation(observation))
        for detector in self.detectors:
            events.extend(detector.finalize())
        events.sort(key=lambda event: (event.timestamp, event.observation_sequence or 0))

        snapshots = {detector.name: detector.snapshot() for detector in self.detectors}
        task_state = snapshots.get("task_state", {})
        output_state = snapshots.get("output_quality", {})
        summary = output_state.get("latest_summary") or self._build_summary(events, task_state)

        return MonitorReport(
            task_id=observations[0].task_id,
            final_state=str(task_state.get("final_state") or "unknown"),
            started_at=task_state.get("started_at"),
            ended_at=task_state.get("ended_at"),
            latest_step=task_state.get("latest_step"),
            summary=summary,
            events=events,
            metrics=self._build_metrics(observations, events, snapshots),
            detector_snapshots=snapshots,
        )

    def _build_metrics(
        self,
        observations: list[Any],
        events: list[DetectionEvent],
        snapshots: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "observation_count": len(observations),
            "event_count": len(events),
            "error_count": sum(1 for event in events if event.severity == "error"),
            "warning_count": sum(1 for event in events if event.severity == "warning"),
            "info_count": sum(1 for event in events if event.severity == "info"),
            "runtime_seconds": snapshots.get("timeout", {}).get("runtime_seconds"),
            "health_overview": self._build_health_overview(observations),
        }

    def _build_summary(
        self, events: list[DetectionEvent], task_state: dict[str, Any]
    ) -> str:
        if events:
            highest = sorted(
                events,
                key=lambda event: {"error": 0, "warning": 1, "info": 2}.get(
                    event.severity, 3
                ),
            )[0]
            return highest.message
        latest_step = task_state.get("latest_step") or "unknown"
        final_state = task_state.get("final_state") or "unknown"
        return f"Task is in state '{final_state}' at step '{latest_step}'."

    def _build_health_overview(self, observations: list[Any]) -> dict[str, Any]:
        overview: dict[str, Any] = {}
        onboard_steps: dict[str, Any] = {}
        for observation in observations:
            probe = observation.metadata.get("probe")
            if observation.kind == "health_check" and probe:
                if probe == "openshell_status":
                    overview["gateway"] = {
                        "status": observation.status,
                        "name": observation.metadata.get("gateway_name"),
                        "server": observation.metadata.get("server"),
                        "version": observation.metadata.get("version"),
                    }
                elif probe == "docker_health":
                    overview["container"] = {
                        "status": observation.status,
                        "raw": observation.content,
                    }
                elif probe == "k8s_pods":
                    overview["k8s"] = {
                        "status": observation.status,
                        "issue_count": observation.metadata.get("issue_count", 0),
                        "issues": observation.metadata.get("issues", []),
                    }
                elif probe == "nemoclaw_status":
                    overview["sandbox"] = {
                        "status": observation.status,
                        "raw": observation.content,
                    }
                elif probe == "onboard_session":
                    overview["onboard_session"] = {
                        "status": observation.status,
                        "sandbox_name": observation.metadata.get("sandbox_name"),
                        "provider": observation.metadata.get("provider"),
                        "model": observation.metadata.get("model"),
                        "last_completed_step": observation.metadata.get(
                            "last_completed_step"
                        ),
                        "last_step_started": observation.metadata.get(
                            "last_step_started"
                        ),
                        "resumable": observation.metadata.get("resumable"),
                    }
                elif probe == "sandboxes_json":
                    overview["sandbox_registry"] = {
                        "status": observation.status,
                        "sandbox_count": observation.metadata.get("sandbox_count", 0),
                        "default_sandbox": observation.metadata.get("default_sandbox"),
                    }
            if (
                observation.kind == "status_update"
                and observation.metadata.get("probe") == "onboard_session"
            ):
                raw_step = str(observation.metadata.get("raw_step", observation.step))
                onboard_steps[raw_step] = {
                    "status": observation.status,
                    "semantic_step": observation.step,
                    "semantic_label": observation.metadata.get("semantic_label"),
                    "started_at": observation.metadata.get("started_at"),
                    "completed_at": observation.metadata.get("completed_at"),
                    "error": observation.metadata.get("error"),
                }
        if onboard_steps:
            overview.setdefault("onboard_session", {})
            overview["onboard_session"]["steps"] = onboard_steps
        return overview
