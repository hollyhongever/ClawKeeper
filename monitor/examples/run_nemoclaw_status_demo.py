# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

from monitor.collectors.status_collector import NemoClawStatusCollector
from monitor.interface.monitor_service import MonitorService
from monitor.reporters.health_reporter import HealthReporter
from monitor.reporters.json_reporter import JsonReporter
from monitor.reporters.summary_reporter import SummaryReporter


def main() -> None:
    collector = NemoClawStatusCollector.from_env(task_id="nemoclaw-status-demo")
    report = MonitorService(collector=collector).run()
    print(SummaryReporter().render(report))
    print(HealthReporter().render(report))
    print(JsonReporter().render(report))


if __name__ == "__main__":
    main()
