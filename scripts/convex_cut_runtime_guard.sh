#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

echo "== Convex cut runtime guard =="

PATTERN='s[u]pabase|@s[u]pabase|S[U]PABASE|s[b]_'
OBFUSCATED_PATTERN='\["supa"[[:space:]]*,[[:space:]]*"base"\][[:space:]]*\.join\(""\)'
TARGETS=(
  apps
  shared
)

echo "[1/3] Scanning runtime/product paths for forbidden legacy provider references..."
guard_rg_assert_absent \
  "legacy provider reference in runtime/product modules" \
  -n -i --hidden -S "$PATTERN" "${TARGETS[@]}"

echo "[2/3] Scanning for obfuscated legacy-provider key composition..."
guard_rg_assert_absent \
  "obfuscated legacy-provider key composition in runtime/product modules" \
  -n -i --hidden -S "$OBFUSCATED_PATTERN" "${TARGETS[@]}"

echo "[3/3] Guard passed."
echo "PASS: runtime/product paths are legacy-provider free."
