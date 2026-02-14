#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FILE="src/App.tsx"
# App.tsx should not call Tauri invoke directly; runtime/shell clients own that boundary.
BASELINE=0

if [[ ! -f "$FILE" ]]; then
  echo "FAIL: missing $FILE"
  exit 1
fi

CURRENT="$(awk '{ while (match($0, /invoke(<[^>]+>)?\("/)) { c++; $0 = substr($0, RSTART + RLENGTH) } } END { print c + 0 }' "$FILE")"

echo "Desktop invoke boundary: current=$CURRENT baseline=$BASELINE"

if [[ "$CURRENT" -gt "$BASELINE" ]]; then
  echo "FAIL: direct invoke usage in $FILE grew above baseline ($CURRENT > $BASELINE)."
  echo "Route new runtime/DB calls through typed adapters (runtime client / service modules)."
  exit 1
fi

echo "PASS: desktop invoke boundary is within baseline."
