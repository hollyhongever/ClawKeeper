// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export type ServiceEventLevel = "info" | "warn" | "error";

export interface ServiceEvent {
  id: string;
  timestamp: string;
  level: ServiceEventLevel;
  source: string;
  title: string;
  detail?: string;
  service?: string;
}

const EVENT_LOG_FILE = "events.jsonl";

function isServiceEvent(value: unknown): value is ServiceEvent {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.timestamp === "string" &&
    typeof entry.level === "string" &&
    typeof entry.source === "string" &&
    typeof entry.title === "string"
  );
}

export function resolveServiceEventLogPath(pidDir: string): string {
  return join(pidDir, EVENT_LOG_FILE);
}

export function appendServiceEvent(
  pidDir: string,
  event: Omit<ServiceEvent, "id" | "timestamp"> &
    Partial<Pick<ServiceEvent, "id" | "timestamp">>,
): ServiceEvent {
  mkdirSync(pidDir, { recursive: true });
  const entry: ServiceEvent = {
    id: event.id ?? randomUUID(),
    timestamp: event.timestamp ?? new Date().toISOString(),
    level: event.level,
    source: event.source,
    title: event.title,
    detail: event.detail,
    service: event.service,
  };
  appendFileSync(resolveServiceEventLogPath(pidDir), `${JSON.stringify(entry)}\n`);
  return entry;
}

export function readServiceEvents(pidDir: string, limit = 10): ServiceEvent[] {
  const logPath = resolveServiceEventLogPath(pidDir);
  if (!existsSync(logPath)) return [];

  const raw = readFileSync(logPath, "utf-8");
  const events = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(isServiceEvent);

  return events.slice(-limit).reverse();
}
