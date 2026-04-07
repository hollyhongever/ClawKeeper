#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const fs = require("fs");
const path = require("path");
const https = require("https");
const {
  appendServiceEvent,
  resolveServiceEventLogPath,
} = require("../dist/lib/service-events");
const { parseAllowedChatIds } = require("../bin/lib/chat-filter");

const SANDBOX = process.env.SANDBOX_NAME || "default";
const PID_DIR =
  process.env.NEMOCLAW_PID_DIR || path.join("/tmp", `nemoclaw-services-${SANDBOX}`);
const EVENT_LOG = process.env.NEMOCLAW_EVENT_LOG || resolveServiceEventLogPath(PID_DIR);
const POLL_MS = Math.max(2000, Number.parseInt(process.env.NEMOCLAW_MONITOR_POLL_MS || "4000", 10));
const MONITORED_SERVICES = ["runtime-watchdog", "telegram-bridge", "cloudflared"];
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const PUSH_CHAT_IDS =
  parseAllowedChatIds(process.env.TELEGRAM_PUSH_CHAT_IDS) ||
  parseAllowedChatIds(process.env.ALLOWED_CHAT_IDS) ||
  [];
const NOTIFY_AFTER_MS = Date.parse(process.env.NEMOCLAW_NOTIFY_AFTER || new Date().toISOString());

let lastStatuses = new Map();
let lastTunnelUrl = null;
let eventOffset = 0;
let tickActive = false;

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(serviceName) {
  const pidFile = path.join(PID_DIR, `${serviceName}.pid`);
  if (!fs.existsSync(pidFile)) return null;
  const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

function readServiceState(serviceName) {
  const pid = readPid(serviceName);
  return {
    pid: pid && isAlive(pid) ? pid : null,
    running: !!(pid && isAlive(pid)),
  };
}

function readTunnelUrl() {
  const logFile = path.join(PID_DIR, "cloudflared.log");
  if (!fs.existsSync(logFile)) return null;
  const log = fs.readFileSync(logFile, "utf8");
  const match = /https:\/\/[a-z0-9-]*\.trycloudflare\.com/.exec(log);
  return match ? match[0] : null;
}

function recordEvent(level, title, detail, service) {
  appendServiceEvent(PID_DIR, {
    level,
    source: "service-monitor",
    title,
    detail,
    service,
  });
}

function tgApi(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${TOKEN}/${method}`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk) => (buf += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(buf));
          } catch {
            resolve({ ok: false, description: buf });
          }
        });
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}

function formatEventNotification(event) {
  const lines = [`[${event.level.toUpperCase()}] ${event.title}`];
  if (event.service) {
    lines.push(`module: ${event.service}`);
  }
  if (event.detail) {
    lines.push(event.detail);
  }
  lines.push(`sandbox: ${SANDBOX}`);
  lines.push(`time: ${event.timestamp}`);
  return lines.join("\n");
}

async function pushEvent(event) {
  if (!TOKEN || PUSH_CHAT_IDS.length === 0) return;
  const text = formatEventNotification(event);
  for (const chatId of PUSH_CHAT_IDS) {
    try {
      const response = await tgApi("sendMessage", { chat_id: chatId, text });
      if (!response?.ok) {
        console.error(
          `[service-monitor] push failed for chat ${chatId}: ${response?.description || "unknown error"}`,
        );
      }
    } catch (error) {
      console.error(
        `[service-monitor] push failed for chat ${chatId}: ${String(error?.message || error)}`,
      );
    }
  }
}

async function flushNewEvents() {
  if (!TOKEN || PUSH_CHAT_IDS.length === 0 || !fs.existsSync(EVENT_LOG)) {
    return;
  }

  const raw = fs.readFileSync(EVENT_LOG, "utf8");
  if (eventOffset > raw.length) {
    eventOffset = 0;
  }
  const nextOffset = raw.length;
  const chunk = raw.slice(eventOffset);
  eventOffset = nextOffset;
  if (!chunk.trim()) {
    return;
  }

  const entries = chunk
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((event) => Date.parse(event.timestamp || "") >= NOTIFY_AFTER_MS)
    .filter(
      (event) =>
        !(event.source === "service-monitor" && event.title === "Service monitor is running"),
    );

  for (const event of entries) {
    await pushEvent(event);
  }
}

function updateServiceStates() {
  const nextStatuses = new Map();
  for (const serviceName of MONITORED_SERVICES) {
    nextStatuses.set(serviceName, readServiceState(serviceName));
  }

  if (lastStatuses.size === 0) {
    lastStatuses = nextStatuses;
    lastTunnelUrl = readTunnelUrl();
    return;
  }

  for (const serviceName of MONITORED_SERVICES) {
    const previous = lastStatuses.get(serviceName);
    const current = nextStatuses.get(serviceName);
    if (!previous || !current) continue;

    if (previous.running && !current.running) {
      recordEvent(
        "error",
        `${serviceName} stopped unexpectedly`,
        previous.pid ? `Last known PID ${previous.pid}` : "Process exited",
        serviceName,
      );
    } else if (!previous.running && current.running) {
      recordEvent(
        "info",
        `${serviceName} recovered`,
        current.pid ? `PID ${current.pid}` : "Process is running again",
        serviceName,
      );
    } else if (
      previous.running &&
      current.running &&
      previous.pid &&
      current.pid &&
      previous.pid !== current.pid
    ) {
      recordEvent(
        "warn",
        `${serviceName} restarted`,
        `PID ${previous.pid} -> ${current.pid}`,
        serviceName,
      );
    }
  }

  const currentTunnelUrl = readTunnelUrl();
  if (currentTunnelUrl && currentTunnelUrl !== lastTunnelUrl) {
    recordEvent(
      "info",
      lastTunnelUrl ? "Public tunnel changed" : "Public tunnel is ready",
      currentTunnelUrl,
      "cloudflared",
    );
  }

  lastStatuses = nextStatuses;
  lastTunnelUrl = currentTunnelUrl;
}

function shutdown() {
  recordEvent("info", "Service monitor stopped", `Sandbox ${SANDBOX}`, "service-monitor");
  process.exit(0);
}

async function tick() {
  if (tickActive) return;
  tickActive = true;
  try {
    updateServiceStates();
    await flushNewEvents();
  } finally {
    tickActive = false;
  }
}

function main() {
  fs.mkdirSync(PID_DIR, { recursive: true });
  if (!fs.existsSync(EVENT_LOG)) {
    fs.writeFileSync(EVENT_LOG, "");
  }
  recordEvent("info", "Service monitor is running", `Sandbox ${SANDBOX}`, "service-monitor");
  eventOffset = 0;
  updateServiceStates();
  void flushNewEvents();
  setInterval(() => {
    tick().catch((error) => {
      recordEvent(
        "error",
        "Service monitor update failed",
        String(error?.message || error),
        "service-monitor",
      );
    });
  }, POLL_MS);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  main();
} catch (error) {
  recordEvent(
    "error",
    "Service monitor crashed",
    String(error?.message || error),
    "service-monitor",
  );
  process.exit(1);
}
