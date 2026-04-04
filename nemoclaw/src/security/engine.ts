// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { execa } from "execa";

import type {
  PluginSecurityConfig,
  SecurityDecision,
  SecurityEvidence,
  SecurityPolicy,
  SecurityRiskLevel,
} from "./types.js";

const RISK_ORDER: SecurityRiskLevel[] = ["low", "medium", "high", "critical"];

interface ExtractedContext {
  toolName: string;
  command: string;
  target: string;
  text: string;
  paths: string[];
  hosts: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((entry) => collectStrings(entry, depth + 1));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((entry) =>
      collectStrings(entry, depth + 1),
    );
  }
  return [];
}

function extractPaths(text: string): string[] {
  const matches = text.match(/(?:^|\s)(\/[A-Za-z0-9._\/-]{2,})/g) ?? [];
  return [...new Set(matches.map((entry) => entry.trim()))];
}

function extractHosts(text: string): string[] {
  const out = new Set<string>();
  const urls = text.match(/https?:\/\/[^\s"'`]+/gi) ?? [];
  for (const url of urls) {
    try {
      out.add(new URL(url).hostname.toLowerCase());
    } catch {
      // ignored
    }
  }

  const hostHints = text.match(/\bhost(?:name)?\s*[:=]\s*([a-z0-9.-]+\.[a-z]{2,})/gi) ?? [];
  for (const hint of hostHints) {
    const match = /([a-z0-9.-]+\.[a-z]{2,})/i.exec(hint);
    if (match) out.add(match[1].toLowerCase());
  }
  return [...out];
}

function compilePattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
}

function matchesAnyPattern(text: string, patterns: string[]): string[] {
  const matched: string[] = [];
  for (const pattern of patterns) {
    const regex = compilePattern(pattern);
    if (regex.test(text)) matched.push(pattern);
  }
  return matched;
}

function higherRisk(a: SecurityRiskLevel, b: SecurityRiskLevel): SecurityRiskLevel {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}

function riskScore(level: SecurityRiskLevel, evidenceCount: number): number {
  const base = {
    low: 20,
    medium: 50,
    high: 75,
    critical: 95,
  } satisfies Record<SecurityRiskLevel, number>;
  return Math.min(100, base[level] + Math.min(4, evidenceCount) * 2);
}

function buildDecision(
  level: SecurityRiskLevel,
  action: SecurityDecision["action"],
  evidence: SecurityEvidence[],
): SecurityDecision {
  return {
    action,
    riskLevel: level,
    riskScore: riskScore(level, evidence.length),
    reason: evidence[0]?.message ?? `Risk level ${level}`,
    evidence,
  };
}

function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 4);
}

function normalizePath(p: string): string {
  return p.replace(/\\+/g, "/").trim();
}

function extractContext(payload: unknown): ExtractedContext {
  const raw = asRecord(payload);
  const toolName =
    typeof raw["toolName"] === "string"
      ? raw["toolName"]
      : typeof raw["name"] === "string"
        ? raw["name"]
        : "unknown-tool";
  const command =
    typeof raw["command"] === "string"
      ? raw["command"]
      : typeof raw["cmd"] === "string"
        ? raw["cmd"]
        : "";
  const target =
    typeof raw["target"] === "string"
      ? raw["target"]
      : typeof raw["source"] === "string"
        ? raw["source"]
        : typeof raw["path"] === "string"
          ? raw["path"]
          : "";

  const text = [command, target, ...collectStrings(payload)]
    .filter(Boolean)
    .join("\n")
    .slice(0, 200_000);
  return {
    toolName,
    command,
    target,
    text,
    paths: extractPaths(text).map(normalizePath),
    hosts: extractHosts(text),
  };
}

