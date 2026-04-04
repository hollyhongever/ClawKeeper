// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SecurityEngine } from "../nemoclaw/src/security/engine.ts";
import { registerSecurityHooks } from "../nemoclaw/src/security/hooks.ts";
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

function createHookApiHarness() {
  const handlers = new Map();
  const api = {
    id: "nemoclaw",
    name: "ClawKeeper",
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    resolvePath: (input) => input,
    on: (hookName, handler) => {
      handlers.set(hookName, handler);
    },
  };
  return { api, handlers };
}

function createPluginConfig(mode) {
  return {
    blueprintVersion: "latest",
    blueprintRegistry: "ghcr.io/nvidia/nemoclaw-blueprint",
    sandboxName: "openclaw",
    inferenceProvider: "nvidia",
    security: {
      ...config,
      mode,
    },
  };
}

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

  it("requires approval for privilege escalation commands", async () => {
    const engine = new SecurityEngine(DEFAULT_SECURITY_POLICY, config);
    const decision = await engine.evaluateBeforeToolCall({
      toolName: "shell",
      command: "sudo cat /tmp/notes.txt",
    });
    expect(decision.riskLevel).toBe("high");
    expect(decision.action).toBe("require_approval");
    expect(decision.evidence.some((item) => item.code === "command_privilege_escalation")).toBe(true);
  });

  it("requires approval for dynamic shell substitution", async () => {
    const engine = new SecurityEngine(DEFAULT_SECURITY_POLICY, config);
    const decision = await engine.evaluateBeforeToolCall({
      toolName: "shell",
      command: "echo $(cat /tmp/a.txt)",
    });
    expect(decision.riskLevel).toBe("high");
    expect(decision.action).toBe("require_approval");
    expect(decision.evidence.some((item) => item.code === "command_dynamic_substitution")).toBe(true);
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

describe("security hook mode rollout", () => {
  it("warn mode allows high-risk commands with visible warning and audit metadata", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clawkeeper-warn-rollout-"));
    const eventsPath = join(dir, "events.jsonl");
    const previousEventsPath = process.env.CLAWKEEPER_SECURITY_EVENTS_PATH;
    process.env.CLAWKEEPER_SECURITY_EVENTS_PATH = eventsPath;

    try {
      const { api, handlers } = createHookApiHarness();
      registerSecurityHooks(api, createPluginConfig("warn"));

      const beforeToolCall = handlers.get("before_tool_call");
      expect(typeof beforeToolCall).toBe("function");

      const response = await beforeToolCall({
        toolName: "shell",
        command: "rm -rf /",
      });
      expect(response.allow).toBe(true);
      expect(response.block).toBeUndefined();
      expect(response.warning).toMatchObject({
        recommendedAction: "block",
        rolloutStage: "warn",
      });

      const lines = readFileSync(eventsPath, "utf-8")
        .split("\n")
        .filter((line) => line.trim().length > 0);
      expect(lines.length).toBe(1);

      const event = JSON.parse(lines[0]);
      expect(event.eventVersion).toBe("security-event.v1");
      expect(event.mode).toBe("warn");
      expect(event.action).toBe("block");
      expect(event.effectiveAction).toBe("allow");
      expect(event.recommendedAction).toBe("block");
      expect(event.rolloutStage).toBe("warn");
      expect(event.details?.stagedDecision).toMatchObject({
        recommendedAction: "block",
        rolloutStage: "warn",
      });
    } finally {
      if (previousEventsPath === undefined) {
        delete process.env.CLAWKEEPER_SECURITY_EVENTS_PATH;
      } else {
        process.env.CLAWKEEPER_SECURITY_EVENTS_PATH = previousEventsPath;
      }
    }
  });

  it("enforce mode keeps blocking critical commands", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clawkeeper-enforce-rollout-"));
    const eventsPath = join(dir, "events.jsonl");
    const previousEventsPath = process.env.CLAWKEEPER_SECURITY_EVENTS_PATH;
    process.env.CLAWKEEPER_SECURITY_EVENTS_PATH = eventsPath;

    try {
      const { api, handlers } = createHookApiHarness();
      registerSecurityHooks(api, createPluginConfig("enforce"));

      const beforeToolCall = handlers.get("before_tool_call");
      expect(typeof beforeToolCall).toBe("function");

      const response = await beforeToolCall({
        toolName: "shell",
        command: "rm -rf /",
      });
      expect(response.block).toBe(true);
      expect(response.allow).toBeUndefined();
      expect(response.warning).toBeUndefined();

      const lines = readFileSync(eventsPath, "utf-8")
        .split("\n")
        .filter((line) => line.trim().length > 0);
      expect(lines.length).toBe(1);

      const event = JSON.parse(lines[0]);
      expect(event.mode).toBe("enforce");
      expect(event.action).toBe("block");
      expect(event.effectiveAction).toBe("block");
    } finally {
      if (previousEventsPath === undefined) {
        delete process.env.CLAWKEEPER_SECURITY_EVENTS_PATH;
      } else {
        process.env.CLAWKEEPER_SECURITY_EVENTS_PATH = previousEventsPath;
      }
    }
  });
});
