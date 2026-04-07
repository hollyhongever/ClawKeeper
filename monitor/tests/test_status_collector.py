# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

import subprocess
import unittest

from monitor.collectors.status_collector import NemoClawStatusCollector
from monitor.interface.monitor_service import MonitorService
from monitor.reporters.health_reporter import HealthReporter


class FakeRunner:
    def __init__(self, outputs: dict[str, tuple[int, str]]) -> None:
        self.outputs = outputs

    def run(self, command: list[str]) -> subprocess.CompletedProcess[str]:
        key = " ".join(command)
        return_code, stdout = self.outputs.get(key, (0, ""))
        return subprocess.CompletedProcess(command, return_code, stdout=stdout, stderr="")


class StatusCollectorTests(unittest.TestCase):
    def test_status_snapshot_collector_creates_summary(self) -> None:
        runner = FakeRunner(
            {
                "openshell status": (
                    0,
                    "Server Status\nGateway: nemoclaw\nStatus: Connected\nVersion: 0.0.19\n",
                ),
                "docker inspect openshell-cluster-nemoclaw --format={{.State.Health.Status}}": (
                    0,
                    "healthy\n",
                ),
                "docker exec openshell-cluster-nemoclaw sh -c KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get pods -A": (
                    0,
                    "NAMESPACE NAME READY STATUS\nopenshell openshell-0 1/1 Running\n",
                ),
            }
        )
        collector = NemoClawStatusCollector(task_id="status-demo", runner=runner)
        observations = collector.collect()
        kinds = [item.kind for item in observations]
        self.assertIn("summary", kinds)
        summary = [item.content for item in observations if item.kind == "summary"][0]
        self.assertIn("nemoclaw connected", summary)
        self.assertIn("container healthy", summary)

    def test_probe_health_detector_flags_degraded_status(self) -> None:
        runner = FakeRunner(
            {
                "openshell status": (
                    0,
                    "Server Status\nGateway: nemoclaw\nStatus: Connected\nVersion: 0.0.19\n",
                ),
                "docker inspect openshell-cluster-nemoclaw --format={{.State.Health.Status}}": (
                    0,
                    "healthy\n",
                ),
                "docker exec openshell-cluster-nemoclaw sh -c KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get pods -A": (
                    0,
                    "NAMESPACE NAME READY STATUS\nopenshell openshell-0 0/1 ContainerCreating\n",
                ),
            }
        )
        collector = NemoClawStatusCollector(task_id="status-demo", runner=runner)
        report = MonitorService(collector=collector).run().to_dict()
        codes = {event["code"] for event in report["events"]}
        self.assertIn("k8s_pods_warning", codes)
        self.assertIn("k8s_pod_issue", codes)

    def test_health_overview_contains_structured_probe_state(self) -> None:
        runner = FakeRunner(
            {
                "openshell status": (
                    0,
                    "Server Status\nGateway: nemoclaw\nServer: https://127.0.0.1:8080/connect\nStatus: Connected\nVersion: 0.0.19\n",
                ),
                "docker inspect openshell-cluster-nemoclaw --format={{.State.Health.Status}}": (
                    0,
                    "healthy\n",
                ),
                "docker exec openshell-cluster-nemoclaw sh -c KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get pods -A": (
                    0,
                    "NAMESPACE NAME READY STATUS\nopenshell openshell-0 1/1 Running\n",
                ),
                "bash -lc cat /tmp/onboard-session.json": (
                    0,
                    '{"status":"complete","sandboxName":"my-assistant","provider":"ollama-local","model":"nemotron","lastCompletedStep":"policies","lastStepStarted":"policies","resumable":false,"steps":{"preflight":{"status":"complete","startedAt":"t1","completedAt":"t2","error":null},"sandbox":{"status":"complete","startedAt":"t3","completedAt":"t4","error":null}}}',
                ),
                "bash -lc cat /tmp/sandboxes.json": (
                    0,
                    '{"sandboxes":{"my-assistant":{"name":"my-assistant","createdAt":"2026-04-01T19:48:26.635Z","gpuEnabled":true,"policies":["pypi","npm"]}},"defaultSandbox":"my-assistant"}',
                ),
            }
        )
        collector = NemoClawStatusCollector(
            task_id="status-demo",
            runner=runner,
            onboard_session_path="/tmp/onboard-session.json",
            sandboxes_path="/tmp/sandboxes.json",
        )
        report = MonitorService(collector=collector).run()
        overview = report.to_dict()["metrics"]["health_overview"]
        self.assertEqual(overview["gateway"]["status"], "connected")
        self.assertEqual(overview["container"]["status"], "healthy")
        self.assertEqual(overview["k8s"]["issue_count"], 0)
        self.assertEqual(overview["onboard_session"]["last_completed_step"], "policies")
        self.assertEqual(overview["sandbox_registry"]["default_sandbox"], "my-assistant")
        rendered = HealthReporter().render(report)
        self.assertIn('"gateway"', rendered)
        self.assertIn('"sandbox_registry"', rendered)


if __name__ == "__main__":
    unittest.main()
