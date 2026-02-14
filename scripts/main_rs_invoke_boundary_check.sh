#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MAIN_FILE="src-tauri/src/main.rs"
INVOKE_FILE="src-tauri/src/invoke_registry.rs"

echo "== main.rs invoke boundary checks =="

echo "[1/6] main.rs should declare invoke registry module..."
if ! grep -q "^mod invoke_registry;" "$MAIN_FILE"; then
  echo "FAIL: main.rs is missing 'mod invoke_registry;' declaration"
  exit 1
fi

echo "[2/6] main.rs should delegate invoke_handler to invoke_registry::build_handler..."
if ! grep -q "\.invoke_handler(invoke_registry::build_handler())" "$MAIN_FILE"; then
  echo "FAIL: main.rs is not delegating invoke_handler to invoke_registry::build_handler"
  exit 1
fi

echo "[3/6] main.rs should not keep inline generate_handler list..."
if grep -q "tauri::generate_handler!\\[" "$MAIN_FILE"; then
  echo "FAIL: main.rs still contains inline tauri::generate_handler![...]"
  exit 1
fi

echo "[4/6] invoke registry file should exist and export build_handler..."
if [[ ! -f "$INVOKE_FILE" ]]; then
  echo "FAIL: invoke registry file is missing: $INVOKE_FILE"
  exit 1
fi
if ! grep -q "pub(crate) fn build_handler" "$INVOKE_FILE"; then
  echo "FAIL: invoke registry is missing build_handler export"
  exit 1
fi

echo "[5/6] invoke registry should own generate_handler list..."
if ! grep -q "tauri::generate_handler!\\[" "$INVOKE_FILE"; then
  echo "FAIL: invoke registry is missing tauri::generate_handler![...] list"
  exit 1
fi

echo "[6/6] invoke registry should retain key command domains..."
for command in \
  "crate::commands::runtime_thread::initialize_cmd" \
  "crate::commands::runtime_thread::submit_turn_cmd" \
  "crate::commands::auth_invite::get_supabase_session_cmd" \
  "crate::commands::auth_invite::list_pending_invites_cmd" \
  "crate::commands::auth_invite::mark_pending_invite_expired_cmd" \
  "crate::commands::workspace_project::set_active_project_cmd" \
  "crate::commands::message_settings::set_active_model_cmd" \
  "crate::commands::attachment::ingest_attachment_cmd" \
  "crate::commands::voice_capture::start_native_voice_capture_cmd" \
  "crate::commands::thread_metadata::set_thread_context_cmd"
do
  if ! grep -q "$command" "$INVOKE_FILE"; then
    echo "FAIL: invoke registry missing expected command: $command"
    exit 1
  fi
done

echo "PASS: main.rs invoke boundary checks passed."
