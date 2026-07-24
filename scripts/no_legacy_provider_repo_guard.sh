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
  --glob '!docs/system-map/snapshots/**'
  --glob '!apps/web/src/lib/discoverCatalog.ts'
  --glob '!shared/discoverCatalog.ts'
  --glob '!shared/communityWorkflowImportMcpRegistry.ts'
  --glob '!scripts/discover_connect_policy_proof.ts'
  --glob '!scripts/discover_integration_profile_proof.ts'
  --glob '!scripts/runtime_profile_policy_proof.ts'
)
CODE_TARGETS=(
  apps
  shared
  convex
)

echo "[1/3] Scanning repository for forbidden legacy provider references outside approved MCP catalog/proof surfaces..."
if rg -n -i --hidden -S "$PATTERN" . "${EXCLUDES[@]}"; then
  echo "FAIL: legacy provider reference detected."
  exit 1
fi

echo "[2/3] Scanning repository for obfuscated legacy-provider key composition..."
if rg -n -i --hidden -S "$OBFUSCATED_PATTERN" "${CODE_TARGETS[@]}" "${EXCLUDES[@]}"; then
  echo "FAIL: obfuscated legacy provider key composition detected."
  exit 1
fi

echo "[3/3] Guard passed."
echo "PASS: repository is legacy-provider free outside approved MCP catalog/proof surfaces."
