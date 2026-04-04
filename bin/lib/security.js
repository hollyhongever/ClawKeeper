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

function normalizeEvent(rawEvent, lineNo) {
  if (!rawEvent || typeof rawEvent !== "object" || Array.isArray(rawEvent)) return null;
  const event = { ...rawEvent };
  event._line = lineNo;
  event.id = typeof event.id === "string" ? event.id : `line-${lineNo}`;
  event.hook = typeof event.hook === "string" ? event.hook : "unknown-hook";
  event.action =
    typeof event.effectiveAction === "string"
      ? event.effectiveAction
      : typeof event.action === "string"
        ? event.action
        : "allow";
  event.riskLevel = typeof event.riskLevel === "string" ? event.riskLevel : "low";
  event.target = typeof event.target === "string" ? event.target : "unknown";
  event.timestamp = typeof event.timestamp === "string" ? event.timestamp : "";
  return event;
}

function readEvents(filePath = defaultEventsPath(), options = {}) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return {
      path: resolved,
      events: [],
      totalEvents: 0,
      returnedEvents: 0,
      malformedLines: 0,
      filters: {},
    };
  }

  const normalizedOptions =
    typeof options === "number"
      ? { limit: options }
      : options && typeof options === "object"
        ? options
        : {};
  const limit = Math.max(1, Number.parseInt(String(normalizedOptions.limit ?? 50), 10) || 50);
  const actionFilter =
    typeof normalizedOptions.action === "string" ? normalizedOptions.action.trim() : "";
  const hookFilter = typeof normalizedOptions.hook === "string" ? normalizedOptions.hook.trim() : "";
  const riskFilter = typeof normalizedOptions.risk === "string" ? normalizedOptions.risk.trim() : "";
  const idFilter = typeof normalizedOptions.id === "string" ? normalizedOptions.id.trim() : "";

  const lines = fs
    .readFileSync(resolved, "utf-8")
    .split("\n")
    .map((line, index) => ({ line: line.trim(), lineNo: index + 1 }))
    .filter((entry) => entry.line.length > 0);

  let malformedLines = 0;
  const allEvents = [];
  for (const { line, lineNo } of lines) {
    try {
      const parsed = JSON.parse(line);
      const event = normalizeEvent(parsed, lineNo);
      if (event) {
        allEvents.push(event);
      } else {
        malformedLines += 1;
      }
    } catch {
      // Ignore malformed lines to keep event browsing resilient.
      malformedLines += 1;
    }
  }

  allEvents.sort((a, b) => {
    const at = a.timestamp || "";
    const bt = b.timestamp || "";
    if (at === bt) return b._line - a._line;
    return bt.localeCompare(at);
  });

  let filtered = allEvents;
  if (actionFilter) filtered = filtered.filter((event) => event.action === actionFilter);
  if (hookFilter) filtered = filtered.filter((event) => event.hook === hookFilter);
  if (riskFilter) filtered = filtered.filter((event) => event.riskLevel === riskFilter);
  if (idFilter) filtered = filtered.filter((event) => String(event.id).includes(idFilter));

  const events = filtered.slice(0, limit);
  return {
    path: resolved,
    events,
    totalEvents: allEvents.length,
    returnedEvents: events.length,
    malformedLines,
    filters: {
      action: actionFilter || null,
      hook: hookFilter || null,
      risk: riskFilter || null,
      id: idFilter || null,
      limit,
    },
  };
}

function replayEvent(eventId, filePath = defaultEventsPath()) {
  const resolved = path.resolve(filePath);
  const { events, totalEvents, malformedLines } = readEvents(resolved, {
    limit: Number.MAX_SAFE_INTEGER,
  });
  const exact = events.filter((entry) => entry.id === eventId);
  if (exact.length > 0) {
    return {
      path: resolved,
      event: exact[0],
      matches: exact.length,
      totalEvents,
      malformedLines,
    };
  }

  const prefix = events.filter((entry) => String(entry.id).startsWith(eventId));
  if (prefix.length === 1) {
    return {
      path: resolved,
      event: prefix[0],
      matches: 1,
      totalEvents,
      malformedLines,
    };
  }

  return {
    path: resolved,
    event: null,
    matches: prefix.length,
    totalEvents,
    malformedLines,
  };
}

module.exports = {
  defaultPolicyPath,
  defaultEventsPath,
  validatePolicy,
  readEvents,
  replayEvent,
};
