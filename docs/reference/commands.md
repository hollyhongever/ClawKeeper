---
title:
  page: "ClawKeeper CLI Commands Reference"
  nav: "Commands"
description:
  main: "Full CLI reference for slash commands and standalone ClawKeeper commands."
  agent: "Lists all slash commands and standalone ClawKeeper CLI commands. Use when looking up a command, checking command syntax, or browsing the CLI reference."
keywords: ["clawkeeper cli commands", "clawkeeper command reference", "nemoclaw compatibility alias"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "clawkeeper", "cli", "nemoclaw"]
content:
  type: reference
  difficulty: technical_beginner
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Commands

The `clawkeeper` CLI is the primary interface for managing ClawKeeper sandboxes.
Legacy alias: `nemoclaw` is still supported for compatibility.

## `/clawkeeper` Slash Command

The `/clawkeeper` slash command is available inside the OpenClaw chat interface for quick actions.
Legacy alias: `/nemoclaw`.

| Subcommand | Description |
|---|---|
| `/clawkeeper` | Show slash-command help and host CLI pointers |
| `/clawkeeper status` | Show sandbox and inference state |
| `/clawkeeper onboard` | Show onboarding status and reconfiguration guidance |
| `/clawkeeper eject` | Show rollback instructions for returning to the host installation |

## Standalone Host Commands

The `clawkeeper` binary handles host-side operations that run outside the OpenClaw plugin context.

### `clawkeeper help`, `clawkeeper --help`, `clawkeeper -h`

Show the top-level usage summary and command groups.
Running `clawkeeper` with no arguments shows the same help output.

```console
$ clawkeeper help
```

### `clawkeeper --version`, `clawkeeper -v`

Print the installed ClawKeeper CLI version.

```console
$ clawkeeper --version
```

### `clawkeeper onboard`

Run the interactive setup wizard (recommended for new installs).
The wizard creates an OpenShell gateway, registers inference providers, builds the sandbox image, and creates the sandbox.
Use this command for new installs and for recreating a sandbox after changes to policy or configuration.

```console
$ clawkeeper onboard
```

The wizard prompts for a provider first, then collects the provider credential if needed.
Supported non-experimental choices include NVIDIA Endpoints, OpenAI, Anthropic, Google Gemini, and compatible OpenAI or Anthropic endpoints.
Credentials are stored in `~/.nemoclaw/credentials.json`.
Set `NEMOCLAW_CRED_STORE_KEY` and run `clawkeeper security set-password` to migrate plaintext credentials into an encrypted AES-256-GCM envelope (scrypt KDF).
Use `clawkeeper security status` to confirm the active storage mode and key count.
The legacy `nemoclaw setup` command is deprecated; use `clawkeeper onboard` instead.

If you enable Brave Search during onboarding, ClawKeeper currently stores the Brave API key in the sandbox's OpenClaw configuration.
That means the OpenClaw agent can read the key.
ClawKeeper explores an OpenShell-hosted credential path first, but the current OpenClaw Brave runtime does not consume that path end to end yet.
Treat Brave Search as an explicit opt-in and use a dedicated low-privilege Brave key.

For non-interactive onboarding, you must explicitly accept the third-party software notice:

```console
$ clawkeeper onboard --non-interactive --yes-i-accept-third-party-software
```

or:

```console
$ CLAWKEEPER_ACCEPT_THIRD_PARTY_SOFTWARE=1 clawkeeper onboard --non-interactive
```

To enable Brave Search in non-interactive mode, set:

```console
$ BRAVE_API_KEY=... \
  clawkeeper onboard --non-interactive
```

`BRAVE_API_KEY` enables Brave Search in non-interactive mode and also enables `web_fetch`.

The wizard prompts for a sandbox name.
Names must follow RFC 1123 subdomain rules: lowercase alphanumeric characters and hyphens only, and must start and end with an alphanumeric character.
Uppercase letters are automatically lowercased.

Before creating the gateway, the wizard runs preflight checks.
On systems with cgroup v2 (Ubuntu 24.04, DGX Spark, WSL2), it verifies that Docker is configured with `"default-cgroupns-mode": "host"` and provides fix instructions if the setting is missing.

### `clawkeeper list`

List all registered sandboxes with their model, provider, and policy presets.

```console
$ clawkeeper list
```

### `clawkeeper deploy`

:::{warning}
The `clawkeeper deploy` command is experimental and may not work as expected.
:::

