#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGETS=(convex apps shared scripts docs package.json)
EXCLUDES=(
  --glob '!scripts/no_legacy_community_policy_mirrors_guard.sh'
  --glob '!docs/archive/**'
  --glob '!docs/product/generated/**'
  --glob '!docs/product/llms*.txt'
)

FORBIDDEN_PATTERNS=(
  'joinMode'
  'freeJoinRequiresApproval'
)

failed=0
for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  if rg -n -S "$pattern" "${TARGETS[@]}" "${EXCLUDES[@]}"; then
    echo "Forbidden legacy community policy mirror found: $pattern" >&2
    failed=1
  fi
done

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo "PASS: no legacy community policy mirrors found in active paths."
