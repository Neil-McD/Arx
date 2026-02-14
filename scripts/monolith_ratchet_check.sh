#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Monolith LOC ratchet =="

resolve_base_commit() {
  local override="${MONOLITH_BASE_REF:-}"
  local candidate=""

  if [[ -n "$override" ]] && git rev-parse --verify "$override" >/dev/null 2>&1; then
    candidate="$override"
  elif [[ -n "${GITHUB_BASE_REF:-}" ]] && git rev-parse --verify "origin/${GITHUB_BASE_REF}" >/dev/null 2>&1; then
    candidate="origin/${GITHUB_BASE_REF}"
  elif git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    candidate="HEAD~1"
  else
    return 1
  fi

  git merge-base HEAD "$candidate"
}

check_file() {
  local file_path="$1"
  local max_lines="$2"
  local base_commit="${3:-}"
  local current_lines
  local head_lines

  current_lines="$(wc -l < "$file_path" | tr -d ' ')"
  if git cat-file -e "HEAD:${file_path}" 2>/dev/null; then
    head_lines="$(git show "HEAD:${file_path}" | wc -l | tr -d ' ')"
  else
    echo "FAIL: $file_path is missing in HEAD."
    exit 1
  fi

  echo "Checking $file_path: current=$current_lines max=$max_lines"
  if (( current_lines > max_lines )); then
    echo "FAIL: $file_path exceeds LOC ratchet ($current_lines > $max_lines)"
    exit 1
  fi

  if [[ -z "$base_commit" ]]; then
    return
  fi

  if git diff --quiet "$base_commit...HEAD" -- "$file_path"; then
    return
  fi

  if ! git cat-file -e "${base_commit}:${file_path}" 2>/dev/null; then
    echo "FAIL: $file_path is new/renamed versus base ($base_commit); monolith files must shrink, not churn."
    exit 1
  fi

  local base_lines
  base_lines="$(git show "${base_commit}:${file_path}" | wc -l | tr -d ' ')"
  echo "Touched $file_path: base=$base_lines head=$head_lines"
  if (( head_lines >= base_lines )); then
    echo "FAIL: $file_path was touched and must net-shrink in this commit range ($head_lines >= $base_lines)."
    exit 1
  fi
}

# Ratchet baselines (captured on 2026-02-10 in MVP worktree).
MONOLITH_BASELINES=(
  "src/App.tsx|13508"
  "apps/web/src/App.tsx|14010"
  "src-tauri/src/main.rs|11018"
)

BASE_COMMIT=""
if BASE_COMMIT="$(resolve_base_commit)"; then
  echo "Diff base: $BASE_COMMIT"
else
  echo "WARN: unable to resolve base commit; touch-to-shrink checks skipped."
fi

for spec in "${MONOLITH_BASELINES[@]}"; do
  IFS="|" read -r file_path max_lines <<< "$spec"
  check_file "$file_path" "$max_lines" "$BASE_COMMIT"
done

echo "PASS: monolith LOC ratchet checks passed."
