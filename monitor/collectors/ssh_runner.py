# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

import os
import shlex
import subprocess
import tempfile
from dataclasses import dataclass
from typing import IO


@dataclass
class SSHConnectionConfig:
    """Connection settings for read-only SSH command execution."""

    host: str
    port: int
    user: str
    password: str
    ssh_bin: str = "/usr/bin/ssh"
    remote_shell: str = "bash"
    remote_init: str = (
        'export PATH="$HOME/.local/bin:$PATH"; '
        'source ~/.bashrc >/dev/null 2>&1 || true; '
        'source ~/.profile >/dev/null 2>&1 || true'
    )


class ManagedSSHProcess:
    """Wraps a local ssh subprocess and cleans up its askpass helper."""

    def __init__(self, process: subprocess.Popen[str], askpass_path: str) -> None:
        self._process = process
        self._askpass_path = askpass_path
        self.stdout: IO[str] | None = process.stdout

    def poll(self) -> int | None:
        return self._process.poll()

    def wait(self) -> int:
        try:
            return self._process.wait()
        finally:
            self._cleanup()

    def _cleanup(self) -> None:
        if self._askpass_path and os.path.exists(self._askpass_path):
            os.unlink(self._askpass_path)
            self._askpass_path = ""


class SSHCommandRunner:
    """Runs commands on a remote host over password-authenticated SSH."""

    def __init__(self, config: SSHConnectionConfig) -> None:
        self.config = config

    def spawn(self, command: list[str]) -> ManagedSSHProcess:
        askpass_path = self._create_askpass_script()
        process = subprocess.Popen(
            self._build_ssh_args(command),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=self._build_env(askpass_path),
            stdin=subprocess.DEVNULL,
            bufsize=1,
        )
        return ManagedSSHProcess(process, askpass_path)

    def run(self, command: list[str]) -> subprocess.CompletedProcess[str]:
        askpass_path = self._create_askpass_script()
        try:
            return subprocess.run(
                self._build_ssh_args(command),
                capture_output=True,
                text=True,
                env=self._build_env(askpass_path),
                stdin=subprocess.DEVNULL,
                check=False,
            )
        finally:
            if os.path.exists(askpass_path):
                os.unlink(askpass_path)

    def _build_env(self, askpass_path: str) -> dict[str, str]:
        env = os.environ.copy()
        env["DISPLAY"] = env.get("DISPLAY", "codex")
        env["SSH_ASKPASS"] = askpass_path
        env["SSH_ASKPASS_REQUIRE"] = "force"
        return env

    def _build_ssh_args(self, command: list[str]) -> list[str]:
        remote_command = self._wrap_remote_command(command)
        return [
            self.config.ssh_bin,
            "-o",
            "PreferredAuthentications=password",
            "-o",
            "PubkeyAuthentication=no",
            "-o",
            "StrictHostKeyChecking=no",
            "-o",
            "UserKnownHostsFile=/dev/null",
            "-o",
            "GlobalKnownHostsFile=/dev/null",
            "-o",
            "LogLevel=ERROR",
            "-p",
            str(self.config.port),
            f"{self.config.user}@{self.config.host}",
            remote_command,
        ]

    def _wrap_remote_command(self, command: list[str]) -> str:
        inner = shlex.join(command)
        remote_parts = []
        if self.config.remote_init.strip():
            remote_parts.append(self.config.remote_init.strip())
        remote_parts.append(inner)
        remote_script = "; ".join(remote_parts)
        return f"{self.config.remote_shell} -lc {shlex.quote(remote_script)}"

    def _create_askpass_script(self) -> str:
        with tempfile.NamedTemporaryFile("w", delete=False) as handle:
            handle.write("#!/bin/sh\n")
            handle.write("printf '%s\\n' \"$CLAW_SSH_PASSWORD\"\n")
            path = handle.name
        os.chmod(path, 0o700)
        return path
