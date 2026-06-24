#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGING_ENV_FILE="${POLYNET_STAGING_ENV_FILE:-"$ROOT_DIR/.env.staging.local"}"

load_env_if_present() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

# Env explicitly set by the caller (e.g. the service contract proof injecting
# its own auth token and port) must win over values in local env files.
# macOS ships Bash 3.2, so no associative arrays: snapshot to prefixed
# variables and restore any that were set before sourcing.
PRESET_VARS=(
  POLYNET_CODEX_WORKER_AUTH_TOKEN
  POLYNET_CODEX_WORKER_PORT
  POLYNET_CODEX_WORKER_HOST
  POLYNET_CODEX_WORKER_MODEL
  POLYNET_CODEX_WORKER_CODEX_BIN
  POLYNET_CODEX_WORKER_CODEX_HOME
  POLYNET_CODEX_WORKSPACE_HOST
  POLYNET_DAYTONA_WORKSPACE_ROOT
  POLYNET_DAYTONA_PREVIEW_URL_PATTERN
  CONVEX_DEPLOYMENT
  POLYNET_DEPLOYMENT_KIND
)
for var in "${PRESET_VARS[@]}"; do
  if [[ -n "${!var:-}" ]]; then
    printf -v "PRESET_SNAPSHOT_${var}" '%s' "${!var}"
  fi
done

load_env_if_present "$STAGING_ENV_FILE"

for var in "${PRESET_VARS[@]}"; do
  snapshot_var="PRESET_SNAPSHOT_${var}"
  if [[ -n "${!snapshot_var:-}" ]]; then
    export "$var"="${!snapshot_var}"
  fi
done

export POLYNET_DEPLOYMENT_KIND="${POLYNET_DEPLOYMENT_KIND:-staging}"
export CONVEX_DEPLOYMENT="${CONVEX_DEPLOYMENT:-dev:quick-porcupine-949}"
export POLYNET_CODEX_WORKER_CODEX_BIN="${POLYNET_CODEX_WORKER_CODEX_BIN:-codex}"
export POLYNET_CODEX_WORKER_HOST="${POLYNET_CODEX_WORKER_HOST:-127.0.0.1}"
export POLYNET_CODEX_WORKSPACE_HOST="${POLYNET_CODEX_WORKSPACE_HOST:-daytona}"

if [[ "$POLYNET_CODEX_WORKSPACE_HOST" != "daytona" ]]; then
  echo "FAIL: POLYNET_CODEX_WORKSPACE_HOST must be daytona for the Codex worker" >&2
  exit 1
fi

if [[ -z "${POLYNET_CODEX_WORKER_AUTH_TOKEN:-}" ]]; then
  if [[ "$POLYNET_CODEX_WORKER_HOST" == "127.0.0.1" || "$POLYNET_CODEX_WORKER_HOST" == "localhost" ]]; then
    export POLYNET_CODEX_WORKER_AUTH_TOKEN="polynet-local-worker-token"
  else
    echo "FAIL: POLYNET_CODEX_WORKER_AUTH_TOKEN is required when POLYNET_CODEX_WORKER_HOST is not localhost" >&2
    exit 1
  fi
fi

if [[ -d "/home/daytona" ]]; then
  DEFAULT_CODEX_HOME_DIR="/home/daytona/.polynet-codex-home"
else
  DEFAULT_CODEX_HOME_DIR="${TMPDIR:-/tmp}/polynet-codex-worker-local/codex-home"
fi
CODEX_HOME_DIR="${POLYNET_CODEX_WORKER_CODEX_HOME:-$DEFAULT_CODEX_HOME_DIR}"
mkdir -p "$CODEX_HOME_DIR"
POLYNET_WORKER_ROOT_DIR="$ROOT_DIR" node \
  --experimental-strip-types \
  --experimental-specifier-resolution=node \
  --input-type=module <<'NODE' > "$CODEX_HOME_DIR/config.toml"
const { join } = await import("node:path");
const { pathToFileURL } = await import("node:url");

const rootDir = process.env.POLYNET_WORKER_ROOT_DIR;
if (!rootDir) throw new Error("POLYNET_WORKER_ROOT_DIR is required.");
const moduleUrl = pathToFileURL(
  join(rootDir, "shared/daytonaCodexRuntimePolicy.ts"),
).href;
const { renderDaytonaCodexCliConfigToml } = await import(moduleUrl);
process.stdout.write(
  renderDaytonaCodexCliConfigToml({
    model: process.env.POLYNET_CODEX_WORKER_MODEL || null,
  }),
);
NODE
chmod 600 "$CODEX_HOME_DIR/config.toml" || true
if [[ -z "${CODEX_ACCESS_TOKEN:-}" && -f "$HOME/.codex/auth.json" && ! -f "$CODEX_HOME_DIR/auth.json" ]]; then
  cp "$HOME/.codex/auth.json" "$CODEX_HOME_DIR/auth.json"
  chmod 600 "$CODEX_HOME_DIR/auth.json" || true
fi
export CODEX_HOME="$CODEX_HOME_DIR"

cd "$ROOT_DIR"

exec node \
  --experimental-strip-types \
  --experimental-specifier-resolution=node \
  "$ROOT_DIR/services/polynet-codex-worker/src/server.ts" \
  "$@"
