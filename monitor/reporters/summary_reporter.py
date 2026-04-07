# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

from collections import Counter

from monitor.schemas.report import MonitorReport


class SummaryReporter:
    """Provides a concise human-readable summary for logs or notifications."""

    def render(self, report: MonitorReport) -> str:
        counter = Counter(event.severity for event in report.events)
        return (
            f"task={report.task_id} state={report.final_state} step={report.latest_step} "
            f"events={len(report.events)} info={counter.get('info', 0)} "
            f"warning={counter.get('warning', 0)} error={counter.get('error', 0)} "
            f"summary={report.summary}"
        )

