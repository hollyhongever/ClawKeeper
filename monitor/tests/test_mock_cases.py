# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

import unittest
from pathlib import Path

from monitor.collectors.mock_collector import MockObservationCollector
from monitor.interface.monitor_service import MonitorService, MonitorSettings


FIXTURE_DIR = Path(__file__).parent / "fixtures"


class MonitorFrameworkTests(unittest.TestCase):
    def _run_fixture(self, name: str) -> dict:
        collector = MockObservationCollector(FIXTURE_DIR / name)
        settings = MonitorSettings(
            stall_timeout_seconds=120,
            task_timeout_seconds=300,
            repeated_step_threshold=4,
            repeated_tool_threshold=3,
            repeated_fingerprint_threshold=4,
            long_output_threshold=180,
            repeated_output_threshold=3,
        )
        report = MonitorService(collector=collector, settings=settings).run()
        return report.to_dict()

    def test_normal_task_stays_clean(self) -> None:
        report = self._run_fixture("normal_task.jsonl")
        self.assertEqual(report["final_state"], "succeeded")
        self.assertEqual(report["metrics"]["error_count"], 0)
        codes = {event["code"] for event in report["events"]}
        self.assertIn("task_started", codes)
        self.assertIn("task_finished", codes)
        self.assertNotIn("suspected_loop", codes)
        self.assertNotIn("task_timeout", codes)

    def test_loop_task_detects_repetition(self) -> None:
        report = self._run_fixture("loop_task.jsonl")
        codes = {event["code"] for event in report["events"]}
        self.assertIn("repeated_tool_call", codes)
        self.assertIn("repeated_output", codes)
        self.assertIn("suspected_loop", codes)

    def test_timeout_task_detects_stall_and_timeout(self) -> None:
        report = self._run_fixture("timeout_task.jsonl")
        codes = {event["code"] for event in report["events"]}
        self.assertIn("stall_detected", codes)
        self.assertIn("task_timeout", codes)
        self.assertIn("task_failed", codes)


if __name__ == "__main__":
    unittest.main()

