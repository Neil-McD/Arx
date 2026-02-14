#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
TOPBAR_COMPONENT_FILE="src/components/DesktopTopbar.tsx"

echo "== Desktop topbar component regression checks =="

echo "[1/5] Desktop should import and render DesktopTopbar..."
if ! grep -q "from \"./components/DesktopTopbar\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not importing DesktopTopbar"
  exit 1
fi
if ! grep -q "<DesktopTopbar" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not rendering DesktopTopbar"
  exit 1
fi

echo "[2/5] Topbar component file must exist and export DesktopTopbar..."
if ! grep -q "export function DesktopTopbar" "$TOPBAR_COMPONENT_FILE"; then
  echo "FAIL: DesktopTopbar component export missing"
  exit 1
fi

echo "[3/5] App.tsx should not inline topbar markup..."
if grep -q "className=\"app-topbar\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still inlines app-topbar markup"
  exit 1
fi
if grep -q "className=\"topbar-left\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still inlines topbar-left markup"
  exit 1
fi

echo "[4/5] Component should own topbar markup..."
if ! grep -q "className=\"app-topbar\"" "$TOPBAR_COMPONENT_FILE"; then
  echo "FAIL: DesktopTopbar missing app-topbar markup"
  exit 1
fi
if ! grep -q "className=\"topbar-left\"" "$TOPBAR_COMPONENT_FILE"; then
  echo "FAIL: DesktopTopbar missing topbar-left markup"
  exit 1
fi
if ! grep -q "className=\"topbar-right\"" "$TOPBAR_COMPONENT_FILE"; then
  echo "FAIL: DesktopTopbar missing topbar-right markup"
  exit 1
fi

echo "[5/5] App.tsx should keep callback-based control of topbar behavior..."
if ! grep -q "onOpenCommunity={handleTopbarOpenCommunity}" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx is not passing topbar community-open callback"
  exit 1
fi
if ! grep -q "const handleTopbarOpenCommunity" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx missing topbar community-open handler"
  exit 1
fi

echo "PASS: desktop topbar component regression checks passed."
