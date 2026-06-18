#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${POLYNET_CODEX_WORKER_FLY_APP:-polynet-codex-worker-staging}"
CONFIG_FILE="$ROOT_DIR/services/polynet-codex-worker/fly.toml"
STAGING_ENV_FILE="${POLYNET_STAGING_ENV_FILE:-"$ROOT_DIR/.env.staging.local"}"
BLAXEL_ENV_FILE="${BLAXEL_ENV_FILE:-"$ROOT_DIR/.env.blaxel.local"}"

load_env_if_present() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

load_env_if_present "$STAGING_ENV_FILE"
load_env_if_present "$BLAXEL_ENV_FILE"

export POLYNET_DEPLOYMENT_KIND="${POLYNET_DEPLOYMENT_KIND:-staging}"
export CONVEX_DEPLOYMENT="${CONVEX_DEPLOYMENT:-dev:quick-porcupine-949}"

cd "$ROOT_DIR"

bash "$ROOT_DIR/scripts/polynet_codex_worker_staging_guard.sh"

if command -v fly >/dev/null 2>&1; then
  FLY_BIN="fly"
elif command -v flyctl >/dev/null 2>&1; then
  FLY_BIN="flyctl"
else
  echo "FAIL: install flyctl before deploying the worker" >&2
  exit 1
fi

if [[ "$APP_NAME" != "polynet-codex-worker-staging" ]]; then
  echo "FAIL: refusing non-staging Fly app: $APP_NAME" >&2
  exit 1
fi

if [[ -z "${POLYNET_CODEX_WORKER_AUTH_TOKEN:-}" ]]; then
  echo "FAIL: POLYNET_CODEX_WORKER_AUTH_TOKEN is required" >&2
  exit 1
fi
if [[ -z "${BL_WORKSPACE:-}" || -z "${BL_API_KEY:-}" ]]; then
  echo "FAIL: BL_WORKSPACE and BL_API_KEY are required" >&2
  exit 1
fi

auth_secret_count=0
secret_args=(
  "POLYNET_CODEX_WORKER_AUTH_TOKEN=$POLYNET_CODEX_WORKER_AUTH_TOKEN"
  "BL_WORKSPACE=$BL_WORKSPACE"
  "BL_API_KEY=$BL_API_KEY"
)

if [[ -n "${CODEX_AUTH_JSON_BASE64:-}" ]]; then
  secret_args+=("CODEX_AUTH_JSON_BASE64=$CODEX_AUTH_JSON_BASE64")
  auth_secret_count=$((auth_secret_count + 1))
fi
if [[ -n "${CODEX_ACCESS_TOKEN:-}" ]]; then
  secret_args+=("CODEX_ACCESS_TOKEN=$CODEX_ACCESS_TOKEN")
  auth_secret_count=$((auth_secret_count + 1))
fi
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  secret_args+=("OPENAI_API_KEY=$OPENAI_API_KEY")
  auth_secret_count=$((auth_secret_count + 1))
fi
if [[ "$auth_secret_count" -eq 0 ]]; then
  echo "FAIL: provide CODEX_ACCESS_TOKEN, OPENAI_API_KEY, or CODEX_AUTH_JSON_BASE64 for Fly Codex auth" >&2
  exit 1
fi
if [[ "$auth_secret_count" -gt 1 ]]; then
  echo "FAIL: provide exactly one Codex auth secret path for Fly" >&2
  exit 1
fi

if [[ -n "${BLAXEL_WORKSPACE_REGION:-}" ]]; then
  secret_args+=("BLAXEL_WORKSPACE_REGION=$BLAXEL_WORKSPACE_REGION")
fi

if [[ "${POLYNET_CODEX_WORKER_FLY_CREATE_APP:-false}" == "true" ]]; then
  create_args=("$APP_NAME" "--yes")
  create_args+=("--org" "${FLY_ORG:-polynet}")
  "$FLY_BIN" apps create "${create_args[@]}" || true
fi

"$FLY_BIN" secrets set -a "$APP_NAME" "${secret_args[@]}"
"$FLY_BIN" deploy --config "$CONFIG_FILE" --remote-only --ha=false "$ROOT_DIR"
