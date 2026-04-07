# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

import os
import subprocess
import unittest
from unittest.mock import patch

from monitor.collectors.ssh_runner import SSHCommandRunner, SSHConnectionConfig
from monitor.config import get_ssh_connection_config


class SSHRunnerTests(unittest.TestCase):
    def test_wrap_remote_command_includes_init(self) -> None:
        runner = SSHCommandRunner(
            SSHConnectionConfig(
                host="example.com",
                port=22,
                user="demo",
                password="secret",
                remote_init='export PATH="$HOME/.local/bin:$PATH"',
            )
        )
        wrapped = runner._wrap_remote_command(["openshell", "status"])
        self.assertIn("bash -lc", wrapped)
        self.assertIn("export PATH=", wrapped)
        self.assertIn("openshell status", wrapped)

    @patch("monitor.collectors.ssh_runner.subprocess.run")
    def test_run_uses_ssh_without_leaking_password_in_args(self, mock_run) -> None:
        mock_run.return_value = subprocess.CompletedProcess(
            ["/usr/bin/ssh"], 0, stdout="ok", stderr=""
        )
        runner = SSHCommandRunner(
            SSHConnectionConfig(
                host="example.com",
                port=22,
                user="demo",
                password="super-secret",
            )
        )
        result = runner.run(["openshell", "status"])
        self.assertEqual(result.stdout, "ok")
        args, kwargs = mock_run.call_args
        command = args[0]
        joined = " ".join(command)
        self.assertIn("demo@example.com", joined)
        self.assertNotIn("super-secret", joined)
        self.assertIn("SSH_ASKPASS", kwargs["env"])
        self.assertEqual(kwargs["env"]["SSH_ASKPASS_REQUIRE"], "force")

    def test_get_ssh_connection_config_from_env(self) -> None:
        old_env = {
            key: os.environ.get(key)
            for key in [
                "CLAW_SSH_HOST",
                "CLAW_SSH_PORT",
                "CLAW_SSH_USER",
                "CLAW_SSH_PASSWORD",
                "CLAW_SSH_BIN",
                "CLAW_REMOTE_SHELL",
                "CLAW_REMOTE_INIT",
            ]
        }
        try:
            os.environ["CLAW_SSH_HOST"] = "example.com"
            os.environ["CLAW_SSH_PORT"] = "2222"
            os.environ["CLAW_SSH_USER"] = "demo"
            os.environ["CLAW_SSH_PASSWORD"] = "secret"
            os.environ["CLAW_SSH_BIN"] = "/custom/ssh"
            os.environ["CLAW_REMOTE_SHELL"] = "zsh"
            os.environ["CLAW_REMOTE_INIT"] = "source ~/.zshrc"
            config = get_ssh_connection_config()
        finally:
            for key, value in old_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
        assert config is not None
        self.assertEqual(config.host, "example.com")
        self.assertEqual(config.port, 2222)
        self.assertEqual(config.user, "demo")
        self.assertEqual(config.ssh_bin, "/custom/ssh")
        self.assertEqual(config.remote_shell, "zsh")
        self.assertEqual(config.remote_init, "source ~/.zshrc")


if __name__ == "__main__":
    unittest.main()

