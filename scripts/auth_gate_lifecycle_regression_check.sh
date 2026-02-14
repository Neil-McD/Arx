#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_APP_FILE="apps/web/src/App.tsx"
HOOK_FILE="shared/useAuthGateLifecycleEffects.ts"

echo "== Auth-gate lifecycle regression checks =="

echo "[1/7] Shared auth-gate lifecycle hook should exist and export expected API..."
if [[ ! -f "$HOOK_FILE" ]]; then
  echo "FAIL: missing shared useAuthGateLifecycleEffects hook file"
  exit 1
fi
if ! grep -q "export function useAuthGateLifecycleEffects" "$HOOK_FILE"; then
  echo "FAIL: shared auth-gate lifecycle hook export missing"
  exit 1
fi

echo "[2/7] Web app should import shared auth-gate lifecycle hook..."
if ! grep -q 'from "../../../shared/useAuthGateLifecycleEffects"' "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing shared auth-gate lifecycle import"
  exit 1
fi

echo "[3/7] Web app should invoke shared auth-gate lifecycle hook..."
if ! grep -q "useAuthGateLifecycleEffects({" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing useAuthGateLifecycleEffects invocation"
  exit 1
fi

echo "[4/7] Web app should not keep inline auth-gate keydown/session-close effects..."
if grep -q "if (!isAuthGateOpen) return;" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains inline auth-gate open guard effect"
  exit 1
fi
if rg -U -q "if \\(!supabaseSession\\) return;\\s*if \\(!isAuthGateOpen\\) return;\\s*setIsAuthGateOpen\\(false\\);" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains inline auth-gate session-close effect block"
  exit 1
fi

echo "[5/7] Shared hook should own escape-key close behavior..."
if ! grep -q "if (event.key === \"Escape\") args.closeAuthGate()" "$HOOK_FILE"; then
  echo "FAIL: shared auth-gate lifecycle hook missing escape-key close behavior"
  exit 1
fi
if ! grep -q "keyHost.addEventListener(\"keydown\", handleKeyDown)" "$HOOK_FILE"; then
  echo "FAIL: shared auth-gate lifecycle hook missing keydown listener wiring"
  exit 1
fi

echo "[6/7] Shared hook should close auth gate after auth is established..."
if ! grep -q "if (!args.isAuthenticated) return;" "$HOOK_FILE"; then
  echo "FAIL: shared auth-gate lifecycle hook missing authenticated guard"
  exit 1
fi
if ! grep -q "args.closeAuthGate()" "$HOOK_FILE"; then
  echo "FAIL: shared auth-gate lifecycle hook missing closeAuthGate call"
  exit 1
fi

echo "[7/7] Auth-gate modal click-to-close wiring should remain in web UI..."
if ! grep -q "onClick={() => setIsAuthGateOpen(false)}" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx missing auth-gate modal click-to-close wiring"
  exit 1
fi

echo "PASS: auth-gate lifecycle regression checks passed."
