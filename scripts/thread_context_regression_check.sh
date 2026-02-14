#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
WEB_APP_FILE="apps/web/src/App.tsx"
CLIENT_FILE="src/runtime/arp/tauriClient.ts"
CLOUD_SYNC_HELPER_FILE="shared/threadContextCloudSync.ts"
DESKTOP_CLOUD_LENS_SYNC_FILE="src/services/thread/createDesktopCloudLensSync.ts"
DESKTOP_THREAD_TITLE_VM_FILE="src/controllers/desktop/useDesktopThreadTitleViewModel.ts"

echo "== Thread context regression checks =="

echo "[1/7] Desktop must route lens updates through shared sync helper..."
if ! grep -q "const syncWorkspaceThreadCommunityLens = (" "$DESKTOP_APP_FILE"; then
  echo "FAIL: missing desktop shared lens sync helper in $DESKTOP_APP_FILE"
  exit 1
fi
if ! grep -q "desktopThreadContextController.ensureLensBeforeSend(threadId);" "$DESKTOP_APP_FILE"; then
  echo "FAIL: send preflight is not routed through desktop thread-context controller in $DESKTOP_APP_FILE"
  exit 1
fi
if ! grep -q "void syncWorkspaceThreadCommunityLens(activeThread, next);" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop community selection is not using shared lens sync helper in $DESKTOP_APP_FILE"
  exit 1
fi

echo "[2/7] Web must route lens updates through shared sync helper..."
if ! grep -q "const syncWorkspaceThreadCommunityLens = (" "$WEB_APP_FILE"; then
  echo "FAIL: missing web shared lens sync helper in $WEB_APP_FILE"
  exit 1
fi
if ! grep -q "webThreadContextController.ensureLensBeforeSend(threadId);" "$WEB_APP_FILE"; then
  echo "FAIL: web send preflight is not routed through web thread-context controller in $WEB_APP_FILE"
  exit 1
fi
if ! grep -q "void syncWorkspaceThreadCommunityLens(activeThreadId, community.id, session);" "$WEB_APP_FILE"; then
  echo "FAIL: web community selection is not using shared lens sync helper in $WEB_APP_FILE"
  exit 1
fi

echo "[3/7] Web preflight must allow lens clearing (no null early-return)..."
if grep -q "if (!desiredCommunityId) return;" "$WEB_APP_FILE"; then
  echo "FAIL: found null-lens early return in web preflight; this causes stale context bleed"
  exit 1
fi

echo "[4/7] Thread titles must not use generic fallback constants..."
if grep -q "FALLBACK_CHAT_THREAD_TITLE\\|FALLBACK_AGENT_THREAD_TITLE" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop still defines generic fallback thread title constants"
  exit 1
fi
if grep -q "FALLBACK_THREAD_TITLE" "$WEB_APP_FILE"; then
  echo "FAIL: web still defines generic fallback thread title constant"
  exit 1
fi
if ! grep -q "buildContextFallbackThreadTitle" "$DESKTOP_APP_FILE" && ! grep -q "buildContextFallbackThreadTitle" "$DESKTOP_THREAD_TITLE_VM_FILE"; then
  echo "FAIL: desktop context-based title fallback helper missing"
  exit 1
fi
if ! grep -q "buildContextFallbackThreadTitle" "$WEB_APP_FILE"; then
  echo "FAIL: web context-based title fallback helper missing"
  exit 1
fi

echo "[5/7] Runtime client must recognize both conflict error formats..."
if ! grep -q "thread context version conflict" "$CLIENT_FILE"; then
  echo "FAIL: missing spaced conflict message match in $CLIENT_FILE"
  exit 1
fi
if ! grep -q "thread_context_version_conflict" "$CLIENT_FILE"; then
  echo "FAIL: missing underscored conflict message match in $CLIENT_FILE"
  exit 1
fi

echo "[6/7] Desktop and web cloud lens sync must use shared helper..."
if [ ! -f "$CLOUD_SYNC_HELPER_FILE" ]; then
  echo "FAIL: missing shared cloud sync helper at $CLOUD_SYNC_HELPER_FILE"
  exit 1
fi
if [ ! -f "$DESKTOP_CLOUD_LENS_SYNC_FILE" ]; then
  echo "FAIL: missing desktop cloud lens sync service at $DESKTOP_CLOUD_LENS_SYNC_FILE"
  exit 1
fi
if ! grep -q "syncThreadCommunityLensCloud" "$DESKTOP_CLOUD_LENS_SYNC_FILE"; then
  echo "FAIL: desktop does not use shared cloud lens sync helper in $DESKTOP_CLOUD_LENS_SYNC_FILE"
  exit 1
fi
if ! grep -q "syncThreadCommunityLensCloud" "$WEB_APP_FILE"; then
  echo "FAIL: web does not use shared cloud lens sync helper in $WEB_APP_FILE"
  exit 1
fi

echo "[7/8] Thread service boundary checks..."
bash scripts/thread_service_boundary_check.sh

echo "[8/8] DB context contract tests..."
(cd src-tauri && cargo test -q set_thread_context_lane_switches_preserve_project_and_community)
(cd src-tauri && cargo test -q set_thread_context_allows_repeated_community_switches_with_monotonic_version)

echo "PASS: thread context regression checks passed."
