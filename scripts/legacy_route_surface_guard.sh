#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

echo "== Legacy route surface guard =="

PATTERN='(/rest/v1|/functions/v1|/rpc\b)'
TARGETS=(
  apps
  shared
)

max_allowed_for_file() {
  case "$1" in
    *) echo "" ;;
  esac
}

echo "[1/3] Scanning runtime/product paths for legacy route markers..."
RAW_MATCHES="$(
  guard_rg_capture \
    "legacy route markers in runtime/product paths" \
    -n --hidden -S "$PATTERN" "${TARGETS[@]}"
)"

COUNTS_FILE="$(mktemp)"
trap 'rm -f "$COUNTS_FILE"' EXIT

if [[ -n "$RAW_MATCHES" ]]; then
  printf '%s\n' "$RAW_MATCHES" \
    | awk -F: '{count[$1]++} END {for (file in count) print file "=" count[file]}' \
    | sort > "$COUNTS_FILE"
fi

FAIL=0

echo "[2/3] Validating allowlisted file surface..."
if [[ -s "$COUNTS_FILE" ]]; then
  while IFS='=' read -r file actual_count; do
    max_allowed="$(max_allowed_for_file "$file")"
    if [[ -z "$max_allowed" ]]; then
      echo "FAIL: unexpected legacy-route marker file: $file ($actual_count)"
      FAIL=1
      continue
    fi
    if (( actual_count > max_allowed )); then
      echo "FAIL: legacy-route marker count grew in $file ($actual_count > $max_allowed)"
      FAIL=1
      continue
    fi
    echo "OK: $file ($actual_count/$max_allowed)"
  done < "$COUNTS_FILE"
else
  echo "OK: no legacy route markers found."
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
echo "PASS: legacy route surface is within allowed migration baseline."