function findRiskByPath(
  paths: string[],
  policy: SecurityPolicy,
  evidence: SecurityEvidence[],
): SecurityRiskLevel {
  let level: SecurityRiskLevel = "low";
  for (const path of paths) {
    if (policy.pathRules.criticalPrefixes.some((prefix) => path.startsWith(prefix))) {
      level = higherRisk(level, "critical");
      evidence.push({ code: "path_critical", message: `Sensitive path targeted: ${path}` });
      continue;
    }
    if (policy.pathRules.highPrefixes.some((prefix) => path.startsWith(prefix))) {
      level = higherRisk(level, "high");
      evidence.push({ code: "path_high", message: `High-risk path targeted: ${path}` });
      continue;
    }
    if (
      path.startsWith("/") &&
      !policy.pathRules.allowPrefixes.some((prefix) => path.startsWith(prefix))
    ) {
      level = higherRisk(level, "medium");
      evidence.push({ code: "path_unknown", message: `Path outside allowlist: ${path}` });
    }
  }
  return level;
}

function findRiskByHosts(
  hosts: string[],
  policy: SecurityPolicy,
  evidence: SecurityEvidence[],
): SecurityRiskLevel {
  let level: SecurityRiskLevel = "low";
  for (const host of hosts) {
    if (policy.networkRules.criticalHosts.includes(host)) {
      level = higherRisk(level, "critical");
      evidence.push({ code: "network_critical", message: `Critical host targeted: ${host}` });
      continue;
    }
    if (policy.networkRules.highHosts.some((entry) => host.includes(entry))) {
      level = higherRisk(level, "high");
      evidence.push({ code: "network_high", message: `High-risk host targeted: ${host}` });
      continue;
    }
    if (!policy.networkRules.allowHosts.some((entry) => host.includes(entry))) {
      level = higherRisk(level, "medium");
      evidence.push({ code: "network_unknown", message: `Host not in allowlist: ${host}` });
    }
  }
  return level;
}

function scanPatterns(
  text: string,
  patterns: { critical: string[]; high: string[]; medium: string[] },
  evidencePrefix: string,
  evidence: SecurityEvidence[],
): SecurityRiskLevel {
  let level: SecurityRiskLevel = "low";

  const criticalMatches = matchesAnyPattern(text, patterns.critical);
  if (criticalMatches.length > 0) {
    level = "critical";
    evidence.push({
      code: `${evidencePrefix}_critical`,
      message: `Matched critical ${evidencePrefix.replace(/_/g, " ")} pattern`,
      metadata: { patterns: criticalMatches.slice(0, 5) },
    });
  }

  const highMatches = matchesAnyPattern(text, patterns.high);
  if (highMatches.length > 0) {
    level = higherRisk(level, "high");
    evidence.push({
      code: `${evidencePrefix}_high`,
      message: `Matched high ${evidencePrefix.replace(/_/g, " ")} pattern`,
      metadata: { patterns: highMatches.slice(0, 5) },
    });
  }

  const mediumMatches = matchesAnyPattern(text, patterns.medium);
  if (mediumMatches.length > 0) {
    level = higherRisk(level, "medium");
    evidence.push({
      code: `${evidencePrefix}_medium`,
      message: `Matched medium ${evidencePrefix.replace(/_/g, " ")} pattern`,
      metadata: { patterns: mediumMatches.slice(0, 5) },
    });
  }

  return level;
}

function walkFiles(basePath: string, maxFiles: number): string[] {
  const queue: string[] = [basePath];
  const files: string[] = [];

  while (queue.length > 0 && files.length < maxFiles) {
    const current = queue.shift();
    if (!current) break;

    try {
      const st = statSync(current);
      if (st.isDirectory()) {
        const entries = readdirSync(current).slice(0, maxFiles);
        for (const entry of entries) {
          queue.push(join(current, entry));
        }
      } else if (st.isFile()) {
        files.push(current);
      }
    } catch {
      // ignored
    }
  }

  return files;
}

