#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== App hook budget checks =="

count_pattern() {
  local file_path="$1"
  local pattern="$2"
  rg -o "$pattern" "$file_path" | wc -l | tr -d ' '
}

check_hook_budget() {
  local file_path="$1"
  local hook_name="$2"
  local pattern="$3"
  local max_count="$4"
  local current_count
  current_count="$(count_pattern "$file_path" "$pattern")"
  echo "Checking $file_path $hook_name: current=$current_count max=$max_count"
  if (( current_count > max_count )); then
    echo "FAIL: $file_path $hook_name exceeds budget ($current_count > $max_count)"
    exit 1
  fi
}

# Baselines captured on 2026-02-11 in MVP worktree.
# App shells are frozen at current hook counts; extra behavior must be extracted
# into controllers/shared modules instead of adding new hooks in shell files.
check_hook_budget "src/App.tsx" "useState" "\\buseState\\(" 116
check_hook_budget "src/App.tsx" "useEffect" "\\buseEffect\\(" 65
check_hook_budget "apps/web/src/App.tsx" "useState" "\\buseState\\(" 134
check_hook_budget "apps/web/src/App.tsx" "useEffect" "\\buseEffect\\(" 79

echo "PASS: app hook budget checks passed."
