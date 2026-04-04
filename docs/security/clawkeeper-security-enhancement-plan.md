---
title:
  page: "ClawKeeper Security Enhancement Plan"
  nav: "Security Enhancement Plan"
description:
  main: "Implementation blueprint for ClawKeeper security hardening across runtime interception, supply-chain admission, and audit pipelines."
  agent: "Defines the ClawKeeper security implementation blueprint. Use when implementing security hooks, policy decisions, audit events, and rollout milestones."
keywords: ["clawkeeper security enhancement plan", "before_tool_call", "before_install", "security policy"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "security", "policy", "supply_chain"]
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

# ClawKeeper Security Enhancement Plan

This page is the implementation blueprint for ClawKeeper security hardening.
All security implementation work follows this document in sequence.

## Threat Model

ClawKeeper extends NemoClaw, so it inherits runtime isolation but still faces semantic execution risks.
The security model treats the following as primary threats.

| Threat | Description | Primary control |
|---|---|---|
| Dangerous tool execution | Agent requests high-impact shell or filesystem operations. | `before_tool_call` risk grading and enforcement. |
| Data exfiltration | Agent attempts to send sensitive data to external destinations. | Network risk grading plus policy-scoped endpoint controls. |
| Malicious or unsafe skill installation | Third-party skills contain prompt injection, exfiltration paths, or malicious code. | `before_install` admission scanning and approval gates. |
| Prompt injection and jailbreak influence | Untrusted inputs attempt to alter tool behavior or safety constraints. | Prompt signal detection as auxiliary risk input. |
| Silent security drift | Risky actions happen without operator visibility. | Structured audit events and alert delivery. |

## Target Architecture

ClawKeeper security is implemented as a layered control plane on top of OpenClaw plugin hooks.
The architecture keeps OpenShell boundary isolation as a foundational layer and adds semantic action arbitration.

1. Hook layer.
   `before_tool_call`, `after_tool_call`, and `before_install` are registered in the ClawKeeper plugin.
2. Decision layer.
   A unified risk engine computes `SecurityDecision` with `allow`, `block`, or `require_approval`.
3. Policy layer.
   `security-policy.yaml` defines rule inputs and decision matrix behavior.
4. Audit and alert layer.
   Every decision emits `security-event.v1` records to JSONL and optional webhook sinks.

## Policy Matrix

ClawKeeper v1 runs in offline-first mode.
Rules, static signatures, and local scanning run first.
Optional remote adjudication can be added later.

| Risk level | Default action | Rationale |
|---|---|---|
| Critical | Block | Immediate prevention for destructive or exfiltration-prone actions. |
| High | Require approval | Human-in-the-loop for potentially legitimate but risky operations. |
| Medium | Allow + audit | Preserve workflow while maintaining traceability. |
| Low | Allow + audit | Minimize friction and keep observability. |

The decision matrix is enforced only when mode is `enforce`.
When mode is `audit`, all actions continue but security events still record recommended actions.
When mode is `off`, the hook layer returns allow and logs minimal telemetry.

## Implementation Milestones

### M1 Security Core Skeleton

- Add plugin `security` configuration namespace.
- Introduce shared security types and policy loader.
- Implement unified decision interface for tool and install flows.

### M2 High-Risk Operation Interception

- Register `before_tool_call` and `after_tool_call` hooks.
- Grade command, path, and network risk.
- Enforce `allow`, `block`, and `require_approval` based on decision matrix.

### M3 Malicious Skill Admission Control

- Register `before_install` hook.
- Run offline-first skill scanning with pattern and static checks.
- Block or require approval based on install risk level.

### M4 Audit and Alert Closure

- Emit `security-event.v1` JSONL events for all hook decisions.
- Add webhook alert path for block and approval outcomes.
- Add CLI commands for policy validation, event listing, and event replay.

### M5 Sandbox Policy Complements

- Add hardened policy templates for stricter egress posture.
- Keep sensitive runtime directories read-only by default.
- Ensure policy templates align with semantic arbitration, not replace it.

## Acceptance Criteria

A milestone is accepted only when all related tests pass and behavior is reproducible.

| Area | Acceptance criteria |
|---|---|
| Hook enforcement | Critical tool requests are blocked, high-risk requests require approval, medium and low requests are allowed with audit events. |
| Skill admission | Known malicious skill fixtures are blocked and medium-risk fixtures trigger approval paths. |
| Audit integrity | Every hook decision emits a valid `security-event.v1` line with event ID, decision, risk level, and evidence. |
| CLI operations | `security policy validate`, `security events`, and `security replay` return stable results and non-zero exits on invalid input. |
| Regression safety | Existing onboard, policy, status, and logs flows remain functional. |

## Rollback Plan

If a release introduces unacceptable regressions, use phased rollback.

1. Switch plugin security mode from `enforce` to `audit`.
2. Keep event logging enabled for diagnosis.
3. Disable webhook alerts if they introduce operational noise.
4. Revert the affected milestone changeset while retaining prior stable milestones.
5. Re-run regression and security fixture tests before re-enabling `enforce`.

