# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

import queue
import re
import subprocess
import threading
import time
import json
import shlex
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import IO, Protocol

from monitor.config import NemoClawRuntimeConfig
from monitor.schemas.observation import Observation


STEP_PATTERN = re.compile(r"^\[(\d+)/(\d+)\]\s+(.+)$")
ANSI_PATTERN = re.compile(r"\x1b\[[0-9;]*m")
TOOL_PATTERNS = [
    re.compile(r"tool[:\s]+([a-zA-Z0-9_.-]+)", re.IGNORECASE),
    re.compile(r"using tool\s+([a-zA-Z0-9_.-]+)", re.IGNORECASE),
    re.compile(r"calling tool\s+([a-zA-Z0-9_.-]+)", re.IGNORECASE),
]
SUMMARY_PATTERNS = [
    re.compile(r"^summary:\s*(.+)$", re.IGNORECASE),
    re.compile(r"^stage summary:\s*(.+)$", re.IGNORECASE),
]
ISSUE_KEYWORDS = {
    "K8s namespace not ready": "namespace_not_ready",
    "ImagePullBackOff": "image_pull_backoff",
    "CrashLoopBackOff": "crash_loop_backoff",
    "ContainerCreating": "container_creating",
    "No gateway configured": "gateway_not_configured",
    "Connected": "gateway_connected",
}
STAGE_ALIASES = {
    "starting openshell gateway": ("gateway_start", "gateway bootstrap in progress"),
    "creating sandbox": ("sandbox_create", "sandbox creation in progress"),
    "inference": ("inference_select", "inference backend selection"),
    "policy presets": ("policies", "policy preset selection"),
    "checking docker": ("docker_check", "docker preflight check"),
    "downloading gateway": ("gateway_download", "gateway image download"),
    "preflight": ("preflight", "preflight checks"),
    "gateway": ("gateway_start", "gateway bootstrap in progress"),
    "sandbox": ("sandbox_create", "sandbox creation in progress"),
    "provider selection": ("provider_selection", "provider selection"),
    "provider_selection": ("provider_selection", "provider selection"),
    "openclaw": ("openclaw", "openclaw environment setup"),
    "policies": ("policies", "policy preset selection"),
}


class RuntimeCommand(Protocol):
    stdout: IO[str] | None

    def poll(self) -> int | None:
        ...

    def wait(self) -> int:
        ...


class CommandRunner(Protocol):
    def spawn(self, command: list[str]) -> RuntimeCommand:
        ...

    def run(self, command: list[str]) -> subprocess.CompletedProcess[str]:
        ...


