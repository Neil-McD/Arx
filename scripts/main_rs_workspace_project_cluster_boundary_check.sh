#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MAIN_FILE="src-tauri/src/main.rs"
MODULE_FILE="src-tauri/src/commands/workspace_project.rs"
COMMANDS_MOD_FILE="src-tauri/src/commands/mod.rs"
INVOKE_FILE="src-tauri/src/invoke_registry.rs"

echo "== main.rs workspace/project cluster boundary checks =="

echo "[1/6] commands module should expose workspace_project..."
if ! grep -q "pub(crate) mod workspace_project;" "$COMMANDS_MOD_FILE"; then
  echo "FAIL: commands/mod.rs missing workspace_project module export"
  exit 1
fi

echo "[2/6] main.rs should not define extracted workspace/project commands..."
for fn_name in \
  "get_workspace_root_cmd" \
  "is_path_within_workspace_cmd" \
  "set_active_project_cmd" \
  "get_active_project_cmd" \
  "list_projects_cmd" \
  "create_project_cmd" \
  "delete_project_cmd" \
  "update_project_name_cmd"
do
  if grep -q "fn ${fn_name}" "$MAIN_FILE"; then
    echo "FAIL: main.rs still defines $fn_name"
    exit 1
  fi
done

echo "[3/6] module file should define workspace/project command handlers..."
if [[ ! -f "$MODULE_FILE" ]]; then
  echo "FAIL: workspace project module missing: $MODULE_FILE"
  exit 1
fi
for fn_name in \
  "get_workspace_root_cmd" \
  "is_path_within_workspace_cmd" \
  "set_active_project_cmd" \
  "get_active_project_cmd" \
  "list_projects_cmd" \
  "create_project_cmd" \
  "delete_project_cmd" \
  "update_project_name_cmd"
do
  if ! grep -q "fn ${fn_name}" "$MODULE_FILE"; then
    echo "FAIL: workspace project module missing $fn_name"
    exit 1
  fi
done

echo "[4/6] module should own project identity helper pipeline..."
for marker in \
  "struct ProjectIdentity" \
  "fn run_git" \
  "fn normalize_git_remote" \
  "fn compute_project_identity"
do
  if ! grep -q "$marker" "$MODULE_FILE"; then
    echo "FAIL: workspace project module missing helper marker: $marker"
    exit 1
  fi
done

echo "[5/6] invoke registry should route workspace/project commands through module..."
for command_path in \
  "crate::commands::workspace_project::get_workspace_root_cmd" \
  "crate::commands::workspace_project::is_path_within_workspace_cmd" \
  "crate::commands::workspace_project::set_active_project_cmd" \
  "crate::commands::workspace_project::get_active_project_cmd" \
  "crate::commands::workspace_project::list_projects_cmd" \
  "crate::commands::workspace_project::create_project_cmd" \
  "crate::commands::workspace_project::delete_project_cmd" \
  "crate::commands::workspace_project::update_project_name_cmd"
do
  if ! grep -q "$command_path" "$INVOKE_FILE"; then
    echo "FAIL: invoke registry missing workspace/project command path: $command_path"
    exit 1
  fi
done

echo "[6/6] shared root-resolution helpers should remain callable from module..."
if ! grep -q "pub(crate) fn is_within_root" "$MAIN_FILE"; then
  echo "FAIL: main.rs is_within_root helper is not crate-visible for module reuse"
  exit 1
fi
if ! grep -q "pub(crate) fn resolve_path_under_root" "$MAIN_FILE"; then
  echo "FAIL: main.rs resolve_path_under_root helper is not crate-visible for module reuse"
  exit 1
fi

echo "PASS: main.rs workspace/project cluster boundary checks passed."
