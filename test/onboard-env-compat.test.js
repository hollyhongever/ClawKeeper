// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "vitest";

function runProbe(env = {}) {
  const repoRoot = path.join(import.meta.dirname, "..");
  const script = `
    const onboard = require("./bin/lib/onboard");
    const payload = {
      sandbox: onboard.getRequestedSandboxNameHint(),
      provider: onboard.getRequestedProviderHint(true),
      model: onboard.getRequestedModelHint(true),
    };
    process.stdout.write(JSON.stringify(payload));
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: repoRoot,
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

describe("onboard env compatibility bridge", () => {
  it("uses CLAWKEEPER_* values when NEMOCLAW_* is not set", () => {
    const payload = runProbe({
      NEMOCLAW_SANDBOX_NAME: undefined,
      NEMOCLAW_PROVIDER: undefined,
      NEMOCLAW_MODEL: undefined,
      CLAWKEEPER_SANDBOX_NAME: "Compat-Assistant",
      CLAWKEEPER_PROVIDER: "cloud",
      CLAWKEEPER_MODEL: "nvidia/compat-model",
    });
    assert.equal(payload.sandbox, "compat-assistant");
    assert.equal(payload.provider, "build");
    assert.equal(payload.model, "nvidia/compat-model");
  });

  it("keeps NEMOCLAW_* precedence when both prefixes are set", () => {
    const payload = runProbe({
      NEMOCLAW_SANDBOX_NAME: "legacy-assistant",
      NEMOCLAW_PROVIDER: "cloud",
      NEMOCLAW_MODEL: "nvidia/legacy-model",
      CLAWKEEPER_SANDBOX_NAME: "new-assistant",
      CLAWKEEPER_PROVIDER: "ollama",
      CLAWKEEPER_MODEL: "nvidia/new-model",
    });
    assert.equal(payload.sandbox, "legacy-assistant");
    assert.equal(payload.provider, "build");
    assert.equal(payload.model, "nvidia/legacy-model");
  });
});

