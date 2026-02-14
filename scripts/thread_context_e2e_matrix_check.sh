#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
WEB_APP_FILE="apps/web/src/App.tsx"
WEB_SEND_FLOW_FILE="shared/useWebSendFlowController.ts"
SEND_FLOW_FILE="src/features/harness/sendTurn.ts"
RUNTIME_FILE="src-tauri/src/main.rs"

echo "== Thread context E2E matrix checks =="

echo "[1/6] Desktop thread selection must sync active community from selected thread..."
if ! grep -q "const handleSelectThreadFromSidebar = (thread: ThreadRecord) =>" "$DESKTOP_APP_FILE"; then
  echo "FAIL: missing desktop thread selection handler"
  exit 1
fi
if ! grep -q "setActiveCommunityId(thread.community_id ?? null);" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop thread selection does not set active community from thread lens"
  exit 1
fi

echo "[2/6] Web thread selection must use a shared helper across grouped/search lists..."
if ! grep -q "const selectWorkspaceThread = (thread: ThreadRecord): void =>" "$WEB_APP_FILE"; then
  echo "FAIL: missing web thread selection helper"
  exit 1
fi
if [[ "$(grep -c "selectWorkspaceThread(thread);" "$WEB_APP_FILE")" -lt 2 ]]; then
  echo "FAIL: web thread list handlers are not consistently routed through selectWorkspaceThread"
  exit 1
fi

echo "[3/6] Send flows must enforce preflight lens sync before dispatch..."
if ! grep -q "await deps.ensureWorkspaceThreadLensBeforeSend(threadId);" "$SEND_FLOW_FILE"; then
  echo "FAIL: desktop send flow missing preflight lens enforcement"
  exit 1
fi
if ! grep -q "ensureWorkspaceThreadLensBeforeSend," "$WEB_APP_FILE"; then
  echo "FAIL: web app is not wiring ensureWorkspaceThreadLensBeforeSend into send flow controller"
  exit 1
fi
if ! grep -q "await current.ensureWorkspaceThreadLensBeforeSend(threadId, session);" "$WEB_SEND_FLOW_FILE"; then
  echo "FAIL: web send flow missing preflight lens enforcement"
  exit 1
fi

echo "[4/6] Runtime must expose run-start context snapshot coverage..."
if ! grep -q "run_started_payload_includes_thread_context_snapshot_fields" "$RUNTIME_FILE"; then
  echo "FAIL: missing run_started payload context coverage test"
  exit 1
fi
if ! grep -q "run_started_payload_uses_immutable_thread_context_snapshot" "$RUNTIME_FILE"; then
  echo "FAIL: missing immutable run snapshot test"
  exit 1
fi
if ! grep -q "next_run_snapshot_reflects_new_lens_after_context_switch" "$RUNTIME_FILE"; then
  echo "FAIL: missing next-run lens snapshot transition test"
  exit 1
fi
if ! grep -q "cancelled_run_then_lens_retarget_uses_new_lens_on_next_run_snapshot" "$RUNTIME_FILE"; then
  echo "FAIL: missing cancelled-run retarget snapshot transition test"
  exit 1
fi

echo "[5/6] Cloud lens provenance regression checks..."
bash scripts/cloud_lens_provenance_regression_check.sh

echo "[6/6] Context isolation and run snapshot tests..."
(cd src-tauri && cargo test -q set_thread_context_updates_do_not_bleed_across_threads)
(cd src-tauri && cargo test -q set_thread_context_project_patch_preserves_community_lens)
(cd src-tauri && cargo test -q run_started_payload_includes_thread_context_snapshot_fields)
(cd src-tauri && cargo test -q run_started_payload_uses_immutable_thread_context_snapshot)
(cd src-tauri && cargo test -q next_run_snapshot_reflects_new_lens_after_context_switch)
(cd src-tauri && cargo test -q cancelled_run_then_lens_retarget_uses_new_lens_on_next_run_snapshot)

echo "PASS: thread context E2E matrix checks passed."
