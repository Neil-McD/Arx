#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

echo "== Auth env contract guard =="

AUTH_CORE_FILE="shared/authCore.ts"
WEB_AUTH_CONTROLLER_FILE="apps/web/src/controllers/useWebAppAuthController.ts"
WEB_LOGIN_TRAMPOLINE_FILE="apps/web/src/auth/loginTrampoline.tsx"
WEB_MAIN_FILE="apps/web/src/main.tsx"
WEB_APP_FILE="apps/web/src/App.tsx"
AUTH_CONFIG_FILE="convex/auth.config.ts"
CONVEX_HTTP_FILE="convex/http.ts"
AUTH_HTTP_FILE="convex/httpAuth.ts"
AUTH_BRIDGE_HTTP_FILE="convex/httpAuthBridge.ts"
API_AUTH_DIR="api/auth"
ROOT_ENV_FILE=".env.example"
WEB_ENV_FILE="apps/web/.env.example"
WEB_PACKAGE_FILE="apps/web/package.json"

require_match_in_file() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if ! rg -n -S "$pattern" "$file" >/dev/null; then
    echo "FAIL: missing contract marker: $description"
    exit 1
  fi
  echo "OK: $description"
}

forbid_match_in_file() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  guard_rg_assert_absent \
    "forbidden pattern: $description" \
    -n -S "$pattern" "$file"
  echo "OK: $description"
}

forbid_multiline_match_in_file() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if PATTERN="$pattern" perl -0ne 'BEGIN { $pattern = $ENV{"PATTERN"}; $found = 0 } if (/$pattern/s) { $found = 1 } END { exit($found ? 0 : 1) }' "$file"; then
    echo "FAIL: forbidden pattern detected: $description"
    exit 1
  fi
  echo "OK: $description"
}

forbid_file_exists() {
  local path="$1"
  local description="$2"
  if [[ -e "$path" ]]; then
    echo "FAIL: forbidden file exists: $description"
    exit 1
  fi
  echo "OK: $description"
}

echo "[1/6] Validating canonical auth continuity contract in shared auth core..."
require_match_in_file "$AUTH_CORE_FILE" 'readFirstNonEmptyEnv\(\["VITE_CONVEX_URL"\]\)' \
  "auth URL lookup is Convex-only"
require_match_in_file "$AUTH_CORE_FILE" 'readFirstNonEmptyEnv\(\["VITE_CONVEX_PUBLIC_KEY"\]\)' \
  "optional runtime API key lookup uses VITE_CONVEX_PUBLIC_KEY"
require_match_in_file "$AUTH_CORE_FILE" 'AUTH_GATEWAY_BEGIN_PATH|AUTH_GATEWAY_SESSION_PATH|AUTH_GATEWAY_REFRESH_PATH|AUTH_GATEWAY_LOGOUT_PATH' \
  "shared auth core exposes same-origin auth bridge endpoints"
require_match_in_file "$AUTH_CORE_FILE" 'beginOAuthSignIn|bootstrapSession|logoutAuthSessionRemote|refreshAuthSessionResult' \
  "shared auth core exposes browser auth bridge helpers"
forbid_match_in_file "$AUTH_CORE_FILE" 'VITE_AUTH_URL' \
  "shared auth core must not use VITE_AUTH_URL"
forbid_match_in_file "$AUTH_CORE_FILE" 'VITE_AUTH_PUBLIC_KEY' \
  "shared auth core must not use VITE_AUTH_PUBLIC_KEY"
forbid_match_in_file "$AUTH_CORE_FILE" 'CLOUD_FUNCTIONS_V1_SEGMENT' \
  "shared auth core must not classify legacy /functions/v1 surface"
forbid_match_in_file "$AUTH_CORE_FILE" 'pgrst303|pgrst301' \
  "shared auth core must not depend on PostgREST auth error codes"

echo "[2/6] Validating web auth controller uses same-origin auth bridge with direct handoff..."
require_match_in_file "$WEB_AUTH_CONTROLLER_FILE" 'beginOAuthSignIn\(\{ returnTo \}\)' \
  "web auth controller starts sign-in through the same-origin auth bridge"
require_match_in_file "$WEB_AUTH_CONTROLLER_FILE" 'window\.location\.assign\(authUrl\)' \
  "web auth controller dispatches the prepared same-origin sign-in URL"
require_match_in_file "$WEB_AUTH_CONTROLLER_FILE" 'bootstrapSessionDetailed\(|bootstrapSession\(' \
  "web auth controller bootstraps through the same-origin auth bridge"
require_match_in_file "$WEB_AUTH_CONTROLLER_FILE" 'refreshAuthSessionResult' \
  "web auth controller refreshes through the same-origin auth bridge"
