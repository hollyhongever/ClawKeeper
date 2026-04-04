#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Thin bootstrap for the ClawKeeper installer.
# Public curl|bash installs should select a ref once, clone that ref, then
# execute installer logic from that same clone. Historical tags that predate
# the extracted payload fall back to their own root install.sh.

set -euo pipefail

apply_brand_compat_env() {
  local legacy="$1" branded="$2"
  if [[ -z "${!legacy+x}" && -n "${!branded+x}" ]]; then
    export "$legacy=${!branded}"
  fi
}

apply_brand_compat_env "NEMOCLAW_INSTALL_TAG" "CLAWKEEPER_INSTALL_TAG"
apply_brand_compat_env "NEMOCLAW_INSTALL_REF" "CLAWKEEPER_INSTALL_REF"
apply_brand_compat_env "NEMOCLAW_NON_INTERACTIVE" "CLAWKEEPER_NON_INTERACTIVE"
apply_brand_compat_env \
  "NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE" \
  "CLAWKEEPER_ACCEPT_THIRD_PARTY_SOFTWARE"
apply_brand_compat_env "NEMOCLAW_SANDBOX_NAME" "CLAWKEEPER_SANDBOX_NAME"
apply_brand_compat_env "NEMOCLAW_PROVIDER" "CLAWKEEPER_PROVIDER"
apply_brand_compat_env "NEMOCLAW_MODEL" "CLAWKEEPER_MODEL"
apply_brand_compat_env "NEMOCLAW_RECREATE_SANDBOX" "CLAWKEEPER_RECREATE_SANDBOX"
apply_brand_compat_env "NEMOCLAW_POLICY_MODE" "CLAWKEEPER_POLICY_MODE"
apply_brand_compat_env "NEMOCLAW_POLICY_PRESETS" "CLAWKEEPER_POLICY_PRESETS"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
LOCAL_PAYLOAD="${SCRIPT_DIR}/scripts/install.sh"
BOOTSTRAP_TMPDIR=""
PAYLOAD_MARKER="NEMOCLAW_VERSIONED_INSTALLER_PAYLOAD=1"

resolve_release_tag() {
  printf "%s" "${NEMOCLAW_INSTALL_TAG:-latest}"
}

verify_downloaded_script() {
  local file="$1" label="${2:-installer}"
  if [[ ! -s "$file" ]]; then
    printf "[ERROR] %s download is empty or missing\n" "$label" >&2
    exit 1
  fi
  if ! head -1 "$file" | grep -qE '^#!.*(sh|bash)'; then
    printf "[ERROR] %s does not start with a shell shebang\n" "$label" >&2
    exit 1
  fi
}

has_payload_marker() {
  local file="$1"
  [[ -f "$file" ]] && grep -q "$PAYLOAD_MARKER" "$file"
}

exec_installer_from_ref() {
  local ref="$1"
  shift

  local tmpdir source_root payload_script legacy_script
  tmpdir="$(mktemp -d)"
  BOOTSTRAP_TMPDIR="$tmpdir"
  trap 'rm -rf "${BOOTSTRAP_TMPDIR:-}"' EXIT
  source_root="${tmpdir}/source"

  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$ref" \
    https://github.com/hollyhongever/ClawKeeper.git "$source_root"

  payload_script="${source_root}/scripts/install.sh"
  legacy_script="${source_root}/install.sh"

  if has_payload_marker "$payload_script"; then
    verify_downloaded_script "$payload_script" "versioned installer"
    NEMOCLAW_INSTALL_REF="$ref" NEMOCLAW_INSTALL_TAG="$ref" NEMOCLAW_BOOTSTRAP_PAYLOAD=1 \
      bash "$payload_script" "$@"
    return
  fi

  verify_downloaded_script "$legacy_script" "legacy installer"
  NEMOCLAW_INSTALL_TAG="$ref" bash "$legacy_script" "$@"
}

bootstrap_version() {
  printf "clawkeeper-installer\n"
}

bootstrap_usage() {
  printf "\n"
  printf "  ClawKeeper Installer\n\n"
  printf "  Usage:\n"
  printf "    curl -fsSL https://raw.githubusercontent.com/hollyhongever/ClawKeeper/main/install.sh | bash\n"
  printf "    curl -fsSL https://raw.githubusercontent.com/hollyhongever/ClawKeeper/main/install.sh | bash -s -- [options]\n\n"
  printf "  Options:\n"
  printf "    --non-interactive    Skip prompts (uses env vars / defaults)\n"
  printf "    --yes-i-accept-third-party-software Accept the third-party software notice in non-interactive mode\n"
  printf "    --version, -v        Print installer version and exit\n"
  printf "    --help, -h           Show this help message and exit\n\n"
  printf "  Environment:\n"
  printf "    CLAWKEEPER_INSTALL_TAG       Git ref to install (fallback: NEMOCLAW_INSTALL_TAG)\n"
  printf "    CLAWKEEPER_NON_INTERACTIVE=1 Same as --non-interactive\n"
  printf "    CLAWKEEPER_ACCEPT_THIRD_PARTY_SOFTWARE=1 Same as --yes-i-accept-third-party-software\n"
  printf "    CLAWKEEPER_SANDBOX_NAME      Sandbox name to create/use\n"
  printf "    CLAWKEEPER_PROVIDER          cloud | ollama | nim | vllm\n"
  printf "    CLAWKEEPER_MODEL             Inference model to configure\n"
  printf "    CLAWKEEPER_RECREATE_SANDBOX=1 Recreate an existing sandbox\n"
  printf "    CLAWKEEPER_POLICY_MODE       suggested | custom | skip\n"
  printf "    CLAWKEEPER_POLICY_PRESETS    Comma-separated policy presets\n"
  printf "    (legacy NEMOCLAW_* variables are still supported)\n"
  printf "\n"
}

bootstrap_main() {
  for arg in "$@"; do
    case "$arg" in
      --help | -h)
        bootstrap_usage
        return 0
        ;;
      --version | -v)
        bootstrap_version
        return 0
        ;;
    esac
  done

  local ref
  ref="$(resolve_release_tag)"
  exec_installer_from_ref "$ref" "$@"
}

if has_payload_marker "$LOCAL_PAYLOAD"; then
  # shellcheck source=/dev/null
  . "$LOCAL_PAYLOAD"
fi

if [[ "${BASH_SOURCE[0]:-}" == "$0" ]] || { [[ -z "${BASH_SOURCE[0]:-}" ]] && { [[ "$0" == "bash" ]] || [[ "$0" == "-bash" ]]; }; }; then
  if has_payload_marker "$LOCAL_PAYLOAD"; then
    main "$@"
  else
    bootstrap_main "$@"
  fi
fi
