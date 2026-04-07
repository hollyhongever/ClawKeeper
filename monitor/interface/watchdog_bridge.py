# Created by Codex for module 3 (work detection), date: 2026-04-07

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from monitor.schemas.event import DetectionEvent
from monitor.schemas.report import MonitorReport


EVENT_LOG_FILE = "events.jsonl"
STATE_FILE = "runtime-watchdog-state.json"
SERVICE_NAME = "runtime-watchdog"
ALERT_SEVERITIES = {"warning", "error"}
STABLE_METADATA_KEYS = (
    "probe",
    "tool_name",
    "step",
    "raw_step",
    "namespace",
    "pod",
    "status",
    "sandbox_name",
    "gateway_name",
    "issue_code",
)


@dataclass
class ActiveIssue:
    key: str
    code: str
    severity: str
    message: str
    latest_step: str | None = None
    detail: str | None = None


class WatchdogEventBridge:
    """Maps monitor findings into the existing service-events notification stream."""

    def __init__(
        self,
        pid_dir: str,
        sandbox_name: str,
        *,
        state_path: str | None = None,
        event_log_path: str | None = None,
    ) -> None:
        self.pid_dir = Path(pid_dir)
        self.pid_dir.mkdir(parents=True, exist_ok=True)
        self.sandbox_name = sandbox_name
        self.state_path = Path(state_path) if state_path else self.pid_dir / STATE_FILE
        self.event_log_path = (
            Path(event_log_path) if event_log_path else self.pid_dir / EVENT_LOG_FILE
        )
        self._active_issues = self._load_state()

    def process_report(self, report: MonitorReport) -> list[dict[str, Any]]:
        current_issues: dict[str, ActiveIssue] = {}
        for event in report.events:
            if event.severity not in ALERT_SEVERITIES:
                continue
            issue = self._issue_from_event(report, event)
            current_issues[issue.key] = issue
        return self._reconcile(current_issues)

    def process_failure(self, detail: str) -> list[dict[str, Any]]:
        issue = ActiveIssue(
            key="watchdog_poll_failed",
            code="watchdog_poll_failed",
            severity="error",
            message="Runtime watchdog failed to collect monitoring data.",
            detail=detail.strip()[:500],
        )
        return self._reconcile({issue.key: issue})

    def _reconcile(self, current_issues: dict[str, ActiveIssue]) -> list[dict[str, Any]]:
        emitted: list[dict[str, Any]] = []

        for key, issue in current_issues.items():
            previous = self._active_issues.get(key)
            if previous is None or previous.detail != issue.detail:
                emitted.append(
                    self._append_service_event(
                        level=self._service_level(issue.severity),
                        title=self._issue_title(issue),
                        detail=self._issue_detail(issue),
                    )
                )

        for key, previous in self._active_issues.items():
            if key not in current_issues:
                emitted.append(
                    self._append_service_event(
                        level="info",
                        title=self._recovery_title(previous),
                        detail=self._recovery_detail(previous),
                    )
                )

        self._active_issues = current_issues
        self._save_state()
        return emitted

    def _issue_from_event(
        self, report: MonitorReport, event: DetectionEvent
    ) -> ActiveIssue:
        key = self._issue_key(event)
        detail_lines = [event.message]
        if report.summary and report.summary != event.message:
            detail_lines.append(f"summary: {report.summary}")
        if report.latest_step:
            detail_lines.append(f"step: {report.latest_step}")
        metadata_summary = self._metadata_summary(event.metadata)
        if metadata_summary:
            detail_lines.append(metadata_summary)
        detail_lines.append(f"sandbox: {self.sandbox_name}")

        return ActiveIssue(
            key=key,
            code=event.code,
            severity=event.severity,
            message=event.message,
            latest_step=report.latest_step,
            detail="\n".join(detail_lines),
        )

    def _issue_key(self, event: DetectionEvent) -> str:
        metadata_fingerprint = "|".join(
            f"{name}={event.metadata.get(name)}"
            for name in STABLE_METADATA_KEYS
            if event.metadata.get(name) not in (None, "")
        )
        parts = [event.detector, event.code, metadata_fingerprint or event.message]
        return "::".join(parts)

    def _metadata_summary(self, metadata: dict[str, Any]) -> str:
        parts = []
        for name in STABLE_METADATA_KEYS:
            value = metadata.get(name)
            if value in (None, ""):
                continue
            parts.append(f"{name}: {value}")
        return ", ".join(parts)

    def _issue_title(self, issue: ActiveIssue) -> str:
        prefix = "Watchdog error" if issue.severity == "error" else "Watchdog warning"
        return f"{prefix}: {issue.code.replace('_', ' ')}"

    def _recovery_title(self, issue: ActiveIssue) -> str:
        return f"Watchdog recovered: {issue.code.replace('_', ' ')}"

    def _issue_detail(self, issue: ActiveIssue) -> str:
        return issue.detail or issue.message

    def _recovery_detail(self, issue: ActiveIssue) -> str:
        detail_lines = [issue.message]
        if issue.latest_step:
            detail_lines.append(f"last step: {issue.latest_step}")
        detail_lines.append(f"sandbox: {self.sandbox_name}")
        return "\n".join(detail_lines)

    def _service_level(self, severity: str) -> str:
        if severity == "error":
            return "error"
        if severity == "warning":
            return "warn"
        return "info"

    def _append_service_event(
        self, *, level: str, title: str, detail: str | None = None
    ) -> dict[str, Any]:
        event = {
            "id": str(uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "source": SERVICE_NAME,
            "title": title,
            "detail": detail,
            "service": SERVICE_NAME,
        }
        with self.event_log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")
        return event

    def _load_state(self) -> dict[str, ActiveIssue]:
        if not self.state_path.exists():
            return {}
        try:
            payload = json.loads(self.state_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
        raw_issues = payload.get("active_issues", {})
        active_issues: dict[str, ActiveIssue] = {}
        for key, raw_issue in raw_issues.items():
            if not isinstance(raw_issue, dict):
                continue
            try:
                active_issues[key] = ActiveIssue(key=key, **raw_issue)
            except TypeError:
                continue
        return active_issues

    def _save_state(self) -> None:
        payload = {
            "sandbox_name": self.sandbox_name,
            "active_issues": {
                key: {
                    field: value
                    for field, value in asdict(issue).items()
                    if field != "key"
                }
                for key, issue in self._active_issues.items()
            },
        }
        self.state_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
        )
