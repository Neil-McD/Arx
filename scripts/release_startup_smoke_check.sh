#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MAIN_FILE="src-tauri/src/main.rs"
STARTUP_FILE="src-tauri/src/startup.rs"

echo "== Release startup smoke checks =="

echo "[1/3] Startup must resolve DB key via shared resolver..."
if ! grep -q "let key = db::resolve_db_key()?;" "$STARTUP_FILE"; then
  echo "FAIL: startup is not using db::resolve_db_key()"
  exit 1
fi

echo "[2/3] Startup should run blob GC asynchronously (not inline blocking sweep)..."
if ! grep -q "spawn_default_blob_gc" "$STARTUP_FILE"; then
  echo "FAIL: startup is not scheduling default blob GC"
  exit 1
fi
if grep -q "sweep_orphan_blobs" "$MAIN_FILE" || grep -q "sweep_orphan_blobs" "$STARTUP_FILE"; then
  echo "FAIL: startup still calls sweep_orphan_blobs synchronously"
  exit 1
fi

echo "[3/3] Release-profile startup bootstrap test..."
(cd src-tauri && cargo test --release -q release_startup_bootstrap_succeeds_with_explicit_db_key)

echo "PASS: release startup smoke checks passed."
