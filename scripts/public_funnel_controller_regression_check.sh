#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_APP_FILE="apps/web/src/App.tsx"
HOOK_FILE="apps/web/src/controllers/useWebPublicFunnelActions.ts"

echo "== Public funnel controller regression checks =="

echo "[1/10] Web app should import public funnel controller hook..."
if ! grep -q "from \"./controllers/useWebPublicFunnelActions\"" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not importing useWebPublicFunnelActions"
  exit 1
fi

echo "[2/10] Web app should not keep inline public funnel handlers..."
if grep -q "async function joinPublicCommunity" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline joinPublicCommunity"
  exit 1
fi
if grep -q "async function requestCommunityAccess" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline requestCommunityAccess"
  exit 1
fi
if grep -q "async function loadPublicCommunity" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline loadPublicCommunity"
  exit 1
fi
if grep -q "async function capturePublicFunnelLead" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline capturePublicFunnelLead"
  exit 1
fi
if grep -q "async function startCheckoutForPlan" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline startCheckoutForPlan"
  exit 1
fi

echo "[3/10] Web app should instantiate public funnel controller hook..."
if ! grep -q "useWebPublicFunnelActions<" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not wiring useWebPublicFunnelActions"
  exit 1
fi
if ! grep -q "joinPublicCommunity," "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not consuming joinPublicCommunity from hook return"
  exit 1
fi
if ! grep -q "startCheckoutForPlan," "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not consuming startCheckoutForPlan from hook return"
  exit 1
fi

echo "[4/10] Hook file should export useWebPublicFunnelActions..."
if ! grep -q "export function useWebPublicFunnelActions<" "$HOOK_FILE"; then
  echo "FAIL: useWebPublicFunnelActions export missing"
  exit 1
fi

echo "[5/10] Hook should own public funnel/community RPC calls..."
if ! grep -q "joinPublicCommunityRpc" "$HOOK_FILE"; then
  echo "FAIL: hook is missing joinPublicCommunityRpc integration"
  exit 1
fi
if ! grep -q "request_community_access_by_slug" "$HOOK_FILE"; then
  echo "FAIL: hook is missing request_community_access_by_slug integration"
  exit 1
fi
if ! grep -q "get_my_join_request_by_slug" "$HOOK_FILE"; then
  echo "FAIL: hook is missing get_my_join_request_by_slug integration"
  exit 1
fi
if ! grep -q "intent: \"resolve\"" "$HOOK_FILE"; then
  echo "FAIL: hook is missing public_funnel resolve intent flow"
  exit 1
fi
if ! grep -q "intent: \"checkout\"" "$HOOK_FILE"; then
  echo "FAIL: hook is missing public_funnel checkout intent flow"
  exit 1
fi

echo "[6/10] Hook should not include removed public lead-capture flow..."
if grep -q "intent: \"capture_email\"" "$HOOK_FILE"; then
  echo "FAIL: hook should not include public_funnel capture_email intent flow"
  exit 1
fi
if grep -q "capturePublicFunnelLead" "$HOOK_FILE"; then
  echo "FAIL: hook should not include capturePublicFunnelLead"
  exit 1
fi

echo "[7/10] Web app should not reintroduce moved RPC calls directly..."
if grep -q "request_community_access_by_slug" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still calls request_community_access_by_slug directly"
  exit 1
fi
if grep -q "get_my_join_request_by_slug" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still calls get_my_join_request_by_slug directly"
  exit 1
fi
if grep -q "public_chat_preview" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still calls public_chat_preview directly"
  exit 1
fi
if grep -q "intent: \"resolve\"" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains public_funnel resolve flow"
  exit 1
fi
if grep -q "intent: \"checkout\"" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains public_funnel checkout flow"
  exit 1
fi
if grep -q "intent: \"capture_email\"" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains public_funnel lead-capture flow"
  exit 1
fi
if grep -q "capturePublicFunnelLead" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx should not reference capturePublicFunnelLead"
  exit 1
fi

echo "[8/10] Hook should preserve join-mode normalization..."
if ! grep -q "isCommunityJoinMode" "$HOOK_FILE"; then
  echo "FAIL: hook is missing join-mode normalization via isCommunityJoinMode"
  exit 1
fi

echo "[9/10] Hook should not depend on removed funnel schema normalization..."
if grep -q "normalizeCommunityFunnelSchema" "$HOOK_FILE"; then
  echo "FAIL: hook should not use normalizeCommunityFunnelSchema"
  exit 1
fi

echo "[10/10] Hook should preserve auth-intent gating on unauthenticated flows..."
if ! grep -q "reason: \"join_public_community\"" "$HOOK_FILE"; then
  echo "FAIL: hook missing join_public_community auth gate"
  exit 1
fi
if ! grep -q "reason: \"request_community_access\"" "$HOOK_FILE"; then
  echo "FAIL: hook missing request_community_access auth gate"
  exit 1
fi

echo "PASS: public funnel controller regression checks passed."
