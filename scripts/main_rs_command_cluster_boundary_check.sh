#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MAIN_FILE="src-tauri/src/main.rs"
AUTH_FILE="src-tauri/src/commands/auth_invite.rs"
VOICE_FILE="src-tauri/src/commands/voice_capture.rs"
INVOKE_FILE="src-tauri/src/invoke_registry.rs"

echo "== main.rs command-cluster boundary checks =="

echo "[1/7] main.rs should declare commands module..."
if ! grep -q "^mod commands;" "$MAIN_FILE"; then
  echo "FAIL: main.rs is missing 'mod commands;' declaration"
  exit 1
fi

echo "[2/7] main.rs should not define extracted auth/invite command handlers..."
for fn_name in \
  "get_chatgpt_auth_summary_cmd" \
  "clear_chatgpt_auth_cmd" \
  "chatgpt_login_cmd" \
  "get_supabase_session_cmd" \
  "set_supabase_session_cmd" \
  "clear_supabase_session_cmd" \
  "open_external_url_cmd" \
  "list_pending_invites_cmd" \
  "upsert_pending_invite_cmd" \
  "dismiss_pending_invite_cmd" \
  "request_join_pending_invite_cmd" \
  "mark_pending_invite_joined_cmd" \
  "mark_pending_invite_expired_cmd"
do
  if grep -q "fn ${fn_name}" "$MAIN_FILE"; then
    echo "FAIL: main.rs still defines $fn_name"
    exit 1
  fi
done

echo "[3/7] main.rs should not define extracted voice command handlers..."
for fn_name in \
  "start_native_voice_capture_cmd" \
  "stop_native_voice_capture_cmd" \
  "cancel_native_voice_capture_cmd"
do
  if grep -q "fn ${fn_name}" "$MAIN_FILE"; then
    echo "FAIL: main.rs still defines $fn_name"
    exit 1
  fi
done

echo "[4/7] auth/invite command module should exist and expose command handlers..."
if [[ ! -f "$AUTH_FILE" ]]; then
  echo "FAIL: auth/invite command module missing: $AUTH_FILE"
  exit 1
fi
for fn_name in \
  "get_chatgpt_auth_summary_cmd" \
  "clear_chatgpt_auth_cmd" \
  "chatgpt_login_cmd" \
  "get_supabase_session_cmd" \
  "set_supabase_session_cmd" \
  "clear_supabase_session_cmd" \
  "open_external_url_cmd" \
  "list_pending_invites_cmd" \
  "upsert_pending_invite_cmd" \
  "dismiss_pending_invite_cmd" \
  "request_join_pending_invite_cmd" \
  "mark_pending_invite_joined_cmd" \
  "mark_pending_invite_expired_cmd"
do
  if ! grep -q "fn ${fn_name}" "$AUTH_FILE"; then
    echo "FAIL: auth/invite command module missing $fn_name"
    exit 1
  fi
done

echo "[5/7] auth/invite module should own invite persistence helpers..."
for marker in \
  "UI_STATE_PENDING_INVITES_V1" \
  "PendingInviteRecord" \
  "load_pending_invites" \
  "save_pending_invites" \
  "normalize_invite_key"
do
  if ! grep -q "$marker" "$AUTH_FILE"; then
    echo "FAIL: auth/invite module missing helper marker: $marker"
    exit 1
  fi
done

echo "[6/7] voice command module should exist and expose command handlers..."
if [[ ! -f "$VOICE_FILE" ]]; then
  echo "FAIL: voice command module missing: $VOICE_FILE"
  exit 1
fi
for fn_name in \
  "start_native_voice_capture_cmd" \
  "stop_native_voice_capture_cmd" \
  "cancel_native_voice_capture_cmd"
do
  if ! grep -q "fn ${fn_name}" "$VOICE_FILE"; then
    echo "FAIL: voice command module missing $fn_name"
    exit 1
  fi
done

echo "[7/7] invoke registry should route extracted commands through command modules..."
for command_path in \
  "crate::commands::auth_invite::get_chatgpt_auth_summary_cmd" \
  "crate::commands::auth_invite::get_supabase_session_cmd" \
  "crate::commands::auth_invite::list_pending_invites_cmd" \
  "crate::commands::voice_capture::start_native_voice_capture_cmd"
do
  if ! grep -q "$command_path" "$INVOKE_FILE"; then
    echo "FAIL: invoke registry missing routed command path: $command_path"
    exit 1
  fi
done

echo "PASS: main.rs command-cluster boundary checks passed."
