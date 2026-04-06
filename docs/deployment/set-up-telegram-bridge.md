---
title:
  page: "Use the NemoClaw Telegram Bridge, Push Notifications, and Service Monitoring"
  nav: "Telegram Bridge and Notifications"
description:
  main: "Forward Telegram messages to the sandboxed OpenClaw agent and monitor service events from the terminal or Telegram."
  agent: "Sets up the Telegram bridge, push notifications, and terminal status views. Use when configuring Telegram integration, getting chat IDs, or diagnosing bridge and network issues."
keywords: ["nemoclaw telegram bridge", "telegram bot openclaw agent", "telegram push notifications", "service monitor"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "telegram", "deployment", "monitoring", "nemoclaw"]
content:
  type: how_to
  difficulty: intermediate
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Use the Telegram Bridge, Push Notifications, and Service Monitoring

Use one Telegram bot to do both of the following:

- Chat with the OpenClaw agent running inside the sandbox.
- Receive service-event push notifications when the bridge, tunnel, or monitor reports a problem.

This workflow is managed by `clawkeeper start` or `nemoclaw start`.

## Prerequisites

- A running NemoClaw sandbox, either local or remote.
- A Telegram bot token from [BotFather](https://t.me/BotFather).
- The OpenShell CLI on your `PATH`.
- An `NVIDIA_API_KEY`.

:::{important}
The current host-side Telegram bridge requires both `TELEGRAM_BOT_TOKEN` and `NVIDIA_API_KEY` to start, even if the sandbox itself uses a local provider such as Ollama.
:::

## Components and Data Flow

The Telegram integration has five moving parts:

1. `clawkeeper` or `nemoclaw` runs on the host and starts auxiliary services.
2. `telegram-bridge` polls the Telegram Bot API.
3. `openshell` provides SSH access into the selected sandbox.
4. `nemoclaw-start openclaw agent` runs inside the sandbox and produces the reply.
5. `service-monitor` watches the bridge and tunnel, writes structured events, and optionally pushes those events back to Telegram.

In practice, the request path looks like this:

```text
Telegram -> telegram-bridge -> openshell ssh -> sandbox -> openclaw agent
```

## Create a Telegram Bot

Open Telegram and send `/newbot` to [@BotFather](https://t.me/BotFather).
Follow the prompts to create a bot and receive a bot token.

## Required and Optional Environment Variables

Use the following environment variables when you start the services:

| Variable | Required | Purpose |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from BotFather. Used for chat and push notifications. |
| `NVIDIA_API_KEY` | Yes | Required by the current host-side bridge startup logic. |
| `SANDBOX_NAME` or `NEMOCLAW_SANDBOX` | Recommended | Selects the target sandbox. If omitted, `clawkeeper start` uses the registered default sandbox. |
| `ALLOWED_CHAT_IDS` | Optional | Comma-separated list of chat IDs allowed to talk to the bot. |
| `TELEGRAM_PUSH_CHAT_IDS` | Optional | Comma-separated list of chat IDs that receive service-event push notifications. If omitted, push falls back to `ALLOWED_CHAT_IDS`. |
| `HTTP_PROXY` and `HTTPS_PROXY` | Optional | Required when the host can reach Telegram only through a local or corporate proxy. |
| `NEMOCLAW_ENABLE_MONITOR` | Optional | Forces `service-monitor` to start even if chat is not enabled. |
| `NEMOCLAW_DISABLE_MONITOR` | Optional | Disables `service-monitor`. |

:::{important}
Environment variables are read by the shell that launches `clawkeeper start`.
If you export a variable in one terminal and start ClawKeeper from another terminal, the second terminal does not inherit that value.
:::

## Verify Network Reachability

Before debugging the bridge, confirm that the host can reach Telegram from the same terminal that you plan to use for `clawkeeper start`.

If your environment requires a proxy, export it first:

```console
$ export HTTP_PROXY=http://127.0.0.1:7890
$ export HTTPS_PROXY=http://127.0.0.1:7890
```

Then verify Telegram access:

```console
$ curl -sS -m 15 https://api.telegram.org
```

The expected response is an HTTP redirect page from Telegram, not a timeout.

If this command times out, the host is not reaching Telegram from the current shell.

## Get Your Chat ID

Before enabling access control or push notifications, send `/start` to the bot once from Telegram.

Then fetch updates:

```console
$ curl -sS -m 15 "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates"
```

Look for the `chat.id` field in the response.

If the result set is empty, the bot has not received a message yet.
Send `/start` or a normal message to the bot, then repeat the request.

## Export the Runtime Configuration

The following example configures one sandbox, one user chat, and one push target:

```console
$ export TELEGRAM_BOT_TOKEN=<your-bot-token>
$ export NVIDIA_API_KEY=<your-nvidia-api-key>
$ export SANDBOX_NAME=my-assistant
$ export ALLOWED_CHAT_IDS=6281470475
$ export TELEGRAM_PUSH_CHAT_IDS=6281470475
```

You do not need a second bot token to receive error notifications.
The same bot token handles both chat and push notifications.
The difference is the target chat ID, not the bot identity.

## Start Auxiliary Services

Start the Telegram bridge and other auxiliary services:

```console
$ clawkeeper start
```

The `start` command launches the following services:

- The Telegram bridge forwards messages between Telegram and the agent.
- The service monitor writes structured service events and optionally pushes them to Telegram.
- The cloudflared tunnel provides external access to the sandbox when `cloudflared` is installed.

When proxy variables are present, the service startup path automatically enables Node.js environment-proxy support for the bridge processes.

## Verify the Services

Check service status:

```console
$ clawkeeper status
```

The terminal view shows the following information:

- Running or stopped state for `service-monitor`, `telegram-bridge`, and `cloudflared`
- Public tunnel URL when available
- Recent structured events such as bridge startup, bridge failures, tunnel changes, and manual test events

For machine-readable output, use:

```console
$ clawkeeper status --json
```

This command prints a snapshot that includes the default sandbox, running auxiliary services, tunnel URL, and recent events.

## Send a Message

Open Telegram, find your bot, and send a message.
The bridge forwards the message to the OpenClaw agent inside the sandbox and returns the agent response.

To watch blocked network requests and approvals in real time, open the OpenShell TUI on the host:

```console
$ openshell term
```

## Restrict Chat Access

To restrict which Telegram chats can interact with the agent, set the `ALLOWED_CHAT_IDS` environment variable to a comma-separated list of Telegram chat IDs:

```console
$ export ALLOWED_CHAT_IDS="123456789,987654321"
$ clawkeeper stop
$ clawkeeper start
```

If you change `ALLOWED_CHAT_IDS`, restart the services so the new value reaches the running processes.

## Enable Push Notifications for Service Events

To receive service errors and state changes in Telegram, set `TELEGRAM_PUSH_CHAT_IDS`:

```console
$ export TELEGRAM_PUSH_CHAT_IDS="123456789"
$ clawkeeper stop
$ clawkeeper start
```

If `TELEGRAM_PUSH_CHAT_IDS` is unset, the service monitor falls back to `ALLOWED_CHAT_IDS`.

:::{note}
The running `service-monitor` process reads its push-target environment variables only at startup.
If you change `TELEGRAM_PUSH_CHAT_IDS` or `ALLOWED_CHAT_IDS`, restart the services.
:::

## Inspect Local Event and Log Files

Service state is stored under `/tmp/nemoclaw-services-<sandbox-name>`.

The most useful files are:

- `events.jsonl` for structured events
- `telegram-bridge.log` for bridge output
- `service-monitor.log` for push-monitoring output
- `cloudflared.log` for tunnel status

For example:

```console
$ tail -f /tmp/nemoclaw-services-my-assistant/events.jsonl
$ tail -f /tmp/nemoclaw-services-my-assistant/service-monitor.log
$ tail -f /tmp/nemoclaw-services-my-assistant/telegram-bridge.log
```

## Generate a Fake Event to Test Push Notifications

Write a manual event into the current sandbox event log:

```console
$ node - <<'NODE'
const { appendServiceEvent } = require('/home/xsuper/ClawKeeper/dist/lib/service-events.js');

appendServiceEvent('/tmp/nemoclaw-services-my-assistant', {
  level: 'error',
  source: 'manual-test',
  service: 'telegram-bridge',
  title: 'Manual push test',
  detail: 'If you see this in Telegram, push is working.',
});
NODE
```

If push is configured correctly, the event appears in both of the following places:

- `clawkeeper status`
- The configured Telegram push target chat

## Common Pitfalls

### `curl ...getUpdates` times out

The host is usually missing `HTTP_PROXY` and `HTTPS_PROXY` in the current terminal.
First verify the proxy variables, then retry `curl`.

### `clawkeeper status` shows events but Telegram does not receive push notifications

The event pipeline is working, but `service-monitor` usually started without a push target.
Check that one of the following variables is set before `clawkeeper start`:

- `TELEGRAM_PUSH_CHAT_IDS`
- `ALLOWED_CHAT_IDS`

Then restart the services.

### `getUpdates` returns an empty list

The bot has not received a message yet.
Send `/start` to the bot, then run `getUpdates` again.

### Manual `curl` works but manually running `node scripts/telegram-bridge.js` fails

`curl` and Node.js must run in the same shell with the same proxy variables.
The `clawkeeper start` path configures Node.js proxy support automatically when proxy variables are present, but ad-hoc manual commands still depend on your current shell environment.

### Telegram bridge does not start when the sandbox uses a local provider

The current bridge still requires `NVIDIA_API_KEY` at startup.
Set it before `clawkeeper start`.

### `cloudflared` is missing

Telegram chat and push notifications can still work without `cloudflared`.
You only lose the public tunnel URL.

### Secrets were pasted into chat or logs

Rotate exposed Telegram bot tokens in BotFather and replace any exposed API keys immediately.

## Stop the Services

To stop the Telegram bridge, service monitor, and any tunnel process:

```console
$ clawkeeper stop
```

## Related Topics

- [Deploy NemoClaw to a Remote GPU Instance](deploy-to-remote-gpu.md) for remote deployment with Telegram support.
- [Monitor Sandbox Activity](../monitoring/monitor-sandbox-activity.md) for sandbox-side logs and TUI guidance.
- [Commands](../reference/commands.md) for the full `start`, `stop`, and `status` command reference.
- [Troubleshooting](../reference/troubleshooting.md) for additional recovery steps.
