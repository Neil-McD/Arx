#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
SEND_FLOW_HOOK_FILE="src/controllers/desktop/useDesktopSendMessageFlow.ts"
SEND_READINESS_FILE="src/controllers/desktop/useDesktopThreadSendReadiness.ts"
THREAD_META_LOADERS_FILE="src/controllers/desktop/useDesktopThreadMetaLoaders.ts"

echo "== Thread service boundary checks =="

echo "[1/7] Desktop send flow must route via ThreadService..."
if ! rg -q "getThreadServiceById: \\(threadId: string\\) => ThreadService;" "$SEND_FLOW_HOOK_FILE"; then
  echo "FAIL: send flow hook does not require ThreadService routing in $SEND_FLOW_HOOK_FILE"
  exit 1
fi
if [[ "$(rg -c "args\\.getThreadServiceById\\(" "$SEND_FLOW_HOOK_FILE")" -lt 3 ]]; then
  echo "FAIL: send flow hook is not routing add/title/send operations through ThreadService"
  exit 1
fi

echo "[2/7] Send flow hook must not branch on storage mode..."
if rg -q "resolveThreadStorageMode" "$SEND_FLOW_HOOK_FILE"; then
  echo "FAIL: send flow hook still branches on storage mode in $SEND_FLOW_HOOK_FILE"
  exit 1
fi
if rg -q "storageMode === \"cloud\"" "$SEND_FLOW_HOOK_FILE"; then
  echo "FAIL: send flow hook still contains cloud/local branching in $SEND_FLOW_HOOK_FILE"
  exit 1
fi

echo "[3/7] Send flow hook must not directly call runtime/cloud mutation paths..."
if rg -q "runtimeClient\\.addMessage\\|runtimeClient\\.sendTurn\\|runtimeClient\\.setThreadTitle" "$SEND_FLOW_HOOK_FILE"; then
  echo "FAIL: send flow hook still directly calls runtime thread mutations in $SEND_FLOW_HOOK_FILE"
  exit 1
fi
if rg -q "addCloudMessage\\|sendCloudTurn\\|setCloudThreadTitle" "$SEND_FLOW_HOOK_FILE"; then
  echo "FAIL: send flow hook still directly calls cloud thread mutations in $SEND_FLOW_HOOK_FILE"
  exit 1
fi

echo "[4/7] Desktop lens apply must route through ThreadService..."
if ! rg -q "const service = resolveThreadServiceForThreadId\\(desired\\.threadId\\);" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop lens apply is not resolving ThreadService in $DESKTOP_APP_FILE"
  exit 1
fi
if ! rg -q "await service\\.setThreadLens\\(" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop lens apply is not using ThreadService.setThreadLens in $DESKTOP_APP_FILE"
  exit 1
fi

echo "[5/7] Desktop must expose a shared router instance + resolver..."
if ! rg -q "const desktopThreadServiceRouter = createDesktopAppThreadServiceRouter\\(" "$DESKTOP_APP_FILE"; then
  echo "FAIL: missing desktop app thread-service router instance in $DESKTOP_APP_FILE"
  exit 1
fi
if ! rg -q "function resolveThreadServiceForThreadId\\(threadId: string\\): ThreadService" "$DESKTOP_APP_FILE"; then
  echo "FAIL: missing desktop ThreadService resolver in $DESKTOP_APP_FILE"
  exit 1
fi

echo "[6/7] Send readiness must route model updates through ThreadService..."
if ! rg -q "getThreadServiceById: \\(threadId: string\\) => ThreadService;" "$SEND_READINESS_FILE"; then
  echo "FAIL: send readiness hook does not require ThreadService resolver in $SEND_READINESS_FILE"
  exit 1
fi
if ! rg -q "const service = args\\.getThreadServiceById\\(sessionId\\);" "$SEND_READINESS_FILE"; then
  echo "FAIL: send readiness hook is not resolving ThreadService for model updates in $SEND_READINESS_FILE"
  exit 1
fi
if rg -q "runtimeClient\\.setThreadEngine" "$SEND_READINESS_FILE"; then
  echo "FAIL: send readiness hook still calls runtimeClient.setThreadEngine directly in $SEND_READINESS_FILE"
  exit 1
fi

echo "[7/9] Model picker must not directly mutate thread engine via runtime client..."
if ! rg -q "resolveThreadServiceForThreadId\\(activeThreadId\\)" "$DESKTOP_APP_FILE"; then
  echo "FAIL: model picker path is not resolving ThreadService by active thread in $DESKTOP_APP_FILE"
  exit 1
fi
if rg -q "thread_id: activeThreadId" "$DESKTOP_APP_FILE"; then
  echo "FAIL: found direct active-thread runtime engine mutation in $DESKTOP_APP_FILE"
  exit 1
fi

echo "[8/9] Thread read loaders must route via ThreadService resolver..."
resolver_hits_desktop="$(rg -c "const service = resolveThreadServiceForThreadId\\(sessionId\\);" "$DESKTOP_APP_FILE" || true)"
resolver_hits_meta_args="$(rg -c "const service = args\\.resolveThreadServiceForThreadId\\(sessionId\\);" "$THREAD_META_LOADERS_FILE" || true)"
resolver_hits_meta_direct="$(rg -c "const service = resolveThreadServiceForThreadId\\(sessionId\\);" "$THREAD_META_LOADERS_FILE" || true)"
total_resolver_hits=$((resolver_hits_desktop + resolver_hits_meta_args + resolver_hits_meta_direct))
if [[ "$total_resolver_hits" -lt 3 ]]; then
  echo "FAIL: expected ThreadService resolver in message/turn/resume loaders across $DESKTOP_APP_FILE and $THREAD_META_LOADERS_FILE"
  exit 1
fi
if rg -q "resolveThreadStorageMode\\(sessionId\\)" "$DESKTOP_APP_FILE"; then
  echo "FAIL: read loaders still branch via resolveThreadStorageMode(sessionId) in $DESKTOP_APP_FILE"
  exit 1
fi

echo "[9/9] Tool-call loader must route by service domain, not ad-hoc storage arg..."
if rg -q "loadToolCalls\\(sessionId, storageMode\\)" "$DESKTOP_APP_FILE"; then
  echo "FAIL: loadToolCalls still accepts ad-hoc storage mode routing in $DESKTOP_APP_FILE"
  exit 1
fi

echo "PASS: thread service boundary checks passed."
