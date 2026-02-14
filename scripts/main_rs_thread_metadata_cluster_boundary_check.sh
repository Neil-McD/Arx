#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MAIN_FILE="src-tauri/src/main.rs"
MODULE_FILE="src-tauri/src/commands/thread_metadata.rs"
COMMANDS_MOD_FILE="src-tauri/src/commands/mod.rs"
INVOKE_FILE="src-tauri/src/invoke_registry.rs"

echo "== main.rs thread-metadata cluster boundary checks =="

echo "[1/6] commands module should expose thread_metadata..."
if ! grep -q "pub(crate) mod thread_metadata;" "$COMMANDS_MOD_FILE"; then
  echo "FAIL: commands/mod.rs missing thread_metadata module export"
  exit 1
fi

echo "[2/6] main.rs should not define extracted thread-metadata commands..."
for fn_name in \
  "set_thread_workspace_cmd" \
  "set_thread_context_cmd" \
  "set_thread_engine_cmd" \
  "set_thread_title_cmd"
do
  if grep -q "fn ${fn_name}" "$MAIN_FILE"; then
    echo "FAIL: main.rs still defines $fn_name"
    exit 1
  fi
done

echo "[3/6] module file should define thread-metadata command handlers..."
if [[ ! -f "$MODULE_FILE" ]]; then
  echo "FAIL: thread-metadata command module missing: $MODULE_FILE"
  exit 1
fi
for fn_name in \
  "set_thread_workspace_cmd" \
  "set_thread_context_cmd" \
  "set_thread_engine_cmd" \
  "set_thread_title_cmd"
do
  if ! grep -q "fn ${fn_name}" "$MODULE_FILE"; then
    echo "FAIL: thread-metadata module missing $fn_name"
    exit 1
  fi
done

echo "[4/6] invoke registry should route thread-metadata commands through module..."
for command_path in \
  "crate::commands::thread_metadata::set_thread_workspace_cmd" \
  "crate::commands::thread_metadata::set_thread_title_cmd" \
  "crate::commands::thread_metadata::set_thread_context_cmd" \
  "crate::commands::thread_metadata::set_thread_engine_cmd"
do
  if ! grep -q "$command_path" "$INVOKE_FILE"; then
    echo "FAIL: invoke registry missing thread-metadata command path: $command_path"
    exit 1
  fi
done

echo "[5/6] thread-metadata module should delegate shared tracing helper..."
if ! grep -q "crate::emit_thread_context_trace" "$MODULE_FILE"; then
  echo "FAIL: thread-metadata module missing shared trace helper delegation"
  exit 1
fi

echo "[6/6] main.rs should keep trace helper crate-visible for module reuse..."
if ! grep -q "pub(crate) fn emit_thread_context_trace" "$MAIN_FILE"; then
  echo "FAIL: main.rs emit_thread_context_trace helper is not crate-visible"
  exit 1
fi

echo "PASS: main.rs thread-metadata cluster boundary checks passed."
