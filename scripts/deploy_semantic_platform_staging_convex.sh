#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_CONVEX_DEPLOYMENT="dev:quick-porcupine-949"

if [[ -n "${CONVEX_DEPLOY_KEY:-}" ]]; then
  echo "FAIL: CONVEX_DEPLOY_KEY must be unset for the staging dev deployment" >&2
  exit 1
fi

export CONVEX_DEPLOYMENT="$EXPECTED_CONVEX_DEPLOYMENT"
export POLYNET_DEPLOYMENT_KIND="staging"

cd "$ROOT_DIR"
bash "$ROOT_DIR/scripts/semantic_platform_staging_guard.sh" --release

echo "Pushing the validated commit to Convex staging: $CONVEX_DEPLOYMENT"
exec npx convex dev --once --tail-logs disable --typecheck try --codegen disable
