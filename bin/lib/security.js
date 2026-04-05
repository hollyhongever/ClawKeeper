// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const YAML = require("yaml");

const { ROOT } = require("./runner");

function defaultPolicyPath() {
  return path.join(ROOT, "nemoclaw", "security-policy.yaml");
}

function defaultEventsPath() {
  return (
    process.env.CLAWKEEPER_SECURITY_EVENTS_PATH ||
    path.join(os.homedir(), ".nemoclaw", "security", "events.jsonl")
  );
}

function readPolicy(policyPath = defaultPolicyPath()) {
  const resolved = path.resolve(policyPath);
  if (!fs.existsSync(resolved)) {
    return { resolved, parsed: null, errors: ["Policy file not found"] };
  }

  try {
    const content = fs.readFileSync(resolved, "utf-8");
    const parsed = YAML.parse(content);
    return { resolved, parsed, errors: [] };
  } catch (error) {
    return {
      resolved,
      parsed: null,
      errors: [`Failed to parse YAML: ${String(error)}`],
    };
  }
}

function validatePolicy(policyPath = defaultPolicyPath()) {
  const { resolved, parsed, errors } = readPolicy(policyPath);
  const warnings = [];

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    if (errors.length === 0) errors.push("Policy root must be a YAML object");
    return { ok: false, path: resolved, errors, warnings, policy: null };
  }

  const decisionMatrix = parsed.decision_matrix || parsed.decisionMatrix;
  const validActions = new Set(["allow", "block", "require_approval"]);
  const requiredRiskLevels = ["low", "medium", "high", "critical"];

  if (!decisionMatrix || typeof decisionMatrix !== "object" || Array.isArray(decisionMatrix)) {
    errors.push("Missing decision_matrix object");
  } else {
    for (const risk of requiredRiskLevels) {
      const action = decisionMatrix[risk];
      if (!validActions.has(action)) {
        errors.push(`decision_matrix.${risk} must be one of allow|block|require_approval`);
      }
    }
  }

  const requiredSections = ["command_rules", "path_rules", "network_rules", "install_rules", "audit"];
  for (const section of requiredSections) {
    if (!(section in parsed) && !(camelCase(section) in parsed)) {
      warnings.push(`Missing section: ${section}`);
    }
  }

  return { ok: errors.length === 0, path: resolved, errors, warnings, policy: parsed };
}

function camelCase(value) {
  return String(value).replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
}

function readEvents(filePath = defaultEventsPath(), limit = 50) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { path: resolved, events: [] };
  }

  const lines = fs
    .readFileSync(resolved, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const events = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event && typeof event === "object" && !Array.isArray(event)) {
        events.push(event);
      }
    } catch {
      // Ignore malformed lines to keep event browsing resilient.
    }
  }

  const bounded = Math.max(1, Number.parseInt(String(limit), 10) || 50);
  return { path: resolved, events: events.slice(-bounded).reverse() };
}

function replayEvent(eventId, filePath = defaultEventsPath()) {
  const resolved = path.resolve(filePath);
  const { events } = readEvents(resolved, Number.MAX_SAFE_INTEGER);
  const event = events.find((entry) => entry.id === eventId) || null;
  return { path: resolved, event };
}

module.exports = {
  defaultPolicyPath,
  defaultEventsPath,
  validatePolicy,
  readEvents,
  replayEvent,
};
