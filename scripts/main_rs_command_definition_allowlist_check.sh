#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MAIN_FILE="src-tauri/src/main.rs"

echo "== main.rs command definition allowlist checks =="

declare -a ALLOWLIST=()

is_allowlisted() {
  local needle="$1"
  for candidate in "${ALLOWLIST[@]}"; do
    if [[ "$candidate" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

declare -a ACTUAL=()
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  ACTUAL+=("$name")
done < <(rg -U -o -r '$1' "(?m)^\\s*#\\[tauri::command\\]\\n\\s*(?:pub\\(crate\\)\\s+)?(?:async\\s+)?fn\\s+([A-Za-z0-9_]+)" "$MAIN_FILE" || true)

echo "Detected main.rs commands: ${ACTUAL[*]:-<none>}"

actual_count=${#ACTUAL[@]}
allow_count=${#ALLOWLIST[@]}
if (( actual_count != allow_count )); then
  echo "FAIL: command count mismatch in main.rs (actual=$actual_count expected=$allow_count)"
  exit 1
fi

for name in "${ACTUAL[@]:-}"; do
  [[ -n "$name" ]] || continue
  if ! is_allowlisted "$name"; then
    echo "FAIL: main.rs has non-allowlisted command handler: $name"
    exit 1
  fi
done

for expected in "${ALLOWLIST[@]:-}"; do
  [[ -n "$expected" ]] || continue
  found=0
  for actual in "${ACTUAL[@]:-}"; do
    [[ -n "$actual" ]] || continue
    if [[ "$actual" == "$expected" ]]; then
      found=1
      break
    fi
  done
  if (( found == 0 )); then
    echo "FAIL: expected allowlisted command missing from main.rs: $expected"
    exit 1
  fi
done

echo "PASS: main.rs command definition allowlist checks passed."
