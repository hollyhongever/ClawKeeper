# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

import subprocess
from datetime import datetime, timezone

from monitor.collectors.cli_collector import (
    ProbeObservation,
    StatusProbe,
    SubprocessCommandRunner,
    build_nemoclaw_probes,
)
from monitor.collectors.ssh_runner import SSHCommandRunner
from monitor.config import NemoClawRuntimeConfig, get_ssh_connection_config
from monitor.schemas.observation import Observation


class StatusSnapshotCollector:
    """Runs read-only probes once and returns a compact observation snapshot."""

    def __init__(
        self,
        task_id: str,
        probes: list[StatusProbe],
        *,
        step: str = "status_snapshot",
        runner: object | None = None,
    ) -> None:
        self.task_id = task_id
        self.probes = probes
        self.step = step
        self.runner = runner or SubprocessCommandRunner()
        self._sequence = 0

    def collect(self) -> list[Observation]:
        observations = [self._observation(kind="task_start", step=self.step)]
        health_summaries: list[str] = []

        for probe in self.probes:
            try:
                result = self.runner.run(probe.command)
            except FileNotFoundError as exc:
                observations.append(
                    self._observation(
                        kind="health_check",
                        step=probe.step,
                        content=f"Probe command not found: {exc.filename}",
                        status="probe_unavailable",
                        metadata={"probe": probe.name},
                    )
                )
                continue

            if result.returncode != 0:
                observations.append(
                    self._observation(
                        kind="health_check",
                        step=probe.step,
                        content=(result.stdout or result.stderr).strip(),
                        status="probe_failed",
                        metadata={"probe": probe.name, "return_code": result.returncode},
                    )
                )
                continue

            parsed = probe.parser(result.stdout)
            for item in parsed:
                observations.append(
                    self._observation(
                        kind=item.kind,
                        step=item.step,
                        content=item.content,
                        status=item.status,
                        tool_name=item.tool_name,
                        metadata=item.metadata,
                    )
                )
                if item.kind == "health_check":
                    health_summaries.append(self._health_summary(item))

        if health_summaries:
            observations.append(
                self._observation(
                    kind="summary",
                    step=self.step,
                    content="; ".join(health_summaries),
                )
            )

        observations.append(
            self._observation(kind="task_end", step=self.step, status="succeeded")
        )
        return observations

    def _health_summary(self, item: ProbeObservation) -> str:
        probe = str(item.metadata.get("probe", item.step))
        status = item.status or "unknown"
        if probe == "openshell_status":
            gateway = item.metadata.get("gateway_name", "gateway")
            return f"{gateway} {status}"
        if probe == "docker_health":
            return f"container {status}"
        if probe == "k8s_pods":
            issue_count = item.metadata.get("issue_count", 0)
            return f"k8s {status} ({issue_count} issues)"
        if probe == "sandbox_status":
            return f"sandbox {status}"
        if probe == "onboard_session":
            return f"onboard session {status}"
        if probe == "sandboxes_json":
            count = item.metadata.get("sandbox_count", 0)
            return f"sandbox registry {status} ({count})"
        return f"{probe} {status}"

    def _observation(
        self,
        *,
        kind: str,
        step: str,
        content: str | None = None,
        status: str | None = None,
        tool_name: str | None = None,
        metadata: dict[str, object] | None = None,
    ) -> Observation:
        self._sequence += 1
        return Observation(
            task_id=self.task_id,
            timestamp=datetime.now(timezone.utc),
            sequence=self._sequence,
            kind=kind,
            step=step,
            content=content,
            tool_name=tool_name,
            status=status,
            metadata=metadata or {},
        )


class NemoClawStatusCollector(StatusSnapshotCollector):
    """Read-only status snapshot collector for local or remote NemoClaw/OpenShell."""

    def __init__(
        self,
        task_id: str,
        *,
        sandbox_name: str | None = None,
        openshell_bin: str = "openshell",
        nemoclaw_bin: str = "nemoclaw",
        docker_bin: str = "docker",
        container_name: str = "openshell-cluster-nemoclaw",
        kubeconfig_path: str = "/etc/rancher/k3s/k3s.yaml",
        onboard_session_path: str | None = None,
        sandboxes_path: str | None = None,
        runner: object | None = None,
    ) -> None:
        probes = build_nemoclaw_probes(
            openshell_bin=openshell_bin,
            nemoclaw_bin=nemoclaw_bin,
            docker_bin=docker_bin,
            container_name=container_name,
            kubeconfig_path=kubeconfig_path,
            sandbox_name=sandbox_name,
            onboard_session_path=onboard_session_path,
            sandboxes_path=sandboxes_path,
        )
        super().__init__(
            task_id=task_id,
            probes=probes,
            step="nemoclaw_status_snapshot",
            runner=runner,
        )

    @classmethod
    def from_env(cls, *, task_id: str) -> "NemoClawStatusCollector":
        runtime = NemoClawRuntimeConfig.from_env()
        ssh_config = get_ssh_connection_config()
        runner = SSHCommandRunner(ssh_config) if ssh_config else None
        return cls(
            task_id=task_id,
            sandbox_name=runtime.sandbox_name,
            openshell_bin=runtime.openshell_bin,
            nemoclaw_bin=runtime.nemoclaw_bin,
            docker_bin=runtime.docker_bin,
            container_name=runtime.container_name,
            kubeconfig_path=runtime.kubeconfig_path,
            onboard_session_path=runtime.onboard_session_path,
            sandboxes_path=runtime.sandboxes_path,
            runner=runner,
        )

