#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

NEEDLE='platform''_fallback'

if rg -n "$NEEDLE" docs shared convex apps/web/src scripts \
  --glob '!**/node_modules/**' \
  --glob '!docs/system-map/snapshots/**' \
  --glob '!scripts/no_platform_fallback_guard.sh' \
  --glob '!scripts/foundation_baseline_gate.sh'; then
  echo "FAIL: found legacy platform_fallback wording; use platform."
  exit 1
fi

echo "PASS: no legacy platform_fallback wording found."
