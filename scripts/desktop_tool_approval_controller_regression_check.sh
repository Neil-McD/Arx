#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_FILE="src/App.tsx"
HOOK_FILE="src/controllers/desktop/useDesktopToolApprovalActions.ts"
CLIENT_IFACE_FILE="src/runtime/arp/client.ts"
TAURI_CLIENT_FILE="src/runtime/arp/tauriClient.ts"

echo "== Desktop tool approval controller regression checks =="

echo "[1/8] Desktop app should import tool approval controller hook..."
if ! grep -q "from \"./controllers/desktop/useDesktopToolApprovalActions\"" "$APP_FILE"; then
  echo "FAIL: App.tsx is not importing useDesktopToolApprovalActions"
  exit 1
fi

echo "[2/8] Desktop app should wire tool approval handlers via hook..."
if ! grep -q "useDesktopToolApprovalActions<ToolApprovalRequestedPayload>" "$APP_FILE"; then
  echo "FAIL: App.tsx is not creating typed useDesktopToolApprovalActions"
  exit 1
fi
if ! grep -q "resolvePendingToolApproval" "$APP_FILE"; then
  echo "FAIL: App.tsx is missing resolvePendingToolApproval wiring"
  exit 1
fi

echo "[3/8] Desktop app should not keep inline tool approval handlers..."
if grep -q "async function respondPermission" "$APP_FILE"; then
  echo "FAIL: App.tsx still defines inline respondPermission"
  exit 1
fi
if grep -q "async function handleApproveAndRun" "$APP_FILE"; then
  echo "FAIL: App.tsx still defines inline handleApproveAndRun"
  exit 1
fi
if grep -q "async function handleRejectToolCall" "$APP_FILE"; then
  echo "FAIL: App.tsx still defines inline handleRejectToolCall"
  exit 1
fi
if grep -q "async function resolvePendingToolApproval" "$APP_FILE"; then
  echo "FAIL: App.tsx still defines inline resolvePendingToolApproval"
  exit 1
fi
if grep -q "async function runToolCallThroughBackend" "$APP_FILE"; then
  echo "FAIL: App.tsx still defines inline runToolCallThroughBackend"
  exit 1
fi

echo "[4/8] Desktop app should not call respond_permission_cmd directly..."
if grep -q "respond_permission_cmd" "$APP_FILE"; then
  echo "FAIL: App.tsx still invokes respond_permission_cmd directly"
  exit 1
fi

echo "[5/8] Hook should export tool approval controller..."
if ! grep -q "export function useDesktopToolApprovalActions" "$HOOK_FILE"; then
  echo "FAIL: useDesktopToolApprovalActions export missing"
  exit 1
fi

echo "[6/8] Hook should use runtime client for approval actions..."
if ! grep -q "runtimeClient.decideToolCall" "$HOOK_FILE"; then
  echo "FAIL: hook is not using runtimeClient.decideToolCall"
  exit 1
fi
if grep -q "runtimeClient.respondPermission" "$HOOK_FILE"; then
  echo "FAIL: hook still references removed respondPermission compatibility path"
  exit 1
fi

echo "[7/8] Runtime client interface should expose decideToolCall..."
if ! grep -q "decideToolCall(" "$CLIENT_IFACE_FILE"; then
  echo "FAIL: runtime client interface missing decideToolCall"
  exit 1
fi

echo "[8/8] Tauri runtime client should route decideToolCall command..."
if ! grep -q "async decideToolCall(" "$TAURI_CLIENT_FILE"; then
  echo "FAIL: Tauri runtime client missing decideToolCall implementation"
  exit 1
fi
if ! grep -q "\"decide_tool_call_cmd\"" "$TAURI_CLIENT_FILE"; then
  echo "FAIL: Tauri runtime client decideToolCall is not calling decide_tool_call_cmd"
  exit 1
fi

echo "PASS: desktop tool approval controller regression checks passed."
