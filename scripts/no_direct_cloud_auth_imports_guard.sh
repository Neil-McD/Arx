#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== No direct cloud-auth imports guard =="

PATTERN='from ".*cloudAuthCore"|from ".*cloudAuthFlow"|from ".*cloudOAuthCallback"'
TARGETS=(src apps shared)

ALLOWLIST=(
  "shared/authSessionCore.ts"
  "shared/authSessionFlow.ts"
  "shared/authOAuthCallback.ts"
  "shared/cloudAuthFlow.ts"
  "shared/cloudOAuthCallback.ts"
)

echo "[1/3] Scanning runtime/product paths for direct cloud-auth imports..."
RAW_MATCHES="$(rg -n --hidden -S "$PATTERN" "${TARGETS[@]}" || true)"

if [[ -z "$RAW_MATCHES" ]]; then
  echo "OK: no direct cloud-auth imports remain."
  echo "[2/3] Allowlist check skipped (no matches)."
  echo "[3/3] Guard passed."
  echo "PASS: direct cloud-auth imports are fully removed."
  exit 0
fi

echo "[2/3] Validating matches against bridge-only allowlist..."
MATCH_FILES="$(printf '%s\n' "$RAW_MATCHES" | cut -d: -f1 | sort -u)"
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  allowed=false
  for allow in "${ALLOWLIST[@]}"; do
    if [[ "$file" == "$allow" ]]; then
      allowed=true
      break
    fi
  done
  if [[ "$allowed" == false ]]; then
    echo "$RAW_MATCHES"
    echo "FAIL: disallowed direct cloud-auth import in $file"
    exit 1
  fi
done <<< "$MATCH_FILES"

echo "OK: all remaining direct cloud-auth imports are bridge-allowlisted."
echo "[3/3] Guard passed."
echo "PASS: cloud-auth imports are constrained to bridge modules."
