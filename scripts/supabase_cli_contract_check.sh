#!/usr/bin/env bash
set -euo pipefail

echo "== Supabase CLI contract checks =="

REQUIRED_PREFIX="${SUPABASE_CLI_REQUIRED_PREFIX:-2.51.}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "FAIL: supabase CLI is not installed."
  echo "Install the pinned major/minor line (${REQUIRED_PREFIX}x) and retry."
  exit 1
fi

ACTUAL_VERSION="$(supabase --version 2>/dev/null | head -n1 | awk '{print $1}')"
if [[ -z "$ACTUAL_VERSION" ]]; then
  echo "FAIL: unable to read supabase CLI version."
  exit 1
fi

if [[ "$ACTUAL_VERSION" != ${REQUIRED_PREFIX}* ]]; then
  echo "FAIL: supabase CLI version mismatch."
  echo "Expected prefix: ${REQUIRED_PREFIX}x"
  echo "Actual: $ACTUAL_VERSION"
  echo "If you intentionally bump, update SUPABASE_CLI_REQUIRED_PREFIX and docs in the same change."
  exit 1
fi

echo "PASS: supabase CLI version contract satisfied ($ACTUAL_VERSION)."
