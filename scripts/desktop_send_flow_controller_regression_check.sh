#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_FILE="src/App.tsx"
HOOK_FILE="src/controllers/desktop/useDesktopSendMessageFlow.ts"

echo "== Desktop send-flow controller regression checks =="

echo "[1/6] Desktop app should import send-flow hook..."
if ! grep -q "from \"./controllers/desktop/useDesktopSendMessageFlow\"" "$APP_FILE"; then
  echo "FAIL: App.tsx is not importing useDesktopSendMessageFlow"
  exit 1
fi

echo "[2/6] Desktop app should not call executeSendMessageFlow directly..."
if grep -q "from \"./features/harness/sendTurn\"" "$APP_FILE"; then
  echo "FAIL: App.tsx still imports executeSendMessageFlow directly"
  exit 1
fi
if grep -q "async function handleSendMessage" "$APP_FILE"; then
  echo "FAIL: App.tsx still defines inline async handleSendMessage"
  exit 1
fi

echo "[3/6] Desktop app should instantiate send-flow hook..."
if ! grep -q "const { handleSendMessage } = useDesktopSendMessageFlow<" "$APP_FILE"; then
  echo "FAIL: App.tsx is not wiring handleSendMessage through useDesktopSendMessageFlow"
  exit 1
fi

echo "[4/6] Hook file must route through executeSendMessageFlow..."
if ! grep -q "import { executeSendMessageFlow } from \"../../features/harness/sendTurn\"" "$HOOK_FILE"; then
  echo "FAIL: useDesktopSendMessageFlow is not importing executeSendMessageFlow"
  exit 1
fi
if ! grep -q "await executeSendMessageFlow({" "$HOOK_FILE"; then
  echo "FAIL: useDesktopSendMessageFlow is not delegating to executeSendMessageFlow"
  exit 1
fi

echo "[5/6] Hook should keep optimistic thread title derivation..."
if ! grep -q "deriveThreadTitleFromUserText" "$HOOK_FILE"; then
  echo "FAIL: useDesktopSendMessageFlow is missing optimistic thread title derivation"
  exit 1
fi
if ! grep -q "service.setThreadTitle" "$HOOK_FILE"; then
  echo "FAIL: useDesktopSendMessageFlow is missing optimistic title persistence path"
  exit 1
fi

echo "[6/6] Hook should keep desktop trace surface wiring..."
if ! grep -q "traceThreadContext" "$APP_FILE"; then
  echo "FAIL: App.tsx is missing traceThreadContext wiring for send-flow hook"
  exit 1
fi

echo "PASS: desktop send-flow controller regression checks passed."
