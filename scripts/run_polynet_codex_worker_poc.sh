#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

export POLYNET_WORKSPACE_COMPUTER_PROVIDER="${POLYNET_WORKSPACE_COMPUTER_PROVIDER:-blaxel}"
export POLYNET_ENABLE_BLAXEL_WORKSPACE_PROVIDER="${POLYNET_ENABLE_BLAXEL_WORKSPACE_PROVIDER:-true}"
export POLYNET_DEPLOYMENT_KIND="${POLYNET_DEPLOYMENT_KIND:-staging}"
export CONVEX_DEPLOYMENT="${CONVEX_DEPLOYMENT:-dev:quick-porcupine-949}"

cd "$ROOT_DIR"

bash "$ROOT_DIR/scripts/polynet_codex_worker_staging_guard.sh"

exec node \
  --experimental-strip-types \
  --experimental-specifier-resolution=node \
  "$ROOT_DIR/scripts/polynet_codex_worker_poc.ts" \
  "$@"
