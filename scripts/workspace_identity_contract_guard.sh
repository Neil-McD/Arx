#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Workspace identity contract guard checks =="

echo "[1/5] Legacy path-only scope helper should be removed..."
if rg -n "fn workspace_scope_id_from_path" src-tauri/src/main.rs >/dev/null; then
  echo "FAIL: src-tauri/src/main.rs still defines workspace_scope_id_from_path"
  exit 1
fi

echo "[2/5] Runtime must compute scope via workspace_identity helper..."
if ! rg -n "workspace_identity::workspace_scope_id\\(" src-tauri/src/main.rs >/dev/null; then
  echo "FAIL: runtime does not use workspace_identity::workspace_scope_id"
  exit 1
fi

echo "[3/5] Runtime must attempt fingerprint resolution for thread scope..."
if ! rg -n "workspace_identity::resolve_thread_workspace_fingerprint\\(" src-tauri/src/main.rs >/dev/null; then
  echo "FAIL: runtime does not resolve thread workspace fingerprint"
  exit 1
fi

echo "[4/5] Thread workspace command must route scope through fingerprint-first helper..."
if ! rg -n "workspace_identity::workspace_scope_id\\(" src-tauri/src/commands/thread_metadata.rs >/dev/null; then
  echo "FAIL: set_thread_workspace_cmd is not using fingerprint-first scope helper"
  exit 1
fi

echo "[5/5] Thread workspace writes must persist workspace_fingerprint..."
if ! rg -n "workspace_path = \\?1, workspace_fingerprint = \\?2" src-tauri/src/db.rs >/dev/null; then
  echo "FAIL: set_thread_workspace_path does not persist workspace_fingerprint"
  exit 1
fi

echo "PASS: workspace identity contract guard checks passed."
