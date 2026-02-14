#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MAIN_FILE="src-tauri/src/main.rs"
MODULE_FILE="src-tauri/src/commands/message_settings.rs"
COMMANDS_MOD_FILE="src-tauri/src/commands/mod.rs"
INVOKE_FILE="src-tauri/src/invoke_registry.rs"

echo "== main.rs message/settings cluster boundary checks =="

echo "[1/6] commands module should expose message_settings..."
if ! grep -q "pub(crate) mod message_settings;" "$COMMANDS_MOD_FILE"; then
  echo "FAIL: commands/mod.rs missing message_settings module export"
  exit 1
fi

echo "[2/6] main.rs should not define extracted message/settings commands..."
for fn_name in \
  "add_message_cmd" \
  "list_messages_cmd" \
  "get_model_toggles_cmd" \
  "set_model_toggles_cmd" \
  "get_active_model_cmd" \
  "set_active_model_cmd" \
  "scan_publish_content_cmd" \
  "get_exec_policy_rules_cmd" \
  "get_system_prompt_cmd" \
  "get_approval_mode_cmd" \
  "detect_test_commands_cmd" \
  "set_exec_policy_rules_cmd" \
  "set_system_prompt_cmd" \
  "set_approval_mode_cmd" \
  "get_session_resume_cmd"
do
  if grep -q "fn ${fn_name}" "$MAIN_FILE"; then
    echo "FAIL: main.rs still defines $fn_name"
    exit 1
  fi
done

echo "[3/6] module file should define message/settings command handlers..."
if [[ ! -f "$MODULE_FILE" ]]; then
  echo "FAIL: message/settings command module missing: $MODULE_FILE"
  exit 1
fi
for fn_name in \
  "add_message_cmd" \
  "list_messages_cmd" \
  "get_model_toggles_cmd" \
  "set_model_toggles_cmd" \
  "get_active_model_cmd" \
  "set_active_model_cmd" \
  "scan_publish_content_cmd" \
  "get_exec_policy_rules_cmd" \
  "get_system_prompt_cmd" \
  "get_approval_mode_cmd" \
  "detect_test_commands_cmd" \
  "set_exec_policy_rules_cmd" \
  "set_system_prompt_cmd" \
  "set_approval_mode_cmd" \
  "get_session_resume_cmd"
do
  if ! grep -q "fn ${fn_name}" "$MODULE_FILE"; then
    echo "FAIL: message/settings module missing $fn_name"
    exit 1
  fi
done

echo "[4/6] message/settings module should own related helper structures..."
for marker in \
  "struct ModelToggle" \
  "fn default_model_toggles" \
  "struct SecretScanResult"
do
  if ! grep -q "$marker" "$MODULE_FILE"; then
    echo "FAIL: message/settings module missing helper marker: $marker"
    exit 1
  fi
done

echo "[5/6] invoke registry should route message/settings commands through module..."
for command_path in \
  "crate::commands::message_settings::add_message_cmd" \
  "crate::commands::message_settings::set_model_toggles_cmd" \
  "crate::commands::message_settings::scan_publish_content_cmd" \
  "crate::commands::message_settings::detect_test_commands_cmd" \
  "crate::commands::message_settings::set_exec_policy_rules_cmd" \
  "crate::commands::message_settings::get_session_resume_cmd"
do
  if ! grep -q "$command_path" "$INVOKE_FILE"; then
    echo "FAIL: invoke registry missing message/settings command path: $command_path"
    exit 1
  fi
done

echo "[6/6] main.rs should retain workspace path guard helper used by module..."
if ! grep -q "pub(crate) fn is_within_root" "$MAIN_FILE"; then
  echo "FAIL: main.rs is_within_root helper is not crate-visible for module reuse"
  exit 1
fi

echo "PASS: main.rs message/settings cluster boundary checks passed."
