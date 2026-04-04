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
