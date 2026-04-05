---
title:
  page: "Use ClawKeeper Security Policy Templates"
  nav: "Security Policy Templates"
description:
  main: "Apply curated security policy templates for strict, balanced, and CI-focused sandbox postures."
  agent: "Explains ClawKeeper security policy templates and how to apply them safely. Use when selecting strict, balanced, or CI-oriented policy baselines."
keywords: ["clawkeeper security policy templates", "nemoclaw policy templates", "sandbox posture templates"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "network_policy", "security", "nemoclaw"]
content:
  type: how_to
  difficulty: intermediate
  audience: ["developer", "engineer", "security_engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Use ClawKeeper Security Policy Templates

ClawKeeper ships policy templates to help you apply common security postures quickly.
Templates are additive policy files that you can review and apply to running sandboxes.

## Template Catalog

The templates live in `nemoclaw-blueprint/policies/templates/`.

| Template | Focus | When to use |
|---|---|---|
| `security-strict-egress.yaml` | Tight outbound allowlist for core inference and OpenClaw API flows. | Production assistants with minimum required egress. |
| `security-sensitive-readonly.yaml` | Read-only protection for sensitive runtime paths and credentials directories. | Any deployment where config and credential tamper resistance is required. |
| `security-dev-balanced.yaml` | Balanced developer posture for source access plus package registries with binary scoping. | Daily development tasks that require GitHub and package installs. |
| `security-ci-minimal.yaml` | Minimal CI-friendly egress for source retrieval and package dependency resolution. | Build and verification pipelines with strict external access requirements. |

## Prerequisites

- A running NemoClaw sandbox.
- The OpenShell CLI on your `PATH`.
- The repository root as your working directory.

## Apply a Template to a Running Sandbox

Apply one template at a time and validate behavior before switching to another template.

### Balanced Development Template

```console
$ openshell policy set nemoclaw-blueprint/policies/templates/security-dev-balanced.yaml
```

Use this when your workflow needs source access (`git`, `gh`) and package install traffic (`pip`, `npm`, `node`).

### Minimal CI Template

```console
$ openshell policy set nemoclaw-blueprint/policies/templates/security-ci-minimal.yaml
```

Use this in build/test pipelines that only need source and dependency retrieval.

### Switch Back to Baseline Policy

```console
$ openshell policy set nemoclaw-blueprint/policies/openclaw-sandbox.yaml
```

Use this to restore the baseline policy after a template trial.

## Validate Before Applying

Before rollout, review each template file and confirm scope:

- Endpoints are limited to required hosts and ports.
- `binaries` are explicitly scoped.
- REST endpoints use method and path rules where possible.

After applying, run representative workflow commands and confirm they behave as expected.
If a required destination is blocked, inspect in `openshell term` and refine policy scope instead of broadening to wildcard hosts.

## Recommended Rollout Pattern

1. Start in a non-production sandbox and apply one template.
2. Run expected agent workflows and watch for blocked requests.
3. Refine policy scope before production rollout.
4. Record approved template combinations in your operational runbook.

## Related Topics

- [Customize the Network Policy](customize-network-policy.md) for baseline and dynamic policy updates.
- [Approve or Deny Agent Network Requests](approve-network-requests.md) for runtime approval handling.
- [Security Best Practices](../security/best-practices.md) for risk trade-offs across security controls.
