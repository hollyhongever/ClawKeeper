// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import http from "node:http";
import https from "node:https";

import type { NemoClawConfig, OpenClawPluginApi } from "../index.js";

import { SecurityEngine } from "./engine.js";
import { loadSecurityPolicy } from "./policy.js";
import type {
  SecurityAction,
  SecurityDecision,
  SecurityEventV1,
  SecurityMode,
  SecurityRiskLevel,
} from "./types.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractTarget(payload: unknown): string {
  const raw = asRecord(payload);
  const targetCandidates = [
    raw["toolName"],
    raw["name"],
    raw["target"],
    raw["source"],
    raw["path"],
    raw["command"],
    raw["cmd"],
  ];
  for (const candidate of targetCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().slice(0, 500);
    }
  }
  return "unknown";
}

function postJson(urlValue: string, payload: unknown, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(urlValue);
    } catch {
      reject(new Error("Invalid webhook URL"));
      return;
    }

    const body = Buffer.from(JSON.stringify(payload));
    const module = target.protocol === "https:" ? https : http;
    const req = module.request(
      {
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: "POST",
        timeout: timeoutMs,
        headers: {
          "content-type": "application/json",
          "content-length": String(body.length),
        },
      },
      (res) => {
        res.resume();
        if ((res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300) {
          resolve();
          return;
        }
        reject(new Error(`Webhook HTTP ${String(res.statusCode ?? 500)}`));
      },
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("Webhook timeout"));
    });
    req.write(body);
    req.end();
  });
}

function normalizeDecisionByMode(decision: SecurityDecision, mode: SecurityMode): SecurityDecision {
  if (mode === "off") {
    const recommendedAction = decision.action === "allow" ? undefined : decision.action;
    return {
      ...decision,
      action: "allow",
      recommendedAction,
      rolloutStage: "off",
      riskLevel: "low",
      riskScore: 0,
      reason: "Security mode is off",
    };
  }

  if (mode === "audit" && decision.action !== "allow") {
    return {
      ...decision,
      action: "allow",
      recommendedAction: decision.action,
      rolloutStage: "audit",
    };
  }

  if (mode === "warn" && decision.action !== "allow") {
    return {
      ...decision,
      action: "allow",
      recommendedAction: decision.action,
      rolloutStage: "warn",
    };
  }

  return {
    ...decision,
    rolloutStage: mode,
  };
}

function ensureEventPath(pathValue: string): void {
  mkdirSync(dirname(pathValue), { recursive: true });
}

function shouldWriteEvent(
  decision: SecurityDecision,
  mode: SecurityMode,
  includeAllowEvents: boolean,
): boolean {
  if (includeAllowEvents) return true;
  if (decision.action !== "allow") return true;
  return mode === "warn" && decision.recommendedAction !== undefined;
}

function toHookResponse(
  decision: SecurityDecision,
  mode: SecurityMode,
  approvalTimeoutMs: number,
): Record<string, unknown> {
  const security = {
    riskLevel: decision.riskLevel,
    riskScore: decision.riskScore,
    evidence: decision.evidence,
  };

  if (decision.action === "block") {
    return {
      block: true,
      reason: decision.reason,
      security,
    };
  }

  if (decision.action === "require_approval") {
    return {
      requireApproval: true,
      timeoutMs: approvalTimeoutMs,
      reason: decision.reason,
      security,
    };
  }

  const response: Record<string, unknown> = {
    allow: true,
    security,
  };

  if (
    mode === "warn" &&
    decision.recommendedAction !== undefined &&
    decision.recommendedAction !== "allow"
  ) {
    response["warning"] = {
      message: `Allowed by warn mode; recommended action is ${decision.recommendedAction}`,
      recommendedAction: decision.recommendedAction,
      rolloutStage: "warn",
      reason: decision.reason,
      security,
    };
  }

  return response;
}

