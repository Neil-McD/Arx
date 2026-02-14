#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
SESSION_ITEM_FILE="src/components/ThreadSidebarSessionItem.tsx"

echo "== Thread session item component regression checks =="

echo "[1/5] Desktop should import and render ThreadSidebarSessionItem..."
if ! grep -q "from \"./components/ThreadSidebarSessionItem\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not importing ThreadSidebarSessionItem"
  exit 1
fi
if ! grep -q "<ThreadSidebarSessionItem" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not rendering ThreadSidebarSessionItem"
  exit 1
fi

echo "[2/5] Session item component file must exist and export ThreadSidebarSessionItem..."
if ! grep -q "export function ThreadSidebarSessionItem" "$SESSION_ITEM_FILE"; then
  echo "FAIL: ThreadSidebarSessionItem component export missing"
  exit 1
fi

echo "[3/5] App.tsx should not inline session row markup..."
if grep -q 'className={`session-item' "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still inlines session-item markup"
  exit 1
fi
if grep -q "className=\"session-action\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still inlines session-action markup"
  exit 1
fi

echo "[4/5] Component should own session row markup..."
if ! grep -q 'className={`session-item' "$SESSION_ITEM_FILE"; then
  echo "FAIL: ThreadSidebarSessionItem missing session-item markup"
  exit 1
fi
if ! grep -q "className=\"session-action\"" "$SESSION_ITEM_FILE"; then
  echo "FAIL: ThreadSidebarSessionItem missing delete action markup"
  exit 1
fi

echo "[5/5] Component should preserve delete handling contract..."
if ! grep -q "event.stopPropagation()" "$SESSION_ITEM_FILE"; then
  echo "FAIL: ThreadSidebarSessionItem is missing stopPropagation on delete button"
  exit 1
fi

echo "PASS: thread session item component regression checks passed."
