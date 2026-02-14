#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_APP_FILE="apps/web/src/App.tsx"
HOOK_FILE="shared/useCommunityAgentRenamingResetEffect.ts"

echo "== Community-agent renaming reset regression checks =="

echo "[1/6] Shared renaming reset hook should exist and export expected API..."
if [[ ! -f "$HOOK_FILE" ]]; then
  echo "FAIL: missing shared useCommunityAgentRenamingResetEffect hook file"
  exit 1
fi
if ! grep -q "export function useCommunityAgentRenamingResetEffect" "$HOOK_FILE"; then
  echo "FAIL: shared hook missing useCommunityAgentRenamingResetEffect export"
  exit 1
fi

echo "[2/6] Web app should import shared renaming reset hook..."
if ! grep -q 'from "../../../shared/useCommunityAgentRenamingResetEffect"' "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing shared renaming reset hook import"
  exit 1
fi

echo "[3/6] Web app should invoke shared renaming reset hook..."
if ! grep -q "useCommunityAgentRenamingResetEffect({" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing useCommunityAgentRenamingResetEffect invocation"
  exit 1
fi

echo "[4/6] Web app should not keep inline renaming-reset effect..."
if rg -U -q "if \\(isCommunityAgentTemplateMenuOpen\\) return;\\s*setCommunityAgentRenamingSlot\\(null\\);\\s*setCommunityAgentRenamingValue\\(\"\"\\);" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains inline community-agent renaming reset effect"
  exit 1
fi

echo "[5/6] Shared hook should preserve reset semantics..."
if ! grep -q "if (args.isTemplateMenuOpen) return;" "$HOOK_FILE"; then
  echo "FAIL: shared renaming reset hook missing open-state guard"
  exit 1
fi
if ! grep -q "args.setCommunityAgentRenamingSlot(null)" "$HOOK_FILE"; then
  echo "FAIL: shared renaming reset hook missing slot reset behavior"
  exit 1
fi
if ! grep -q "args.setCommunityAgentRenamingValue(\"\")" "$HOOK_FILE"; then
  echo "FAIL: shared renaming reset hook missing value reset behavior"
  exit 1
fi

echo "[6/6] Web template menu lifecycle hook should still be wired..."
if ! grep -q "useCommunityAgentTemplateMenuLifecycle({" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx lost template-menu lifecycle hook wiring"
  exit 1
fi

echo "PASS: community-agent renaming reset regression checks passed."
