#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MAIN_FILE="src-tauri/src/main.rs"
MODULE_FILE="src-tauri/src/commands/runtime_thread.rs"
COMMANDS_MOD_FILE="src-tauri/src/commands/mod.rs"
INVOKE_FILE="src-tauri/src/invoke_registry.rs"

echo "== main.rs runtime/thread cluster boundary checks =="

echo "[1/6] commands module should expose runtime_thread..."
if ! grep -q "pub(crate) mod runtime_thread;" "$COMMANDS_MOD_FILE"; then
  echo "FAIL: commands/mod.rs missing runtime_thread module export"
  exit 1
fi

echo "[2/6] main.rs should not define extracted runtime/thread commands..."
for fn_name in \
  "initialize_cmd" \
  "get_agent_mode_cmd" \
  "set_agent_mode_cmd" \
  "decide_tool_call_cmd" \
  "cancel_run_cmd" \
  "submit_turn_cmd" \
  "create_thread_cmd" \
  "upsert_thread_cmd" \
  "list_threads_cmd" \
  "get_thread_cmd" \
  "list_events_cmd" \
  "list_events_since_cmd" \
  "list_tool_calls_cmd" \
  "get_event_cmd" \
  "list_turns_cmd" \
  "reset_local_db_cmd" \
  "delete_thread_cmd"
do
  if grep -q "fn ${fn_name}" "$MAIN_FILE"; then
    echo "FAIL: main.rs still defines $fn_name"
    exit 1
  fi
done

echo "[3/6] module file should define runtime/thread command handlers..."
if [[ ! -f "$MODULE_FILE" ]]; then
  echo "FAIL: runtime/thread command module missing: $MODULE_FILE"
  exit 1
fi
for fn_name in \
  "initialize_cmd" \
  "get_agent_mode_cmd" \
  "set_agent_mode_cmd" \
  "decide_tool_call_cmd" \
  "cancel_run_cmd" \
  "submit_turn_cmd" \
  "create_thread_cmd" \
  "upsert_thread_cmd" \
  "list_threads_cmd" \
  "get_thread_cmd" \
  "list_events_cmd" \
  "list_events_since_cmd" \
  "list_tool_calls_cmd" \
  "get_event_cmd" \
  "list_turns_cmd" \
  "reset_local_db_cmd" \
  "delete_thread_cmd"
do
  if ! grep -q "fn ${fn_name}" "$MODULE_FILE"; then
    echo "FAIL: runtime/thread module missing $fn_name"
    exit 1
  fi
done

echo "[4/6] runtime/thread module should delegate run orchestration through core helpers..."
for marker in \
  "crate::lock_thread_run" \
  "crate::CancelRegistration::register" \
  "crate::send_turn_cmd_core" \
  "crate::normalize_agent_mode"
do
  if ! grep -q "$marker" "$MODULE_FILE"; then
    echo "FAIL: runtime/thread module missing helper delegation marker: $marker"
    exit 1
  fi
done

echo "[5/6] invoke registry should route runtime/thread commands through module..."
for command_path in \
  "crate::commands::runtime_thread::initialize_cmd" \
  "crate::commands::runtime_thread::submit_turn_cmd" \
  "crate::commands::runtime_thread::create_thread_cmd" \
  "crate::commands::runtime_thread::list_threads_cmd" \
  "crate::commands::runtime_thread::list_events_since_cmd" \
  "crate::commands::runtime_thread::cancel_run_cmd"
do
  if ! grep -q "$command_path" "$INVOKE_FILE"; then
    echo "FAIL: invoke registry missing runtime/thread command path: $command_path"
    exit 1
  fi
done

echo "[6/6] main.rs should retain shared run-loop helpers used by the module..."
for marker in \
  "async fn send_turn_cmd_core" \
  "fn normalize_agent_mode"
do
  if ! grep -q "$marker" "$MAIN_FILE"; then
    echo "FAIL: main.rs missing expected shared helper: $marker"
    exit 1
  fi
done

echo "PASS: main.rs runtime/thread cluster boundary checks passed."
