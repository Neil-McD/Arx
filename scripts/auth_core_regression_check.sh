#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
WEB_APP_FILE="apps/web/src/App.tsx"
SHARED_SESSION_LIFECYCLE_FILE="shared/useSupabaseSessionLifecycle.ts"

echo "== Auth core regression checks =="

echo "[1/14] Desktop auth bootstrap must serialize OAuth callback before stored-session load..."
if ! grep -q "const oauthBootstrap = await consumeOAuthHash();" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop startup does not await consumeOAuthHash before session load"
  exit 1
fi
if ! grep -q "if (oauthBootstrap !== \"session_set\")" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop startup does not gate loadSupabaseSession on OAuth callback result"
  exit 1
fi
if grep -q "void consumeOAuthHash();" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop still triggers consumeOAuthHash in fire-and-forget mode (race risk)"
  exit 1
fi

echo "[2/14] Desktop OAuth callback contract must expose explicit outcome states and use shared helper..."
if ! grep -q "async function consumeOAuthHash(): Promise<\"none\" | \"session_set\" | \"callback_error\">" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop consumeOAuthHash is missing explicit outcome contract"
  exit 1
fi
if ! grep -q "consumeSupabaseOAuthCallback" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop consumeOAuthHash is not routed through shared consumeSupabaseOAuthCallback helper"
  exit 1
fi
if ! grep -q "export async function consumeSupabaseOAuthCallback" "shared/supabaseOAuthCallback.ts"; then
  echo "FAIL: shared supabaseOAuthCallback helper export missing"
  exit 1
fi

echo "[3/14] Desktop signout must be fail-closed locally via extracted reset helper..."
if ! grep -q "Always clear local auth state, even if remote logout fails." "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop signout is missing explicit local-clear guarantee"
  exit 1
fi
if ! grep -q "from \"./auth/resetSessionState\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not importing the extracted resetSessionState helper"
  exit 1
fi
if ! grep -q "resetDesktopSessionStateAfterSignOut({" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop signout is not routed through resetDesktopSessionStateAfterSignOut"
  exit 1
fi
if ! grep -q "export async function resetDesktopSessionStateAfterSignOut" "src/auth/resetSessionState.ts"; then
  echo "FAIL: desktop resetSessionState helper export missing"
  exit 1
fi
if ! grep -q "await deps.clearPersistedSupabaseSession();" "src/auth/resetSessionState.ts"; then
  echo "FAIL: desktop resetSessionState helper does not clear persisted session"
  exit 1
fi

echo "[4/14] Web signout must be fail-closed locally via extracted reset helper..."
if ! grep -q "Always clear local auth state, even if remote logout fails." "$WEB_APP_FILE"; then
  echo "FAIL: web signout is missing explicit local-clear guarantee"
  exit 1
fi
if ! grep -q "from \"./auth/resetSessionState\"" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not importing the extracted resetSessionState helper"
  exit 1
fi
if ! grep -q "resetWebSessionStateAfterSignOut({" "$WEB_APP_FILE"; then
  echo "FAIL: web signout is not routed through resetWebSessionStateAfterSignOut"
  exit 1
fi
if ! grep -q "export async function resetWebSessionStateAfterSignOut" "apps/web/src/auth/resetSessionState.ts"; then
  echo "FAIL: web resetSessionState helper export missing"
  exit 1
fi
if ! grep -q "await deps.clearPersistedSupabaseSession();" "apps/web/src/auth/resetSessionState.ts"; then
  echo "FAIL: web resetSessionState helper does not clear persisted session"
  exit 1
fi

echo "[5/14] Shared PKCE helper must remain source of truth..."
if ! grep -q "export function storeSupabasePkceVerifier" "shared/supabasePkce.ts"; then
  echo "FAIL: shared PKCE verifier storage helper missing"
  exit 1
fi
if ! grep -q "export function consumeSupabasePkceVerifier" "shared/supabasePkce.ts"; then
  echo "FAIL: shared PKCE verifier consume helper missing"
  exit 1
