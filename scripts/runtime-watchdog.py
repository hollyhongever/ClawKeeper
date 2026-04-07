#!/usr/bin/env python3
# Created by Codex for module 3 (work detection), date: 2026-04-07

from __future__ import annotations

import signal
import sys
import time
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from monitor.collectors.status_collector import NemoClawStatusCollector
from monitor.interface.monitor_service import MonitorService
from monitor.interface.watchdog_bridge import WatchdogEventBridge


SANDBOX_NAME = (
    __import__("os").environ.get("NEMOCLAW_SANDBOX")
    or __import__("os").environ.get("SANDBOX_NAME")
    or "default"
)
PID_DIR = __import__("os").environ.get(
    "NEMOCLAW_PID_DIR", f"/tmp/nemoclaw-services-{SANDBOX_NAME}"
)
POLL_MS = max(
    5000,
    int(__import__("os").environ.get("NEMOCLAW_WATCHDOG_POLL_MS", "15000")),
)

_RUNNING = True


def _shutdown(_signum: int, _frame: object) -> None:
    global _RUNNING
    _RUNNING = False


def main() -> None:
    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    bridge = WatchdogEventBridge(pid_dir=PID_DIR, sandbox_name=SANDBOX_NAME)

    while _RUNNING:
        try:
            collector = NemoClawStatusCollector.from_env(task_id="runtime-watchdog")
            report = MonitorService(collector=collector).run()
            bridge.process_report(report)
        except Exception as exc:  # pragma: no cover - exercised in integration
            bridge.process_failure(str(exc))

        deadline = time.monotonic() + (POLL_MS / 1000.0)
        while _RUNNING and time.monotonic() < deadline:
            time.sleep(0.2)


if __name__ == "__main__":
    main()
