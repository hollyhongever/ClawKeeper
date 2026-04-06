// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  appendServiceEvent,
  readServiceEvents,
  resolveServiceEventLogPath,
} from "../../dist/lib/service-events";

describe("service-events", () => {
  let pidDir: string;

  beforeEach(() => {
    pidDir = mkdtempSync(join(tmpdir(), "nemoclaw-events-"));
  });

  afterEach(() => {
    rmSync(pidDir, { recursive: true, force: true });
  });

  it("resolves the event log path inside the pid directory", () => {
    expect(resolveServiceEventLogPath(pidDir)).toBe(join(pidDir, "events.jsonl"));
  });

  it("appends and reads events in reverse chronological order", () => {
    appendServiceEvent(pidDir, {
      level: "info",
      source: "test",
      title: "bridge started",
      timestamp: "2026-04-06T14:00:00.000Z",
      service: "telegram-bridge",
    });
    appendServiceEvent(pidDir, {
      level: "error",
      source: "test",
      title: "bridge stopped unexpectedly",
      detail: "Last known PID 999",
      timestamp: "2026-04-06T14:01:00.000Z",
      service: "telegram-bridge",
    });

    const events = readServiceEvents(pidDir, 10);

    expect(events).toHaveLength(2);
    expect(events[0]?.title).toBe("bridge stopped unexpectedly");
    expect(events[1]?.title).toBe("bridge started");
  });

  it("returns an empty list when no log file exists", () => {
    expect(readServiceEvents(pidDir, 5)).toEqual([]);
  });
});