require_match_in_file "$WEB_AUTH_CONTROLLER_FILE" 'logoutAuthSessionRemote' \
  "web auth controller logs out through the same-origin auth bridge"
require_match_in_file "$WEB_LOGIN_TRAMPOLINE_FILE" 'export function LoginTrampolineRoute' \
  "login trampoline route remains available as an explicit recovery route"
require_match_in_file "$WEB_MAIN_FILE" 'LoginTrampolineRoute' \
  "web entrypoint still mounts the login trampoline route"
forbid_match_in_file "$WEB_AUTH_CONTROLLER_FILE" 'workos\.|useWorkOsRuntime|isWorkOsLoginRequiredError' \
  "web auth controller must not depend on the deleted browser WorkOS runtime"

echo "[3/6] Validating web model readiness is not coupled to auth keys..."
forbid_match_in_file "$WEB_APP_FILE" 'getAuthUrl\(\) && getAuthPublicKey\(\)' \
  "web model readiness must not require auth key presence"

echo "[4/6] Validating Convex JWT verifier contract..."
require_match_in_file "$AUTH_CONFIG_FILE" 'const issuer = readEnv\("ARX_AUTH_JWT_ISSUER"\);' \
  "JWT issuer is explicitly configured"
require_match_in_file "$AUTH_CONFIG_FILE" 'const explicitJwks = readEnv\("ARX_AUTH_JWT_JWKS_URL"\);' \
  "explicit JWKS override is supported"
require_match_in_file "$AUTH_CONFIG_FILE" 'readEnv\("ARX_AUTH_JWT_AUDIENCE"\).*readEnv\("ARX_AUTH_CLIENT_ID"\)' \
  "JWT verifier audience falls back to the OAuth client id"
require_match_in_file "$AUTH_CONFIG_FILE" 'applicationID' \
  "JWT verifier binds tokens to an audience/application id"
require_match_in_file "$AUTH_CONFIG_FILE" 'do not carry aud; Convex applicationID validates aud' \
  "WorkOS user-management JWT provider documents issuer/client_id-only token shape"
forbid_multiline_match_in_file "$AUTH_CONFIG_FILE" 'issuer:\s*`https://api\.workos\.com/user_management/\$\{workOsClientId\}`,\s*algorithm:\s*"RS256",\s*applicationID:' \
  "WorkOS user-management JWT provider must not bind Convex applicationID without a real aud claim"
forbid_match_in_file "$AUTH_CONFIG_FILE" '/auth/v1' \
  "JWT issuer derivation must not append /auth/v1"
forbid_match_in_file "$AUTH_CONFIG_FILE" 'ARX_AUTH_BASE_URL|VITE_AUTH_URL' \
  "JWT verifier must not derive issuer from legacy auth base URL vars"

echo "[5/6] Validating same-origin auth bridge surfaces exist and old browser WorkOS path is removed..."
require_match_in_file "$CONVEX_HTTP_FILE" 'registerRuntimeAuthRoutes' \
  "Convex HTTP router mounts the PKCE auth start/exchange routes"
require_match_in_file "$CONVEX_HTTP_FILE" 'registerRuntimeAuthBridgeRoutes' \
  "Convex HTTP router mounts the auth continuity bridge routes"
require_match_in_file "$AUTH_HTTP_FILE" 'auth_begin_google_sign_in|auth_exchange_pkce_code' \
  "Convex auth helper exposes PKCE start/exchange routes"
require_match_in_file "$AUTH_HTTP_FILE" 'hasValidAuthBridgeSecret' \
  "Convex PKCE start/exchange routes require the auth bridge secret"
require_match_in_file "$AUTH_BRIDGE_HTTP_FILE" 'auth_bridge_session_create|auth_bridge_session_bootstrap|auth_bridge_session_refresh|auth_bridge_session_logout' \
  "Convex auth bridge exposes session continuity routes"
require_match_in_file "$API_AUTH_DIR/_bridge.js" 'callAuthBridgeJson' \
  "same-origin auth bridge helper exists"
require_match_in_file "$API_AUTH_DIR/_bridge.js" 'buildBridgeHeaders' \
  "same-origin OAuth runtime helper uses bridge-authenticated headers"
require_match_in_file "$API_AUTH_DIR/_bridge.js" 'X-Arx-Auth-Bridge-Secret' \
  "same-origin auth bridge helper sends the auth bridge secret"
require_match_in_file "$API_AUTH_DIR/google/start.js" 'auth_begin_google_sign_in' \
  "same-origin auth start route exists"
require_match_in_file "$API_AUTH_DIR/google/callback.js" 'auth_exchange_pkce_code|auth_bridge_session_create' \
  "same-origin auth callback route exchanges PKCE and stores opaque session"