## Next Steps

Use this plan as the source of truth for implementation order.
Each milestone should land in an independent PR to keep review scope and rollback boundaries clear.

## Execution Status Snapshot

This section tracks implementation status for milestone execution and parallel coordination.

| Milestone | Status | Notes |
|---|---|---|
| M1 Security Core Skeleton | Completed | `security` config namespace, policy loader, shared decision types are implemented. |
| M2 High-Risk Operation Interception | Completed (v2 hardening) | Adds semantic command signals for privilege escalation, dynamic substitution, decoded payload execution, command chaining, and sensitive-path redirection detection. |
| M3 Malicious Skill Admission Control | Completed (v2 hardening) | Adds install target hardening for symlink escape detection, lifecycle-script detection, remote/insecure source handling, and structured scanner severity parsing with explicit fallback evidence. |
| M4 Audit and Alert Closure | Completed (v2 hardening) | Adds filtered event browsing (`--action`, `--hook`, `--risk`, `--id`), malformed-line accounting, replay JSON mode, and prefix disambiguation with non-zero exit on ambiguity. |
| M5 Sandbox Policy Complements | Completed (v2 hardening) | Adds `security-dev-balanced.yaml` and `security-ci-minimal.yaml` templates with docs and validation coverage for template parse/shape checks. |
| M6-M10 Public Exposure Addendum | Planned | Password-first, encrypted credential store, unified redaction, staged dangerous-command policy, and rollout playbooks remain queued. |

Current implementation branch baseline for parallel streams:

- Base branch: `feature/security`
- Parallel branches: `feature/security-main`, `feature/security-m2-hooks`, `feature/security-m3-install-gate`, `feature/security-m4-audit-cli`, `feature/security-m5-policy`, `feature/security-m6m8-exposure`, `feature/security-m9m10-rollout`
- Worktrees are provisioned for each branch to avoid cross-stream file contention.
- Integration status (2026-04-04): `feature/security-main` has integrated M2-M5 stream outputs and is the current baseline for M6-M10 development.

## Parallel Workstream Strategy

This section defines how to execute milestone work in parallel without creating merge instability.

### Interface Freeze Before Parallel Build

`Interface freeze` means locking shared contracts before parallel coding starts.
Do not start concurrent implementation until all teams agree on these contracts.

Freeze scope for this plan:

1. Plugin config contract.
   The `security` schema keys and default semantics in `openclaw.plugin.json` and parser logic.
2. Decision contract.
   `SecurityDecision` fields, allowed action values, and risk-level definitions.
3. Event contract.
   `security-event.v1` required fields and field meanings.
4. Policy contract.
   `security-policy.yaml` top-level sections and core key names.
5. CLI contract.
   Command names and required argument shapes for `security policy validate`, `security events`, and `security replay`.

If any frozen contract must change, open one small contract PR first, merge it, and then rebase all active parallel branches.

### Recommended Parallel Branch Mapping

Use one branch per workstream with explicit ownership.

| Workstream | Recommended branch | Primary owner |
|---|---|---|
| M2 hook interception | `feature/security-m2-hooks` | Runtime and plugin owner |
| M3 install admission | `feature/security-m3-install-gate` | Supply-chain controls owner |
| M4 audit and CLI | `feature/security-m4-audit-cli` | Platform tooling owner |
| M5 policy templates | `feature/security-m5-policy` | Policy and docs owner |
| M6-M8 public-exposure hardening | `feature/security-m6m8-exposure` | Gateway and credentials owner |
| M9-M10 rollout and playbooks | `feature/security-m9m10-rollout` | Ops and release owner |

### Synchronization Cadence

Use fixed sync points to prevent drift.

1. Contract sync.
   Confirm no contract deltas before opening new parallel branches.
2. Midpoint integration sync.
   Merge test fixtures, shared helpers, and schema updates.
3. Pre-merge gate sync.
   Require green checks for `nemoclaw/npm run check`, targeted `vitest`, and doc references.

### Codex Threading Guidance

You can run parallel execution in Codex with either multiple chats or delegated sub-agents.

Recommended model:

1. Main agent.
   Keep one main agent as coordinator for contract ownership, review, and merge order.
2. Sub-agents or separate threads.
   Assign each workstream to one sub-agent or one dedicated chat thread with a single branch owner.
3. Non-overlapping write scope.
   Avoid assigning the same file to multiple workers in the same phase unless explicitly planned.
4. Merge sequence.
   Merge contract baseline first, then M2-M5 branches, then M6-M10 branches.
5. Final integration pass.
   Run full regression after all branches are rebased onto the latest integration branch.

## Demo Runbook

Use this runbook for a concise technical demo of the current security module baseline.

### Demo Goals

Show that policy validation, event browsing, and event replay are operational.
Show that semantic security hooks and policy contracts are wired without breaking existing CLI flows.

### Demo Script

