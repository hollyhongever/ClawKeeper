---
title:
  page: "ClawKeeper Security Module Updates"
  nav: "Security Module Updates"
description:
  main: "Changelog for ClawKeeper security module implementation milestones and behavior changes."
  agent: "Tracks ClawKeeper security module updates over time. Use when auditing what changed in hooks, policy, CLI security commands, and test coverage."
keywords: ["clawkeeper security changelog", "security module updates", "before_tool_call updates"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "security", "changelog"]
content:
  type: reference
  difficulty: intermediate
  audience: ["developer", "engineer", "security_engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# ClawKeeper Security Module Updates

This page records implementation updates for the ClawKeeper security module.
Use it as the release log for security milestones after the baseline plan is approved.

## 2026-04-04

### Added

- Added the security enhancement implementation blueprint page and connected it to the Security docs navigation.
- Added plugin security config namespace in `openclaw.plugin.json` and runtime parsing in plugin registration.
- Added security policy file support (`security-policy.yaml`) with defaults and fallback behavior.
- Added hook-based semantic controls for `before_tool_call`, `after_tool_call`, and `before_install`.
- Added rule-based risk evaluation across command, path, network, prompt-signal, and quota dimensions.
- Added install-time admission evaluation with offline-first scanning patterns and optional external scanner command support.
- Added structured audit event output (`security-event.v1`) to JSONL and optional webhook alert delivery.
- Added CLI security commands:
  - `clawkeeper security policy validate`
  - `clawkeeper security events`
  - `clawkeeper security replay`
- Added hardened policy template files for strict egress and sensitive path read-only posture.
- Added tests for security engine behavior, security CLI workflows, plugin hook registration, and config parsing.

### Changed

- Updated help output to include security command group and usage examples.
- Updated command reference docs with new security command documentation.
- Updated Security toctree with the plan page and this update log page.

### Validation Snapshot

- Plugin package checks pass (`npm run check` under `nemoclaw/`).
- Plugin project test suite passes.
- Security-focused CLI and engine tests pass.
- Core CLI regression tests still pass for existing flows.

## 2026-04-04 (Parallel Execution and Demo Readiness)

### Added

- Added parallel execution strategy to the security enhancement plan, including interface-freeze scope and branch ownership model.
- Added explicit Codex coordination guidance for main-agent ownership and non-overlapping write scopes.
- Added execution status snapshot to the plan, including milestone completion state and active parallel branch baseline.
- Added demo runbook to the plan for policy validation, event listing, and event replay walkthroughs.
- Provisioned dedicated parallel branches and worktrees for M2-M10 streams:
  - `feature/security-main`
  - `feature/security-m2-hooks`
  - `feature/security-m3-install-gate`
  - `feature/security-m4-audit-cli`
  - `feature/security-m5-policy`
  - `feature/security-m6m8-exposure`
  - `feature/security-m9m10-rollout`

### Changed

- Updated planning docs to support technical write-up and stakeholder demo preparation.
- Clarified that contract changes must land as isolated interface PRs before stream-level implementation rebases.

### Validation Snapshot

- Security policy validation command remains operational against `nemoclaw/security-policy.yaml`.
- Security events command handles empty event logs with explicit user-facing output.
- Branch and worktree topology for parallel execution has been created and verified.

## 2026-04-04 (M2-M5 Parallel Hardening Pass)

### Added

- Added semantic high-risk command signals in tool-call interception:
  - privilege escalation (`sudo`, `su`)
  - dynamic shell substitution (backticks, `$()`)
  - decoded payload execution pipelines
  - sensitive system-path redirection detection
- Added install-admission hardening for local and remote targets:
  - symlink escape detection
  - install lifecycle-script detection (`preinstall`, `install`, `postinstall`)
  - insecure `http://` source escalation
  - structured scanner severity parsing and explicit scanner fallback evidence
- Added event browsing filters to `clawkeeper security events`:
  - `--action`
  - `--hook`
  - `--risk`
  - `--id`
- Added replay JSON mode and ambiguity handling to `clawkeeper security replay`, including non-zero exit on ambiguous ID prefixes.
- Added new M5 policy templates:
  - `nemoclaw-blueprint/policies/templates/security-dev-balanced.yaml`
  - `nemoclaw-blueprint/policies/templates/security-ci-minimal.yaml`
- Added new docs page for template operations: `docs/network-policy/security-policy-templates.md`.
- Added template-shape validation coverage in `test/validate-blueprint.test.ts` for security template files.

### Changed

- Updated `docs/reference/commands.md` with new `security events` filter flags and `security replay --json` behavior.
- Updated `docs/index.md` Network Policy toctree to include the security policy templates guide.
- Updated `docs/security/clawkeeper-security-enhancement-plan.md` execution snapshot to reflect M2-M5 v2 hardening and demo command updates.

### Validation Snapshot

- `npm test -- test/security-engine.test.js` passes on the integration baseline.
- `npm test -- test/security-cli.test.js` passes with new filter/replay behaviors.
- `npm test -- test/validate-blueprint.test.ts` passes with template parse/shape assertions.

## Next Steps

- Continue appending future security changes here with exact dates and concise impact notes.
- Keep each entry grouped into `Added`, `Changed`, and `Validation Snapshot` for consistent release review.
