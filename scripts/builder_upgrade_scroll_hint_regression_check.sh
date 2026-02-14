#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
WEB_APP_FILE="apps/web/src/App.tsx"
HOOK_FILE="shared/useBuilderUpgradeScrollHint.ts"

echo "== Builder upgrade scroll-hint regression checks =="

echo "[1/7] App shells should import shared scroll-hint hook..."
if ! grep -q 'from "../shared/useBuilderUpgradeScrollHint"' "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not importing useBuilderUpgradeScrollHint"
  exit 1
fi
if ! grep -q 'from "../../../shared/useBuilderUpgradeScrollHint"' "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not importing useBuilderUpgradeScrollHint"
  exit 1
fi

echo "[2/7] Shared hook should export useBuilderUpgradeScrollHint..."
if ! grep -q "export function useBuilderUpgradeScrollHint" "$HOOK_FILE"; then
  echo "FAIL: shared useBuilderUpgradeScrollHint export missing"
  exit 1
fi

echo "[3/7] App shells should instantiate shared scroll-hint hook..."
if ! grep -q "useBuilderUpgradeScrollHint({" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not instantiating useBuilderUpgradeScrollHint"
  exit 1
fi
if ! grep -q "useBuilderUpgradeScrollHint({" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not instantiating useBuilderUpgradeScrollHint"
  exit 1
fi

echo "[4/7] App shells should not keep inline scroll-hint state/effects..."
if grep -q "const \\[showBuilderUpgradeScrollHint, setShowBuilderUpgradeScrollHint\\]" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx still defines inline showBuilderUpgradeScrollHint state"
  exit 1
fi
if grep -q "const \\[showBuilderUpgradeScrollHint, setShowBuilderUpgradeScrollHint\\]" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline showBuilderUpgradeScrollHint state"
  exit 1
fi
if grep -q "const updateBuilderUpgradeScrollHint = useCallback" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx still defines inline updateBuilderUpgradeScrollHint callback"
  exit 1
fi
if grep -q "const updateBuilderUpgradeScrollHint = useCallback" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline updateBuilderUpgradeScrollHint callback"
  exit 1
fi

echo "[5/7] Shared hook should own modal resize/open refresh logic..."
if ! grep -q "window.addEventListener(\"resize\", handleResize)" "$HOOK_FILE"; then
  echo "FAIL: shared hook missing resize listener wiring"
  exit 1
fi
if ! grep -q "if (!isOpen)" "$HOOK_FILE"; then
  echo "FAIL: shared hook missing open-state guard"
  exit 1
fi

echo "[6/7] App shells should keep modal body onScroll wiring..."
if ! grep -q "onScroll={updateBuilderUpgradeScrollHint}" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx missing modal onScroll wiring"
  exit 1
fi
if ! grep -q "onScroll={updateBuilderUpgradeScrollHint}" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing modal onScroll wiring"
  exit 1
fi

echo "[7/7] App shells should keep modal scroll-hint class toggle..."
if ! grep -q 'showBuilderUpgradeScrollHint ? " show" : ""' "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx missing scroll-hint class toggle"
  exit 1
fi
if ! grep -q 'showBuilderUpgradeScrollHint ? " show" : ""' "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing scroll-hint class toggle"
  exit 1
fi

echo "PASS: builder upgrade scroll-hint regression checks passed."
