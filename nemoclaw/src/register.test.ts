// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OpenClawPluginApi } from "./index.js";

vi.mock("./onboard/config.js", () => ({
  loadOnboardConfig: vi.fn(),
  describeOnboardEndpoint: vi.fn(() => "build.nvidia.com"),
  describeOnboardProvider: vi.fn(() => "NVIDIA Endpoint API"),
}));

import register, { getPluginConfig } from "./index.js";
import { loadOnboardConfig } from "./onboard/config.js";

const mockedLoadOnboardConfig = vi.mocked(loadOnboardConfig);

function createMockApi(): OpenClawPluginApi {
  return {
    id: "nemoclaw",
    name: "ClawKeeper",
    version: "0.1.0",
    config: {},
    pluginConfig: {},
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    registerCommand: vi.fn(),
    registerProvider: vi.fn(),
    registerService: vi.fn(),
    resolvePath: vi.fn((p: string) => p),
    on: vi.fn(),
  };
}

describe("plugin registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLoadOnboardConfig.mockReturnValue(null);
  });

  it("registers slash commands with a legacy alias", () => {
    const api = createMockApi();
    register(api);
    const registered = vi.mocked(api.registerCommand).mock.calls.map((call) => call[0].name);
    expect(registered).toContain("clawkeeper");
    expect(registered).toContain("nemoclaw");
  });

  it("registers an inference provider", () => {
    const api = createMockApi();
    register(api);
    expect(api.registerProvider).toHaveBeenCalledWith(expect.objectContaining({ id: "inference" }));
  });

  it("registers security hooks", () => {
    const api = createMockApi();
    register(api);
    const hookNames = vi.mocked(api.on).mock.calls.map((call) => call[0]);
    expect(hookNames).toContain("before_tool_call");
    expect(hookNames).toContain("after_tool_call");
    expect(hookNames).toContain("before_install");
  });

  it("does NOT register CLI commands", () => {
    const api = createMockApi();
    // registerCli should not exist on the API interface after removal
    expect("registerCli" in api).toBe(false);
  });

  it("registers custom model when onboard config has a model", () => {
    mockedLoadOnboardConfig.mockReturnValue({
      endpointType: "build",
      endpointUrl: "https://api.build.nvidia.com/v1",
      ncpPartner: null,
      model: "nvidia/custom-model",
      profile: "default",
      credentialEnv: "NVIDIA_API_KEY",
      onboardedAt: "2026-03-01T00:00:00.000Z",
    });
    const api = createMockApi();
    register(api);
    const providerArg = vi.mocked(api.registerProvider).mock.calls[0][0];
    expect(providerArg.models?.chat).toEqual([
      expect.objectContaining({ id: "inference/nvidia/custom-model" }),
    ]);
  });
});

describe("getPluginConfig", () => {
  it("returns defaults when pluginConfig is undefined", () => {
    const api = createMockApi();
    api.pluginConfig = undefined;
    const config = getPluginConfig(api);
    expect(config.blueprintVersion).toBe("latest");
    expect(config.blueprintRegistry).toBe("ghcr.io/nvidia/nemoclaw-blueprint");
    expect(config.sandboxName).toBe("openclaw");
    expect(config.inferenceProvider).toBe("nvidia");
    expect(config.security.mode).toBe("enforce");
    expect(config.security.policyPath).toBe("security-policy.yaml");
    expect(config.security.approvalTimeoutMs).toBe(120000);
    expect(config.security.scanTimeoutMs).toBe(30000);
    expect(config.security.alertWebhook).toBe("");
    expect(config.security.quota.maxToolCallsPerMinute).toBe(120);
  });

  it("returns defaults when pluginConfig has non-string values", () => {
    const api = createMockApi();
    api.pluginConfig = { blueprintVersion: 42, sandboxName: true };
    const config = getPluginConfig(api);
    expect(config.blueprintVersion).toBe("latest");
    expect(config.sandboxName).toBe("openclaw");
    expect(config.security.mode).toBe("enforce");
  });

  it("uses string values from pluginConfig", () => {
    const api = createMockApi();
    api.pluginConfig = {
      blueprintVersion: "2.0.0",
      blueprintRegistry: "ghcr.io/custom/registry",
      sandboxName: "custom-sandbox",
      inferenceProvider: "openai",
      security: {
        mode: "audit",
        policyPath: "/tmp/security-policy.yaml",
        approvalTimeoutMs: 90000,
        scanTimeoutMs: 10000,
        alertWebhook: "https://alerts.example.com/hook",
        quota: {
          maxToolCallsPerMinute: 10,
          maxInstallsPerHour: 2,
          maxEstimatedTokensPerHour: 5000,
        },
      },
    };
    const config = getPluginConfig(api);
    expect(config.blueprintVersion).toBe("2.0.0");
    expect(config.blueprintRegistry).toBe("ghcr.io/custom/registry");
    expect(config.sandboxName).toBe("custom-sandbox");
    expect(config.inferenceProvider).toBe("openai");
    expect(config.security.mode).toBe("audit");
    expect(config.security.policyPath).toBe("/tmp/security-policy.yaml");
    expect(config.security.approvalTimeoutMs).toBe(90000);
    expect(config.security.scanTimeoutMs).toBe(10000);
    expect(config.security.alertWebhook).toBe("https://alerts.example.com/hook");
    expect(config.security.quota.maxToolCallsPerMinute).toBe(10);
    expect(config.security.quota.maxInstallsPerHour).toBe(2);
    expect(config.security.quota.maxEstimatedTokensPerHour).toBe(5000);
  });
});
