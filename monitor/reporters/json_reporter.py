# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

import json

from monitor.schemas.report import MonitorReport


class JsonReporter:
    """Serializes monitor reports for APIs and push modules."""

    def render(self, report: MonitorReport) -> str:
        return json.dumps(report.to_dict(), indent=2, ensure_ascii=False)

