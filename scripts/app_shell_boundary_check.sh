#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== App shell boundary checks =="

count_occurrences() {
  local pattern="$1"
  local file_path="$2"
  (rg -o "$pattern" "$file_path" || true) | wc -l | tr -d ' '
}

count_lines() {
  local pattern="$1"
  local file_path="$2"
  (rg -n "$pattern" "$file_path" || true) | wc -l | tr -d ' '
}

check_occurrence_budget() {
  local label="$1"
  local pattern="$2"
  local file_path="$3"
  local max_count="$4"
  local current_count
  current_count="$(count_occurrences "$pattern" "$file_path")"
  echo "Checking $label: current=$current_count max=$max_count"
  if (( current_count > max_count )); then
    echo "FAIL: $label exceeds boundary budget ($current_count > $max_count)"
    exit 1
  fi
}

check_line_budget() {
  local label="$1"
  local pattern="$2"
  local file_path="$3"
  local max_count="$4"
  local current_count
  current_count="$(count_lines "$pattern" "$file_path")"
  echo "Checking $label: current=$current_count max=$max_count"
  if (( current_count > max_count )); then
    echo "FAIL: $label exceeds boundary budget ($current_count > $max_count)"
    exit 1
  fi
}

ENDPOINT_LITERAL_PATTERN='/functions/v1/[A-Za-z0-9_/-]+|/rest/v1/[A-Za-z0-9_/-]+'
FUNCTION_DECL_PATTERN='^[[:space:]]*(async[[:space:]]+)?function[[:space:]]+[A-Za-z0-9_]+'

# Transitional budgets captured on 2026-02-11 in MVP worktree.
# App shells are frozen at current counts; further reductions happen slice-by-slice.
check_occurrence_budget "desktop App endpoint literals" "$ENDPOINT_LITERAL_PATTERN" "src/App.tsx" 19
check_occurrence_budget "web App endpoint literals" "$ENDPOINT_LITERAL_PATTERN" "apps/web/src/App.tsx" 38
check_line_budget "desktop App function declarations" "$FUNCTION_DECL_PATTERN" "src/App.tsx" 144
check_line_budget "web App function declarations" "$FUNCTION_DECL_PATTERN" "apps/web/src/App.tsx" 109

echo "PASS: app shell boundary checks passed."
