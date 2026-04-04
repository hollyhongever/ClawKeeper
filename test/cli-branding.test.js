// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "vitest";

function runAs(commandName, args = []) {
  const repoRoot = path.join(import.meta.dirname, "..");
  const scriptPath = path.join(repoRoot, "bin", "nemoclaw.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawkeeper-cli-test-"));
  const aliasPath = path.join(tmpDir, commandName);
  fs.symlinkSync(scriptPath, aliasPath);
  try {
    return spawnSync(process.execPath, [aliasPath, ...args], {
      cwd: repoRoot,
      encoding: "utf-8",
      env: process.env,
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe("CLI branding and compatibility aliases", () => {
  it("prints clawkeeper version when invoked via the clawkeeper entrypoint", () => {
    const result = runAs("clawkeeper", ["--version"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.trim(), /^clawkeeper v\d+\.\d+\.\d+/);
  });

  it("keeps nemoclaw version output for the legacy entrypoint", () => {
    const result = runAs("nemoclaw", ["--version"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.trim(), /^nemoclaw v\d+\.\d+\.\d+/);
  });

  it("shows clawkeeper as the primary command in help", () => {
    const result = runAs("clawkeeper", ["help"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Primary command:\s*clawkeeper\s*·\s*Legacy alias:\s*nemoclaw/);
    assert.match(result.stdout, /clawkeeper onboard/);
  });
});

