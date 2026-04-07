# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

import subprocess
import unittest
from typing import IO

from monitor.collectors.cli_collector import (
    CLICollector,
    NemoClawCLICollector,
    build_nemoclaw_probes,
    parse_onboard_session_json,
    parse_kubectl_pods,
    parse_openshell_status,
    parse_sandboxes_json,
    resolve_stage,
)
from monitor.config import NemoClawRuntimeConfig


class FakeProcess:
    def __init__(self, lines: list[str], return_code: int = 0) -> None:
        self.stdout: IO[str] = iter([f"{line}\n" for line in lines])  # type: ignore[assignment]
        self._return_code = return_code

    def poll(self) -> int | None:
        return self._return_code

    def wait(self) -> int:
        return self._return_code


class FakeRunner:
    def __init__(
        self,
        *,
        stream_lines: list[str],
        probe_outputs: dict[str, tuple[int, str]],
        return_code: int = 0,
    ) -> None:
        self.stream_lines = stream_lines
        self.probe_outputs = probe_outputs
        self.return_code = return_code

    def spawn(self, command: list[str]) -> FakeProcess:
        return FakeProcess(self.stream_lines, self.return_code)

    def run(self, command: list[str]) -> subprocess.CompletedProcess[str]:
        key = " ".join(command)
        return_code, stdout = self.probe_outputs.get(key, (0, ""))
        return subprocess.CompletedProcess(command, return_code, stdout=stdout, stderr="")


