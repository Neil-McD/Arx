#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_FILE="src/App.tsx"
HOOK_FILE="src/controllers/desktop/useDesktopSlashCommands.ts"

echo "== Desktop slash controller regression checks =="

echo "[1/8] Desktop app should import slash controller hook..."
if ! grep -q "from \"./controllers/desktop/useDesktopSlashCommands\"" "$APP_FILE"; then
  echo "FAIL: App.tsx is not importing useDesktopSlashCommands"
  exit 1
fi

echo "[2/8] Desktop app should instantiate slash controller hook..."
if ! grep -q "const { handleSlashCommand, handleSlashSelect } = useDesktopSlashCommands({" "$APP_FILE"; then
  echo "FAIL: App.tsx is not wiring slash handling through useDesktopSlashCommands"
  exit 1
fi

echo "[3/8] Desktop app should not keep inline slash handlers..."
if grep -q "async function handleSlashCommand" "$APP_FILE"; then
  echo "FAIL: App.tsx still defines inline handleSlashCommand"
  exit 1
fi
if grep -q "async function handleSlashSelect" "$APP_FILE"; then
  echo "FAIL: App.tsx still defines inline handleSlashSelect"
  exit 1
fi
if grep -q "async function proposeShellCommand" "$APP_FILE"; then
  echo "FAIL: App.tsx still defines inline proposeShellCommand"
  exit 1
fi

echo "[4/8] Hook should export useDesktopSlashCommands..."
if ! grep -q "export function useDesktopSlashCommands" "$HOOK_FILE"; then
  echo "FAIL: useDesktopSlashCommands export missing"
  exit 1
fi

echo "[5/8] Hook should preserve slash command surface..."
if ! grep -q "if (name === \"status\")" "$HOOK_FILE"; then
  echo "FAIL: status slash command missing"
  exit 1
fi
if ! grep -q "if (name === \"mode\")" "$HOOK_FILE"; then
  echo "FAIL: mode slash command missing"
  exit 1
fi
if ! grep -q "if (name === \"approvals\")" "$HOOK_FILE"; then
  echo "FAIL: approvals slash command missing"
  exit 1
fi
if ! grep -q "if (name === \"remember\")" "$HOOK_FILE"; then
  echo "FAIL: remember slash command missing"
  exit 1
fi

echo "[6/8] Hook should preserve memory save path..."
if ! grep -q "/rest/v1/personal_memory_items" "$HOOK_FILE"; then
  echo "FAIL: remember command is not writing to personal_memory_items"
  exit 1
fi
if ! grep -q "setSettingsPage(\"memory\")" "$HOOK_FILE"; then
  echo "FAIL: remember command no longer routes to memory settings page"
  exit 1
fi

echo "[7/8] Hook should preserve slash select orchestration..."
if ! grep -q "const handleSlashSelect = useCallback" "$HOOK_FILE"; then
  echo "FAIL: handleSlashSelect callback missing in hook"
  exit 1
fi
if ! grep -q "dispatchRunPhase({ type: \"send_start\" })" "$HOOK_FILE"; then
  echo "FAIL: handleSlashSelect missing send_start dispatch"
  exit 1
fi
if ! grep -q "dispatchRunPhase({ type: \"reset\" })" "$HOOK_FILE"; then
  echo "FAIL: handleSlashSelect missing reset dispatch"
  exit 1
fi

echo "[8/8] Hook should keep disabled shell command message..."
if ! grep -q "Internal tool execution is disabled in MVP; use the engine terminal." "$HOOK_FILE"; then
  echo "FAIL: disabled shell proposal message changed/missing"
  exit 1
fi

echo "PASS: desktop slash controller regression checks passed."
