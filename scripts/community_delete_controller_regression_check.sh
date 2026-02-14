#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
WEB_APP_FILE="apps/web/src/App.tsx"
HOOK_FILE="shared/useCommunityDeleteController.ts"

echo "== Community delete controller regression checks =="

echo "[1/8] App shells should import shared delete controller hook..."
if ! grep -q 'from "../shared/useCommunityDeleteController"' "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not importing useCommunityDeleteController"
  exit 1
fi
if ! grep -q 'from "../../../shared/useCommunityDeleteController"' "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not importing useCommunityDeleteController"
  exit 1
fi

echo "[2/8] Shared delete controller file should export useCommunityDeleteController..."
if ! grep -q "export function useCommunityDeleteController" "$HOOK_FILE"; then
  echo "FAIL: shared delete controller export missing"
  exit 1
fi

echo "[3/8] App shells should instantiate the shared delete controller hook..."
if ! grep -q "useCommunityDeleteController<" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not instantiating useCommunityDeleteController"
  exit 1
fi
if ! grep -q "useCommunityDeleteController<" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not instantiating useCommunityDeleteController"
  exit 1
fi

echo "[4/8] App shells should not keep inline delete-community handlers..."
if grep -q "function openDeleteCommunityModal" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx still defines openDeleteCommunityModal inline"
  exit 1
fi
if grep -q "function closeDeleteCommunityModal" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx still defines closeDeleteCommunityModal inline"
  exit 1
fi
if grep -q "async function handleConfirmDeleteCommunity" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx still defines handleConfirmDeleteCommunity inline"
  exit 1
fi
if grep -q "function openDeleteCommunityModal" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines openDeleteCommunityModal inline"
  exit 1
fi
if grep -q "function closeDeleteCommunityModal" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines closeDeleteCommunityModal inline"
  exit 1
fi
if grep -q "async function handleConfirmDeleteCommunity" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines handleConfirmDeleteCommunity inline"
  exit 1
fi

echo "[5/8] Delete endpoint call should live in shared hook..."
if ! grep -q "/rest/v1/communities?id=eq." "$HOOK_FILE"; then
  echo "FAIL: shared delete hook is missing delete endpoint wiring"
  exit 1
fi
if grep -q "/rest/v1/communities?id=eq." "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx still contains inline delete endpoint wiring"
  exit 1
fi
if grep -q "/rest/v1/communities?id=eq." "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains inline delete endpoint wiring"
  exit 1
fi

echo "[6/8] Desktop and web settings UI should still trigger open-delete action..."
if ! grep -q "onClick={openDeleteCommunityModal}" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not wiring openDeleteCommunityModal"
  exit 1
fi
if ! grep -q "onClick={openDeleteCommunityModal}" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not wiring openDeleteCommunityModal"
  exit 1
fi

echo "[7/8] Desktop and web delete modals should still wire close + confirm actions..."
if ! grep -q "onClick={closeDeleteCommunityModal}" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not wiring closeDeleteCommunityModal"
  exit 1
fi
if ! grep -q "onClick={() => void handleConfirmDeleteCommunity()}" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not wiring handleConfirmDeleteCommunity"
  exit 1
fi
if ! grep -q "onClick={closeDeleteCommunityModal}" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not wiring closeDeleteCommunityModal"
  exit 1
fi
if ! grep -q "onClick={() => void handleConfirmDeleteCommunity()}" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not wiring handleConfirmDeleteCommunity"
  exit 1
fi

echo "[8/8] Shared hook should still clear modal form state on open/close..."
if ! grep -q "setDeleteCommunityNameInput(\"\")" "$HOOK_FILE"; then
  echo "FAIL: shared delete hook is not clearing deleteCommunityNameInput"
  exit 1
fi
if ! grep -q "setDeleteCommunityConfirmInput(\"\")" "$HOOK_FILE"; then
  echo "FAIL: shared delete hook is not clearing deleteCommunityConfirmInput"
  exit 1
fi

echo "PASS: community delete controller regression checks passed."
