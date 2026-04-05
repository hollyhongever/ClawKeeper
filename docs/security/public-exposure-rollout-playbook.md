---
title:
  page: "ClawKeeper Public Exposure Rollout Playbook"
  nav: "Public Exposure Rollout"
description:
  main: "Operator playbook for staged ClawKeeper security rollout across audit, warn, and enforce phases."
  agent: "Guides operators through staged ClawKeeper security rollout for public exposure with acceptance gates, rollback, and release checks."
keywords: ["clawkeeper rollout playbook", "security audit warn enforce", "public exposure operations"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "clawkeeper", "security", "operations", "rollout"]
content:
  type: reference
  difficulty: intermediate
  audience: ["operator", "engineer", "security_engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Public Exposure Rollout Playbook

This playbook defines a staged rollout model for ClawKeeper security controls in public exposure environments.
It is designed for release demos and production operations.

For command semantics, see [Commands](../reference/commands.md).
For incident triage guidance, see [Troubleshooting](../reference/troubleshooting.md).

## Scope and Owners

- Scope: staged rollout for semantic security behavior and operator response.
- Primary owner: release operator for the target sandbox.
- Secondary owner: security reviewer who validates event quality and triage completeness.

## Release Preconditions

Run these checks before entering any rollout stage:

```console
$ clawkeeper security policy validate --file nemoclaw/security-policy.yaml
$ clawkeeper security events --limit 20 --json
$ clawkeeper <name> status
$ bash scripts/check-security-rollout.sh
```

The rollout gate script verifies that required docs and command references are present.

## Stage Overview

| Stage | Intent | Blocking behavior | Typical duration | Exit condition |
|---|---|---|---|---|
| Audit | Observe real traffic and tune policy/rules. | No blocking due to rollout stage. | 3-7 days | High/critical events are explained and triaged. |
| Warn | Keep workflow continuity while enforcing operator response discipline. | No automatic block from warn policy; operator warning and acknowledgement required. | 2-5 days | Alert response and false-positive thresholds are met. |
| Enforce | Apply blocking/approval actions for high-risk behavior. | Blocking and approval gates active. | Ongoing | Stable operation with defined rollback trigger guardrails. |

:::{note}
Current plugin modes are `off`, `audit`, and `enforce`.
Use `warn` as an operational stage between `audit` and `enforce`: keep runtime in `audit`, but treat high/critical findings as release warnings that require acknowledgement before promotion.
:::

## Stage 1: Audit

### Entry Checklist

- `clawkeeper security policy validate --file nemoclaw/security-policy.yaml` succeeds.
- Security event log path is writable.
- At least one operator can inspect requests in `openshell term`.

### Operator Routine

1. Run `clawkeeper security events --limit 50 --json` at least once per shift.
2. Replay representative high-risk events with `clawkeeper security replay <event-id> --json`.
3. Update policy rules when repeated high-risk-but-legitimate activity appears.

### Audit Acceptance Gates

- Policy validation passes in two consecutive runs.
- 100% of high and critical events have triage notes.
- False positives for high/critical events are below 20% over the observation window.
- No unresolved parser/data-quality issue blocks event interpretation.

## Stage 2: Warn

### Entry Checklist

- All audit gates are met.
- On-call rotation is assigned for high/critical warnings.
- Rollback owner and communication channel are identified.

### Operator Routine

1. Keep security runtime in `audit` mode while applying warn discipline.
2. Treat every high/critical finding as a promotion blocker until acknowledged.
3. Confirm operator readiness in `openshell term` for approval-required workflows.
4. Track warning MTTA (mean time to acknowledge) and recurring patterns.

### Warn Acceptance Gates

- 100% of high/critical warnings are acknowledged within 15 minutes.
- No critical warning remains unresolved at end of day.
- Recurring warning classes have documented handling steps.
- A rollback drill has been performed once with successful recovery evidence.

## Stage 3: Enforce

### Entry Checklist

- All warn gates are met.
- Release owner approves promotion decision.
- Recovery window and responder assignments are confirmed.

### Operator Routine

1. Set plugin security mode to `enforce` in deployment config.
2. Reconcile and apply config in the target environment (`clawkeeper onboard` if needed).
3. Watch live behavior with:

```console
$ clawkeeper <name> logs --follow
$ clawkeeper security events --limit 50 --hook before_tool_call --risk high
```

4. Confirm expected blocking/approval outcomes for high-risk fixtures or rehearsed commands.

### Enforce Acceptance Gates

- No unexpected critical block in golden-path workflows.
- Approval prompts are actionable and acknowledged by operators.
- Event payloads include risk level, action, and evidence for sampled incidents.
- The first 24-hour enforce window completes without Sev-1/Sev-2 regressions.

## Rollback Playbook

Trigger rollback when one of these conditions occurs:

- Repeated false blocking impacts core operator workflows.
- Approval path is unavailable or unstable.
- Event pipeline quality regresses (missing or malformed records affecting triage).

Rollback steps:

1. Change security mode from `enforce` to `audit` in deployment config.
2. Re-apply runtime configuration (`clawkeeper onboard` if your environment requires reconciliation).
3. Keep event capture enabled and collect the latest 100 events:

```console
$ clawkeeper security events --limit 100 --json
```

4. Replay representative blocked event IDs for root-cause review:

```console
$ clawkeeper security replay <event-id> --json
```

5. Re-open promotion only after warn-stage gates are green again.

## Demo-Friendly Validation Flow

For release demonstration, use this sequence:

1. `clawkeeper security policy validate --file nemoclaw/security-policy.yaml`
2. `clawkeeper security events --limit 5 --hook before_tool_call --risk high`
3. `clawkeeper security replay <event-id> --json`
4. `bash scripts/check-security-rollout.sh`

This keeps demo evidence aligned with operational rollout evidence.
