#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_CONVEX_DEPLOYMENT="dev:quick-porcupine-949"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

if [[ -n "${CONVEX_DEPLOY_KEY:-}" ]]; then
  fail "CONVEX_DEPLOY_KEY is set; this script only pushes to the named staging dev deployment"
fi

if [[ -n "${CONVEX_DEPLOYMENT:-}" && "$CONVEX_DEPLOYMENT" != "$EXPECTED_CONVEX_DEPLOYMENT" ]]; then
  fail "CONVEX_DEPLOYMENT must be $EXPECTED_CONVEX_DEPLOYMENT, got $CONVEX_DEPLOYMENT"
fi

if [[ -n "${POLYNET_DEPLOYMENT_KIND:-}" && "$POLYNET_DEPLOYMENT_KIND" != "staging" ]]; then
  fail "POLYNET_DEPLOYMENT_KIND must be staging, got $POLYNET_DEPLOYMENT_KIND"
fi

export CONVEX_DEPLOYMENT="$EXPECTED_CONVEX_DEPLOYMENT"
export POLYNET_DEPLOYMENT_KIND="staging"

cd "$ROOT_DIR"

bash "$ROOT_DIR/scripts/daytona_codex_runtime_staging_guard.sh"

echo "Pushing Daytona Codex runtime Convex code to staging dev deployment: $CONVEX_DEPLOYMENT"
exec npx convex dev --once --tail-logs disable --typecheck disable
