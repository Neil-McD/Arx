#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

echo "== Auth runtime readiness check =="
echo "UTC: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Scope: $ROOT_DIR"

ENV_FILES=(
  ".env.local"
  ".env"
)

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

strip_wrapping_quotes() {
  local value="$1"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

lookup_key() {
  local key="$1"
  local file line
  for file in "${ENV_FILES[@]}"; do
    [[ -f "$file" ]] || continue
    line="$(rg -n --no-heading -m1 "^${key}=.*$" "$file" 2>/dev/null | cut -d: -f2- || true)"
    if [[ -n "$line" ]]; then
      local value="${line#*=}"
      value="$(strip_wrapping_quotes "$value")"
      trim "$value"
      return 0
    fi
  done
  printf ''
}

has_any_env_file=false
for file in "${ENV_FILES[@]}"; do
  if [[ -f "$file" ]]; then
    has_any_env_file=true
    break
  fi
done

if [[ "$has_any_env_file" != true ]]; then
  echo "FAIL: No env file found. Add .env (and optional .env.local) at repo root."
  exit 1
fi

missing_count=0
warn_count=0

require_key() {
  local key="$1"
  local hint="$2"
  local value
  value="$(lookup_key "$key")"
  if [[ -z "$value" ]]; then
    echo "FAIL: missing ${key}"
    echo "  hint: ${hint}"
    missing_count=$((missing_count + 1))
    return
  fi
  echo "OK: ${key} is set"
}

warn_if_missing() {
  local key="$1"
  local hint="$2"
  local value
  value="$(lookup_key "$key")"
  if [[ -z "$value" ]]; then
    echo "WARN: ${key} is not set"
    echo "  hint: ${hint}"
    warn_count=$((warn_count + 1))
    return
  fi
  echo "OK: ${key} is set"
}

require_any_key() {
  local description="$1"
  local hint="$2"
  shift 2
  local key value
  for key in "$@"; do
    value="$(lookup_key "$key")"
    if [[ -n "$value" ]]; then
      echo "OK: ${description} is set via ${key}"
      return
    fi
  done
  echo "FAIL: missing ${description}"
  echo "  hint: ${hint}"
  missing_count=$((missing_count + 1))
}

validate_url() {
  local key="$1"
  local value
  value="$(lookup_key "$key")"
  [[ -z "$value" ]] && return 0
  if [[ ! "$value" =~ ^https?:// ]]; then
    echo "WARN: ${key} does not look like a URL (${value})"
    warn_count=$((warn_count + 1))
    return
  fi
  echo "OK: ${key} looks like a URL"
}

echo "[1/5] Validating required Convex runtime URL..."
require_key "VITE_CONVEX_URL" "Use your Convex deployment URL: https://<deployment>.convex.cloud"
validate_url "VITE_CONVEX_URL"

echo "[2/5] Validating same-origin auth bridge configuration..."
require_key "ARX_AUTH_BRIDGE_SECRET" "Set the opaque same-origin auth bridge secret."
bridge_secret="$(lookup_key "ARX_AUTH_BRIDGE_SECRET")"
if [[ "${#bridge_secret}" -lt 32 ]]; then
  echo "WARN: ARX_AUTH_BRIDGE_SECRET is short; use a high-entropy secret in real environments."
  warn_count=$((warn_count + 1))
else
  echo "OK: ARX_AUTH_BRIDGE_SECRET looks non-trivial"
fi

echo "[3/5] Validating required server-side OAuth metadata..."
require_key "ARX_AUTH_AUTHORIZE_URL" "OAuth authorize endpoint for same-origin sign-in. WorkOS AuthKit example: https://<AUTHKIT_DOMAIN>/oauth2/authorize"
require_key "ARX_AUTH_TOKEN_URL" "OAuth token endpoint for same-origin PKCE exchange. WorkOS AuthKit example: https://<AUTHKIT_DOMAIN>/oauth2/token"
require_key "ARX_AUTH_CLIENT_ID" "OAuth client id used for PKCE sign-in and WorkOS JWT verification."
validate_url "ARX_AUTH_AUTHORIZE_URL"
validate_url "ARX_AUTH_TOKEN_URL"

echo "[4/5] Validating required Convex JWT verifier configuration..."
require_key "ARX_AUTH_JWT_ISSUER" "JWT issuer URL for verified Convex identity."
require_key "ARX_AUTH_JWT_JWKS_URL" "JWKS URL for the verified JWT issuer."
validate_url "ARX_AUTH_JWT_ISSUER"
validate_url "ARX_AUTH_JWT_JWKS_URL"
require_any_key "JWT audience binding" "Set ARX_AUTH_JWT_AUDIENCE explicitly, or ensure ARX_AUTH_CLIENT_ID is set when the JWT audience is the OAuth client id." \
  "ARX_AUTH_JWT_AUDIENCE" "ARX_AUTH_CLIENT_ID"

echo "[5/5] Validating fail-closed auth posture..."
allow_unverified="$(lookup_key "ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT")"
if [[ -z "$allow_unverified" ]]; then
  echo "WARN: ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT is unset (recommended: false)"
  warn_count=$((warn_count + 1))
else
  normalized="$(printf '%s' "$allow_unverified" | tr '[:upper:]' '[:lower:]')"
  if [[ "$normalized" == "1" || "$normalized" == "true" || "$normalized" == "yes" || "$normalized" == "on" ]]; then
    echo "FAIL: ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT is true; set it to false for verified identity enforcement."
    missing_count=$((missing_count + 1))
  else
    echo "OK: ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT is fail-closed (${allow_unverified})"
  fi
fi

warn_if_missing "ARX_AUTH_SESSION_COOKIE_DOMAIN" "Optional cross-subdomain cookie domain for the same-origin auth bridge."
warn_if_missing "ARX_AUTH_SESSION_COOKIE_MAX_AGE_SECONDS" "Optional opaque auth session cookie max age."

if [[ "$missing_count" -gt 0 ]]; then
  echo "FAIL: auth runtime readiness failed (${missing_count} required issues, ${warn_count} warnings)."
  exit 1
fi

echo "PASS: auth runtime readiness check passed (${warn_count} warnings)."