fi
if ! grep -q "export function clearOAuthCallbackParamsFromLocation" "shared/supabasePkce.ts"; then
  echo "FAIL: shared OAuth callback cleanup helper missing"
  exit 1
fi

echo "[6/14] Desktop and web must use shared auth lock/fetch helpers..."
if ! grep -q "refreshSupabaseSessionWithLock" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not using shared refreshSupabaseSessionWithLock helper"
  exit 1
fi
if ! grep -q "fetchWithSupabaseAuthShared" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not using shared fetchWithSupabaseAuthShared helper"
  exit 1
fi
if ! grep -q "refreshSupabaseSessionWithLock" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not using shared refreshSupabaseSessionWithLock helper"
  exit 1
fi
if ! grep -q "fetchWithSupabaseAuthShared" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not using shared fetchWithSupabaseAuthShared helper"
  exit 1
fi

echo "[7/14] Web auth intent storage/parsing must live in shared auth-intent helper..."
if ! grep -q "from \"../../../shared/supabaseAuthIntent\"" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not importing shared supabaseAuthIntent helper"
  exit 1
fi
if grep -q "const PENDING_AUTH_INTENT_STORAGE_KEY" "$WEB_APP_FILE"; then
  echo "FAIL: web app still defines pending auth intent storage key locally"
  exit 1
fi
if ! grep -q "export function readPendingAuthIntent" "shared/supabaseAuthIntent.ts"; then
  echo "FAIL: shared auth intent helper missing readPendingAuthIntent export"
  exit 1
fi
if ! grep -q "export function storePendingAuthIntent" "shared/supabaseAuthIntent.ts"; then
  echo "FAIL: shared auth intent helper missing storePendingAuthIntent export"
  exit 1
fi

if ! grep -q "from \"../../../shared/supabaseAuthIntentRouter\"" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not importing shared supabaseAuthIntentRouter helper"
  exit 1
fi
if [[ "$(grep -c "intent.reason ===" "$WEB_APP_FILE")" -gt 0 ]]; then
  echo "FAIL: web app still has inline pending auth intent reason-branching"
  exit 1
fi

echo "[8/14] Shared auth-intent helper must pass executable unit checks..."
node scripts/supabase_auth_intent_unit_check.mjs

echo "[9/14] Desktop and web should use shared sign-in/sign-out auth flow helper..."
if ! grep -q "beginGoogleSupabaseSignIn" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not using shared beginGoogleSupabaseSignIn helper"
  exit 1
fi
if ! grep -q "revokeSupabaseSessionRemote" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not using shared revokeSupabaseSessionRemote helper"
  exit 1
fi
if ! grep -q "beginGoogleSupabaseSignIn" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not using shared beginGoogleSupabaseSignIn helper"
  exit 1
fi
if ! grep -q "revokeSupabaseSessionRemote" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not using shared revokeSupabaseSessionRemote helper"
  exit 1
fi
if ! grep -q "export async function beginGoogleSupabaseSignIn" "shared/supabaseAuthFlow.ts"; then
  echo "FAIL: shared auth flow helper missing beginGoogleSupabaseSignIn export"
  exit 1
fi
if ! grep -q "export async function revokeSupabaseSessionRemote" "shared/supabaseAuthFlow.ts"; then
  echo "FAIL: shared auth flow helper missing revokeSupabaseSessionRemote export"
  exit 1
fi

echo "[10/14] Session-expiry fail-closed handling should route through shared helper..."
if ! grep -q "expireSupabaseSessionFailClosed" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not using shared expireSupabaseSessionFailClosed helper"
  exit 1
fi
if ! grep -q "expireSupabaseSessionFailClosed" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not using shared expireSupabaseSessionFailClosed helper"
  exit 1
fi
if ! grep -q "export async function expireSupabaseSessionFailClosed" "shared/supabaseAuthFlow.ts"; then
  echo "FAIL: shared auth flow helper missing expireSupabaseSessionFailClosed export"
  exit 1
