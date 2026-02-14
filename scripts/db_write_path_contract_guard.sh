#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== DB write-path contract guard checks =="

echo "[1/4] Database module should not expose legacy add_message bypass..."
if rg -n "pub fn add_message\\(" src-tauri/src/db.rs >/dev/null; then
  echo "FAIL: src-tauri/src/db.rs still exposes pub fn add_message"
  exit 1
fi

echo "[2/4] Runtime/commands should not call crate::db::add_message..."
if rg -n "crate::db::add_message\\(" src-tauri/src >/dev/null; then
  echo "FAIL: runtime still calls crate::db::add_message bypass path"
  exit 1
fi

echo "[3/4] Message-settings command should route writes via append_event..."
if ! rg -n "append_event\\(" src-tauri/src/commands/message_settings.rs >/dev/null; then
  echo "FAIL: add_message_cmd is not routing through append_event"
  exit 1
fi

echo "[4/4] Runtime turn flow should use append-event helper for fallback writes..."
if ! rg -n "append_local_message_event\\(" src-tauri/src/commands/runtime_thread.rs >/dev/null; then
  echo "FAIL: runtime_thread submit flow missing append-event helper path"
  exit 1
fi

echo "PASS: db write-path contract guard checks passed."
