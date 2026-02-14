#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DB_FILE="src-tauri/src/db.rs"
MAIN_FILE="src-tauri/src/main.rs"
STARTUP_FILE="src-tauri/src/startup.rs"

echo "== Release startup missing-key checks =="

echo "[1/3] Non-debug key requirement message must exist..."
if ! grep -q "ARX_DB_KEY is required for non-debug runtime" "$DB_FILE"; then
  echo "FAIL: non-debug key requirement message missing in resolver"
  exit 1
fi

echo "[2/3] Startup bootstrap must not contain inline dev fallback key..."
if grep -q "dev-only-key" "$MAIN_FILE" || grep -q "dev-only-key" "$STARTUP_FILE"; then
  echo "FAIL: startup bootstrap still contains inline dev-only-key fallback"
  exit 1
fi

echo "[3/3] Release-profile missing-key startup test..."
(cd src-tauri && cargo test --release -q release_startup_bootstrap_rejects_missing_db_key)

echo "PASS: release startup missing-key checks passed."