class CLICollectorTests(unittest.TestCase):
    def test_parse_openshell_status_connected(self) -> None:
        observations = parse_openshell_status(
            "\x1b[1m\x1b[36mServer Status\x1b[39m\x1b[0m\n\n"
            "  Gateway: nemoclaw\n"
            "  Server: https://127.0.0.1:8080/connect\n"
            "  Status: \x1b[32mConnected\x1b[39m\n"
            "  Version: 0.0.19\n"
        )
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].status, "connected")
        self.assertEqual(observations[0].metadata["gateway_name"], "nemoclaw")
        self.assertEqual(observations[0].metadata["version"], "0.0.19")

    def test_parse_kubectl_pods_detects_problem_rows(self) -> None:
        text = (
            "NAMESPACE NAME READY STATUS\n"
            "kube-system coredns-abc 1/1 Running\n"
            "openshell openshell-0 0/1 ContainerCreating\n"
        )
        observations = parse_kubectl_pods(text)
        self.assertEqual(observations[0].status, "degraded")
        self.assertEqual(observations[1].status, "ContainerCreating")

    def test_resolve_stage_maps_known_onboarding_step(self) -> None:
        step, label = resolve_stage("Starting OpenShell gateway")
        self.assertEqual(step, "gateway_start")
        self.assertEqual(label, "gateway bootstrap in progress")

    def test_parse_onboard_session_json_maps_real_steps(self) -> None:
        observations = parse_onboard_session_json(
            """
            {
              "status": "complete",
              "sandboxName": "my-assistant",
              "provider": "ollama-local",
              "model": "nemotron-3-nano:30b",
              "lastCompletedStep": "policies",
              "lastStepStarted": "policies",
              "resumable": false,
              "steps": {
                "preflight": {"status": "complete", "startedAt": "t1", "completedAt": "t2", "error": null},
                "provider_selection": {"status": "complete", "startedAt": "t3", "completedAt": "t4", "error": null},
                "inference": {"status": "complete", "startedAt": "t5", "completedAt": "t6", "error": null},
                "sandbox": {"status": "complete", "startedAt": "t7", "completedAt": "t8", "error": null},
                "policies": {"status": "complete", "startedAt": "t9", "completedAt": "t10", "error": null}
              }
            }
            """
        )
        self.assertEqual(observations[0].step, "onboard_session")
        semantic_steps = {item.step for item in observations[1:]}
        self.assertIn("preflight", semantic_steps)
        self.assertIn("provider_selection", semantic_steps)
        self.assertIn("sandbox_create", semantic_steps)
        self.assertIn("policies", semantic_steps)

    def test_parse_sandboxes_json_extracts_default(self) -> None:
        observations = parse_sandboxes_json(
            """
            {
              "sandboxes": {
                "my-assistant": {
                  "name": "my-assistant",
                  "createdAt": "2026-04-01T19:48:26.635Z",
                  "gpuEnabled": true,
                  "policies": ["pypi", "npm"]
                }
              },
              "defaultSandbox": "my-assistant"
            }
            """
        )
        self.assertEqual(observations[0].metadata["default_sandbox"], "my-assistant")
        self.assertEqual(observations[1].metadata["sandbox_name"], "my-assistant")

    def test_nemoclaw_cli_collector_builds_stream_and_probe_observations(self) -> None:
        runner = FakeRunner(
            stream_lines=[
                "[2/7] Starting OpenShell gateway",
                "Tool: openshell_status",
                "K8s namespace not ready",
                "Summary: gateway bootstrap is still waiting",
            ],
            probe_outputs={
                "openshell status": (0, "Connected\n"),
                "docker inspect openshell-cluster-nemoclaw --format={{.State.Health.Status}}": (
                    0,
                    "healthy\n",
                ),
                "docker exec openshell-cluster-nemoclaw sh -c KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get pods -A": (
                    0,
                    "NAMESPACE NAME READY STATUS\nopenshell openshell-0 1/1 Running\n",
                ),
                "nemoclaw demo status": (0, "Sandbox running\n"),
            },
        )
        collector = NemoClawCLICollector(
            task_id="demo-cli",
            command=["nemoclaw", "onboard"],
            sandbox_name="demo",
            poll_interval_seconds=999,
            runner=runner,
        )
        observations = collector.collect()
        kinds = [item.kind for item in observations]
        statuses = {item.status for item in observations if item.status}
        tool_names = {item.tool_name for item in observations if item.tool_name}
        self.assertIn("task_start", kinds)
        self.assertIn("summary", kinds)
        self.assertIn("health_check", kinds)
        self.assertIn("task_end", kinds)
        self.assertIn("connected", statuses)
        self.assertIn("running", statuses)
        self.assertIn("openshell_status", tool_names)
        stage_updates = [item for item in observations if item.kind == "status_update"]
        self.assertEqual(stage_updates[0].step, "gateway_start")
        self.assertEqual(
            stage_updates[0].metadata["semantic_label"],
            "gateway bootstrap in progress",
        )

    def test_cli_collector_handles_missing_binary(self) -> None:
        class MissingRunner:
            def spawn(self, command: list[str]) -> FakeProcess:
                raise FileNotFoundError(2, "No such file or directory", command[0])

            def run(self, command: list[str]) -> subprocess.CompletedProcess[str]:
                raise AssertionError("run should not be called")

        collector = CLICollector(
            task_id="missing-binary",
            command=["openshell", "status"],
            runner=MissingRunner(),
        )
        observations = collector.collect()
        self.assertEqual(observations[-1].status, "failed")
        self.assertEqual(observations[-1].metadata["return_code"], 127)

    def test_runtime_config_reads_environment(self) -> None:
        import os

        old_env = {
            key: os.environ.get(key)
            for key in [
                "CLAW_OPENSHELL_BIN",
                "CLAW_NEMOCLAW_BIN",
                "CLAW_DOCKER_BIN",
                "CLAW_OPENSHELL_CONTAINER",
                "CLAW_KUBECONFIG_PATH",
                "CLAW_SANDBOX_NAME",
                "CLAW_CLI_POLL_INTERVAL",
            ]
        }
        try:
            os.environ["CLAW_OPENSHELL_BIN"] = "/opt/bin/openshell"
            os.environ["CLAW_NEMOCLAW_BIN"] = "/opt/bin/nemoclaw"
            os.environ["CLAW_DOCKER_BIN"] = "/opt/bin/docker"
            os.environ["CLAW_OPENSHELL_CONTAINER"] = "custom-container"
            os.environ["CLAW_KUBECONFIG_PATH"] = "/tmp/k3s.yaml"
            os.environ["CLAW_SANDBOX_NAME"] = "sandbox-a"
            os.environ["CLAW_CLI_POLL_INTERVAL"] = "7.5"
            os.environ["CLAW_ONBOARD_SESSION_PATH"] = "/tmp/onboard-session.json"
            os.environ["CLAW_SANDBOXES_PATH"] = "/tmp/sandboxes.json"
            config = NemoClawRuntimeConfig.from_env()
        finally:
            for key, value in old_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

        self.assertEqual(config.openshell_bin, "/opt/bin/openshell")
        self.assertEqual(config.nemoclaw_bin, "/opt/bin/nemoclaw")
        self.assertEqual(config.docker_bin, "/opt/bin/docker")
        self.assertEqual(config.container_name, "custom-container")
        self.assertEqual(config.kubeconfig_path, "/tmp/k3s.yaml")
        self.assertEqual(config.sandbox_name, "sandbox-a")
        self.assertEqual(config.poll_interval_seconds, 7.5)
        self.assertEqual(config.onboard_session_path, "/tmp/onboard-session.json")
        self.assertEqual(config.sandboxes_path, "/tmp/sandboxes.json")

    def test_build_nemoclaw_probes_includes_file_probes(self) -> None:
        probes = build_nemoclaw_probes(
            sandbox_name="sandbox-a",
            onboard_session_path="/tmp/onboard-session.json",
            sandboxes_path="/tmp/sandboxes.json",
        )
        probe_names = [probe.name for probe in probes]
        self.assertIn("openshell_status", probe_names)
        self.assertIn("nemoclaw_status", probe_names)
        self.assertIn("onboard_session", probe_names)
        self.assertIn("sandboxes_json", probe_names)


if __name__ == "__main__":
    unittest.main()
