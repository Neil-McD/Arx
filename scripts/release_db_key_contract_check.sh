#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DB_FILE="src-tauri/src/db.rs"
MAIN_FILE="src-tauri/src/main.rs"
STARTUP_FILE="src-tauri/src/startup.rs"

echo "== Release DB key contract checks =="

echo "[1/5] Startup must resolve DB key through shared resolver..."
if ! grep -q "let key = db::resolve_db_key()?;" "$STARTUP_FILE"; then
  echo "FAIL: startup is not using db::resolve_db_key()"
  exit 1
fi

echo "[2/5] Startup bootstrap must not contain inline dev fallback key..."
if grep -q "dev-only-key" "$MAIN_FILE" || grep -q "dev-only-key" "$STARTUP_FILE"; then
  echo "FAIL: startup bootstrap still contains inline dev-only-key fallback"
  exit 1
fi

echo "[3/5] Resolver must enforce non-debug key requirement..."
if ! grep -q "ARX_DB_KEY is required for non-debug runtime" "$DB_FILE"; then
  echo "FAIL: resolve_db_key contract message missing non-debug requirement"
  exit 1
fi

echo "[4/5] Contract unit tests (debug profile)..."
(cd src-tauri && cargo test -q resolve_db_key_for_release_requires_non_empty_env_value)
(cd src-tauri && cargo test -q resolve_db_key_for_release_accepts_configured_env_value)

echo "[5/5] Contract unit test (release profile)..."
(cd src-tauri && cargo test --release -q resolve_db_key_for_release_accepts_configured_env_value)

echo "PASS: release DB key contract checks passed."
