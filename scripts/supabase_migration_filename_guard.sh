#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/supabase/migrations"

echo "== Supabase migration filename guard =="

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "FAIL: migrations directory missing: $MIGRATIONS_DIR"
  exit 1
fi

FILES="$(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name "*.sql" -print | sort)"
if [[ -z "$FILES" ]]; then
  echo "FAIL: no SQL migration files found in $MIGRATIONS_DIR"
  exit 1
fi

PREV_ID=""
COUNT=0

while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  COUNT=$((COUNT + 1))
  file="$(basename "$path")"
  if [[ ! "$file" =~ ^([0-9]{14})_.+\.sql$ ]]; then
    echo "FAIL: invalid migration filename (expected 14-digit timestamp prefix): $file"
    exit 1
  fi
  migration_id="${BASH_REMATCH[1]}"
  if [[ -n "$PREV_ID" && "$migration_id" == "$PREV_ID" ]]; then
    echo "FAIL: duplicate migration timestamp prefix detected: $migration_id"
    exit 1
  fi
  if [[ -n "$PREV_ID" && "$migration_id" < "$PREV_ID" ]]; then
    echo "FAIL: non-monotonic migration id ordering: $migration_id after $PREV_ID"
    exit 1
  fi
  PREV_ID="$migration_id"
done <<< "$FILES"

echo "PASS: migration filenames are valid, unique, and monotonic ($COUNT files)."
