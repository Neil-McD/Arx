#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
RAIL_COMPONENT_FILE="src/components/DesktopCommunityRail.tsx"

echo "== Desktop community rail component regression checks =="

echo "[1/5] Desktop should import and render DesktopCommunityRail..."
if ! grep -q "from \"./components/DesktopCommunityRail\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not importing DesktopCommunityRail"
  exit 1
fi
if ! grep -q "<DesktopCommunityRail" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not rendering DesktopCommunityRail"
  exit 1
fi

echo "[2/5] Community rail component file must exist and export DesktopCommunityRail..."
if ! grep -q "export function DesktopCommunityRail" "$RAIL_COMPONENT_FILE"; then
  echo "FAIL: DesktopCommunityRail component export missing"
  exit 1
fi

echo "[3/5] App.tsx should not inline community rail markup..."
if grep -q "className=\"rail community-rail\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still inlines community rail markup"
  exit 1
fi
if grep -q "className=\"community-rail-button community-rail-add\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still inlines community rail add button markup"
  exit 1
fi

echo "[4/5] Component should own community rail markup..."
if ! grep -q "className=\"rail community-rail\"" "$RAIL_COMPONENT_FILE"; then
  echo "FAIL: DesktopCommunityRail missing rail wrapper markup"
  exit 1
fi
if ! grep -q "className=\"community-rail-button community-rail-add\"" "$RAIL_COMPONENT_FILE"; then
  echo "FAIL: DesktopCommunityRail missing add button markup"
  exit 1
fi

echo "[5/5] App.tsx should keep callback-based rail control..."
if ! grep -q "onOpenDiscover={handleRailOpenDiscover}" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx is not passing discover callback to DesktopCommunityRail"
  exit 1
fi
if ! grep -q "onToggleSettings={handleRailToggleSettings}" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx is not passing settings callback to DesktopCommunityRail"
  exit 1
fi
if ! grep -q "const handleRailOpenDiscover" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx missing handleRailOpenDiscover callback"
  exit 1
fi

echo "PASS: desktop community rail component regression checks passed."
