#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== main.rs budget checks =="

MAIN_FILE="src-tauri/src/main.rs"

count_matches() {
  local pattern="$1"
  (rg -n "$pattern" "$MAIN_FILE" || true) | wc -l | tr -d ' '
}

check_budget() {
  local label="$1"
  local pattern="$2"
  local max_count="$3"
  local current_count
  current_count="$(count_matches "$pattern")"
  echo "Checking $label: current=$current_count max=$max_count"
  if (( current_count > max_count )); then
    echo "FAIL: $label exceeds budget ($current_count > $max_count)"
    exit 1
  fi
}

# Baselines captured on 2026-02-10 in MVP worktree.
check_budget "tauri command count" "^\\s*#\\[tauri::command\\]" 0
check_budget "main.rs test gate count" "^\\s*#\\[cfg\\(test\\)\\]" 11

echo "PASS: main.rs budget checks passed."
