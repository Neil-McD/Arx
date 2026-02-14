#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_APP_FILE="apps/web/src/App.tsx"
DESKTOP_UI_HOOK_FILE="src/controllers/desktop/useDesktopUiLifecycleEffects.ts"
LIFECYCLE_HOOK_FILE="shared/useModelPickerLifecycleEffects.ts"

echo "== Model picker lifecycle regression checks =="

echo "[1/8] Shared lifecycle hook should exist and export expected API..."
if [[ ! -f "$LIFECYCLE_HOOK_FILE" ]]; then
  echo "FAIL: missing shared useModelPickerLifecycleEffects hook file"
  exit 1
fi
if ! grep -q "export function useModelPickerLifecycleEffects" "$LIFECYCLE_HOOK_FILE"; then
  echo "FAIL: shared hook missing useModelPickerLifecycleEffects export"
  exit 1
fi

echo "[2/8] Desktop lifecycle controller should import shared model-picker lifecycle hook..."
if ! grep -q 'from "../../../shared/useModelPickerLifecycleEffects"' "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop UI lifecycle controller missing shared model-picker lifecycle import"
  exit 1
fi

echo "[3/8] Web app should import shared model-picker lifecycle hook..."
if ! grep -q 'from "../../../shared/useModelPickerLifecycleEffects"' "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing shared model-picker lifecycle import"
  exit 1
fi

echo "[4/8] Desktop and web should invoke shared model-picker lifecycle hook..."
if ! grep -q "useModelPickerLifecycleEffects({" "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop UI lifecycle controller missing useModelPickerLifecycleEffects invocation"
  exit 1
fi
if ! grep -q "useModelPickerLifecycleEffects({" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing useModelPickerLifecycleEffects invocation"
  exit 1
fi

echo "[5/8] Desktop lifecycle controller should not keep inline model-picker pointer/key handlers..."
if grep -q "if (!params.isModelPickerOpen) return;" "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop UI lifecycle controller still contains inline model-picker effect gate"
  exit 1
fi
if grep -q "params.modelPickerSearchRef.current?.focus()" "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop UI lifecycle controller still contains inline model-picker focus logic"
  exit 1
fi

echo "[6/8] Web app should not keep inline model-picker pointer/key handlers..."
if grep -q "if (!isModelPickerOpen) return;" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains inline model-picker effect gate"
  exit 1
fi
if grep -q "modelPickerSearchRef.current?.focus()" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains inline model-picker focus logic"
  exit 1
fi

echo "[7/8] Shared lifecycle hook should own outside-click + escape behavior..."
if ! grep -q "document.addEventListener(\"mousedown\", handlePointerDown)" "$LIFECYCLE_HOOK_FILE"; then
  echo "FAIL: shared lifecycle hook missing outside-click listener"
  exit 1
fi
if ! grep -q "if (event.key === \"Escape\") args.closeModelPicker()" "$LIFECYCLE_HOOK_FILE"; then
  echo "FAIL: shared lifecycle hook missing escape-key close behavior"
  exit 1
fi

echo "[8/8] Shared lifecycle hook should own search-focus-on-open behavior..."
if ! grep -q "window.requestAnimationFrame(() => args.modelPickerSearchRef.current?.focus())" "$LIFECYCLE_HOOK_FILE"; then
  echo "FAIL: shared lifecycle hook missing search-focus-on-open behavior"
  exit 1
fi

echo "PASS: model picker lifecycle regression checks passed."
