#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

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
)
CODE_TARGETS=(
  src
  apps
  shared
  src-tauri
  convex
)

echo "[1/3] Scanning repository for forbidden legacy provider references..."
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
echo "PASS: repository is legacy-provider free."
