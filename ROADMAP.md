# ClawKeeper Roadmap

ClawKeeper is evolving in layers.
The goal is to preserve the NemoClaw and OpenShell runtime foundation while adding stronger governance and operator-facing capabilities for long-running OpenClaw deployments.

## Platform Layers

| Layer | Status | Focus |
|---|---|---|
| Foundation Layer | Inherited and adapted | Sandbox lifecycle, OpenShell isolation, onboarding, routing, blueprint flows, and CLI compatibility. |
| Security Control Plane | Implemented and expanding | Semantic interception, install admission, audit visibility, policy templates, credential hardening, redaction, and staged rollout. |
| Runtime Watchdog | Planned | Detect dead loops, abnormal token burn, timeout or stalled-task conditions, and retry storms before unattended runs degrade. |
| Operator Intelligence | Planned | Recommend useful skills, workflows, and operational playbooks based on policy, audit, and runtime-health signals. |

## Phase 1: Security Control Plane

This is the first major ClawKeeper-native module and the current mature focus area.

- Tool-call interception with semantic risk grading.
- Skill install admission controls.
- Structured security events and CLI replay workflows.
- Hardened policy templates and rollout playbooks.
- Password-first onboarding, encrypted credentials, and deterministic redaction.

## Phase 2: Runtime Watchdog

The next planned governance layer focuses on unattended execution health.

- Dead-loop detection for repetitive, non-productive task cycles.
- Token overconsumption and runaway-cost detection.
- Timeout and stalled-task detection.
- Retry-storm and repeated-failure pattern detection.
- Operator-visible remediation hints and escalation paths.

## Phase 3: Operator Intelligence

This planned layer focuses on proactive value delivery rather than only failure prevention.

- Curated skill recommendations based on deployment posture and task intent.
- Suggested workflow improvements and operator playbooks.
- Proactive guidance for profitable or high-value usage patterns where appropriate.
- Digest summaries that combine security, runtime-health, and operator-facing recommendations.

## Guiding Principles

- Respect the upstream NemoClaw and OpenShell foundation instead of obscuring it.
- Keep ClawKeeper-specific innovation explicit and well-scoped.
- Preserve operator control over any autonomous mitigation or recommendation behavior.
- Roll out new governance layers in staged modes before default enforcement.
- Prefer reusable signals so security, watchdog, and intelligence modules can reinforce one another.
