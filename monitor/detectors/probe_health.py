# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

from typing import Any

from monitor.detectors.base import BaseDetector
from monitor.schemas.event import DetectionEvent
from monitor.schemas.observation import Observation


ERROR_STATUSES = {"probe_failed", "probe_unavailable", "failed"}
WARNING_STATUSES = {"disconnected", "degraded", "unknown"}
NON_RUNNING_K8S_STATUSES = {"CrashLoopBackOff", "ImagePullBackOff", "ContainerCreating"}


class ProbeHealthDetector(BaseDetector):
    """Turns probe results into normalized health alerts."""

    name = "probe_health"

    def __init__(self) -> None:
        self.health_event_count = 0

    def on_observation(self, observation: Observation) -> list[DetectionEvent]:
        if observation.kind not in {"health_check", "status_update"}:
            return []

        probe = str(observation.metadata.get("probe", ""))
        status = observation.status or ""
        if observation.kind == "health_check":
            event = self._health_check_event(observation, probe, status)
            return [event] if event else []
        if probe == "k8s_pods" and status in NON_RUNNING_K8S_STATUSES:
            return [
                self._event(
                    observation,
                    code="k8s_pod_issue",
                    severity="error",
                    message=f"Kubernetes pod issue detected: {observation.content}",
                    metadata=observation.metadata,
                )
            ]
        if probe == "onboard_session" and status not in {"complete", "known"}:
            return [
                self._event(
                    observation,
                    code="onboard_step_not_complete",
                    severity="warning",
                    message=f"Onboarding step '{observation.metadata.get('raw_step', observation.step)}' is {status}.",
                    metadata=observation.metadata,
                )
            ]
        return []

    def finalize(self) -> list[DetectionEvent]:
        return []

    def snapshot(self) -> dict[str, Any]:
        return {"health_event_count": self.health_event_count}

    def _health_check_event(
        self, observation: Observation, probe: str, status: str
    ) -> DetectionEvent | None:
        if status in ERROR_STATUSES:
            return self._event(
                observation,
                code=f"{probe or observation.step}_error",
                severity="error",
                message=f"Probe '{probe or observation.step}' failed with status '{status}'.",
                metadata=observation.metadata,
            )
        if status in WARNING_STATUSES:
            return self._event(
                observation,
                code=f"{probe or observation.step}_warning",
                severity="warning",
                message=f"Probe '{probe or observation.step}' reported status '{status}'.",
                metadata=observation.metadata,
            )
        return None

    def _event(
        self,
        observation: Observation,
        *,
        code: str,
        severity: str,
        message: str,
        metadata: dict[str, object],
    ) -> DetectionEvent:
        self.health_event_count += 1
        return DetectionEvent(
            task_id=observation.task_id,
            timestamp=observation.timestamp,
            detector=self.name,
            code=code,
            severity=severity,
            message=message,
            category="health",
            observation_sequence=observation.sequence,
            metadata=metadata,
        )

