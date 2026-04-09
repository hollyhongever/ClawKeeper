# ClawKeeper: Security-Hardened OpenClaw Operations on OpenShell

<!-- start-badges -->
[![License](https://img.shields.io/badge/License-Apache_2.0-blue)](https://github.com/hollyhongever/ClawKeeper/blob/main/LICENSE)
[![Security Policy](https://img.shields.io/badge/Security-Report%20a%20Vulnerability-red)](https://github.com/hollyhongever/ClawKeeper/blob/main/SECURITY.md)
[![Project Status](https://img.shields.io/badge/status-alpha-orange)](https://github.com/hollyhongever/ClawKeeper/blob/main/docs/about/release-notes.md)
[![Discord](https://img.shields.io/badge/Discord-Join-7289da)](https://discord.gg/XFpfPv9Uvx)
<!-- end-badges -->

<!-- start-intro -->
ClawKeeper is a security-focused reference stack for running [OpenClaw](https://openclaw.ai) assistants inside [OpenShell](https://github.com/NVIDIA/OpenShell).
It is an independent derivative project built on the NemoClaw and OpenShell foundation, then extended with ClawKeeper-specific security controls, runtime governance, and operator-facing guidance layers.
ClawKeeper is Team ZJU001's entry for the inaugural China NVIDIA DGX Spark Hackathon.
<!-- end-intro -->

## Hackathon Highlights

ClawKeeper is not presented as a single-feature patch.
The project is intentionally framed as an operator-facing stack for **safe, observable, and governable agent execution**.

Current highlights across the repository include:

- Security Control Plane:
  risk-aware tool interception, install admission, audit events, policy templates, credential hardening, and redaction.
- Runtime Watchdog:
  local-first work detection for timeout, stall, repeated-step, repeated-tool, repeated-output, and runtime-health anomalies.
- Operator Feedback:
  structured event outputs that can feed CLI status views, service monitoring, Telegram notifications, and future dashboards.
- Deployment and Ops:
  remote GPU deployment notes, DGX Spark setup experience, public exposure rollout guidance, and troubleshooting playbooks.

This makes the project more compelling to evaluate as a product direction, because it addresses not just "can the agent run", but also "can operators understand, trust, and control the runtime".

> **Early-stage software**
>
> ClawKeeper is experimental and not production-ready.
> Interfaces, APIs, and behavior may change without notice as we iterate on the design.
> The project is shared to gather feedback and enable early experimentation.
> We welcome issues and discussion from the community while the project evolves.

ClawKeeper keeps the upstream sandbox, blueprint, onboarding, and routing workflow, then layers ClawKeeper-native control planes on top. This repository documents ClawKeeper behavior and roadmap; when details differ from upstream NemoClaw material, prefer the documentation in this repository.

## Project Positioning

ClawKeeper is intentionally positioned as all three of the following:

- an implementation built on the NemoClaw and OpenShell foundation,
- a home for ClawKeeper-native governance modules rather than a verbatim upstream mirror,
- and a long-running operations stack that starts with security hardening and expands into runtime watchdog and operator-intelligence capabilities.

Repository guides for that positioning:

- [NOTICE](NOTICE)
- [Upstream Foundation and Attribution](UPSTREAM.md)
- [ClawKeeper Roadmap](ROADMAP.md)
- [Project Overview](docs/about/overview.md)
- [How It Works](docs/about/how-it-works.md)

## Security Enhancements

ClawKeeper extends the base stack with a security module focused on operator visibility and higher-confidence automation.

- Runtime interception with `before_tool_call` and `after_tool_call` risk grading for dangerous shell, filesystem, and network actions.
- Install-time admission controls with offline-first scanning through `before_install`.
- Structured `security-event.v1` audit output plus `clawkeeper security policy validate`, `security events`, and `security replay` CLI workflows.
- Hardened policy templates for development, CI, stricter egress posture, and sensitive-path protections.
- Password-first onboarding, encrypted credential storage, and safer public-exposure defaults.
- Deterministic redaction, staged dangerous-command policy, and rollout playbooks for `audit`, `warn`, and `enforce` promotion.

## Runtime Watchdog and Observability

Beyond security, ClawKeeper now also includes an early **Runtime Watchdog** layer aimed at answering a practical operator question:

**is the agent actually making progress, or only appearing busy?**

The current monitoring work focuses on:

- task lifecycle tracking and stage-aware summaries
- timeout and stalled-task detection
- repeated-step, repeated-tool, and repeated-output detection
- runtime-health observation through OpenShell, Docker, sandbox, and cluster probes
- normalized event emission for notifications, dashboards, and downstream integrations
- local-first mock testing so the module can be developed and demoed without depending on a live remote cluster

The watchdog implementation and monitoring documentation live here:

- [Monitor Module README](monitor/README.md)
- [Monitor Sandbox Activity](docs/monitoring/monitor-sandbox-activity.md)
- [Telegram Bridge and Notifications](docs/deployment/set-up-telegram-bridge.md)
- [Deploy to Remote GPU](docs/deployment/deploy-to-remote-gpu.md)
- [DGX Spark Setup Guide](spark-install.md)

## Planned Expansion Beyond Security

Security is the first major ClawKeeper-native layer, not the final one.
The current roadmap also includes:

- Runtime Watchdog:
  expanding the current prototype toward deeper dead-loop detection, token overconsumption checks, timeout or stalled-task detection, and abnormal run-state alerts.
- Operator Intelligence:
  proactive recommendations for useful skills, workflow improvements, and operator playbooks based on deployment posture and runtime signals.

Start with these pages if you want the ClawKeeper-specific security story:

- [ClawKeeper Security Enhancement Plan](docs/security/clawkeeper-security-enhancement-plan.md)
- [Security Module Updates](docs/security/security-module-updates.md)
- [Public Exposure Rollout Playbook](docs/security/public-exposure-rollout-playbook.md)
- [Security Best Practices](docs/security/best-practices.md)

## Getting Started

Follow these steps to install ClawKeeper and run your first sandboxed OpenClaw agent.

<!-- start-quickstart-guide -->

### Prerequisites

Before getting started, check the prerequisites to ensure you have the necessary software and hardware to run ClawKeeper.

#### Hardware

| Resource | Minimum        | Recommended      |
|----------|----------------|------------------|
| CPU      | 4 vCPU         | 4+ vCPU          |
| RAM      | 8 GB           | 16 GB            |
| Disk     | 20 GB free     | 40 GB free       |

The sandbox image is approximately 2.4 GB compressed. During image push, the Docker daemon, k3s, and the OpenShell gateway run alongside the export pipeline, which buffers decompressed layers in memory. On machines with less than 8 GB of RAM, this combined usage can trigger the OOM killer. If you cannot add memory, configuring at least 8 GB of swap can work around the issue at the cost of slower performance.

#### Software

| Dependency | Version                          |
|------------|----------------------------------|
| Linux      | Ubuntu 22.04 LTS or later |
| Node.js    | 22.16 or later |
| npm        | 10 or later |
| Container runtime | Supported runtime installed and running |
| [OpenShell](https://github.com/NVIDIA/OpenShell) | Installed |

#### Container Runtimes

| Platform | Supported runtimes | Notes |
|----------|--------------------|-------|
| Linux | Docker | Primary supported path. |
| macOS (Apple Silicon) | Colima, Docker Desktop | Install Xcode Command Line Tools (`xcode-select --install`) and start the runtime before running the installer. |
| macOS (Intel) | Podman | Not supported yet. Depends on OpenShell support for Podman on macOS. |
| Windows WSL | Docker Desktop (WSL backend) | Supported target path. |
| DGX Spark | Docker | Refer to the [DGX Spark setup guide](https://github.com/hollyhongever/ClawKeeper/blob/main/spark-install.md) for cgroup v2 and Docker configuration. |

### Install ClawKeeper and Onboard OpenClaw Agent

Download and run the installer script.
The script installs Node.js if it is not already present, then runs the guided onboard wizard to create a sandbox, configure inference, and apply security policies.

> **ℹ️ Note**
>
> ClawKeeper creates a fresh OpenClaw instance inside the sandbox during the onboarding process.

```bash
curl -fsSL https://raw.githubusercontent.com/hollyhongever/ClawKeeper/main/install.sh | bash
```

If you use nvm or fnm to manage Node.js, the installer may not update your current shell's PATH.
If `clawkeeper` is not found after install, run `source ~/.bashrc` (or `source ~/.zshrc` for zsh) or open a new terminal.
Legacy command `nemoclaw` remains available as a compatibility alias.

When the install completes, a summary confirms the running environment:

```text
──────────────────────────────────────────────────
Sandbox      my-assistant (Landlock + seccomp + netns)
Model        nvidia/nemotron-3-super-120b-a12b (NVIDIA Endpoints)
──────────────────────────────────────────────────
Run:         clawkeeper my-assistant connect
Status:      clawkeeper my-assistant status
Logs:        clawkeeper my-assistant logs --follow
──────────────────────────────────────────────────

[INFO]  === Installation complete ===
```

### Chat with the Agent

Connect to the sandbox, then chat with the agent through the TUI or the CLI.

```bash
clawkeeper my-assistant connect
```

In the sandbox shell, open the OpenClaw terminal UI and start a chat:

```bash
openclaw tui
```

Alternatively, send a single message and print the response:

```bash
openclaw agent --agent main --local -m "hello" --session-id test
```

### Uninstall

To remove ClawKeeper and all resources created during setup, run the uninstall script:

```bash
curl -fsSL https://raw.githubusercontent.com/hollyhongever/ClawKeeper/main/uninstall.sh | bash
```

| Flag               | Effect                                              |
|--------------------|-----------------------------------------------------|
| `--yes`            | Skip the confirmation prompt.                       |
| `--keep-openshell` | Leave the `openshell` binary installed.              |
| `--delete-models`  | Also remove ClawKeeper-pulled Ollama models.         |

For troubleshooting installation or onboarding issues, see the [Troubleshooting guide](docs/reference/troubleshooting.md).

<!-- end-quickstart-guide -->

## Documentation

Refer to the repository documentation for ClawKeeper-specific usage, architecture, and security behavior.

| Page | Description |
|------|-------------|
| [Overview](docs/about/overview.md) | What ClawKeeper is, where it builds on upstream, and which security layers it adds. |
| [How It Works](docs/about/how-it-works.md) | Plugin, blueprint, sandbox lifecycle, and host-side control flow. |
| [ClawKeeper Security Enhancement Plan](docs/security/clawkeeper-security-enhancement-plan.md) | Implementation blueprint for runtime interception, install admission, policy, and audit behavior. |
| [Security Module Updates](docs/security/security-module-updates.md) | Changelog of landed security milestones and operator-facing changes. |
| [Monitor Module README](monitor/README.md) | Module 3 design notes for work detection, collectors, detectors, events, tests, and NemoClaw integration path. |
| [Monitor Sandbox Activity](docs/monitoring/monitor-sandbox-activity.md) | Operator-facing guide for observing sandbox health, runtime signals, and structured events. |
| [Telegram Bridge and Notifications](docs/deployment/set-up-telegram-bridge.md) | Describes the host-side notification path, service monitor, and Telegram push workflow. |
| [Deploy to Remote GPU](docs/deployment/deploy-to-remote-gpu.md) | Remote deployment path for GPU-backed environments and operator workflows. |
| [DGX Spark Setup Guide](spark-install.md) | Practical deployment guide for NemoClaw / ClawKeeper on NVIDIA DGX Spark. |
| [Public Exposure Rollout Playbook](docs/security/public-exposure-rollout-playbook.md) | Staged rollout guide for exposing hardened ClawKeeper deployments more safely. |
| [CLI Commands](docs/reference/commands.md) | Full ClawKeeper CLI command reference. |
| [Network Policies](docs/reference/network-policies.md) | Baseline rules, operator approval flow, and egress control. |
| [Security Best Practices](docs/security/best-practices.md) | Controls reference, risk framework, and posture profiles for sandbox security. |
| [Troubleshooting](docs/reference/troubleshooting.md) | Common issues and resolution steps. |

## Repository Guides

| Guide | Description |
|------|-------------|
| [Upstream Foundation and Attribution](UPSTREAM.md) | Explains how ClawKeeper relates to NemoClaw and OpenShell, and how the repository handles attribution and branding. |
| [Roadmap](ROADMAP.md) | Outlines the Security Control Plane, Runtime Watchdog, and Operator Intelligence phases. |
| [NOTICE](NOTICE) | Short-form attribution and repository notice for derivative work context. |

## Project Structure

The following directories make up the ClawKeeper repository.

```text
ClawKeeper/
├── bin/              # CLI entry point and library modules (CJS)
├── nemoclaw/         # TypeScript plugin (Commander CLI extension)
│   └── src/
│       ├── blueprint/    # Runner, snapshot, SSRF validation, state
│       ├── commands/     # Slash commands, migration state
│       ├── security/     # Risk engine, hooks, policies, audit types
│       └── onboard/      # Onboarding config
├── monitor/          # Runtime watchdog framework, collectors, detectors, reporters, examples, and tests
├── nemoclaw-blueprint/   # Blueprint YAML and network policies
├── scripts/          # Install helpers, setup, automation
├── test/             # Integration and E2E tests
└── docs/             # User-facing docs, including security design and rollout guides
```

## Demo Story

For hackathon judges, the most important takeaway is that ClawKeeper tries to close the gap between **agent capability** and **agent operability**.
The repository now shows work in several complementary directions:

- making the runtime safer through policy and audit controls
- making the runtime observable through watchdog monitoring and structured events
- making the system easier to operate through notification flows, rollout guides, and deployment documentation
- making the project easier to trust through explicit attribution, docs, and operator-facing explanations

That combination is the reason ClawKeeper is more than a thin wrapper around upstream tools.

## Community

Join the ClawKeeper community to ask questions, share feedback, and report issues.

- [Discord](https://discord.gg/XFpfPv9Uvx)
- [GitHub Discussions](https://github.com/hollyhongever/ClawKeeper/discussions)
- [GitHub Issues](https://github.com/hollyhongever/ClawKeeper/issues)

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and the PR process.

## Security

If you discover a ClawKeeper-specific security issue, follow the guidance in [SECURITY.md](SECURITY.md).

For high-risk vulnerabilities such as credential exposure, authentication bypass, sandbox escape, remote code execution, or clear data-exfiltration paths, prefer private reporting first.
For lower-risk hardening gaps, detection misses, non-sensitive misconfigurations, or security improvement suggestions, opening a public GitHub issue is acceptable as long as you do not include secrets or weaponized exploit details.

If the issue appears to originate in upstream OpenShell, NemoClaw, or another dependency rather than ClawKeeper-specific code, coordinate disclosure with the upstream project or vendor as well.

## Notice and Disclaimer

This software automatically retrieves, accesses or interacts with external materials. Those retrieved materials are not distributed with this software and are governed solely by separate terms, conditions and licenses. You are solely responsible for finding, reviewing and complying with all applicable terms, conditions, and licenses, and for verifying the security, integrity and suitability of any retrieved materials for your specific use case. This software is provided "AS IS", without warranty of any kind. The author makes no representations or warranties regarding any retrieved materials, and assumes no liability for any losses, damages, liabilities or legal consequences from your use or inability to use this software or any retrieved materials. Use this software and the retrieved materials at your own risk.

## License

Apache 2.0. See [LICENSE](LICENSE).
