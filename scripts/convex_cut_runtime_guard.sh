#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Convex cut runtime guard =="

PATTERN='s[u]pabase|@s[u]pabase|S[U]PABASE|s[b]_'
OBFUSCATED_PATTERN='\["supa"[[:space:]]*,[[:space:]]*"base"\][[:space:]]*\.join\(""\)'
TARGETS=(
  src
  apps
  shared
)

echo "[1/3] Scanning runtime/product paths for forbidden legacy provider references..."
if rg -n -i --hidden -S "$PATTERN" "${TARGETS[@]}"; then
  echo "FAIL: legacy provider reference detected in runtime/product module(s)."
  exit 1
fi

echo "[2/3] Scanning for obfuscated legacy-provider key composition..."
if rg -n -i --hidden -S "$OBFUSCATED_PATTERN" "${TARGETS[@]}"; then
  echo "FAIL: obfuscated legacy provider key composition detected in runtime/product module(s)."
  exit 1
fi

echo "[3/3] Guard passed."
echo "PASS: runtime/product paths are legacy-provider free."
