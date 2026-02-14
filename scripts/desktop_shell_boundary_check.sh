#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_FILE="src/App.tsx"
SHELL_FILE="src/runtime/shell/tauriClient.ts"

if rg -n "\\binvoke\\s*\\(" "$APP_FILE" >/dev/null 2>&1; then
  echo "FAIL: $APP_FILE must not call invoke(...) directly."
  rg -n "\\binvoke\\s*\\(" "$APP_FILE"
  exit 1
fi

required_cmds=(
  "reset_local_db_cmd"
  "set_system_prompt_cmd"
  "set_model_toggles_cmd"
  "clear_chatgpt_auth_cmd"
  "set_supabase_session_cmd"
  "clear_supabase_session_cmd"
  "upsert_pending_invite_cmd"
  "dismiss_pending_invite_cmd"
  "request_join_pending_invite_cmd"
  "mark_pending_invite_joined_cmd"
  "mark_pending_invite_expired_cmd"
  "open_external_url_cmd"
  "start_native_voice_capture_cmd"
  "cancel_native_voice_capture_cmd"
  "stop_native_voice_capture_cmd"
)

for cmd in "${required_cmds[@]}"; do
  if ! rg -n "\"$cmd\"" "$SHELL_FILE" >/dev/null 2>&1; then
    echo "FAIL: missing shell adapter coverage for '$cmd' in $SHELL_FILE"
    exit 1
  fi
done

echo "PASS: desktop shell boundary check passed."
