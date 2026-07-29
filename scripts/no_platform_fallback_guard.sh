#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

NEEDLE='platform''_fallback'

guard_rg_assert_absent "legacy platform_fallback wording" \
  -n "$NEEDLE" docs shared convex apps/web/src scripts \
  --glob '!**/node_modules/**' \
  --glob '!scripts/no_platform_fallback_guard.sh' \
  --glob '!scripts/foundation_baseline_gate.sh'

echo "PASS: no legacy platform_fallback wording found."
