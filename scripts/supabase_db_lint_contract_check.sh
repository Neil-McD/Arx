#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Supabase DB lint contract check =="

if ! command -v supabase >/dev/null 2>&1; then
  echo "FAIL: supabase CLI is not installed."
  exit 1
fi

LINT_OUTPUT="$(supabase db lint --workdir "$ROOT_DIR" 2>&1)"
echo "$LINT_OUTPUT"

if grep -F -q '"level": "error"' <<<"$LINT_OUTPUT"; then
  echo "FAIL: supabase db lint reported schema errors."
  exit 1
fi

if ! grep -F -q "No schema errors found" <<<"$LINT_OUTPUT"; then
  echo "FAIL: supabase db lint did not confirm a clean schema."
  exit 1
fi

echo "PASS: supabase db lint contract check passed."