Deploy ClawKeeper to a remote GPU instance through [Brev](https://brev.nvidia.com).
The deploy script installs Docker, NVIDIA Container Toolkit if a GPU is present, and OpenShell on the VM, then runs `clawkeeper onboard` and connects to the sandbox.

```console
$ clawkeeper deploy <instance-name>
```

### `clawkeeper <name> connect`

Connect to a sandbox by name.

```console
$ clawkeeper my-assistant connect
```

### `clawkeeper <name> status`

Show sandbox status, health, and inference configuration.

```console
$ clawkeeper my-assistant status
```

### `clawkeeper <name> logs`

View sandbox logs.
Use `--follow` to stream output in real time.

```console
$ clawkeeper my-assistant logs [--follow]
```

### `clawkeeper <name> destroy`

Stop the NIM container and delete the sandbox.
This removes the sandbox from the registry.

:::{warning}
Destroying a sandbox permanently deletes all files inside it, including
[workspace files](../workspace/workspace-files.md) (SOUL.md, USER.md, IDENTITY.md, AGENTS.md, MEMORY.md, and daily memory notes).
Back up your workspace first by following the instructions at [Back Up and Restore](../workspace/backup-restore.md).
:::

```console
$ clawkeeper my-assistant destroy
```

### `clawkeeper <name> policy-add`

Add a policy preset to a sandbox.
Presets extend the baseline network policy with additional endpoints.

```console
$ clawkeeper my-assistant policy-add
```

### `clawkeeper <name> policy-list`

List available policy presets and show which ones are applied to the sandbox.

```console
$ clawkeeper my-assistant policy-list
```

### `openshell term`

Open the OpenShell TUI to monitor sandbox activity and approve network egress requests.
Run this on the host where the sandbox is running.

```console
$ openshell term
```

For a remote Brev instance, SSH to the instance and run `openshell term` there, or use a port-forward to the gateway.

### `clawkeeper start`

Start auxiliary services, such as the Telegram bridge and cloudflared tunnel.

```console
$ clawkeeper start
```

Requires `TELEGRAM_BOT_TOKEN` for the Telegram bridge.

### `clawkeeper stop`

Stop all auxiliary services.

```console
$ clawkeeper stop
```

### `clawkeeper status`

Show the sandbox list and the status of auxiliary services.

```console
$ clawkeeper status
```

### `clawkeeper security policy validate`

Validate a ClawKeeper security policy file before enforcing semantic security hooks.
By default this validates `nemoclaw/security-policy.yaml`.

```console
$ clawkeeper security policy validate [--file <path>]
```

### `clawkeeper security status`

Show credential-store mode (`plaintext` or `encrypted`), stored credential key count, and whether `NEMOCLAW_CRED_STORE_KEY` is detected in the current environment.

```console
$ clawkeeper security status
```

### `clawkeeper security set-password`

Set or rotate the credential-store password and re-encrypt `~/.nemoclaw/credentials.json`.
In non-interactive contexts this command uses `NEMOCLAW_CRED_STORE_KEY`.
In interactive terminals, you can enter and confirm a password if the environment variable is not set.

```console
$ export NEMOCLAW_CRED_STORE_KEY='my-credential-store-password'
$ clawkeeper security set-password
```

### `clawkeeper security events`

Print recent structured security events from the JSONL audit log.
By default this reads `~/.nemoclaw/security/events.jsonl`.

```console
$ clawkeeper security events [--limit <n>] [--action <name>] [--hook <name>] [--risk <level>] [--id <pattern>] [--json] [--file <path>]
```

Use filters to narrow event lists for demos and incident triage.
Malformed JSONL records are skipped so listing remains resilient, and the CLI reports how many malformed lines were ignored.

| Flag | Description |
|------|-------------|
| `--limit <n>` | Maximum number of matching events to print (default: `50`) |
| `--action <name>` | Filter by effective action (`allow`, `block`, `require_approval`) |
| `--hook <name>` | Filter by hook name (for example `before_tool_call`) |
| `--risk <level>` | Filter by risk level (`low`, `medium`, `high`, `critical`) |
| `--id <pattern>` | Filter by event ID substring match |
| `--json` | Print structured JSON output including filters and malformed-line count |
| `--file <path>` | Read from an alternate JSONL audit log file |

### `clawkeeper security replay`

Show full details for a single security event by ID.
Replay first checks exact IDs, then falls back to ID prefix matching.
If the provided prefix is ambiguous (matches multiple events), the command exits non-zero.

```console
$ clawkeeper security replay <event-id> [--json] [--file <path>]
```

| Flag | Description |
|------|-------------|
| `--json` | Print replay result as JSON (includes dataset totals and match count) |
| `--file <path>` | Read from an alternate JSONL audit log file |

### `clawkeeper setup-spark`

Set up ClawKeeper on DGX Spark.
This command applies cgroup v2 and Docker fixes required for Ubuntu 24.04.
Run with `sudo` on the Spark host.
After the fixes complete, the script prompts you to run `clawkeeper onboard` to continue setup.

```console
$ sudo clawkeeper setup-spark
```

### `clawkeeper debug`

Collect diagnostics for bug reports.
Gathers system info, Docker state, gateway logs, and sandbox status into a summary or tarball.
Use `--sandbox <name>` to target a specific sandbox, `--quick` for a smaller snapshot, or `--output <path>` to save a tarball that you can attach to an issue.

```console
$ clawkeeper debug [--quick] [--sandbox NAME] [--output PATH]
```

| Flag | Description |
|------|-------------|
| `--quick` | Collect minimal diagnostics only |
| `--sandbox NAME` | Target a specific sandbox (default: auto-detect) |
| `--output PATH` | Write diagnostics tarball to the given path |

### `clawkeeper uninstall`

Run `uninstall.sh` to remove ClawKeeper sandboxes, gateway resources, related images and containers, and local state.
The CLI uses the local `uninstall.sh` first and falls back to the hosted script if the local file is unavailable.

| Flag | Effect |
|---|---|
| `--yes` | Skip the confirmation prompt |
| `--keep-openshell` | Leave the `openshell` binary installed |
| `--delete-models` | Also remove ClawKeeper-pulled Ollama models |

```console
$ clawkeeper uninstall [--yes] [--keep-openshell] [--delete-models]
```

### Legacy `nemoclaw` Compatibility

`nemoclaw` remains available as a compatibility alias for `clawkeeper`.
Deprecated `nemoclaw setup` delegates directly to `clawkeeper onboard`.

```console
$ nemoclaw setup
```
