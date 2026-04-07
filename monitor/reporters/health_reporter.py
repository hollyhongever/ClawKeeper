# Created by Codex for module 3 (work detection), date: 2026-04-04

from __future__ import annotations

import json

from monitor.schemas.report import MonitorReport


class HealthReporter:
    """Renders the structured health overview for dashboards and push modules."""

    def render(self, report: MonitorReport) -> str:
        overview = report.metrics.get("health_overview", {})
        return json.dumps(overview, indent=2, ensure_ascii=False)

