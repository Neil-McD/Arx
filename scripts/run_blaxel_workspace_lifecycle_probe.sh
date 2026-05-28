#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${BLAXEL_ENV_FILE:-"$ROOT_DIR/.env.blaxel.local"}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${BL_WORKSPACE:-}" || -z "${BL_API_KEY:-}" ]]; then
  echo "Blaxel credentials are not set." >&2
  echo "Paste BL_WORKSPACE and BL_API_KEY into: $ENV_FILE" >&2
fi

exec node \
  --experimental-strip-types \
  --experimental-specifier-resolution=node \
  "$ROOT_DIR/scripts/blaxel_workspace_lifecycle_probe.ts" \
  "$@"
