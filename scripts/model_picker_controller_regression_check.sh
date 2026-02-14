#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
WEB_APP_FILE="apps/web/src/App.tsx"
HOOK_FILE="shared/useModelPickerController.ts"

echo "== Model picker controller regression checks =="

echo "[1/8] App shells should import shared model-picker controller..."
if ! grep -q 'from "../shared/useModelPickerController"' "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not importing useModelPickerController"
  exit 1
fi
if ! grep -q 'from "../../../shared/useModelPickerController"' "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not importing useModelPickerController"
  exit 1
fi

echo "[2/8] Shared model-picker controller hook should exist and export contract..."
if [[ ! -f "$HOOK_FILE" ]]; then
  echo "FAIL: missing shared model-picker controller hook file"
  exit 1
fi
if ! grep -q "export function useModelPickerController" "$HOOK_FILE"; then
  echo "FAIL: useModelPickerController export missing"
  exit 1
fi

echo "[3/8] App shells should instantiate shared model-picker controller..."
if ! grep -q "useModelPickerController<" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not instantiating useModelPickerController"
  exit 1
fi
if ! grep -q "useModelPickerController<" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not instantiating useModelPickerController"
  exit 1
fi

echo "[4/8] App shells should not keep inline open/close/filter model-picker handlers..."
if grep -q "const visiblePickerModels = useMemo" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx still defines inline visiblePickerModels useMemo"
  exit 1
fi
if grep -q "const visiblePickerModels = useMemo" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline visiblePickerModels useMemo"
  exit 1
fi
if grep -q "const openModelPicker =" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx still defines inline openModelPicker"
  exit 1
fi
if grep -q "const closeModelPicker =" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx still defines inline closeModelPicker"
  exit 1
fi
if grep -q "const openModelPicker =" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline openModelPicker"
  exit 1
fi
if grep -q "const closeModelPicker =" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline closeModelPicker"
  exit 1
fi

echo "[5/8] Shared hook should own query filter + section sort semantics..."
if ! grep -q "model.label.toLowerCase().includes(normalizedQuery)" "$HOOK_FILE"; then
  echo "FAIL: shared model-picker controller missing query filter behavior"
  exit 1
fi
if ! grep -q "MODEL_SECTION_ORDER" "$HOOK_FILE"; then
  echo "FAIL: shared model-picker controller missing section ordering map"
  exit 1
fi

echo "[6/8] App shells should still wire picker toggle actions in UI..."
if ! grep -q "isModelPickerOpen ? closeModelPicker() : openModelPicker()" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx model-picker toggle wiring missing"
  exit 1
fi
if ! grep -q "isModelPickerOpen ? closeModelPicker() : openModelPicker()" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx model-picker toggle wiring missing"
  exit 1
fi

echo "[7/8] Desktop and web should still receive visiblePickerModels from shared hook..."
if ! grep -q "const { visiblePickerModels, openModelPicker, closeModelPicker } = useModelPickerController" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not destructuring model-picker controller output"
  exit 1
fi
if ! grep -q "const { visiblePickerModels, openModelPicker, closeModelPicker } = useModelPickerController" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not destructuring model-picker controller output"
  exit 1
fi

echo "[8/8] Desktop and web should keep section reset to all on open..."
if ! grep -q "setModelPickerSection(args.allSectionId)" "$HOOK_FILE"; then
  echo "FAIL: shared model-picker controller missing section reset on open"
  exit 1
fi

echo "PASS: model picker controller regression checks passed."
