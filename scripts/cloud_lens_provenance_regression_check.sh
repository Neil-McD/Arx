#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
THREAD_SERVICE_COMPOSER_FILE="src/services/thread/createDesktopAppThreadServiceRouter.ts"
THREAD_CLOUD_LENS_SYNC_FILE="src/services/thread/createDesktopCloudLensSync.ts"
SEND_FLOW_FILE="src/features/harness/sendTurn.ts"
CLOUD_TURN_FILE="supabase/functions/agent_turn/index.ts"

echo "== Cloud lens provenance regression checks =="

echo "[1/9] Cloud lens routing must use thread service router path..."
if ! rg -q "const service = resolveThreadServiceForThreadId\\(desired\\.threadId\\);" "$DESKTOP_APP_FILE"; then
  echo "FAIL: missing thread-service resolver in lens apply path in $DESKTOP_APP_FILE"
  exit 1
fi
if ! rg -q "await service\\.setThreadLens\\(" "$DESKTOP_APP_FILE"; then
  echo "FAIL: lens apply path is not calling service.setThreadLens in $DESKTOP_APP_FILE"
  exit 1
fi
if ! rg -q "createDesktopAppThreadServiceRouter\\(" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not using dedicated thread-service composer in $DESKTOP_APP_FILE"
  exit 1
fi
if ! rg -q "setCloudLens: async \\(input, session\\) =>" "$THREAD_SERVICE_COMPOSER_FILE"; then
  echo "FAIL: cloud service wiring is missing setCloudLens in $THREAD_SERVICE_COMPOSER_FILE"
  exit 1
fi
if ! rg -q "setThreadCommunityLensInCloud\\(\\{" "$THREAD_SERVICE_COMPOSER_FILE"; then
  echo "FAIL: cloud service lens wiring does not call setThreadCommunityLensInCloud in $THREAD_SERVICE_COMPOSER_FILE"
  exit 1
fi

echo "[2/9] Signed-out cloud lens switching must trigger auth guard..."
if ! rg -q "Sign in to switch community context for cloud chat threads\\." "$DESKTOP_APP_FILE"; then
  echo "FAIL: missing signed-out cloud lens auth message in $DESKTOP_APP_FILE"
  exit 1
fi
if ! rg -q "void handleSignIn\\(\\);" "$DESKTOP_APP_FILE"; then
  echo "FAIL: signed-out cloud lens path does not trigger handleSignIn in $DESKTOP_APP_FILE"
  exit 1
fi

echo "[3/9] Send flow must keep lens preflight before dispatch..."
if ! rg -q "await deps\\.ensureWorkspaceThreadLensBeforeSend\\(threadId\\);" "$SEND_FLOW_FILE"; then
  echo "FAIL: missing preflight lens enforcement in $SEND_FLOW_FILE"
  exit 1
fi

echo "[4/9] Desktop cloud lens write must patch community context through RPC..."
if ! rg -q "set_thread_context" "$THREAD_CLOUD_LENS_SYNC_FILE"; then
  echo "FAIL: missing cloud set_thread_context RPC call in $THREAD_CLOUD_LENS_SYNC_FILE"
  exit 1
fi
if ! rg -q "p_update_community_id: true" "$THREAD_CLOUD_LENS_SYNC_FILE"; then
  echo "FAIL: cloud context RPC call missing p_update_community_id=true in $THREAD_CLOUD_LENS_SYNC_FILE"
  exit 1
fi

echo "[5/9] Cloud agent_turn must derive context lens from thread entitlement..."
if ! rg -q "const contextCommunityId: string \\| null = hasCommunityContextEntitlement \\? threadCommunityId : null;" "$CLOUD_TURN_FILE"; then
  echo "FAIL: agent_turn is not deriving contextCommunityId from entitled thread lens in $CLOUD_TURN_FILE"
  exit 1
fi

echo "[6/9] Cloud assistant message writes must persist context_community_id provenance..."
if [[ "$(rg -c "if \\(contextCommunityId\\) meta\\.context_community_id = contextCommunityId;" "$CLOUD_TURN_FILE")" -lt 2 ]]; then
  echo "FAIL: expected context_community_id meta wiring in both streaming and non-streaming writes in $CLOUD_TURN_FILE"
  exit 1
fi
if [[ "$(rg -c "meta: Object\\.keys\\(meta\\)\\.length > 0 \\? meta : null," "$CLOUD_TURN_FILE")" -lt 2 ]]; then
  echo "FAIL: expected meta persistence wiring in both assistant write paths in $CLOUD_TURN_FILE"
  exit 1
fi

echo "[7/9] Lens updates must use last-click-wins controller..."
if ! rg -q "useLastClickWinsController<WorkspaceLensTarget>" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop lens switching is not routed through last-click-wins controller in $DESKTOP_APP_FILE"
  exit 1
fi

echo "[8/9] Cloud lens sync must keep context version retry logic..."
if ! rg -q "syncThreadCommunityLensCloud\\(" "$THREAD_CLOUD_LENS_SYNC_FILE"; then
  echo "FAIL: desktop cloud lens path is not using syncThreadCommunityLensCloud in $THREAD_CLOUD_LENS_SYNC_FILE"
  exit 1
fi
if ! rg -q "for \\(let attempt = 0; attempt < 2; attempt \\+= 1\\)" "shared/threadContextCloudSync.ts"; then
  echo "FAIL: missing conflict retry loop in shared/threadContextCloudSync.ts"
  exit 1
fi
if ! rg -q "expectedContextVersion:" "$DESKTOP_APP_FILE"; then
  echo "FAIL: expected context version is not being propagated in desktop lens requests"
  exit 1
fi

echo "[9/9] Switching community during active send must defer to next turn..."
if ! rg -q "Active run keeps prior context; new context applies next turn\\." "$DESKTOP_APP_FILE"; then
  echo "FAIL: missing deferred-context UX guard while send is in-flight in $DESKTOP_APP_FILE"
  exit 1
fi

echo "PASS: cloud lens provenance regression checks passed."
