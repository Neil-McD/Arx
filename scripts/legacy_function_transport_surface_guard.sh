#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

echo "== Legacy function transport surface guard =="

PATTERN='invokeFunctionAuthJson|invokeFunctionPublicJson|buildCloudFunctionUrl\('
TARGETS=(
  src
  apps
  shared
)

max_allowed_for_file() {
  case "$1" in
    shared/cloudRuntimeTransport.ts) echo 0 ;;
    *) echo "" ;;
  esac
}

echo "[1/3] Scanning runtime/product paths for legacy function transport refs..."
RAW_MATCHES="$(rg -n --hidden -S "$PATTERN" "${TARGETS[@]}" || true)"

COUNTS_FILE="$(mktemp)"
trap 'rm -f "$COUNTS_FILE"' EXIT

if [[ -n "$RAW_MATCHES" ]]; then
  printf '%s\n' "$RAW_MATCHES" \
    | awk -F: '{count[$1]++} END {for (file in count) print file "=" count[file]}' \
    | sort > "$COUNTS_FILE"
fi

FAIL=0

echo "[2/3] Validating migration baseline allowlist..."
if [[ -s "$COUNTS_FILE" ]]; then
  while IFS='=' read -r file actual_count; do
    max_allowed="$(max_allowed_for_file "$file")"
    if [[ -z "$max_allowed" ]]; then
      echo "FAIL: unexpected legacy function transport file: $file ($actual_count)"
      FAIL=1
      continue
    fi
    if (( actual_count > max_allowed )); then
      echo "FAIL: legacy function transport count grew in $file ($actual_count > $max_allowed)"
      FAIL=1
      continue
    fi
    echo "OK: $file ($actual_count/$max_allowed)"
  done < "$COUNTS_FILE"
else
  echo "OK: no legacy function transport refs found."
fi

if (( FAIL != 0 )); then
  echo
  echo "Matched lines:"
  if [[ -n "$RAW_MATCHES" ]]; then
    printf '%s\n' "$RAW_MATCHES"
  else
    echo "(none)"
  fi
  exit 1
fi

echo "[3/3] Guard passed."
echo "PASS: legacy function transport surface is within allowed migration baseline."
