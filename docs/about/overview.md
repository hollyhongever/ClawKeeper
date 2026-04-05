---
title:
  page: "ClawKeeper Overview — What It Adds and How It Fits Together"
  nav: "Overview"
description:
  main: "ClawKeeper is a security-focused OpenClaw operations stack built on the NemoClaw and OpenShell foundation."
  agent: "Explains what ClawKeeper adds, how it builds on upstream NemoClaw and OpenShell, and which security workflows it owns."
keywords: ["clawkeeper overview", "clawkeeper security module", "openclaw operations", "openshell"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "sandboxing", "security", "blueprints"]
content:
  type: concept
  difficulty: technical_beginner
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Overview

ClawKeeper is a security-focused reference stack for running [OpenClaw](https://openclaw.ai) assistants inside [OpenShell](https://github.com/NVIDIA/OpenShell).
It builds on the NemoClaw and OpenShell foundation, then adds ClawKeeper-specific security workflows for semantic tool interception, install admission, audit visibility, credential handling, redaction, and staged rollout controls.

ClawKeeper keeps the upstream sandbox, routing, onboarding, and blueprint lifecycle model.
Its main differentiation is the security module implemented in this repository and documented under the `docs/security/` section.

## Project Positioning

ClawKeeper should be understood as a layered project rather than a pure rebrand.

| Layer | Role |
|---|---|
| Upstream foundation | NemoClaw and OpenShell provide the sandbox, routing, onboarding, and blueprint lifecycle model. |
| Current ClawKeeper extension | The Security Control Plane adds semantic interception, install admission, audit visibility, redaction, credential hardening, and rollout controls. |
| Planned ClawKeeper extensions | Runtime Watchdog and Operator Intelligence modules will add long-running task governance and proactive operator guidance. |

| Capability              | Description                                                                                                                                          |
|-------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| Sandbox OpenClaw        | Creates an OpenShell sandbox pre-configured for OpenClaw, with filesystem and network policies applied from the first boot.                         |
| Route inference         | Preserves the upstream inference-routing model so agent traffic still flows through the OpenShell gateway.                                          |
| Add semantic security   | Intercepts tool calls and install requests, grades risk, and enforces `allow`, `block`, or `require_approval` decisions.                           |
| Improve operator audit  | Emits structured security events and adds CLI workflows for validation, browsing, replay, and staged rollout support.                               |

## Key Features

ClawKeeper provides the following capabilities on top of the upstream runtime foundation.

| Feature | Description |
|---------|-------------|
| Guided onboarding | Validates credentials, selects providers, and creates a working sandbox in one command. |
| Hardened blueprint | A security-first Dockerfile with capability drops, least-privilege network rules, and declarative policy. |
| Runtime security arbitration | Uses `before_tool_call` and `after_tool_call` to grade command, path, network, prompt-signal, and quota risk before action execution. |
| Install admission control | Uses `before_install` to scan third-party skills and gate suspicious packages before they land in the environment. |
| Audit and replay workflows | Records `security-event.v1` JSONL output and provides CLI tools for policy validation, event browsing, and replay analysis. |
| Credential and exposure hardening | Adds password-first onboarding, encrypted credential storage, deterministic redaction, and public-exposure rollout guidance. |
| Runtime watchdogs (planned) | Will detect dead loops, abnormal token burn, timeout or stalled-task conditions, and repeated failure patterns. |
| Operator intelligence (planned) | Will recommend skills, workflows, and operator playbooks based on deployment posture, audit history, and runtime health. |
| State management | Safe migration of agent state across machines with credential stripping and integrity verification. |
| Messaging bridges | Host-side processes that connect Telegram, Discord, and Slack to the sandboxed agent. |
| Routed inference | Provider-routed model calls through the OpenShell gateway, transparent to the agent. Supports NVIDIA Endpoints, OpenAI, Anthropic, Google Gemini, and local Ollama. |
| Layered protection | Network, filesystem, process, inference, and semantic security controls that can be staged from `audit` to `enforce`. |

## Challenge

Autonomous AI agents like OpenClaw can make arbitrary network requests, access the host filesystem, install extensions, and invoke risky shell workflows. Traditional sandboxing reduces host escape risk, but it does not fully address semantic actions such as data exfiltration, dangerous tool sequences, or malicious skill installation.

## Benefits

ClawKeeper provides the following benefits.

| Benefit                    | Description                                                                                                            |
|----------------------------|------------------------------------------------------------------------------------------------------------------------|
| Sandboxed execution        | Every agent runs inside an OpenShell sandbox with Landlock, seccomp, and network namespace isolation. No access is granted by default. |
| Semantic action control   | Risky tool and install actions can be blocked or routed through approval instead of relying only on static sandbox boundaries. |
| Audit visibility          | Operators get structured evidence and replayable security events rather than opaque failures or scattered logs. |
| Safer exposure posture    | Public-exposure workflows add credential hardening, redaction, dangerous-command staging, and rollout checklists. |
| Single CLI                 | The `clawkeeper` command orchestrates onboarding, runtime operations, policy validation, logs, and security workflows. |
| Blueprint lifecycle        | Versioned blueprints handle sandbox creation, digest verification, and reproducible setup.                             |

## Use Cases

You can use ClawKeeper for various use cases including the following.

| Use Case                  | Description                                                                                  |
|---------------------------|----------------------------------------------------------------------------------------------|
| Always-on assistant       | Run an OpenClaw assistant with controlled network access and operator-approved egress.        |
| Sandboxed testing         | Test agent behavior in a locked-down environment before granting broader permissions.         |
| Security hardening demos  | Demonstrate tool interception, install gating, audit replay, and staged rollout workflows.   |
| Remote GPU deployment     | Deploy a sandboxed agent to a remote GPU instance for persistent operation.                   |

## Next Steps

Explore the following pages to learn more about ClawKeeper.

- [How It Works](../about/how-it-works.md) to understand the plugin, blueprint, and sandbox model.
- [Quickstart](../get-started/quickstart.md) to install ClawKeeper and run your first agent.
- [ClawKeeper Security Enhancement Plan](../security/clawkeeper-security-enhancement-plan.md) for the security implementation blueprint.
- [Security Module Updates](../security/security-module-updates.md) for landed milestone changes.
- [Public Exposure Rollout Playbook](../security/public-exposure-rollout-playbook.md) for staged operator rollout guidance.
- [Switch Inference Providers](../inference/switch-inference-providers.md) to configure the inference provider.
- [Approve or Deny Network Requests](../network-policy/approve-network-requests.md) to manage egress approvals.
- [Deploy to a Remote GPU Instance](../deployment/deploy-to-remote-gpu.md) for persistent operation.
- [Monitor Sandbox Activity](../monitoring/monitor-sandbox-activity.md) to observe agent behavior.

At the repository level, `UPSTREAM.md` explains the relationship to NemoClaw and OpenShell, while `ROADMAP.md` tracks planned Runtime Watchdog and Operator Intelligence layers.
