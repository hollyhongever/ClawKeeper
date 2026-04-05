#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

failures=0

pass() {
  printf 'PASS: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

contains() {
  local file="$1"
  local needle="$2"

  if command -v rg >/dev/null 2>&1; then
    rg -Fq -- "$needle" "$file"
  else
    grep -Fq -- "$needle" "$file"
  fi
}

check_file() {
  local rel="$1"
  local abs="$ROOT/$rel"

  if [[ -f "$abs" ]]; then
    pass "file exists: $rel"
  else
    fail "missing file: $rel"
  fi
}

check_contains() {
  local rel="$1"
  local needle="$2"
  local label="$3"
  local abs="$ROOT/$rel"

  if [[ ! -f "$abs" ]]; then
    fail "$label (missing file: $rel)"
    return
  fi

  if contains "$abs" "$needle"; then
    pass "$label"
  else
    fail "$label (missing: $needle)"
  fi
}

check_file "docs/security/public-exposure-rollout-playbook.md"
check_file "docs/reference/troubleshooting.md"
check_file "docs/reference/commands.md"
check_file "docs/index.md"

check_contains \
  "docs/index.md" \
  "Public Exposure Rollout Playbook <security/public-exposure-rollout-playbook>" \
  "docs index includes security rollout playbook toctree entry"

check_contains \
  "docs/reference/troubleshooting.md" \
  "../security/public-exposure-rollout-playbook.md" \
  "troubleshooting links to rollout playbook"

check_contains \
  "docs/security/public-exposure-rollout-playbook.md" \
  "## Stage 1: Audit" \
  "playbook contains audit stage"

check_contains \
  "docs/security/public-exposure-rollout-playbook.md" \
  "## Stage 2: Warn" \
  "playbook contains warn stage"

check_contains \
  "docs/security/public-exposure-rollout-playbook.md" \
  "## Stage 3: Enforce" \
  "playbook contains enforce stage"

check_contains \
  "docs/security/public-exposure-rollout-playbook.md" \
  "## Rollback Playbook" \
  "playbook contains rollback section"

check_contains \
  "docs/security/public-exposure-rollout-playbook.md" \
  "Acceptance Gates" \
  "playbook defines acceptance gates"

commands=(
  "clawkeeper security policy validate"
  "clawkeeper security events"
  "clawkeeper security replay"
  "clawkeeper <name> status"
  "clawkeeper <name> logs"
  "openshell term"
)

for cmd in "${commands[@]}"; do
  check_contains \
    "docs/security/public-exposure-rollout-playbook.md" \
    "$cmd" \
    "playbook references command: $cmd"

  check_contains \
    "docs/reference/commands.md" \
    "$cmd" \
    "command reference documents: $cmd"
done

if (( failures > 0 )); then
  printf '\nsecurity rollout gate failed with %d issue(s).\n' "$failures" >&2
  exit 1
fi

printf '\nsecurity rollout gate passed.\n'
