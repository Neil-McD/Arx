#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_APP_FILE="apps/web/src/App.tsx"
DESKTOP_UI_HOOK_FILE="src/controllers/desktop/useDesktopUiLifecycleEffects.ts"
LIFECYCLE_HOOK_FILE="shared/useCommunityAgentTemplateMenuLifecycle.ts"

echo "== Community-agent template-menu lifecycle regression checks =="

echo "[1/8] Shared lifecycle hook should exist and export expected API..."
if [[ ! -f "$LIFECYCLE_HOOK_FILE" ]]; then
  echo "FAIL: missing shared useCommunityAgentTemplateMenuLifecycle hook file"
  exit 1
fi
if ! grep -q "export function useCommunityAgentTemplateMenuLifecycle" "$LIFECYCLE_HOOK_FILE"; then
  echo "FAIL: shared hook missing useCommunityAgentTemplateMenuLifecycle export"
  exit 1
fi

echo "[2/8] Desktop lifecycle controller should import shared template-menu lifecycle hook..."
if ! grep -q 'from "../../../shared/useCommunityAgentTemplateMenuLifecycle"' "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop lifecycle controller missing shared template-menu lifecycle import"
  exit 1
fi

echo "[3/8] Web app should import shared template-menu lifecycle hook..."
if ! grep -q 'from "../../../shared/useCommunityAgentTemplateMenuLifecycle"' "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing shared template-menu lifecycle import"
  exit 1
fi

echo "[4/8] Desktop and web should invoke shared template-menu lifecycle hook..."
if ! grep -q "useCommunityAgentTemplateMenuLifecycle({" "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop lifecycle controller missing useCommunityAgentTemplateMenuLifecycle invocation"
  exit 1
fi
if ! grep -q "useCommunityAgentTemplateMenuLifecycle({" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing useCommunityAgentTemplateMenuLifecycle invocation"
  exit 1
fi

echo "[5/8] Desktop lifecycle controller should not keep inline template-menu effect..."
if grep -q "if (!params.isCommunityAgentTemplateMenuOpen) return;" "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop lifecycle controller still contains inline template-menu effect gate"
  exit 1
fi
if grep -q "window.addEventListener(\"mousedown\", handleMouseDown)" "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop lifecycle controller still contains inline template-menu mousedown listener"
  exit 1
fi

echo "[6/8] Web app should not keep inline template-menu effect..."
if grep -q "if (!isCommunityAgentTemplateMenuOpen) return;" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains inline template-menu effect gate"
  exit 1
fi
if grep -q "document.addEventListener(\"mousedown\", handlePointerDown)" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains inline template-menu mousedown listener"
  exit 1
fi

echo "[7/8] Shared hook should own pointer + optional escape behavior..."
if ! grep -q "pointerHost.addEventListener(\"mousedown\", handlePointerDown)" "$LIFECYCLE_HOOK_FILE"; then
  echo "FAIL: shared template-menu lifecycle hook missing pointer listener wiring"
  exit 1
fi
if ! grep -q "if (args.closeOnEscape ?? true)" "$LIFECYCLE_HOOK_FILE"; then
  echo "FAIL: shared template-menu lifecycle hook missing optional escape gating"
  exit 1
fi

echo "[8/8] Desktop and web should preserve target-specific behavior config..."
if ! grep -q "closeOnEscape: false" "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop lifecycle controller missing closeOnEscape: false config"
  exit 1
fi
if ! grep -q "pointerTarget: \"window\"" "$DESKTOP_UI_HOOK_FILE"; then
  echo "FAIL: desktop lifecycle controller missing pointerTarget: window config"
  exit 1
fi
if ! grep -q "closeOnEscape: true" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing closeOnEscape: true config"
  exit 1
fi
if ! grep -q "pointerTarget: \"document\"" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing pointerTarget: document config"
  exit 1
fi

echo "PASS: community-agent template-menu lifecycle regression checks passed."