function readScanTextFromTarget(target: string): string {
  if (!target || !existsSync(target)) return "";
  const files = walkFiles(target, 30);
  if (files.length === 0) return "";

  const textParts: string[] = [];
  for (const file of files) {
    const lower = file.toLowerCase();
    if (!/(\.md|\.txt|\.json|\.ya?ml|\.js|\.ts|\.py|\.sh)$/i.test(lower)) continue;
    try {
      textParts.push(readFileSync(file, "utf-8").slice(0, 10_000));
    } catch {
      // ignored
    }
    if (textParts.join("\n").length > 180_000) break;
  }
  return textParts.join("\n");
}

export class SecurityEngine {
  private readonly toolCallTimes: number[] = [];

  private readonly installTimes: number[] = [];

  private estimatedTokenUsage: Array<{ ts: number; tokens: number }> = [];

  constructor(
    private readonly policy: SecurityPolicy,
    private readonly config: PluginSecurityConfig,
  ) {}

  private pruneCounters(now: number): void {
    while (this.toolCallTimes.length > 0 && now - this.toolCallTimes[0] > 60_000) {
      this.toolCallTimes.shift();
    }
    while (this.installTimes.length > 0 && now - this.installTimes[0] > 3_600_000) {
      this.installTimes.shift();
    }
    this.estimatedTokenUsage = this.estimatedTokenUsage.filter(
      (item) => now - item.ts <= 3_600_000,
    );
  }

  private actionForRisk(level: SecurityRiskLevel): SecurityDecision["action"] {
    return this.policy.decisionMatrix[level];
  }

  evaluateBeforeToolCall(payload: unknown): SecurityDecision {
    const now = Date.now();
    this.pruneCounters(now);
    this.toolCallTimes.push(now);

    const context = extractContext(payload);
    const evidence: SecurityEvidence[] = [];
    let risk: SecurityRiskLevel = "low";

    risk = higherRisk(
      risk,
      scanPatterns(
        context.text,
        {
          critical: this.policy.commandRules.criticalPatterns,
          high: this.policy.commandRules.highPatterns,
          medium: this.policy.commandRules.mediumPatterns,
        },
        "command",
        evidence,
      ),
    );

    risk = higherRisk(risk, findRiskByPath(context.paths, this.policy, evidence));
    risk = higherRisk(risk, findRiskByHosts(context.hosts, this.policy, evidence));

    const promptMatches = matchesAnyPattern(
      context.text,
      this.policy.promptRules.injectionPatterns,
    );
    if (promptMatches.length > 0) {
      risk = higherRisk(risk, "high");
      evidence.push({
        code: "prompt_injection_signal",
        message: "Prompt injection signal detected in tool payload",
        metadata: { patterns: promptMatches.slice(0, 5) },
      });
    }

    const estimatedTokens = estimateTokensFromText(context.text);
    this.estimatedTokenUsage.push({ ts: now, tokens: estimatedTokens });

    if (this.toolCallTimes.length > this.config.quota.maxToolCallsPerMinute) {
      risk = higherRisk(risk, "high");
      evidence.push({
        code: "quota_tool_calls",
        message: `Tool call quota exceeded (${String(this.toolCallTimes.length)}/${String(this.config.quota.maxToolCallsPerMinute)} per minute)`,
      });
    }

    const totalTokens = this.estimatedTokenUsage.reduce((acc, item) => acc + item.tokens, 0);
    if (totalTokens > this.config.quota.maxEstimatedTokensPerHour) {
      risk = higherRisk(risk, "high");
      evidence.push({
        code: "quota_estimated_tokens",
        message: `Estimated token quota exceeded (${String(totalTokens)}/${String(this.config.quota.maxEstimatedTokensPerHour)} per hour)`,
      });
    }

    if (evidence.length === 0) {
      evidence.push({
        code: "baseline_allow",
        message: `No high-risk signals for tool ${context.toolName}`,
      });
    }

    return buildDecision(risk, this.actionForRisk(risk), evidence);
  }