1. Validate security policy.

```console
$ clawkeeper security policy validate --file nemoclaw/security-policy.yaml
```

Expected outcome: validation succeeds and reports the resolved policy path.

2. Show latest security events.

```console
$ clawkeeper security events --limit 5 --hook before_tool_call --risk high
```

Expected outcome: filtered event summary appears, including malformed-line notice when present.

3. Replay one event by ID.

```console
$ clawkeeper security replay <event-id> --json
```

Expected outcome: replay JSON includes event details plus dataset metadata (`matches`, `totalEvents`, `malformedLines`).

### Demo Notes

- If no events exist yet, generate one in a test environment before live demo.
- Keep demo runs in `audit` mode when demonstrating behavior to stakeholders without operational interruption.

## Safe-OpenClaw Integration Addendum (Public Exposure)

This addendum extends the core ClawKeeper security blueprint for public gateway exposure scenarios.
It defines how to selectively integrate safe-openclaw concepts without replacing the existing NemoClaw and OpenShell security foundation.

### Decision Summary

- Integration strategy is selective module adoption, not full fork replacement.
- The deployment context is public gateway exposure, where authentication and operator-safe defaults are mandatory.
- OpenShell sandbox and policy enforcement remain the primary boundary, while this addendum introduces semantic and credential-focused defense-in-depth controls.

### Adopt / Adapt / Reject Matrix

| Category | Decision | Scope |
|---|---|---|
| Adopt | Password-first gateway onboarding | Require password bootstrap flow for exposed gateways and avoid token-first onboarding guidance. |
| Adopt | Localhost-only sensitive setup and reset endpoints | Restrict password setup and reset interfaces to local direct access. |
| Adopt | Outbound secret redaction pipeline | Redact API key and token patterns in outbound, diagnostic, and operator-facing outputs. |
| Adapt | Credential-at-rest encryption for `~/.nemoclaw/credentials.json` | Use modern KDF plus AES-256-GCM envelope encryption with migration support from plaintext entries. |
| Reject | Unsalted SHA-256 password storage | Do not use unsalted password hashes as a durable credential primitive. |
| Reject | Linux `unshare` and `mount` command wrapping as primary isolation | Keep OpenShell policy and sandbox boundary as primary isolation controls. |

### Delivery Milestones (M6-M10)

#### M6 Password-First Gateway Bootstrap

- Introduce password-first bootstrap for publicly exposed gateway workflows.
- Remove onboarding guidance that promotes `#token` control UI URLs.
- Ensure pre-setup remote access is denied while local setup path remains available.

#### M7 Encrypted Credential Store Migration

- Add encrypted storage format for `~/.nemoclaw/credentials.json`.
- Use modern KDF-derived keys and AES-256-GCM for value encryption.
- Support automatic migration from existing plaintext credential records.

#### M8 Unified Redaction Across Runtime Surfaces

- Apply a shared redaction policy to CLI output, onboarding session records, and debug reports.
- Cover high-confidence API key, bearer token, and credential assignment patterns.
- Keep redaction behavior deterministic for incident review and reproducibility.

#### M9 Semantic Dangerous-Command Policy

- Introduce semantic dangerous-command policy with staged behavior: `warn` first, then `block`.
- Align policy outcomes with OpenShell network and filesystem policy posture.
- Emit auditable decision metadata for allow, warn, and block outcomes.

#### M10 Rollout Controls and Operator Playbooks

- Define staged rollout toggles for `audit`, `warn`, and `enforce` modes.
- Update operator docs and troubleshooting playbooks for public exposure scenarios.
- Add release gating checkpoints for docs parity and backward compatibility.

### Public Interfaces and Contracts

- Planned CLI contracts:
  - `nemoclaw security set-password`
  - `nemoclaw security status`
- Planned environment contract:
  - `NEMOCLAW_CRED_STORE_KEY`
- Updated behavior contract:
  - Onboarding output no longer promotes tokenized control UI URL guidance.

### Acceptance Criteria for Addendum

- Remote pre-setup access is blocked and localhost setup remains available.
- Credential store migration leaves no plaintext provider keys in `~/.nemoclaw/credentials.json`.
- Redaction consistently covers API key and token patterns across diagnostic and operator-visible outputs.
- Existing `onboard`, `connect`, `status`, and `logs` flows remain backward compatible.

### Test Plan

1. Run markdown quality checks for this document and ensure no structural issues are introduced.
2. Validate section discoverability and heading hierarchy for the appended addendum.
3. Verify cross-document consistency against:
   - `docs/security/best-practices.md`
   - `docs/reference/commands.md`
4. Confirm no conflicting security guidance remains for tokenized dashboard URL promotion in security-facing docs.

### Assumptions

- The existing security blueprint remains authoritative; this addendum is implementation-focused.
- OpenShell policy and sandbox isolation remain the primary boundary; all additions are defense-in-depth.
- Planned interface names are accepted as v1 contracts and may be refined in implementation PRs.
