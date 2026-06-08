#!/usr/bin/env bash
set -euo pipefail

EXPECTED_ROOT="/Users/neilmcdevitt/code/arx-codex-blaxel-staging"
EXPECTED_BRANCH="codex/blaxel-staging-active-20260608"
FORBIDDEN_ROOT="/Users/neilmcdevitt/code/arx"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
BRANCH="$(git branch --show-current 2>/dev/null || true)"

if [[ -z "$ROOT" ]]; then
  echo "FAIL: not inside a git worktree." >&2
  exit 1
fi

if [[ "$ROOT" == "$FORBIDDEN_ROOT" ]]; then
  echo "FAIL: Blaxel staging work must not run from $FORBIDDEN_ROOT." >&2
  echo "Use $EXPECTED_ROOT instead." >&2
  exit 1
fi

if [[ "$ROOT" != "$EXPECTED_ROOT" ]]; then
  echo "FAIL: wrong Blaxel staging worktree." >&2
  echo "Expected: $EXPECTED_ROOT" >&2
  echo "Actual:   $ROOT" >&2
  exit 1
fi

if [[ "$BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "FAIL: wrong Blaxel staging branch." >&2
  echo "Expected: $EXPECTED_BRANCH" >&2
  echo "Actual:   ${BRANCH:-detached HEAD}" >&2
  exit 1
fi

echo "PASS: Blaxel staging worktree is correct."