function deriveEventRolloutStage(decision: SecurityDecision, mode: SecurityMode): SecurityMode {
  if (decision.rolloutStage !== undefined) {
    return decision.rolloutStage;
  }
  return mode;
}

function createEvent(
  hook: SecurityEventV1["hook"],
  mode: SecurityMode,
  sandboxName: string,
  decision: SecurityDecision,
  target: string,
  details: Record<string, unknown>,
): SecurityEventV1 {
  const recommendedAction = decision.recommendedAction;
  const action = recommendedAction ?? decision.action;
  const rolloutStage = deriveEventRolloutStage(decision, mode);

  return {
    eventVersion: "security-event.v1",
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    hook,
    mode,
    sandboxName,
    action,
    effectiveAction: decision.action,
    recommendedAction,
    rolloutStage,
    riskLevel: decision.riskLevel,
    riskScore: decision.riskScore,
    reason: decision.reason,
    evidence: decision.evidence,
    target,
    details: {
      ...details,
      stagedDecision: {
        recommendedAction: action,
        effectiveAction: decision.action,
        rolloutStage,
      },
    },
  };
}

async function maybeSendAlert(
  api: OpenClawPluginApi,
  webhook: string,
  actions: SecurityAction[],
  event: SecurityEventV1,
): Promise<void> {
  if (!webhook.trim()) return;
  if (!actions.includes(event.action) && !actions.includes(event.effectiveAction)) return;
  try {
    await postJson(webhook, event, 5000);
  } catch (error) {
    api.logger.warn(`[security] alert delivery failed: ${String(error)}`);
  }
}

export function registerSecurityHooks(api: OpenClawPluginApi, config: NemoClawConfig): void {
  const loaded = loadSecurityPolicy(config.security.policyPath, api.resolvePath);
  const policy = loaded.policy;
  const engine = new SecurityEngine(policy, config.security);
  const mode = config.security.mode;
  const eventsPath = process.env.CLAWKEEPER_SECURITY_EVENTS_PATH || policy.audit.eventLogPath;

  ensureEventPath(eventsPath);

  api.logger.info(
    `[security] mode=${mode} policy=${loaded.resolvedPath} source=${loaded.source} events=${eventsPath}`,
  );

  const runHook = async (
    hook: SecurityEventV1["hook"],
    payload: unknown,
    evaluate: (input: unknown) => SecurityDecision | Promise<SecurityDecision>,
  ): Promise<Record<string, unknown>> => {
    const rawDecision = await evaluate(payload);
    const effectiveDecision = normalizeDecisionByMode(rawDecision, mode);

    const event = createEvent(
      hook,
      mode,
      config.sandboxName,
      effectiveDecision,
      extractTarget(payload),
      {
        pluginId: api.id,
      },
    );

    if (shouldWriteEvent(effectiveDecision, mode, policy.audit.includeAllowEvents)) {
      appendFileSync(eventsPath, `${JSON.stringify(event)}\n`, { encoding: "utf-8" });
    }

    await maybeSendAlert(api, config.security.alertWebhook, policy.audit.webhookOn, event);

    return toHookResponse(effectiveDecision, mode, config.security.approvalTimeoutMs);
  };

  api.on("before_tool_call", async (...args: unknown[]) =>
    runHook("before_tool_call", args[0], (input) => engine.evaluateBeforeToolCall(input)),
  );

  api.on("after_tool_call", async (...args: unknown[]) =>
    runHook("after_tool_call", args[0], (input) => engine.evaluateAfterToolCall(input)),
  );

  api.on("before_install", async (...args: unknown[]) =>
    runHook("before_install", args[0], (input) => engine.evaluateBeforeInstall(input)),
  );
}

export function worstRiskLevel(lhs: SecurityRiskLevel, rhs: SecurityRiskLevel): SecurityRiskLevel {
  const order: SecurityRiskLevel[] = ["low", "medium", "high", "critical"];
  return order.indexOf(lhs) >= order.indexOf(rhs) ? lhs : rhs;
}
