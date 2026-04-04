// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

export type SecurityMode = "off" | "audit" | "enforce";

export type SecurityAction = "allow" | "block" | "require_approval";

export type SecurityRiskLevel = "low" | "medium" | "high" | "critical";

export interface SecurityQuotaConfig {
  maxToolCallsPerMinute: number;
  maxInstallsPerHour: number;
  maxEstimatedTokensPerHour: number;
}

export interface PluginSecurityConfig {
  mode: SecurityMode;
  policyPath: string;
  approvalTimeoutMs: number;
  scanTimeoutMs: number;
  alertWebhook: string;
  quota: SecurityQuotaConfig;
}

export interface SecurityPatternRules {
  criticalPatterns: string[];
  highPatterns: string[];
  mediumPatterns: string[];
}

export interface SecurityPathRules {
  criticalPrefixes: string[];
  highPrefixes: string[];
  allowPrefixes: string[];
}

export interface SecurityNetworkRules {
  criticalHosts: string[];
  highHosts: string[];
  allowHosts: string[];
}

export interface SecurityInstallRules extends SecurityPatternRules {
  scannerCommand: string;
  scannerArgs: string[];
}

export interface SecurityPromptRules {
  injectionPatterns: string[];
}

export interface SecurityAuditRules {
  eventLogPath: string;
  includeAllowEvents: boolean;
  webhookOn: SecurityAction[];
}

export interface SecurityPolicy {
  version: number;
  decisionMatrix: Record<SecurityRiskLevel, SecurityAction>;
  commandRules: SecurityPatternRules;
  pathRules: SecurityPathRules;
  networkRules: SecurityNetworkRules;
  installRules: SecurityInstallRules;
  promptRules: SecurityPromptRules;
  audit: SecurityAuditRules;
}

export interface SecurityEvidence {
  code: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface SecurityDecision {
  action: SecurityAction;
  riskLevel: SecurityRiskLevel;
  riskScore: number;
  reason: string;
  evidence: SecurityEvidence[];
  recommendedAction?: SecurityAction;
}

export interface SecurityEventV1 {
  eventVersion: "security-event.v1";
  id: string;
  timestamp: string;
  hook: "before_tool_call" | "after_tool_call" | "before_install";
  mode: SecurityMode;
  sandboxName: string;
  action: SecurityAction;
  effectiveAction: SecurityAction;
  riskLevel: SecurityRiskLevel;
  riskScore: number;
  reason: string;
  evidence: SecurityEvidence[];
  target: string;
  details: Record<string, unknown>;
}
