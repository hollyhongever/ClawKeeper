# Upstream Foundation and Attribution

ClawKeeper is an independent derivative project built on the NemoClaw and OpenShell foundation.
It keeps upstream runtime and sandbox concepts where they are useful, then adds ClawKeeper-native governance layers on top.

## Upstream Components

The repository inherits or adapts the following foundation pieces from upstream projects.

- NemoClaw repository structure, CLI compatibility patterns, onboarding flow, blueprint lifecycle, and documentation conventions.
- OpenShell runtime isolation, gateway routing, filesystem/network policy enforcement, and sandbox execution model.
- OpenClaw runtime usage inside the sandboxed agent environment.

## ClawKeeper-Native Additions

ClawKeeper is not intended to remain a verbatim mirror of upstream material.
Its primary innovation tracks are the following:

- Security Control Plane:
  `before_tool_call`, `after_tool_call`, and `before_install` enforcement, security policy templates, audit events, replay tooling, password-first onboarding, encrypted credentials, deterministic redaction, and rollout controls.
- Runtime Watchdog:
  planned task-health detection for dead loops, abnormal token consumption, timeout or stalled-task detection, retry storms, and other unattended-run failure modes.
- Operator Intelligence:
  planned recommendation and proactive guidance layer for useful skills, operational tactics, workflow improvements, and monetization-oriented playbooks.

## Attribution Principles

ClawKeeper follows these repository-level attribution rules.

- Preserve upstream license headers, copyright notices, and attribution notices in inherited files.
- Mark modified files and new repository docs as ClawKeeper changes when their content materially diverges from upstream.
- Describe the project as "built on NemoClaw and OpenShell" instead of presenting it as an official upstream repository or documentation mirror.
- Keep third-party names descriptive of origin or compatibility, not primary branding for ClawKeeper-owned features.

## Branding Guidance

Use the following framing in repository and documentation entry points.

- Preferred:
  "ClawKeeper is built on the NemoClaw and OpenShell foundation."
- Preferred:
  "ClawKeeper adds a security control plane, runtime watchdogs, and operator intelligence layers."
- Avoid:
  presenting ClawKeeper docs as if they were the official NVIDIA NemoClaw documentation site.

## Upstream Sync Strategy

ClawKeeper should continue to respect upstream work while maintaining its own roadmap.

- Sync upstream foundation changes selectively and deliberately.
- Keep repository docs honest about which behaviors are inherited and which are ClawKeeper-specific.
- Prefer additive ClawKeeper modules over invasive replacement of upstream sandbox guarantees.
- Track meaningful divergence in roadmap and security planning documents so reviewers can see where innovation is happening.
