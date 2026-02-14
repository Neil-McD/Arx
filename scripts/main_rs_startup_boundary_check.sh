#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MAIN_FILE="src-tauri/src/main.rs"
STARTUP_FILE="src-tauri/src/startup.rs"

echo "== main.rs startup boundary checks =="

echo "[1/7] main.rs should declare startup module..."
if ! grep -q "^mod startup;" "$MAIN_FILE"; then
  echo "FAIL: main.rs is missing 'mod startup;' declaration"
  exit 1
fi

echo "[2/7] Tauri setup should delegate to startup::setup_app..."
if ! grep -q "\.setup(|app| startup::setup_app(app))" "$MAIN_FILE"; then
  echo "FAIL: main.rs setup is not delegated to startup::setup_app"
  exit 1
fi

echo "[3/7] main.rs should not inline startup DB bootstrap details..."
if grep -q "let key = db::resolve_db_key()?;" "$MAIN_FILE"; then
  echo "FAIL: main.rs still resolves db key inline in setup path"
  exit 1
fi
if grep -q "spawn_default_blob_gc" "$MAIN_FILE"; then
  echo "FAIL: main.rs still schedules blob GC inline in setup path"
  exit 1
fi

echo "[4/7] startup.rs should exist and export setup_app..."
if [[ ! -f "$STARTUP_FILE" ]]; then
  echo "FAIL: startup.rs does not exist"
  exit 1
fi
if ! grep -q "pub fn setup_app" "$STARTUP_FILE"; then
  echo "FAIL: startup.rs missing setup_app export"
  exit 1
fi

echo "[5/7] startup.rs should keep resolver + GC bootstrap..."
if ! grep -q "let key = db::resolve_db_key()?;" "$STARTUP_FILE"; then
  echo "FAIL: startup.rs is not resolving ARX_DB_KEY via db::resolve_db_key"
  exit 1
fi
if ! grep -q "spawn_default_blob_gc" "$STARTUP_FILE"; then
  echo "FAIL: startup.rs is not scheduling default blob GC"
  exit 1
fi

echo "[6/7] startup.rs should keep DB recovery retry semantics..."
if ! grep -q "for attempt in 0..2" "$STARTUP_FILE"; then
  echo "FAIL: startup.rs missing retry-once DB bootstrap loop"
  exit 1
fi
if ! grep -q "backup_db_files" "$STARTUP_FILE"; then
  echo "FAIL: startup.rs missing DB backup-on-failure path"
  exit 1
fi

echo "[7/7] startup.rs should still manage DB state and native voice manager..."
if ! grep -q "app.manage(state);" "$STARTUP_FILE"; then
  echo "FAIL: startup.rs missing app.manage(state)"
  exit 1
fi
if ! grep -q "NativeVoiceCaptureManager::default()" "$STARTUP_FILE"; then
  echo "FAIL: startup.rs missing native voice manager registration"
  exit 1
fi

echo "PASS: main.rs startup boundary checks passed."
