#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

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

echo "[2/6] Validating required auth bridge continuity settings..."
require_key "ARX_AUTH_BRIDGE_SECRET" "Opaque auth session continuity requires a shared bridge secret between Vercel auth gateway and Convex bridge."

echo "[3/6] Validating required OAuth/OIDC runtime endpoints..."
require_key "ARX_AUTH_AUTHORIZE_URL" "OAuth authorize endpoint. WorkOS AuthKit example: https://<AUTHKIT_DOMAIN>/oauth2/authorize"
require_key "ARX_AUTH_TOKEN_URL" "OAuth token endpoint. WorkOS AuthKit example: https://<AUTHKIT_DOMAIN>/oauth2/token"
require_key "ARX_AUTH_CLIENT_ID" "OAuth client id from your auth provider app settings."
validate_url "ARX_AUTH_AUTHORIZE_URL"
validate_url "ARX_AUTH_TOKEN_URL"

echo "[4/6] Validating required Convex JWT verifier configuration..."
require_key "ARX_AUTH_JWT_ISSUER" "JWT issuer URL. WorkOS AuthKit example: https://<AUTHKIT_DOMAIN>"
require_key "ARX_AUTH_JWT_JWKS_URL" "JWKS URL. WorkOS AuthKit example: https://<AUTHKIT_DOMAIN>/oauth2/jwks"
validate_url "ARX_AUTH_JWT_ISSUER"
validate_url "ARX_AUTH_JWT_JWKS_URL"

echo "[5/6] Validating fail-closed auth posture..."
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

echo "[6/6] Recommended (not required) settings..."
warn_if_missing "ARX_AUTH_JWT_AUDIENCE" "Set audience when your provider includes aud checks (often the OAuth client id for ID tokens)."
warn_if_missing "VITE_AUTH_JWT_ISSUER" "Client-side issuer hint for additional session sanity checks."
warn_if_missing "ARX_AUTH_SESSION_COOKIE_DOMAIN" "Set this to .polynet.ai when you want cross-subdomain auth continuity."

if [[ "$missing_count" -gt 0 ]]; then
  echo "FAIL: auth runtime readiness failed (${missing_count} required issues, ${warn_count} warnings)."
  exit 1
fi

echo "PASS: auth runtime readiness check passed (${warn_count} warnings)."
