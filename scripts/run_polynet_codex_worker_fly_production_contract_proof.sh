#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRODUCTION_ENV_FILE="${POLYNET_PRODUCTION_ENV_FILE:-"$ROOT_DIR/.env.production.local"}"
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

load_env_if_present "$PRODUCTION_ENV_FILE"
load_env_if_present "$BLAXEL_ENV_FILE"

export POLYNET_DEPLOYMENT_KIND="${POLYNET_DEPLOYMENT_KIND:-production}"
export CONVEX_DEPLOYMENT="${CONVEX_DEPLOYMENT:-prod:wry-hawk-715}"
export POLYNET_CODEX_WORKER_FLY_APP="${POLYNET_CODEX_WORKER_FLY_APP:-polynet-codex-worker}"
export POLYNET_CODEX_WORKER_FLY_CONFIG="$ROOT_DIR/services/polynet-codex-worker/fly.production.toml"
export POLYNET_CODEX_WORKER_URL="${POLYNET_CODEX_WORKER_URL:-https://polynet-codex-worker.fly.dev}"
export POLYNET_CODEX_WORKER_INGEST_URL="${POLYNET_CODEX_WORKER_INGEST_URL:-https://wry-hawk-715.convex.site/runtime/polynet_codex_worker_ingest}"
export POLYNET_CODEX_WORKER_EXPECT_MULTI_MACHINE="${POLYNET_CODEX_WORKER_EXPECT_MULTI_MACHINE:-true}"

cd "$ROOT_DIR"

bash "$ROOT_DIR/scripts/polynet_codex_worker_production_guard.sh"

exec node \
  --experimental-strip-types \
  --experimental-specifier-resolution=node \
  "$ROOT_DIR/scripts/polynet_codex_worker_fly_staging_contract_proof.ts" \
  "$@"
