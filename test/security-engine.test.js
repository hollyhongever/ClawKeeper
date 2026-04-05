// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SecurityEngine } from "../nemoclaw/src/security/engine.ts";
import { DEFAULT_SECURITY_POLICY, loadSecurityPolicy, normalizeSecurityPolicy } from "../nemoclaw/src/security/policy.ts";

const config = {
  mode: "enforce",
  policyPath: "security-policy.yaml",
  approvalTimeoutMs: 120000,
  scanTimeoutMs: 30000,
  alertWebhook: "",
  quota: {
    maxToolCallsPerMinute: 3,
    maxInstallsPerHour: 2,
    maxEstimatedTokensPerHour: 100000,
  },
};

describe("security engine", () => {
  it("blocks critical tool commands", async () => {
    const engine = new SecurityEngine(DEFAULT_SECURITY_POLICY, config);
    const decision = await engine.evaluateBeforeToolCall({
      toolName: "shell",
      command: "rm -rf /",
    });
    expect(decision.riskLevel).toBe("critical");
    expect(decision.action).toBe("block");
  });

  it("requires approval for high-risk hosts", async () => {
    const engine = new SecurityEngine(DEFAULT_SECURITY_POLICY, config);
    const decision = await engine.evaluateBeforeToolCall({
      toolName: "shell",
      command: "curl https://my.trycloudflare.com/token",
    });
    expect(decision.riskLevel).toBe("high");
    expect(decision.action).toBe("require_approval");
  });

  it("allows low-risk commands", async () => {
    const engine = new SecurityEngine(DEFAULT_SECURITY_POLICY, config);
    const decision = await engine.evaluateBeforeToolCall({
      toolName: "shell",
      command: "echo hello > /sandbox/notes.txt",
    });
    expect(decision.riskLevel).toBe("low");
    expect(decision.action).toBe("allow");
  });

  it("blocks path traversal installs", async () => {
    const engine = new SecurityEngine(DEFAULT_SECURITY_POLICY, config);
    const decision = await engine.evaluateBeforeInstall({ target: "../../malicious-skill" });
    expect(decision.riskLevel).toBe("critical");
    expect(decision.action).toBe("block");
  });

  it("raises risk on tool-call quota exceed", async () => {
    const engine = new SecurityEngine(DEFAULT_SECURITY_POLICY, config);
    await engine.evaluateBeforeToolCall({ command: "echo one > /sandbox/a.txt" });
    await engine.evaluateBeforeToolCall({ command: "echo two > /sandbox/b.txt" });
    await engine.evaluateBeforeToolCall({ command: "echo three > /sandbox/c.txt" });
    const decision = await engine.evaluateBeforeToolCall({ command: "echo four > /sandbox/d.txt" });
    expect(decision.riskLevel).toBe("high");
    expect(decision.action).toBe("require_approval");
  });

  it("flags install lifecycle scripts as high risk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clawkeeper-skill-lifecycle-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name: "demo-skill",
          scripts: {
            postinstall: "node scripts/setup.js",
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const engine = new SecurityEngine(DEFAULT_SECURITY_POLICY, config);
    const decision = await engine.evaluateBeforeInstall({ target: dir });
    expect(decision.riskLevel).toBe("high");
    expect(decision.evidence.some((item) => item.code === "install_lifecycle_scripts")).toBe(true);
  });

  it("flags insecure HTTP install sources", async () => {
    const engine = new SecurityEngine(DEFAULT_SECURITY_POLICY, config);
    const decision = await engine.evaluateBeforeInstall({
      target: "http://evil.example.com/skill.tgz",
    });
    expect(decision.riskLevel).toBe("high");
    expect(decision.evidence.some((item) => item.code === "install_insecure_transport")).toBe(true);
  });

  it("flags scanner unavailability when scanner is configured but missing", async () => {
    const policy = {
      ...DEFAULT_SECURITY_POLICY,
      installRules: {
        ...DEFAULT_SECURITY_POLICY.installRules,
        scannerCommand: "__definitely_missing_scanner__",
        scannerArgs: [],
      },
    };
    const engine = new SecurityEngine(policy, {
      ...config,
      scanTimeoutMs: 1000,
    });

    const decision = await engine.evaluateBeforeInstall({
      target: "/sandbox/skill",
    });
    expect(decision.riskLevel).toBe("high");
    expect(
      decision.evidence.some(
        (item) => item.code === "scanner_unavailable" || item.code === "scanner_nonzero_exit",
      ),
    ).toBe(true);
  });

  it("flags symlink escape in local install targets", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clawkeeper-skill-symlink-"));
    const safeDir = join(dir, "skill");
    mkdirSync(safeDir, { recursive: true });
    const outside = mkdtempSync(join(tmpdir(), "clawkeeper-outside-"));
    symlinkSync(outside, join(safeDir, "outside-link"));

    const engine = new SecurityEngine(DEFAULT_SECURITY_POLICY, config);
    const decision = await engine.evaluateBeforeInstall({ target: safeDir });
    expect(decision.riskLevel).toBe("critical");
    expect(decision.evidence.some((item) => item.code === "install_symlink_escape")).toBe(true);
  });
});

describe("security policy loading", () => {
  it("uses defaults when file is missing", () => {
    const loaded = loadSecurityPolicy("missing.yaml", (input) => `/tmp/${input}`);
    expect(loaded.source).toBe("default");
    expect(loaded.policy.decisionMatrix.high).toBe("require_approval");
  });

  it("normalizes snake_case fields", () => {
    const policy = normalizeSecurityPolicy({
      decision_matrix: { low: "allow", medium: "allow", high: "block", critical: "block" },
      install_rules: {
        critical_patterns: ["evil"],
        high_patterns: ["warn"],
        medium_patterns: [],
      },
      audit: {
        include_allow_events: true,
      },
    });
    expect(policy.decisionMatrix.high).toBe("block");
    expect(policy.installRules.criticalPatterns).toEqual(["evil"]);
    expect(policy.audit.includeAllowEvents).toBe(true);
  });

  it("loads policy from file", () => {
    const dir = mkdtempSync(join(tmpdir(), "clawkeeper-policy-"));
    const file = join(dir, "security-policy.yaml");
    writeFileSync(
      file,
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
    const loaded = loadSecurityPolicy(file, (input) => input);
    expect(loaded.source).toBe("file");
    expect(loaded.policy.decisionMatrix.critical).toBe("block");
  });
});