fi

echo "[11/14] Web OAuth callback bootstrap should route through shared helper..."
if ! grep -q "consumeSupabaseOAuthCallback" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not using shared consumeSupabaseOAuthCallback helper"
  exit 1
fi
if ! grep -q "parseSupabaseOAuthCallbackFromLocation" "apps/web/src/supabase.ts"; then
  echo "FAIL: web supabase parser is not using shared parseSupabaseOAuthCallbackFromLocation helper"
  exit 1
fi

echo "[12/14] Refresh timer scheduling should route through shared timer helper..."
if ! grep -q "scheduleSupabaseRefreshTimer" "$DESKTOP_APP_FILE" && ! grep -q "useDesktopAuthSessionLifecycle" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not routed through shared refresh timer scheduling"
  exit 1
fi
if ! grep -q "scheduleSupabaseRefreshTimer" "$WEB_APP_FILE" && ! grep -q "useWebAuthSessionLifecycle" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not routed through shared refresh timer scheduling"
  exit 1
fi
if ! grep -q "export function scheduleSupabaseRefreshTimer" "shared/supabaseSessionRefreshTimer.ts"; then
  echo "FAIL: shared refresh timer helper missing scheduleSupabaseRefreshTimer export"
  exit 1
fi
if ! grep -q "scheduleSupabaseRefreshTimer" "$SHARED_SESSION_LIFECYCLE_FILE"; then
  echo "FAIL: shared session lifecycle hook is not using scheduleSupabaseRefreshTimer"
  exit 1
fi
if grep -q "expires_at - 90" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app still has inline supabase refresh delay math"
  exit 1
fi
if grep -q "expires_at - 90" "$WEB_APP_FILE"; then
  echo "FAIL: web app still has inline supabase refresh delay math"
  exit 1
fi

echo "[13/14] Focus near-expiry refresh should route through shared helper..."
if ! grep -q "bindSupabaseFocusRefresh" "$DESKTOP_APP_FILE" && ! grep -q "useDesktopAuthSessionLifecycle" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not routed through shared focus-refresh binding"
  exit 1
fi
if ! grep -q "bindSupabaseFocusRefresh" "$WEB_APP_FILE" && ! grep -q "useWebAuthSessionLifecycle" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not routed through shared focus-refresh binding"
  exit 1
fi
if ! grep -q "export function bindSupabaseFocusRefresh" "shared/supabaseSessionRefreshTimer.ts"; then
  echo "FAIL: shared refresh timer helper missing bindSupabaseFocusRefresh export"
  exit 1
fi
if ! grep -q "bindSupabaseFocusRefresh" "$SHARED_SESSION_LIFECYCLE_FILE"; then
  echo "FAIL: shared session lifecycle hook is not using bindSupabaseFocusRefresh"
  exit 1
fi
if grep -q "expires_at <= now + 60" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app still has inline focus near-expiry refresh logic"
  exit 1
fi
if grep -q "expires_at <= now + 60" "$WEB_APP_FILE"; then
  echo "FAIL: web app still has inline focus near-expiry refresh logic"
  exit 1
fi

echo "[14/14] App shells should no longer inline giant signout reset state blocks..."
WEB_SIGNOUT_BLOCK="$(awk '
  /async function handleSignOut\(\)/ { capture=1 }
  capture { print }
  capture && /async function fetchWithSupabasePublic/ { exit }
' "$WEB_APP_FILE")"
if grep -q "setCommunityMessages(\\[\\]);" <<<"$WEB_SIGNOUT_BLOCK"; then
  echo "FAIL: web App.tsx still inlines community signout reset state"
  exit 1
fi
if grep -q "setThreadMessages(\\[\\]);" <<<"$WEB_SIGNOUT_BLOCK"; then
  echo "FAIL: web App.tsx still inlines thread signout reset state"
  exit 1
fi

echo "PASS: auth core regression checks passed."
