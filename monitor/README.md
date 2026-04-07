<!-- Created by Codex for module 3 (work detection), date: 2026-04-04 -->

# Monitor Module

## Purpose

This directory contains module 3 for ClawKeeper / BossClaw: a local-first work detection framework for agent task monitoring.

## Design

The MVP follows four layers:

- `collectors/`: normalize runtime observations from mock files or subprocess output.
- `detectors/`: run rules for lifecycle, timeout, loop, and output quality checks.
- `schemas/`: define normalized observation, event, and report structures.
- `interface/` and `reporters/`: expose one unified monitoring service and render structured results.

## Files

- `schemas/observation.py`: normalized observation model.
- `schemas/event.py`: standard alert event schema.
- `schemas/report.py`: final report schema consumed by UI or push modules.
- `collectors/mock_collector.py`: reads JSONL fixtures for local testing.
- `collectors/subprocess_collector.py`: wraps a local command into an observation stream.
- `collectors/cli_collector.py`: streams NemoClaw/OpenShell CLI output and polls health commands.
- `collectors/status_collector.py`: runs one-shot status probes and synthesizes a health summary.
- `collectors/ssh_runner.py`: runs the same collector commands against a remote host over read-only SSH.
- `config.py`: reads collector runtime settings from environment variables.
- `detectors/task_state.py`: lifecycle tracking and repeated-step detection.
- `detectors/timeout.py`: stall and total timeout detection.
- `detectors/loop.py`: repeated tool call and repeated pattern detection.
- `detectors/output_quality.py`: long output, repeated output, and truncation checks.
- `detectors/probe_health.py`: turns probe failures and degraded statuses into health events.
- `interface/monitor_service.py`: orchestrates collectors and detectors.
- `interface/watchdog_bridge.py`: bridges monitoring findings into the shared service-event log used by push notifications.
- `reporters/json_reporter.py`: machine-readable JSON output.
- `reporters/summary_reporter.py`: short summary string for logs or notifications.
- `reporters/health_reporter.py`: renders the structured health overview for dashboards and push systems.
- `tests/fixtures/*.jsonl`: three deterministic demo scenarios.
- `tests/test_mock_cases.py`: unit tests for the MVP scenarios.
- `tests/test_cli_collector.py`: parser and CLI collector tests for NemoClaw/OpenShell integration.
- `tests/test_status_collector.py`: verifies one-shot status snapshots and health alerts.
- `tests/test_ssh_runner.py`: verifies SSH runner command assembly and env-driven SSH config.
- `tests/test_watchdog_bridge.py`: verifies event dedupe, recovery emission, and `events.jsonl` output.
- `examples/run_mock_demo.py`: prints structured results for all mock scenarios.
- `examples/run_nemoclaw_cli_demo.py`: example entrypoint for a live NemoClaw CLI run.
- `examples/run_nemoclaw_status_demo.py`: example entrypoint for read-only local or remote status snapshots.
- `scripts/runtime-watchdog.py`: host-side polling loop that runs status probes and writes normalized watchdog alerts.

## NemoClaw / OpenClaw Integration Path

### Based on local file facts

- NemoClaw deployment currently exposes observable signals through CLI output, Docker health, k3s pod status, and sandbox status commands.
- The repository does not yet contain a direct NemoClaw SDK integration.

### Recommended path

1. Keep the current framework local-first and collector-driven.
2. Add a `NemoClawCollector` later that converts:
   - `nemoclaw onboard` stdout/stderr
   - `openshell status`
   - Docker health checks
   - `kubectl get pods -A`
   into the same `Observation` schema.
3. This repository now includes a read-only `NemoClawCLICollector` for that path.
4. If OpenClaw exposes cleaner runtime traces first, support OpenClaw by adding another collector instead of changing detector logic.

### Environment-driven runtime configuration

The CLI collector reads these optional environment variables:

