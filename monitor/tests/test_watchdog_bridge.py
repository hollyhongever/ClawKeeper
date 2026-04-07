# Created by Codex for module 3 (work detection), date: 2026-04-07

from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from monitor.interface.watchdog_bridge import WatchdogEventBridge
from monitor.schemas.event import DetectionEvent
from monitor.schemas.report import MonitorReport


def _report_with_events(events: list[DetectionEvent]) -> MonitorReport:
    return MonitorReport(
        task_id="runtime-watchdog",
        final_state="succeeded",
        started_at=datetime.now(timezone.utc).isoformat(),
        ended_at=datetime.now(timezone.utc).isoformat(),
        latest_step="gateway_status",
        summary="Gateway status snapshot completed.",
        events=events,
        metrics={},
        detector_snapshots={},
    )


class WatchdogBridgeTests(unittest.TestCase):
    def test_emits_once_for_same_issue_and_recovers_when_clear(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            bridge = WatchdogEventBridge(pid_dir=tmpdir, sandbox_name="demo")
            warning = DetectionEvent(
                task_id="runtime-watchdog",
                timestamp=datetime.now(timezone.utc),
                detector="probe_health",
                code="openshell_status_warning",
                severity="warning",
                message="Probe 'openshell_status' reported status 'disconnected'.",
                category="health",
                metadata={"probe": "openshell_status", "status": "disconnected"},
            )

            first = bridge.process_report(_report_with_events([warning]))
            second = bridge.process_report(_report_with_events([warning]))
            cleared = bridge.process_report(_report_with_events([]))

            self.assertEqual(len(first), 1)
            self.assertEqual(first[0]["level"], "warn")
            self.assertEqual(len(second), 0)
            self.assertEqual(len(cleared), 1)
            self.assertEqual(cleared[0]["level"], "info")
            self.assertIn("recovered", cleared[0]["title"].lower())

    def test_records_poll_failure_and_clears_after_success(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            bridge = WatchdogEventBridge(pid_dir=tmpdir, sandbox_name="demo")

            failed = bridge.process_failure("ssh timed out")
            cleared = bridge.process_report(_report_with_events([]))

            self.assertEqual(len(failed), 1)
            self.assertEqual(failed[0]["level"], "error")
            self.assertEqual(len(cleared), 1)
            self.assertIn("recovered", cleared[0]["title"].lower())

    def test_writes_events_jsonl_entries(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            bridge = WatchdogEventBridge(pid_dir=tmpdir, sandbox_name="demo")
            error = DetectionEvent(
                task_id="runtime-watchdog",
                timestamp=datetime.now(timezone.utc),
                detector="probe_health",
                code="k8s_pod_issue",
                severity="error",
                message="Kubernetes pod issue detected: openshell-0 is CrashLoopBackOff",
                category="health",
                metadata={
                    "probe": "k8s_pods",
                    "namespace": "openshell",
                    "pod": "openshell-0",
                    "status": "CrashLoopBackOff",
                },
            )

            bridge.process_report(_report_with_events([error]))

            lines = (
                Path(tmpdir, "events.jsonl").read_text(encoding="utf-8").strip().splitlines()
            )
            self.assertEqual(len(lines), 1)
            payload = json.loads(lines[0])
            self.assertEqual(payload["source"], "runtime-watchdog")
            self.assertEqual(payload["service"], "runtime-watchdog")
            self.assertEqual(payload["level"], "error")
