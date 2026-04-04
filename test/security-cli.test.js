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

  it("prints events and replays a specific event", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "clawkeeper-security-events-"));
    const eventsDir = path.join(home, ".nemoclaw", "security");
    fs.mkdirSync(eventsDir, { recursive: true });
    const eventsPath = path.join(eventsDir, "events.jsonl");

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

    fs.writeFileSync(eventsPath, `${JSON.stringify(event)}\n`, "utf-8");

    const list = runWithEnv("security events --limit 1", { HOME: home });
    expect(list.code).toBe(0);
    expect(list.out).toContain("evt-123");
    expect(list.out).toContain("before_tool_call");

    const replay = runWithEnv("security replay evt-123", { HOME: home });
    expect(replay.code).toBe(0);
    expect(replay.out).toContain("Event: evt-123");
    expect(replay.out).toContain("Matched critical command pattern");
  });
});