forbid_match_in_file "$API_AUTH_DIR/google/callback.js" 'clearAuthSessionCookie' \
  "invalid OAuth callbacks must not clear an unrelated auth session"
require_match_in_file "$API_AUTH_DIR/session.js" 'auth_bridge_session_bootstrap' \
  "same-origin auth bootstrap route exists"
require_match_in_file "$API_AUTH_DIR/refresh.js" 'auth_bridge_session_refresh' \
  "same-origin auth refresh route exists"
require_match_in_file "$API_AUTH_DIR/logout.js" 'auth_bridge_session_logout' \
  "same-origin auth logout route exists"
forbid_file_exists "apps/web/src/auth/workosRuntime.tsx" "deleted browser WorkOS runtime stays removed"
forbid_match_in_file "$WEB_PACKAGE_FILE" '@workos-inc/authkit-react' \
  "web package must not depend on the deleted browser WorkOS SDK runtime"

echo "[6/6] Validating env templates include canonical keys and remove legacy keys..."
require_match_in_file "$ROOT_ENV_FILE" '^VITE_CONVEX_URL=' \
  "root env template declares VITE_CONVEX_URL"
require_match_in_file "$ROOT_ENV_FILE" '^VITE_CONVEX_PUBLIC_KEY=' \
  "root env template declares VITE_CONVEX_PUBLIC_KEY"
require_match_in_file "$ROOT_ENV_FILE" '^ARX_AUTH_AUTHORIZE_URL=' \
  "root env template declares ARX_AUTH_AUTHORIZE_URL"
require_match_in_file "$ROOT_ENV_FILE" '^ARX_AUTH_TOKEN_URL=' \
  "root env template declares ARX_AUTH_TOKEN_URL"
require_match_in_file "$ROOT_ENV_FILE" '^ARX_AUTH_CLIENT_ID=' \
  "root env template declares ARX_AUTH_CLIENT_ID"
require_match_in_file "$ROOT_ENV_FILE" '^ARX_AUTH_BRIDGE_SECRET=' \
  "root env template declares ARX_AUTH_BRIDGE_SECRET"
require_match_in_file "$ROOT_ENV_FILE" '^ARX_AUTH_JWT_ISSUER=' \
  "root env template declares ARX_AUTH_JWT_ISSUER"
require_match_in_file "$ROOT_ENV_FILE" '^ARX_AUTH_JWT_JWKS_URL=' \
  "root env template declares ARX_AUTH_JWT_JWKS_URL"
require_match_in_file "$ROOT_ENV_FILE" '^ARX_MCP_RESOURCE_URL=' \
  "root env template declares canonical MCP resource URL"
require_match_in_file "$ROOT_ENV_FILE" '^ARX_MCP_AUTH_JWT_AUDIENCE=' \
  "root env template declares MCP JWT audience"
require_match_in_file "$ROOT_ENV_FILE" '^ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT=' \
  "root env template declares verified-identity fallback toggle"
forbid_match_in_file "$ROOT_ENV_FILE" '^ARX_AUTH_JWT_ADDITIONAL_AUDIENCES=' \
  "root env template must not include generic JWT audience list"
forbid_match_in_file "$ROOT_ENV_FILE" '^ARX_AUTH_MAGIC_LINK_URL=' \
  "root env template must not include deleted magic-link env"
forbid_match_in_file "$ROOT_ENV_FILE" '^VITE_AUTH_URL=|^VITE_AUTH_PUBLIC_KEY=|^ARX_AUTH_BASE_URL=|^ARX_AUTH_PUBLIC_KEY=' \
  "root env template must not include legacy auth-base/public-key vars"

require_match_in_file "$WEB_ENV_FILE" '^VITE_CONVEX_URL=' \
  "web env template declares VITE_CONVEX_URL"
require_match_in_file "$WEB_ENV_FILE" '^VITE_CONVEX_PUBLIC_KEY=' \
  "web env template declares VITE_CONVEX_PUBLIC_KEY"
require_match_in_file "$WEB_ENV_FILE" 'same-origin `/api/auth/\*`' \
  "web env template documents the same-origin auth bridge posture"
forbid_match_in_file "$WEB_ENV_FILE" '^VITE_AUTH_URL=|^VITE_AUTH_PUBLIC_KEY=|ARX_AUTH_BASE_URL|ARX_AUTH_PUBLIC_KEY' \
  "web env template must not include legacy auth-base/public-key vars"
forbid_match_in_file "$WEB_ENV_FILE" 'VITE_WORKOS_CLIENT_ID|VITE_WORKOS_API_HOSTNAME|VITE_WORKOS_REDIRECT_URI|VITE_WORKOS_DEV_MODE' \
  "web env template must not include deleted browser WorkOS SDK vars"

echo "PASS: auth env contract guard passed."
