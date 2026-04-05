// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import YAML from "yaml";

import type {
  SecurityAction,
  SecurityAuditRules,
  SecurityInstallRules,
  SecurityNetworkRules,
  SecurityPathRules,
  SecurityPatternRules,
  SecurityPolicy,
  SecurityPromptRules,
  SecurityRiskLevel,
} from "./types.js";

const ALLOWED_ACTIONS: SecurityAction[] = ["allow", "block", "require_approval"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

function readPatternRules(value: unknown, fallback: SecurityPatternRules): SecurityPatternRules {
  const raw = asRecord(value);
  return {
    criticalPatterns: readStringArray(
      raw["criticalPatterns"] ?? raw["critical_patterns"],
      fallback.criticalPatterns,
    ),
    highPatterns: readStringArray(
      raw["highPatterns"] ?? raw["high_patterns"],
      fallback.highPatterns,
    ),
    mediumPatterns: readStringArray(
      raw["mediumPatterns"] ?? raw["medium_patterns"],
      fallback.mediumPatterns,
    ),
  };
}

function readPathRules(value: unknown, fallback: SecurityPathRules): SecurityPathRules {
  const raw = asRecord(value);
  return {
    criticalPrefixes: readStringArray(
      raw["criticalPrefixes"] ?? raw["critical_prefixes"],
      fallback.criticalPrefixes,
    ),
    highPrefixes: readStringArray(
      raw["highPrefixes"] ?? raw["high_prefixes"],
      fallback.highPrefixes,
    ),
    allowPrefixes: readStringArray(
      raw["allowPrefixes"] ?? raw["allow_prefixes"],
      fallback.allowPrefixes,
    ),
  };
}

function readNetworkRules(value: unknown, fallback: SecurityNetworkRules): SecurityNetworkRules {
  const raw = asRecord(value);
  return {
    criticalHosts: readStringArray(
      raw["criticalHosts"] ?? raw["critical_hosts"],
      fallback.criticalHosts,
    ),
    highHosts: readStringArray(raw["highHosts"] ?? raw["high_hosts"], fallback.highHosts),
    allowHosts: readStringArray(raw["allowHosts"] ?? raw["allow_hosts"], fallback.allowHosts),
  };
}

function readInstallRules(value: unknown, fallback: SecurityInstallRules): SecurityInstallRules {
  const base = readPatternRules(value, fallback);
  const raw = asRecord(value);
  return {
    ...base,
    scannerCommand: readString(
      raw["scannerCommand"] ?? raw["scanner_command"],
      fallback.scannerCommand,
    ),
    scannerArgs: readStringArray(raw["scannerArgs"] ?? raw["scanner_args"], fallback.scannerArgs),
  };
}

function readPromptRules(value: unknown, fallback: SecurityPromptRules): SecurityPromptRules {
  const raw = asRecord(value);
  return {
    injectionPatterns: readStringArray(
      raw["injectionPatterns"] ?? raw["injection_patterns"],
      fallback.injectionPatterns,
    ),
  };
}

function readAuditRules(value: unknown, fallback: SecurityAuditRules): SecurityAuditRules {
  const raw = asRecord(value);
  return {
    eventLogPath: expandHomePath(
      readString(raw["eventLogPath"] ?? raw["event_log_path"], fallback.eventLogPath),
    ),
    includeAllowEvents: readBoolean(
      raw["includeAllowEvents"] ?? raw["include_allow_events"],
      fallback.includeAllowEvents,
    ),
    webhookOn: readStringArray(raw["webhookOn"] ?? raw["webhook_on"], fallback.webhookOn).filter(
      (item): item is SecurityAction => ALLOWED_ACTIONS.includes(item as SecurityAction),
    ),
  };
}

function readDecisionMatrix(
  value: unknown,
  fallback: Record<SecurityRiskLevel, SecurityAction>,
): Record<SecurityRiskLevel, SecurityAction> {
  const raw = asRecord(value);
  const pick = (level: SecurityRiskLevel): SecurityAction => {
    const candidate = raw[level];
    if (typeof candidate === "string" && ALLOWED_ACTIONS.includes(candidate as SecurityAction)) {
      return candidate as SecurityAction;
    }
    return fallback[level];
  };
  return {
    critical: pick("critical"),
    high: pick("high"),
    medium: pick("medium"),
    low: pick("low"),
  };
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  version: 1,
  decisionMatrix: {
    critical: "block",
    high: "require_approval",
    medium: "allow",
    low: "allow",
  },
  commandRules: {
    criticalPatterns: [
      "(^|\\s)rm\\s+-rf\\s+/(\\s|$)",
      "(^|\\s)mkfs(\\.|\\s)",
      "(^|\\s)dd\\s+if=",
      "(^|\\s)(shutdown|reboot|poweroff)(\\s|$)",
      "(:\\(\\)\\s*\\{\\s*:\\|:\\s*&\\s*\\};:)",
    ],
    highPatterns: [
      "https?://[^\\s]+\\s*\\|\\s*(bash|sh)",
      "(^|\\s)(chmod\\s+777|chown\\s+-R\\s+root)(\\s|$)",
      "(^|\\s)(iptables|ufw|firewall-cmd)(\\s|$)",
    ],
    mediumPatterns: ["(^|\\s)curl(\\s|$)", "(^|\\s)wget(\\s|$)", "(^|\\s)scp(\\s|$)"],
  },
  pathRules: {
    criticalPrefixes: ["/etc", "/root", "/var/lib/docker", "/sandbox/.openclaw"],
    highPrefixes: ["/home", "/var/log", "/proc", "/dev"],
    allowPrefixes: ["/sandbox", "/tmp"],
  },
  networkRules: {
    criticalHosts: ["169.254.169.254", "metadata.google.internal", "localhost", "127.0.0.1"],
    highHosts: ["ngrok.io", "trycloudflare.com", "transfer.sh"],
    allowHosts: ["integrate.api.nvidia.com", "inference-api.nvidia.com"],
  },
  installRules: {
    criticalPatterns: [
      "ignore\\s+all\\s+previous\\s+instructions",
      "process\\.env\\.[A-Z0-9_]{3,}",
      "child_process",
      "https?://[^\\s]+\\s*\\|\\s*(bash|sh)",
    ],
    highPatterns: ["prompt\\s*injection", "data\\s*exfil", "base64\\s+-d"],
    mediumPatterns: ["eval\\(", "Function\\(", "new\\s+WebSocket\\("],
    scannerCommand: "",
    scannerArgs: [],
  },
  promptRules: {
    injectionPatterns: [
      "ignore\\s+system\\s+instructions",
      "disable\\s+guardrails",
      "developer\\s+mode",
      "jailbreak",
    ],
  },
  audit: {
    eventLogPath: join(homedir(), ".nemoclaw", "security", "events.jsonl"),
    includeAllowEvents: false,
    webhookOn: ["block", "require_approval"],
  },
};

export function normalizeSecurityPolicy(rawPolicy: unknown): SecurityPolicy {
  const raw = asRecord(rawPolicy);
  return {
    version: readNumber(raw["version"], DEFAULT_SECURITY_POLICY.version),
    decisionMatrix: readDecisionMatrix(
      raw["decisionMatrix"] ?? raw["decision_matrix"],
      DEFAULT_SECURITY_POLICY.decisionMatrix,
    ),
    commandRules: readPatternRules(
      raw["commandRules"] ?? raw["command_rules"],
      DEFAULT_SECURITY_POLICY.commandRules,
    ),
    pathRules: readPathRules(
      raw["pathRules"] ?? raw["path_rules"],
      DEFAULT_SECURITY_POLICY.pathRules,
    ),
    networkRules: readNetworkRules(
      raw["networkRules"] ?? raw["network_rules"],
      DEFAULT_SECURITY_POLICY.networkRules,
    ),
    installRules: readInstallRules(
      raw["installRules"] ?? raw["install_rules"],
      DEFAULT_SECURITY_POLICY.installRules,
    ),
    promptRules: readPromptRules(
      raw["promptRules"] ?? raw["prompt_rules"],
      DEFAULT_SECURITY_POLICY.promptRules,
    ),
    audit: readAuditRules(raw["audit"], DEFAULT_SECURITY_POLICY.audit),
  };
}

export function loadSecurityPolicy(
  policyPath: string,
  resolvePath: (input: string) => string,
): { policy: SecurityPolicy; resolvedPath: string; source: "default" | "file" } {
  const requested = policyPath.trim().length > 0 ? policyPath : "security-policy.yaml";
  const resolvedPath = resolvePath(requested);

  if (!existsSync(resolvedPath)) {
    return { policy: DEFAULT_SECURITY_POLICY, resolvedPath, source: "default" };
  }

  try {
    const content = readFileSync(resolvedPath, "utf-8");
    const parsed: unknown = YAML.parse(content);
    return {
      policy: normalizeSecurityPolicy(parsed),
      resolvedPath,
      source: "file",
    };
  } catch {
    return {
      policy: DEFAULT_SECURITY_POLICY,
      resolvedPath,
      source: "default",
    };
  }
}