- `CLAW_OPENSHELL_BIN`
- `CLAW_NEMOCLAW_BIN`
- `CLAW_DOCKER_BIN`
- `CLAW_OPENSHELL_CONTAINER`
- `CLAW_KUBECONFIG_PATH`
- `CLAW_SANDBOX_NAME`
- `CLAW_CLI_POLL_INTERVAL`
- `CLAW_ONBOARD_SESSION_PATH`
- `CLAW_SANDBOXES_PATH`
- `CLAW_SSH_BIN`
- `CLAW_REMOTE_SHELL`
- `CLAW_REMOTE_INIT`

This keeps collector wiring out of source code and avoids hardcoding machine-specific paths.

### Recon findings aligned into the parser

Based on read-only remote inspection:

- `openshell` may exist at an absolute path such as `/home/.../.local/bin/openshell` even when `PATH` does not include `~/.local/bin`.
- `openshell status` emits ANSI-colored text with `Gateway`, `Server`, `Status`, and `Version` fields.
- the OpenShell cluster container can be healthy while CLI shims are missing from `PATH`.
- `~/.nemoclaw/onboard-session.json` stores structured onboarding progress with steps such as `preflight`, `provider_selection`, `inference`, `sandbox`, `openclaw`, and `policies`.
- `~/.nemoclaw/sandboxes.json` stores sandbox registry metadata including `defaultSandbox`.

The collector now strips ANSI sequences and maps these observed step names into stable internal step ids.

### Remote read-only mode

If `CLAW_SSH_HOST`, `CLAW_SSH_PORT`, `CLAW_SSH_USER`, and `CLAW_SSH_PASSWORD` are present,
the demo entrypoint now routes the collector through the SSH runner and executes all probes on the remote host.
This is still read-only: it only runs status, inspect, `kubectl get`, and file `cat` commands.

### Snapshot mode vs CLI mode

- Use `NemoClawStatusCollector` for one-shot health snapshots, dashboards, or push notifications.
- Use `NemoClawCLICollector` when you want to observe a long-running command stream and correlate it with the same probes.

### Host-side notification bridge

- `scripts/runtime-watchdog.py` periodically runs `NemoClawStatusCollector.from_env()` and passes the report to `WatchdogEventBridge`.
- `WatchdogEventBridge` appends warning and error findings into `/tmp/nemoclaw-services-<sandbox>/events.jsonl`.
- Existing host services such as `service-monitor` and the Telegram bridge can consume those events without any detector-specific integration.

## Implemented vs Not Yet Implemented

Implemented:

- task lifecycle tracking
- timeout and stall detection
- repeated step / repeated tool / repeated output checks
- structured event schema
- JSON and summary output interfaces
- structured health overview for snapshot and remote status mode
- bridge from runtime findings into the existing host-side service-event notification pipeline
- local mock testing and demo cases

Not yet implemented:

- semantic similarity for near-duplicate outputs
- token-level accounting from real model traces
- full live task-stream transport to frontend or push services
- direct NemoClaw/OpenClaw runtime adapters
- security-module correlation
- semantic parsing for all real CLI output variants

## How To Run

Run tests:

```bash
python3 -m unittest monitor.tests.test_mock_cases
python3 -m unittest monitor.tests.test_cli_collector
python3 -m unittest monitor.tests.test_status_collector
python3 -m unittest monitor.tests.test_ssh_runner
python3 -m unittest monitor.tests.test_watchdog_bridge
```

Run the local demo:

```bash
python3 -m monitor.examples.run_mock_demo
python3 -m monitor.examples.run_nemoclaw_cli_demo
python3 -m monitor.examples.run_nemoclaw_status_demo
```

Example:

```bash
export CLAW_SANDBOX_NAME=my-sandbox
export CLAW_OPENSHELL_CONTAINER=openshell-cluster-nemoclaw
python3 -m monitor.examples.run_nemoclaw_cli_demo
```
