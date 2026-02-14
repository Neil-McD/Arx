#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
SIDEBAR_COMPONENT_FILE="src/components/ThreadSidebarPanel.tsx"

echo "== Thread sidebar component regression checks =="

echo "[1/5] Desktop should import and render ThreadSidebarPanel..."
if ! grep -q "from \"./components/ThreadSidebarPanel\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not importing ThreadSidebarPanel"
  exit 1
fi
if ! grep -q "<ThreadSidebarPanel" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not rendering ThreadSidebarPanel"
  exit 1
fi

echo "[2/5] Sidebar component file must exist and export ThreadSidebarPanel..."
if ! grep -q "export function ThreadSidebarPanel" "$SIDEBAR_COMPONENT_FILE"; then
  echo "FAIL: ThreadSidebarPanel component export missing"
  exit 1
fi

echo "[3/5] App.tsx should not inline the sidebar lane/search markup..."
if grep -q "className=\"session-search\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still inlines session-search sidebar markup"
  exit 1
fi
if grep -q 'className={`thread-lane-switch' "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still inlines thread-lane-switch markup"
  exit 1
fi

echo "[4/5] Component should own sidebar lane/search/project markup..."
if ! grep -q "className=\"session-search\"" "$SIDEBAR_COMPONENT_FILE"; then
  echo "FAIL: ThreadSidebarPanel missing session-search markup"
  exit 1
fi
if ! grep -q 'className={`thread-lane-switch' "$SIDEBAR_COMPONENT_FILE"; then
  echo "FAIL: ThreadSidebarPanel missing thread-lane-switch markup"
  exit 1
fi
if ! grep -q "className=\"project-group\"" "$SIDEBAR_COMPONENT_FILE"; then
  echo "FAIL: ThreadSidebarPanel missing project-group markup"
  exit 1
fi

echo "[5/5] App.tsx should still route project transitions through shared controller..."
if ! grep -q "threadPanelController.toggleProjectExpanded" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx lost controller wiring for project expand"
  exit 1
fi
if ! grep -q "threadPanelController.startDraftInProject" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx lost controller wiring for project draft"
  exit 1
fi

echo "PASS: thread sidebar component regression checks passed."
