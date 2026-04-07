# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

import os
from dataclasses import dataclass

from monitor.collectors.ssh_runner import SSHConnectionConfig


def _get_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    try:
        return float(value)
    except ValueError:
        return default


@dataclass
class NemoClawRuntimeConfig:
    """Environment-driven runtime settings for the read-only CLI collector."""

    openshell_bin: str = "openshell"
    nemoclaw_bin: str = "nemoclaw"
    docker_bin: str = "docker"
    container_name: str = "openshell-cluster-nemoclaw"
    kubeconfig_path: str = "/etc/rancher/k3s/k3s.yaml"
    sandbox_name: str | None = None
    poll_interval_seconds: float = 15.0
    onboard_session_path: str | None = None
    sandboxes_path: str | None = None

    @classmethod
    def from_env(cls) -> "NemoClawRuntimeConfig":
        sandbox_name = os.getenv("CLAW_SANDBOX_NAME")
        return cls(
            openshell_bin=os.getenv("CLAW_OPENSHELL_BIN", "openshell"),
            nemoclaw_bin=os.getenv("CLAW_NEMOCLAW_BIN", "nemoclaw"),
            docker_bin=os.getenv("CLAW_DOCKER_BIN", "docker"),
            container_name=os.getenv(
                "CLAW_OPENSHELL_CONTAINER", "openshell-cluster-nemoclaw"
            ),
            kubeconfig_path=os.getenv(
                "CLAW_KUBECONFIG_PATH", "/etc/rancher/k3s/k3s.yaml"
            ),
            sandbox_name=sandbox_name if sandbox_name else None,
            poll_interval_seconds=_get_float("CLAW_CLI_POLL_INTERVAL", 15.0),
            onboard_session_path=os.getenv("CLAW_ONBOARD_SESSION_PATH") or None,
            sandboxes_path=os.getenv("CLAW_SANDBOXES_PATH") or None,
        )


def get_ssh_connection_config() -> SSHConnectionConfig | None:
    host = os.getenv("CLAW_SSH_HOST")
    port = os.getenv("CLAW_SSH_PORT")
    user = os.getenv("CLAW_SSH_USER")
    password = os.getenv("CLAW_SSH_PASSWORD")
    if not all([host, port, user, password]):
        return None
    try:
        port_value = int(port)
    except ValueError:
        return None
    return SSHConnectionConfig(
        host=host,
        port=port_value,
        user=user,
        password=password,
        ssh_bin=os.getenv("CLAW_SSH_BIN", "/usr/bin/ssh"),
        remote_shell=os.getenv("CLAW_REMOTE_SHELL", "bash"),
        remote_init=os.getenv(
            "CLAW_REMOTE_INIT",
            'export PATH="$HOME/.local/bin:$PATH"; '
            'source ~/.bashrc >/dev/null 2>&1 || true; '
            'source ~/.profile >/dev/null 2>&1 || true',
        ),
    )
