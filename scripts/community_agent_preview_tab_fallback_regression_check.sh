#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_APP_FILE="apps/web/src/App.tsx"
DESKTOP_UI_HOOK_FILE="src/controllers/desktop/useDesktopUiLifecycleEffects.ts"
HOOK_FILE="shared/useCommunityAgentPreviewTabFallbackEffect.ts"

echo "== Community-agent preview-tab fallback regression checks =="

echo "[1/8] Shared preview-tab fallback hook should exist and export expected API..."
if [[ ! -f "$HOOK_FILE" ]]; then
  echo "FAIL: missing shared useCommunityAgentPreviewTabFallbackEffect hook file"
  exit 1
fi
if ! grep -q "export function useCommunityAgentPreviewTabFallbackEffect" "$HOOK_FILE"; then
  echo "FAIL: shared preview-tab fallback hook export missing"
  exit 1
fi

echo "[2/8] Desktop lifecycle controller should import shared preview-tab fallback hook..."
if ! grep -q 'from "../../../shared/useCommunityAgentPreviewTabFallbackEffect"' "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop lifecycle controller missing shared preview-tab fallback import"
  exit 1
fi

echo "[3/8] Web app should import shared preview-tab fallback hook..."
if ! grep -q 'from "../../../shared/useCommunityAgentPreviewTabFallbackEffect"' "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing shared preview-tab fallback import"
  exit 1
fi

echo "[4/8] Desktop and web should invoke shared preview-tab fallback hook..."
if ! grep -q "useCommunityAgentPreviewTabFallbackEffect({" "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop lifecycle controller missing useCommunityAgentPreviewTabFallbackEffect invocation"
  exit 1
fi
if ! grep -q "useCommunityAgentPreviewTabFallbackEffect({" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing useCommunityAgentPreviewTabFallbackEffect invocation"
  exit 1
fi

echo "[5/8] Desktop lifecycle controller should not keep inline preview-tab fallback effect..."
if grep -Fq "const first = params.communityAgentDraftLanding.tabs[0]?.id ?? \"\";" "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop lifecycle controller still contains inline preview-tab fallback first-tab logic"
  exit 1
fi
if grep -Fq "params.setCommunityAgentPreviewTabId((prev) =>" "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop lifecycle controller still contains inline preview-tab fallback setter"
  exit 1
fi

echo "[6/8] Web app should not keep inline preview-tab fallback effects..."
if rg -U -q "const first = communityAgentDraftLanding\\.tabs\\[0\\]\\?\\.id \\?\\? \"\";\\s*if \\(!first\\) return;" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains inline preview-tab fallback guard effect"
  exit 1
fi
if rg -U -q "const first = communityAgentDraftLanding\\.tabs\\[0\\]\\?\\.id \\?\\? \"\";\\s*setCommunityAgentPreviewTabId\\(\\(prev\\) =>" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains inline preview-tab fallback callback effect"
  exit 1
fi

echo "[7/8] Shared hook should preserve fallback semantics..."
if ! grep -q "if (!prev) return first;" "$HOOK_FILE"; then
  echo "FAIL: shared preview-tab fallback hook missing empty-prev fallback behavior"
  exit 1
fi
if ! grep -q "args.tabs.some((tab) => tab.id === prev)" "$HOOK_FILE"; then
  echo "FAIL: shared preview-tab fallback hook missing membership check"
  exit 1
fi

echo "[8/8] Desktop and web should keep resetWhenNoTabs explicit..."
if ! grep -q "resetWhenNoTabs: true" "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop lifecycle controller missing resetWhenNoTabs: true"
  exit 1
fi
if ! grep -q "resetWhenNoTabs: true" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing resetWhenNoTabs: true"
  exit 1
fi

echo "PASS: community-agent preview-tab fallback regression checks passed."
