# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

from monitor.collectors.cli_collector import NemoClawCLICollector
from monitor.collectors.ssh_runner import SSHCommandRunner
from monitor.config import NemoClawRuntimeConfig, get_ssh_connection_config
from monitor.interface.monitor_service import MonitorService
from monitor.reporters.json_reporter import JsonReporter
from monitor.reporters.summary_reporter import SummaryReporter


def main() -> None:
    config = NemoClawRuntimeConfig.from_env()
    ssh_config = get_ssh_connection_config()
    runner = SSHCommandRunner(ssh_config) if ssh_config else None
    collector = NemoClawCLICollector.from_env(
        task_id="nemoclaw-onboard-demo",
        command=[config.openshell_bin, "status"],
    )
    if runner is not None:
        collector.runner = runner
    report = MonitorService(collector=collector).run()
    print(SummaryReporter().render(report))
    print(JsonReporter().render(report))


if __name__ == "__main__":
    main()
