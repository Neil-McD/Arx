#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

echo "== No legacy provider repo guard =="

PATTERN='s[u]pabase|@s[u]pabase|S[U]PABASE|s[b]_'
OBFUSCATED_PATTERN='\["supa"[[:space:]]*,[[:space:]]*"base"\][[:space:]]*\.join\(""\)'
EXCLUDES=(
  --glob '!**/.git/**'
  --glob '!**/node_modules/**'
  --glob '!**/dist/**'
  --glob '!**/target/**'
  --glob '!**/.next/**'
  --glob '!**/.turbo/**'
  --glob '!**/coverage/**'
  --glob '!references/**'
)
CODE_TARGETS=(
  apps
  shared
  convex
)

echo "[1/3] Scanning repository for forbidden legacy provider references..."
guard_rg_assert_absent \
  "legacy provider reference in repository" \
  -n -i --hidden -S "$PATTERN" . "${EXCLUDES[@]}"

echo "[2/3] Scanning repository for obfuscated legacy-provider key composition..."
guard_rg_assert_absent \
  "obfuscated legacy-provider key composition in repository" \
  -n -i --hidden -S "$OBFUSCATED_PATTERN" "${CODE_TARGETS[@]}" "${EXCLUDES[@]}"

echo "[3/3] Guard passed."
echo "PASS: repository is legacy-provider free outside approved MCP catalog/proof surfaces."
