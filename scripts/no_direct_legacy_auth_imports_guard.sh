#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== No direct legacy-auth imports guard =="

PATTERN='from ".*cloudAuthCore"|from ".*cloudAuthFlow"|from ".*cloudOAuthCallback"|from ".*cloudAuthClient"'
TARGETS=(src apps shared)

echo "[1/2] Scanning runtime/product paths for direct legacy-auth imports..."
RAW_MATCHES="$(rg -n --hidden -S "$PATTERN" "${TARGETS[@]}" || true)"

if [[ -z "$RAW_MATCHES" ]]; then
  echo "OK: no direct legacy-auth imports remain."
  echo "[2/2] Guard passed."
  echo "PASS: direct legacy-auth imports are fully removed."
  exit 0
fi

echo "$RAW_MATCHES"
echo "FAIL: direct legacy-auth imports remain."
exit 1