class SubprocessCommandRunner:
    """Default command runner backed by subprocess."""

    def spawn(self, command: list[str]) -> RuntimeCommand:
        return subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

    def run(self, command: list[str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )


@dataclass
class ProbeObservation:
    kind: str
    step: str
    content: str
    status: str | None = None
    tool_name: str | None = None
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass
class StatusProbe:
    name: str
    command: list[str]
    step: str
    parser: callable


def slugify_step(label: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "_", label.strip().lower()).strip("_")
    return value or "unknown_step"


def resolve_stage(label: str) -> tuple[str, str]:
    lowered = label.strip().lower()
    for key, value in STAGE_ALIASES.items():
        if key in lowered:
            return value
    slug = slugify_step(label)
    return slug, label.strip()


def strip_ansi(text: str) -> str:
    return ANSI_PATTERN.sub("", text)


def parse_openshell_status(text: str) -> list[ProbeObservation]:
    content = strip_ansi(text).strip()
    if not content:
        return []
    lowered = content.lower()
    status = "connected" if "connected" in lowered else "disconnected"
    severity = "healthy" if status == "connected" else "warning"
    metadata: dict[str, object] = {"probe": "openshell_status", "health": severity}
    for line in content.splitlines():
        clean = line.strip()
        if clean.startswith("Gateway:"):
            metadata["gateway_name"] = clean.split(":", 1)[1].strip()
        elif clean.startswith("Server:"):
            metadata["server"] = clean.split(":", 1)[1].strip()
        elif clean.startswith("Version:"):
            metadata["version"] = clean.split(":", 1)[1].strip()
    return [
        ProbeObservation(
            kind="health_check",
            step="gateway_status",
            content=content,
            status=status,
            metadata=metadata,
        )
    ]


def parse_docker_health(text: str) -> list[ProbeObservation]:
    content = strip_ansi(text).strip()
    if not content:
        return []
    normalized = content.lower()
    return [
        ProbeObservation(
            kind="health_check",
            step="container_health",
            content=content,
            status=normalized,
            metadata={"probe": "docker_health"},
        )
    ]


def parse_kubectl_pods(text: str) -> list[ProbeObservation]:
    content = strip_ansi(text).strip()
    if not content:
        return []
    observations: list[ProbeObservation] = []
    issue_rows: list[dict[str, str]] = []
    lines = [line for line in content.splitlines() if line.strip()]
    for line in lines:
        if line.startswith("NAMESPACE") or line.startswith("NAME "):
            continue
        parts = line.split()
        if len(parts) < 4:
            continue
        namespace, name = parts[0], parts[1]
        status = parts[3]
        if status not in {"Running", "Completed"}:
            issue_rows.append(
                {
                    "namespace": namespace,
                    "pod": name,
                    "status": status,
                }
            )
    overall_status = "healthy" if not issue_rows else "degraded"
    observations.append(
        ProbeObservation(
            kind="health_check",
            step="k8s_pods",
            content="k8s pod status snapshot",
            status=overall_status,
            metadata={
                "probe": "k8s_pods",
                "issue_count": len(issue_rows),
                "issues": issue_rows,
            },
        )
    )
    for issue in issue_rows:
        observations.append(
            ProbeObservation(
                kind="status_update",
                step="k8s_pods",
                content=f"{issue['pod']} in {issue['namespace']} is {issue['status']}",
                status=issue["status"],
                metadata={"probe": "k8s_pods", **issue},
            )
        )
    return observations


def parse_nemoclaw_status(text: str) -> list[ProbeObservation]:
    content = strip_ansi(text).strip()
    if not content:
        return []
    lowered = content.lower()
    if "running" in lowered or "ready" in lowered:
        status = "running"
    elif "failed" in lowered or "error" in lowered:
        status = "failed"
    else:
        status = "unknown"
    return [
        ProbeObservation(
            kind="health_check",
            step="sandbox_status",
            content=content,
            status=status,
            metadata={"probe": "nemoclaw_status"},
        )
    ]


def parse_onboard_session_json(text: str) -> list[ProbeObservation]:
    content = text.strip()
    if not content:
        return []
    payload = json.loads(content)
    observations: list[ProbeObservation] = []
    steps = payload.get("steps", {})
    session_status = str(payload.get("status", "unknown"))
    observations.append(
        ProbeObservation(
            kind="health_check",
            step="onboard_session",
            content=f"Onboard session status: {session_status}",
            status=session_status,
            metadata={
                "probe": "onboard_session",
                "sandbox_name": payload.get("sandboxName"),
                "provider": payload.get("provider"),
                "model": payload.get("model"),
                "last_completed_step": payload.get("lastCompletedStep"),
                "last_step_started": payload.get("lastStepStarted"),
                "resumable": payload.get("resumable"),
            },
        )
    )
    for raw_step, step_payload in steps.items():
        semantic_step, semantic_label = resolve_stage(raw_step)
        step_status = step_payload.get("status", "unknown")
        observations.append(
            ProbeObservation(
                kind="status_update",
                step=semantic_step,
                content=f"{raw_step}: {step_status}",
                status=step_status,
                metadata={
                    "probe": "onboard_session",
                    "raw_step": raw_step,
                    "semantic_label": semantic_label,
                    "started_at": step_payload.get("startedAt"),
                    "completed_at": step_payload.get("completedAt"),
                    "error": step_payload.get("error"),
                },
            )
        )
    return observations


def parse_sandboxes_json(text: str) -> list[ProbeObservation]:
    content = text.strip()
    if not content:
        return []
    payload = json.loads(content)
    sandboxes = payload.get("sandboxes", {})
    default_sandbox = payload.get("defaultSandbox")
    observations = [
        ProbeObservation(
            kind="health_check",
            step="sandbox_registry",
            content=f"Known sandboxes: {', '.join(sorted(sandboxes)) or 'none'}",
            status="available" if sandboxes else "empty",
            metadata={
                "probe": "sandboxes_json",
                "sandbox_count": len(sandboxes),
                "default_sandbox": default_sandbox,
            },
        )
    ]
    for name, sandbox in sandboxes.items():
        observations.append(
            ProbeObservation(
                kind="status_update",
                step="sandbox_registry",
                content=f"{name}: gpu_enabled={sandbox.get('gpuEnabled')}",
                status="known",
                metadata={
                    "probe": "sandboxes_json",
                    "sandbox_name": name,
                    "created_at": sandbox.get("createdAt"),
                    "policies": sandbox.get("policies", []),
                    "gpu_enabled": sandbox.get("gpuEnabled"),
                },
            )
        )
    return observations


class CLICollector:
    """Streams a CLI command and enriches it with periodic status probes."""

    def __init__(
        self,
        task_id: str,
        command: list[str],
        *,
        step: str = "cli_runtime",
        probes: list[StatusProbe] | None = None,
        poll_interval_seconds: float = 15.0,
        runner: CommandRunner | None = None,
    ) -> None:
        self.task_id = task_id
        self.command = command
        self.step = step
        self.probes = probes or []
        self.poll_interval_seconds = poll_interval_seconds
        self.runner = runner or SubprocessCommandRunner()
        self._sequence = 0
        self._current_step = step

    def collect(self) -> list[Observation]:
        observations = [self._observation(kind="task_start", step=self.step)]
        try:
            process = self.runner.spawn(self.command)
        except FileNotFoundError as exc:
            observations.append(
                self._observation(
                    kind="output",
                    step=self.step,
                    content=f"Command not found: {exc.filename}",
                    metadata={"error": "command_not_found"},
                )
            )
            observations.append(
                self._observation(
                    kind="task_end",
                    step=self.step,
                    status="failed",
                    metadata={"return_code": 127},
                )
            )
            return observations

        line_queue: queue.Queue[tuple[str | None, datetime]] = queue.Queue()
        reader = threading.Thread(
            target=self._read_stdout,
            args=(process, line_queue),
            daemon=True,
        )
        reader.start()
        last_probe_at = time.monotonic()
        process_finished = False
        while True:
            try:
                line, timestamp = line_queue.get(timeout=0.2)
                if line is None:
                    process_finished = True
                else:
                    observations.extend(self._parse_stream_line(line, timestamp))
            except queue.Empty:
                pass

            now = time.monotonic()
            if now - last_probe_at >= self.poll_interval_seconds:
                observations.extend(self._run_probes())
                last_probe_at = now

            if process_finished and line_queue.empty():
                break
        observations.extend(self._run_probes())
        return_code = process.wait()
        observations.append(
            self._observation(
                kind="task_end",
                step=self._current_step,
                status="succeeded" if return_code == 0 else "failed",
                metadata={"return_code": return_code},
            )
        )
        return observations

    def _read_stdout(
        self, process: RuntimeCommand, line_queue: queue.Queue[tuple[str | None, datetime]]
    ) -> None:
        stdout = process.stdout
        if stdout is None:
            line_queue.put((None, datetime.now(timezone.utc)))
            return
        for line in stdout:
            line_queue.put((line.rstrip("\n"), datetime.now(timezone.utc)))
        line_queue.put((None, datetime.now(timezone.utc)))

    def _run_probes(self) -> list[Observation]:
        observations: list[Observation] = []
        for probe in self.probes:
            try:
                result = self.runner.run(probe.command)
                if result.returncode != 0:
                    observations.append(
                        self._observation(
                            kind="health_check",
                            step=probe.step,
                            content=(result.stdout or result.stderr).strip(),
                            status="probe_failed",
                            metadata={
                                "probe": probe.name,
                                "return_code": result.returncode,
                            },
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
        return observations

    def _parse_stream_line(self, line: str, timestamp: datetime) -> list[Observation]:
        content = line.strip()
        if not content:
            return []
        content = strip_ansi(content)

        match = STEP_PATTERN.match(content)
        if match:
            step_index, step_total, step_label = match.groups()
            step, semantic_label = resolve_stage(step_label)
            step_changed = step != self._current_step
            self._current_step = step
            return [
                self._observation(
                    kind="status_update",
                    step=step,
                    content=content,
                    timestamp=timestamp,
                    metadata={
                        "step_index": int(step_index),
                        "step_total": int(step_total),
                        "step_label": step_label,
                        "semantic_step": step,
                        "semantic_label": semantic_label,
                        "step_changed": step_changed,
                    },
                )
            ]

        summary = self._extract_summary(content)
        if summary:
            return [
                self._observation(
                    kind="summary",
                    step=self._current_step,
                    content=summary,
                    timestamp=timestamp,
                )
            ]

        tool_name = self._extract_tool_name(content)
        issue_code = self._match_issue(content)
        observations = [
            self._observation(
                kind="output",
                step=self._current_step,
                content=content,
                timestamp=timestamp,
                metadata={"issue_code": issue_code} if issue_code else {},
            )
        ]
        if tool_name:
            observations.append(
                self._observation(
                    kind="tool_call",
                    step=self._current_step,
                    content=content,
                    tool_name=tool_name,
                    timestamp=timestamp,
                )
            )
        return observations

    def _extract_tool_name(self, content: str) -> str | None:
        for pattern in TOOL_PATTERNS:
            match = pattern.search(content)
            if match:
                return match.group(1)
        return None

    def _extract_summary(self, content: str) -> str | None:
        for pattern in SUMMARY_PATTERNS:
            match = pattern.match(content)
            if match:
                return match.group(1).strip()
        return None

    def _match_issue(self, content: str) -> str | None:
        for keyword, issue_code in ISSUE_KEYWORDS.items():
            if keyword in content:
                return issue_code
        return None

    def _observation(
        self,
        *,
        kind: str,
        step: str,
        content: str | None = None,
        status: str | None = None,
        tool_name: str | None = None,
        metadata: dict[str, object] | None = None,
        timestamp: datetime | None = None,
    ) -> Observation:
        self._sequence += 1
        return Observation(
            task_id=self.task_id,
            timestamp=timestamp or datetime.now(timezone.utc),
            sequence=self._sequence,
            kind=kind,
            step=step,
            content=content,
            tool_name=tool_name,
            status=status,
            metadata=metadata or {},
        )


class NemoClawCLICollector(CLICollector):
    """Read-only collector for NemoClaw/OpenShell runtime commands."""

    def __init__(
        self,
        task_id: str,
        command: list[str],
        *,
        sandbox_name: str | None = None,
        openshell_bin: str = "openshell",
        nemoclaw_bin: str = "nemoclaw",
        docker_bin: str = "docker",
        container_name: str = "openshell-cluster-nemoclaw",
        kubeconfig_path: str = "/etc/rancher/k3s/k3s.yaml",
        onboard_session_path: str | None = None,
        sandboxes_path: str | None = None,
        poll_interval_seconds: float = 15.0,
        runner: CommandRunner | None = None,
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
            command=command,
            step="nemoclaw_runtime",
            probes=probes,
            poll_interval_seconds=poll_interval_seconds,
            runner=runner,
        )

    @classmethod
    def from_env(
        cls,
        *,
        task_id: str,
        command: list[str] | None = None,
    ) -> "NemoClawCLICollector":
        config = NemoClawRuntimeConfig.from_env()
        runtime_command = command or [config.openshell_bin, "status"]
        return cls(
            task_id=task_id,
            command=runtime_command,
            sandbox_name=config.sandbox_name,
            openshell_bin=config.openshell_bin,
            nemoclaw_bin=config.nemoclaw_bin,
            docker_bin=config.docker_bin,
            container_name=config.container_name,
            kubeconfig_path=config.kubeconfig_path,
            poll_interval_seconds=config.poll_interval_seconds,
            onboard_session_path=config.onboard_session_path,
            sandboxes_path=config.sandboxes_path,
        )


def build_nemoclaw_probes(
    *,
    openshell_bin: str = "openshell",
    nemoclaw_bin: str = "nemoclaw",
    docker_bin: str = "docker",
    container_name: str = "openshell-cluster-nemoclaw",
    kubeconfig_path: str = "/etc/rancher/k3s/k3s.yaml",
    sandbox_name: str | None = None,
    onboard_session_path: str | None = None,
    sandboxes_path: str | None = None,
) -> list[StatusProbe]:
    probes = [
        StatusProbe(
            name="openshell_status",
            command=[openshell_bin, "status"],
            step="gateway_status",
            parser=parse_openshell_status,
        ),
        StatusProbe(
            name="docker_health",
            command=[
                docker_bin,
                "inspect",
                container_name,
                "--format={{.State.Health.Status}}",
            ],
            step="container_health",
            parser=parse_docker_health,
        ),
        StatusProbe(
            name="k8s_pods",
            command=[
                docker_bin,
                "exec",
                container_name,
                "sh",
                "-c",
                f"KUBECONFIG={kubeconfig_path} kubectl get pods -A",
            ],
            step="k8s_pods",
            parser=parse_kubectl_pods,
        ),
    ]
    if sandbox_name:
        probes.append(
            StatusProbe(
                name="nemoclaw_status",
                command=[nemoclaw_bin, sandbox_name, "status"],
                step="sandbox_status",
                parser=parse_nemoclaw_status,
            )
        )
    if onboard_session_path:
        probes.append(
            StatusProbe(
                name="onboard_session",
                command=["bash", "-lc", f"cat {shlex.quote(onboard_session_path)}"],
                step="onboard_session",
                parser=parse_onboard_session_json,
            )
        )
    if sandboxes_path:
        probes.append(
            StatusProbe(
                name="sandboxes_json",
                command=["bash", "-lc", f"cat {shlex.quote(sandboxes_path)}"],
                step="sandbox_registry",
                parser=parse_sandboxes_json,
            )
        )
    return probes
