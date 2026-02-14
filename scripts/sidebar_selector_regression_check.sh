#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
WEB_APP_FILE="apps/web/src/App.tsx"
SELECTOR_FILE="shared/threadSidebarSelectors.ts"

echo "== Sidebar selector regression checks =="

echo "[1/5] Desktop and web should import shared sidebar selectors..."
if ! grep -q "from \"../shared/threadSidebarSelectors\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not importing shared threadSidebarSelectors helper"
  exit 1
fi
if ! grep -q "from \"../../../shared/threadSidebarSelectors\"" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not importing shared threadSidebarSelectors helper"
  exit 1
fi

echo "[2/5] Shared selector file must export core helpers..."
if ! grep -q "export function groupThreadsByDate" "$SELECTOR_FILE"; then
  echo "FAIL: shared threadSidebarSelectors missing groupThreadsByDate export"
  exit 1
fi
if ! grep -q "export function normalizeThreadLane" "$SELECTOR_FILE"; then
  echo "FAIL: shared threadSidebarSelectors missing normalizeThreadLane export"
  exit 1
fi
if ! grep -q "export function searchThreads" "$SELECTOR_FILE"; then
  echo "FAIL: shared threadSidebarSelectors missing searchThreads export"
  exit 1
fi

echo "[3/5] App shells should not redefine groupThreadsByDate locally..."
if grep -q "function groupThreadsByDate(" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app still defines local groupThreadsByDate"
  exit 1
fi
if grep -q "function groupThreadsByDate(" "$WEB_APP_FILE"; then
  echo "FAIL: web app still defines local groupThreadsByDate"
  exit 1
fi

echo "[4/5] Desktop should not redefine normalizeThreadLane locally..."
if grep -q "function normalizeThreadLane(" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app still defines local normalizeThreadLane"
  exit 1
fi

echo "[5/5] App shells should use shared search/visibility selectors..."
if ! grep -q "filterVisibleThreads(" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not using shared filterVisibleThreads helper"
  exit 1
fi
if ! grep -q "searchThreads(" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not using shared searchThreads helper"
  exit 1
fi
if ! grep -q "filterVisibleThreads(" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not using shared filterVisibleThreads helper"
  exit 1
fi
if ! grep -q "searchThreads(" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not using shared searchThreads helper"
  exit 1
fi

echo "PASS: sidebar selector regression checks passed."
