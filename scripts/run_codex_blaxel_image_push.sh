#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_DIR="$ROOT_DIR/infra/blaxel/codex-runtime"
IMAGE_NAME="${POLYNET_CODEX_BLAXEL_IMAGE_NAME:-polynet-codex-runtime}"
TIMEOUT="${POLYNET_CODEX_BLAXEL_PUSH_TIMEOUT:-30m}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

if ! command -v bl >/dev/null 2>&1; then
  fail "Blaxel CLI is not installed"
fi

if [[ -f "$ROOT_DIR/.env.blaxel.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.blaxel.local"
  set +a
fi

BL_WORKSPACE_VALUE="${BL_WORKSPACE:-}"
BL_API_KEY_VALUE="${BL_API_KEY:-}"
ALLOW_CLI_AUTH="${POLYNET_CODEX_BLAXEL_PUSH_ALLOW_CLI_AUTH:-false}"

if [[ -z "$BL_WORKSPACE_VALUE" ]]; then
  if [[ "$ALLOW_CLI_AUTH" == "true" ]]; then
    BL_WORKSPACE_VALUE="$(bl workspaces --current 2>/dev/null | tr -d '\r' | sed -E 's/[^A-Za-z0-9._-]/_/g')"
  fi
fi

if [[ -z "$BL_WORKSPACE_VALUE" ]]; then
  fail "BL_WORKSPACE is required, or set POLYNET_CODEX_BLAXEL_PUSH_ALLOW_CLI_AUTH=true to use the current Blaxel CLI workspace"
fi
if [[ -z "$BL_API_KEY_VALUE" && "$ALLOW_CLI_AUTH" != "true" ]]; then
  fail "BL_API_KEY is required, or set POLYNET_CODEX_BLAXEL_PUSH_ALLOW_CLI_AUTH=true to use local Blaxel CLI auth"
fi

push_output="$(mktemp)"
cleanup() {
  rm -f "$push_output"
}
trap cleanup EXIT

sanitize_output() {
  sed -E \
    -e 's/(BL_API_KEY=)[^[:space:]]+/\1[redacted]/g' \
    -e 's/(Authorization: Bearer )[A-Za-z0-9._-]+/\1[redacted]/gI' \
    -e 's/(api[-_]?key[":= ]+)[A-Za-z0-9._-]+/\1[redacted]/gI' \
    -e 's/sk-[A-Za-z0-9_-]{8,}/[redacted_api_key]/g' \
    -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[redacted_jwt]/g' \
    "$push_output"
}

env_args=(
  "HOME=${HOME:-}"
  "PATH=${PATH:-}"
  "USER=${USER:-}"
  "BL_WORKSPACE=$BL_WORKSPACE_VALUE"
)
if [[ -n "$BL_API_KEY_VALUE" ]]; then
  env_args+=("BL_API_KEY=$BL_API_KEY_VALUE")
fi

set +e
(
  cd "$IMAGE_DIR"
  env -i "${env_args[@]}" \
    bl push \
      --type sandbox \
      --name "$IMAGE_NAME" \
      --workspace "$BL_WORKSPACE_VALUE" \
      --yes \
      --timeout "$TIMEOUT" \
      >"$push_output" 2>&1
)
status=$?
set -e

if grep -E 'OPENAI_API_KEY|CODEX_API_KEY|ARX_|SUPABASE|SECRET|TOKEN|sk-[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' "$push_output" >/dev/null; then
  echo "FAIL: Blaxel push output contained secret-like environment material" >&2
  sanitize_output | tail -120 >&2
  exit 1
fi

if grep -E 'File: (\.claude/|\.npm-cache/|apps/|convex/|marketing/|node_modules/|references/|scripts/|services/|shared/|package\.json|package-lock\.json)' "$push_output" >/dev/null; then
  echo "FAIL: Blaxel push packaged files outside the Codex runtime image directory" >&2
  sanitize_output | tail -120 >&2
  exit 1
fi

if [[ "$status" -ne 0 ]]; then
  echo "FAIL: Blaxel push failed with status $status" >&2
  sanitize_output | tail -120 >&2
  exit "$status"
fi

echo "PASS: Codex Blaxel image pushed as $IMAGE_NAME in workspace $BL_WORKSPACE_VALUE"
