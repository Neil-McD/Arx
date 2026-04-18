#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Auth env contract guard =="

AUTH_CORE_FILE="shared/authCore.ts"
WEB_AUTH_CONTROLLER_FILE="apps/web/src/controllers/useWebAppAuthController.ts"
WEB_APP_FILE="apps/web/src/App.tsx"
AUTH_CONFIG_FILE="convex/auth.config.ts"
AUTH_HTTP_FILE="convex/httpAuth.ts"
ROOT_ENV_FILE=".env.example"
WEB_ENV_FILE="apps/web/.env.example"

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
  if rg -n -S "$pattern" "$file" >/dev/null; then
    echo "FAIL: forbidden pattern detected: $description"
    rg -n -S "$pattern" "$file" || true
    exit 1
  fi
  echo "OK: $description"
}

echo "[1/6] Validating canonical auth continuity contract in shared auth core..."
require_match_in_file "$AUTH_CORE_FILE" 'readFirstNonEmptyEnv\(\["VITE_CONVEX_URL"\]\)' \
  "auth URL lookup is Convex-only"
require_match_in_file "$AUTH_CORE_FILE" 'readFirstNonEmptyEnv\(\["VITE_CONVEX_PUBLIC_KEY"\]\)' \
  "optional runtime API key lookup uses VITE_CONVEX_PUBLIC_KEY"
require_match_in_file "$AUTH_CORE_FILE" 'AUTH_GATEWAY_MAGIC_LINK_PATH' \
  "auth core only keeps the same-origin magic-link gateway"
forbid_match_in_file "$AUTH_CORE_FILE" 'AUTH_GATEWAY_BEGIN_PATH|AUTH_GATEWAY_SESSION_PATH|AUTH_GATEWAY_REFRESH_PATH|AUTH_GATEWAY_LOGOUT_PATH' \
  "shared auth core must not carry deleted browser bridge endpoints"
forbid_match_in_file "$AUTH_CORE_FILE" 'VITE_AUTH_URL' \
  "shared auth core must not use VITE_AUTH_URL"
forbid_match_in_file "$AUTH_CORE_FILE" 'VITE_AUTH_PUBLIC_KEY' \
  "shared auth core must not use VITE_AUTH_PUBLIC_KEY"
forbid_match_in_file "$AUTH_CORE_FILE" 'CLOUD_FUNCTIONS_V1_SEGMENT' \
  "shared auth core must not classify legacy /functions/v1 surface"
forbid_match_in_file "$AUTH_CORE_FILE" 'pgrst303|pgrst301' \
  "shared auth core must not depend on PostgREST auth error codes"
forbid_match_in_file "$AUTH_CORE_FILE" 'beginOAuthSignIn|bootstrapSession|logoutAuthSessionRemote|refreshAuthSessionResult' \
  "shared auth core must not expose deleted browser bridge helpers"

echo "[2/6] Validating web auth controller is WorkOS-native..."
require_match_in_file "$WEB_AUTH_CONTROLLER_FILE" 'workos\.signIn\(' \
  "web auth controller signs in through WorkOS runtime"
require_match_in_file "$WEB_AUTH_CONTROLLER_FILE" 'workos\.readSession\(' \
  "web auth controller bootstraps browser session through WorkOS runtime"
forbid_match_in_file "$WEB_AUTH_CONTROLLER_FILE" 'bootstrapSession\(|refreshAuthSessionResult\(|beginGoogleSignIn\(|revokeAuthSessionRemote\(|shared/authFlow' \
  "web auth controller must not depend on deleted browser bridge helpers"

echo "[3/6] Validating web model readiness is not coupled to auth keys..."
forbid_match_in_file "$WEB_APP_FILE" 'getAuthUrl\(\) && getAuthPublicKey\(\)' \
  "web model readiness must not require auth key presence"

echo "[4/6] Validating Convex JWT verifier contract..."
require_match_in_file "$AUTH_CONFIG_FILE" 'const issuer = readEnv\("ARX_AUTH_JWT_ISSUER"\);' \
  "JWT issuer is explicitly configured"
require_match_in_file "$AUTH_CONFIG_FILE" 'const explicitJwks = readEnv\("ARX_AUTH_JWT_JWKS_URL"\);' \
  "explicit JWKS override is supported"
forbid_match_in_file "$AUTH_CONFIG_FILE" '/auth/v1' \
  "JWT issuer derivation must not append /auth/v1"
forbid_match_in_file "$AUTH_CONFIG_FILE" 'ARX_AUTH_BASE_URL|VITE_AUTH_URL' \
  "JWT verifier must not derive issuer from legacy auth base URL vars"

echo "[5/6] Validating runtime auth proxy contract is provider-agnostic..."
require_match_in_file "$AUTH_HTTP_FILE" 'resolveOAuthAuthorizeUrl\(' \
  "runtime auth route uses explicit authorize URL env"
require_match_in_file "$AUTH_HTTP_FILE" 'resolveOAuthTokenUrl\(' \
  "runtime auth route uses explicit token URL env"
require_match_in_file "$AUTH_HTTP_FILE" 'resolveOAuthClientId\(' \
  "runtime auth route uses explicit OAuth client id"
require_match_in_file "$AUTH_HTTP_FILE" 'forwardAuthFormRequest\(' \
  "runtime auth token exchange uses form-encoded OAuth transport"
forbid_match_in_file "$AUTH_HTTP_FILE" 'AUTH_V1_SEGMENT|buildAuthUpstreamUrl|resolveAuthBaseUrl' \
  "runtime auth proxy must not carry /auth/v1 base-path assumptions"

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
require_match_in_file "$ROOT_ENV_FILE" '^ARX_AUTH_JWT_ISSUER=' \
  "root env template declares ARX_AUTH_JWT_ISSUER"
require_match_in_file "$ROOT_ENV_FILE" '^ARX_AUTH_JWT_JWKS_URL=' \
  "root env template declares ARX_AUTH_JWT_JWKS_URL"
require_match_in_file "$ROOT_ENV_FILE" '^ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT=' \
  "root env template declares verified-identity fallback toggle"
forbid_match_in_file "$ROOT_ENV_FILE" '^VITE_AUTH_URL=|^VITE_AUTH_PUBLIC_KEY=|^ARX_AUTH_BASE_URL=|^ARX_AUTH_PUBLIC_KEY=' \
  "root env template must not include legacy auth-base/public-key vars"

require_match_in_file "$WEB_ENV_FILE" '^VITE_CONVEX_URL=' \
  "web env template declares VITE_CONVEX_URL"
require_match_in_file "$WEB_ENV_FILE" '^VITE_CONVEX_PUBLIC_KEY=' \
  "web env template declares VITE_CONVEX_PUBLIC_KEY"
require_match_in_file "$WEB_ENV_FILE" 'VITE_WORKOS_CLIENT_ID' \
  "web env template documents native WorkOS client id"
require_match_in_file "$WEB_ENV_FILE" 'VITE_WORKOS_REDIRECT_URI' \
  "web env template documents WorkOS redirect uri"
require_match_in_file "$WEB_ENV_FILE" 'VITE_WORKOS_DEV_MODE' \
  "web env template documents WorkOS devMode toggle"
forbid_match_in_file "$WEB_ENV_FILE" '^VITE_AUTH_URL=|^VITE_AUTH_PUBLIC_KEY=|ARX_AUTH_BASE_URL|ARX_AUTH_PUBLIC_KEY' \
  "web env template must not include legacy auth-base/public-key vars"

echo "PASS: auth env contract guard passed."
