#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
WEB_APP_FILE="apps/web/src/App.tsx"
HOOK_FILE="shared/useWorkspaceAutoScroll.ts"

echo "== Workspace auto-scroll regression checks =="

echo "[1/8] App shells should import shared workspace auto-scroll hook..."
if ! grep -q 'from "../shared/useWorkspaceAutoScroll"' "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not importing useWorkspaceAutoScroll"
  exit 1
fi
if ! grep -q 'from "../../../shared/useWorkspaceAutoScroll"' "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not importing useWorkspaceAutoScroll"
  exit 1
fi

echo "[2/8] Shared workspace auto-scroll hook should exist and export contract..."
if [[ ! -f "$HOOK_FILE" ]]; then
  echo "FAIL: missing shared workspace auto-scroll hook file"
  exit 1
fi
if ! grep -q "export function useWorkspaceAutoScroll" "$HOOK_FILE"; then
  echo "FAIL: useWorkspaceAutoScroll export missing"
  exit 1
fi

echo "[3/8] App shells should instantiate shared workspace auto-scroll hook..."
if ! grep -q "useWorkspaceAutoScroll({" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not instantiating useWorkspaceAutoScroll"
  exit 1
fi
if ! grep -q "useWorkspaceAutoScroll({" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not instantiating useWorkspaceAutoScroll"
  exit 1
fi

echo "[4/8] App shells should not keep inline workspace auto-scroll handler/effect..."
if grep -q "const handleWorkspaceScroll = () =>" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx still defines inline handleWorkspaceScroll"
  exit 1
fi
if grep -q "const handleWorkspaceScroll = () =>" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline handleWorkspaceScroll"
  exit 1
fi
if grep -q "const isThreadLoad = isLoadingThreadRef.current" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx still contains inline workspace auto-scroll effect body"
  exit 1
fi
if grep -q "const isThreadLoad = isLoadingThreadRef.current" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains inline workspace auto-scroll effect body"
  exit 1
fi

echo "[5/8] Hook ownership should include RAF + bottom-state logic..."
if ! grep -q "window.requestAnimationFrame" "$HOOK_FILE"; then
  echo "FAIL: shared workspace auto-scroll hook missing RAF scheduling"
  exit 1
fi
if ! grep -q "setIsWorkspaceAtBottom" "$HOOK_FILE"; then
  echo "FAIL: shared workspace auto-scroll hook missing bottom-state wiring"
  exit 1
fi
if ! grep -q "autoScrollEnabledRef.current = atBottom" "$HOOK_FILE"; then
  echo "FAIL: shared workspace auto-scroll hook missing auto-scroll resume contract"
  exit 1
fi

echo "[6/8] App shells should still wire workspace list onScroll to handler..."
if ! grep -q "onScroll={handleWorkspaceScroll}" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx missing workspace onScroll handler wiring"
  exit 1
fi
if ! grep -q "onScroll={handleWorkspaceScroll}" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing workspace onScroll handler wiring"
  exit 1
fi

echo "[7/8] Desktop and web should preserve dependency triggers via shared hook args..."
if ! grep -q "autoScrollDependencies: \\[messages, toolCalls, streamingContent\\]" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx missing expected auto-scroll dependency wiring"
  exit 1
fi
if ! grep -q "autoScrollDependencies: \\[threadMessages, streamingContent\\]" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing expected auto-scroll dependency wiring"
  exit 1
fi

echo "[8/8] App shells should preserve behavior-specific scroll modes..."
if ! grep -q 'scrollBehavior: "instant"' "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx missing instant workspace scroll mode"
  exit 1
fi
if ! grep -q 'scrollBehavior: "auto"' "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing auto workspace scroll mode"
  exit 1
fi

echo "PASS: workspace auto-scroll regression checks passed."