  evaluateAfterToolCall(payload: unknown): SecurityDecision {
    const context = extractContext(payload);
    const evidence: SecurityEvidence[] = [];
    let risk: SecurityRiskLevel = "low";

    const secretLeakMatches = matchesAnyPattern(context.text, [
      "(nvapi-|nvcf-|ghp_)[A-Za-z0-9_-]{10,}",
      "Bearer\\s+[A-Za-z0-9_.+/=-]{10,}",
      "(API_KEY|TOKEN|SECRET|PASSWORD)\\s*[:=]\\s*['\"]?[A-Za-z0-9_.+/=-]{8,}",
    ]);
    if (secretLeakMatches.length > 0) {
      risk = "high";
      evidence.push({
        code: "post_tool_secret_leak",
        message: "Potential secret leakage detected in tool result",
        metadata: { patterns: secretLeakMatches.slice(0, 5) },
      });
    } else {
      evidence.push({
        code: "post_tool_observed",
        message: "Tool call completed without high-risk output signals",
      });
    }

    return buildDecision(risk, this.actionForRisk(risk), evidence);
  }

  async evaluateBeforeInstall(payload: unknown): Promise<SecurityDecision> {
    const now = Date.now();
    this.pruneCounters(now);
    this.installTimes.push(now);

    const context = extractContext(payload);
    const evidence: SecurityEvidence[] = [];
    let risk: SecurityRiskLevel = "low";

    if (context.target.includes("..")) {
      risk = "critical";
      evidence.push({
        code: "install_path_traversal",
        message: `Path traversal-like install target: ${context.target}`,
      });
    }

    const localScanText = context.target ? readScanTextFromTarget(context.target) : "";
    const scanText = `${context.text}\n${localScanText}`;

    risk = higherRisk(
      risk,
      scanPatterns(
        scanText,
        {
          critical: this.policy.installRules.criticalPatterns,
          high: this.policy.installRules.highPatterns,
          medium: this.policy.installRules.mediumPatterns,
        },
        "install",
        evidence,
      ),
    );

    if (this.installTimes.length > this.config.quota.maxInstallsPerHour) {
      risk = higherRisk(risk, "high");
      evidence.push({
        code: "quota_installs",
        message: `Install quota exceeded (${String(this.installTimes.length)}/${String(this.config.quota.maxInstallsPerHour)} per hour)`,
      });
    }

    if (this.policy.installRules.scannerCommand.trim()) {
      try {
        const args = [...this.policy.installRules.scannerArgs];
        if (context.target) args.push(context.target);
        const result = await execa(this.policy.installRules.scannerCommand, args, {
          reject: false,
          timeout: this.config.scanTimeoutMs,
          stdout: "pipe",
          stderr: "pipe",
        });
        const output = `${result.stdout}\n${result.stderr}`.toLowerCase();

        if (output.includes("critical")) {
          risk = higherRisk(risk, "critical");
          evidence.push({
            code: "scanner_critical",
            message: "External scanner reported critical risk",
          });
        } else if (output.includes("high") || result.exitCode !== 0) {
          risk = higherRisk(risk, "high");
          evidence.push({
            code: "scanner_high",
            message: "External scanner reported high risk or non-zero exit",
            metadata: { exitCode: result.exitCode },
          });
        } else if (output.includes("medium")) {
          risk = higherRisk(risk, "medium");
          evidence.push({
            code: "scanner_medium",
            message: "External scanner reported medium risk",
          });
        } else {
          evidence.push({
            code: "scanner_clean",
            message: "External scanner did not report elevated risk",
          });
        }
      } catch {
        risk = higherRisk(risk, "high");
        evidence.push({
          code: "scanner_timeout",
          message: `External scanner failed or timed out (> ${String(this.config.scanTimeoutMs)} ms)`,
        });
      }
    }

    if (evidence.length === 0) {
      evidence.push({
        code: "install_baseline_allow",
        message: "Install request did not trigger risk patterns",
      });
    }

    return buildDecision(risk, this.actionForRisk(risk), evidence);
  }
}
