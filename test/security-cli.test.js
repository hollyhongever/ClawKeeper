// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CLI = path.join(import.meta.dirname, "..", "bin", "nemoclaw.js");

function runWithEnv(args, env = {}) {
  try {
    const out = execSync(`node "${CLI}" ${args}`, {
      encoding: "utf-8",
      env: {
        ...process.env,
        ...env,
      },
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout || ""}${err.stderr || ""}` };
  }
}

function setupSecurityEventsHome(lines) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "clawkeeper-security-events-"));
  const eventsDir = path.join(home, ".nemoclaw", "security");
  fs.mkdirSync(eventsDir, { recursive: true });
  const eventsPath = path.join(eventsDir, "events.jsonl");
  fs.writeFileSync(eventsPath, `${lines.join("\n")}\n`, "utf-8");
  return { home, eventsPath };
}

describe("security CLI commands", () => {
  it("validates a well-formed security policy", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "clawkeeper-security-policy-"));
    const policyPath = path.join(tmp, "security-policy.yaml");
    fs.writeFileSync(
      policyPath,
      [
        "version: 1",
        "decision_matrix:",
        "  low: allow",
        "  medium: allow",
        "  high: require_approval",
        "  critical: block",
      ].join("\n"),
      "utf-8",
    );

    const result = runWithEnv(`security policy validate --file "${policyPath}"`);
    expect(result.code).toBe(0);
    expect(result.out).toContain("Security policy is valid");
  });

  it("fails validation on malformed policy", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "clawkeeper-security-policy-invalid-"));
    const policyPath = path.join(tmp, "security-policy.yaml");
    fs.writeFileSync(policyPath, "not: [valid", "utf-8");

    const result = runWithEnv(`security policy validate --file "${policyPath}"`);
    expect(result.code).toBe(1);
    expect(result.out).toContain("Security policy validation failed");
  });

  it("supports combined filters and reports malformed JSONL lines", () => {
    const eventLow = {
      id: "evt-low",
      timestamp: "2026-04-04T10:00:00.000Z",
      hook: "before_tool_call",
      action: "allow",
      effectiveAction: "allow",
      riskLevel: "low",
      target: "ls -la",
    };
    const eventCriticalMatch = {
      id: "evt-critical-match",
      timestamp: "2026-04-04T11:00:00.000Z",
      hook: "before_tool_call",
      action: "block",
      effectiveAction: "block",
      riskLevel: "critical",
      target: "rm -rf /",
    };
    const eventCriticalOtherHook = {
      id: "evt-critical-other-hook",
      timestamp: "2026-04-04T12:00:00.000Z",
      hook: "after_tool_result",
      action: "block",
      effectiveAction: "block",
      riskLevel: "critical",
      target: "curl example.com",
    };
    const { home } = setupSecurityEventsHome([
      JSON.stringify(eventLow),
      "{invalid-jsonl",
      JSON.stringify(eventCriticalMatch),
      JSON.stringify(eventCriticalOtherHook),
    ]);

    const list = runWithEnv("security events --hook before_tool_call --risk critical --limit 10", {
      HOME: home,
    });
    expect(list.code).toBe(0);
    expect(list.out).toContain("Note: skipped 1 malformed event line(s).");
    expect(list.out).toContain("Filters: hook=before_tool_call, risk=critical");
    expect(list.out).toContain("evt-critical-match");
    expect(list.out).not.toContain("evt-low");
    expect(list.out).not.toContain("evt-critical-other-hook");
  });

  it("supports replay JSON output", () => {
    const event = {
      eventVersion: "security-event.v1",
      id: "evt-123",
      timestamp: "2026-04-04T12:34:56.000Z",
      hook: "before_tool_call",
      action: "block",
      effectiveAction: "block",
      riskLevel: "critical",
      riskScore: 99,
      target: "rm -rf /",
      reason: "Matched critical command pattern",
      evidence: [{ code: "command_critical", message: "Matched critical pattern" }],
    };
    const { home } = setupSecurityEventsHome([JSON.stringify(event)]);

    const replay = runWithEnv("security replay evt-123 --json", { HOME: home });
    expect(replay.code).toBe(0);
    const payload = JSON.parse(replay.out);
    expect(payload.event?.id).toBe("evt-123");
    expect(payload.matches).toBe(1);
  });

  it("returns non-zero for ambiguous replay ID prefix (including JSON mode)", () => {
    const event1 = {
      id: "evt-prefix-a",
      timestamp: "2026-04-04T12:00:00.000Z",
      hook: "before_tool_call",
      action: "block",
      effectiveAction: "block",
      riskLevel: "high",
      target: "npm install foo",
    };
    const event2 = {
      id: "evt-prefix-b",
      timestamp: "2026-04-04T12:01:00.000Z",
      hook: "before_tool_call",
      action: "block",
      effectiveAction: "block",
      riskLevel: "high",
      target: "npm install bar",
    };
    const { home } = setupSecurityEventsHome([JSON.stringify(event1), JSON.stringify(event2)]);

    const replay = runWithEnv("security replay evt-prefix --json", { HOME: home });
    expect(replay.code).toBe(1);
    const payload = JSON.parse(replay.out);
    expect(payload.event).toBeNull();
    expect(payload.matches).toBe(2);
  });
});
