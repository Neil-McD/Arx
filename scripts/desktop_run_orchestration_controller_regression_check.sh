#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_FILE="src/App.tsx"
HOOK_FILE="src/controllers/desktop/useDesktopRunOrchestration.ts"

echo "== Desktop run-orchestration controller regression checks =="

echo "[1/8] Desktop app should import run-orchestration hook..."
if ! grep -q "from \"./controllers/desktop/useDesktopRunOrchestration\"" "$APP_FILE"; then
  echo "FAIL: App.tsx is not importing useDesktopRunOrchestration"
  exit 1
fi

echo "[2/8] Desktop app should not keep inline runtime notification switch..."
if grep -q "const onNotification = (n:" "$APP_FILE"; then
  echo "FAIL: App.tsx still defines inline runtime notification handler"
  exit 1
fi
if grep -q "subscribeNotifications(onNotification" "$APP_FILE"; then
  echo "FAIL: App.tsx still subscribes to runtime notifications inline"
  exit 1
fi

echo "[3/8] Desktop app should not keep inline Escape cancellation handler..."
if grep -q "const handleGlobalEscape = (event: KeyboardEvent)" "$APP_FILE"; then
  echo "FAIL: App.tsx still defines inline global Escape handler"
  exit 1
fi

echo "[4/8] Desktop app should instantiate run-orchestration hook..."
if ! grep -q "const { cancelActiveRun } = useDesktopRunOrchestration<" "$APP_FILE"; then
  echo "FAIL: App.tsx is not wiring cancelActiveRun through useDesktopRunOrchestration"
  exit 1
fi

echo "[5/8] Workspace send/stop CTA should route stop through cancelActiveRun..."
if ! grep -q "cancelActiveRun();" "$APP_FILE"; then
  echo "FAIL: App.tsx stop action is not routed through cancelActiveRun"
  exit 1
fi

echo "[6/8] Hook file must exist and export useDesktopRunOrchestration..."
if [[ ! -f "$HOOK_FILE" ]]; then
  echo "FAIL: $HOOK_FILE is missing"
  exit 1
fi
if ! grep -q "export function useDesktopRunOrchestration" "$HOOK_FILE"; then
  echo "FAIL: $HOOK_FILE is missing useDesktopRunOrchestration export"
  exit 1
fi

echo "[7/8] Hook should own runtime notification subscription + mapping..."
if ! grep -q "subscribeNotifications(handleRuntimeNotification" "$HOOK_FILE"; then
  echo "FAIL: useDesktopRunOrchestration is not subscribing to runtime notifications"
  exit 1
fi
if ! grep -q "n.type === \"tool_approval_requested\"" "$HOOK_FILE"; then
  echo "FAIL: useDesktopRunOrchestration is missing tool approval notification handling"
  exit 1
fi
if ! grep -q "n.type === \"opened_urls\"" "$HOOK_FILE"; then
  echo "FAIL: useDesktopRunOrchestration is missing opened_urls handling"
  exit 1
fi

echo "[8/8] Hook should own Escape cancellation path..."
if ! grep -q "window.addEventListener(\"keydown\", handleGlobalEscape)" "$HOOK_FILE"; then
  echo "FAIL: useDesktopRunOrchestration is missing global Escape listener wiring"
  exit 1
fi
if ! grep -q "dispatchRunPhase({ type: \"cancel_requested\" })" "$HOOK_FILE"; then
  echo "FAIL: useDesktopRunOrchestration is missing cancel_requested dispatch"
  exit 1
fi

echo "PASS: desktop run-orchestration controller regression checks passed."
