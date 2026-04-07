# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

from pathlib import Path

from monitor.collectors.mock_collector import MockObservationCollector
from monitor.interface.monitor_service import MonitorService
from monitor.reporters.json_reporter import JsonReporter
from monitor.reporters.summary_reporter import SummaryReporter


def main() -> None:
    fixture_dir = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
    json_reporter = JsonReporter()
    summary_reporter = SummaryReporter()

    for fixture in sorted(fixture_dir.glob("*.jsonl")):
        report = MonitorService(MockObservationCollector(fixture)).run()
        print(f"=== {fixture.name} ===")
        print(summary_reporter.render(report))
        print(json_reporter.render(report))
        print()


if __name__ == "__main__":
    main()

