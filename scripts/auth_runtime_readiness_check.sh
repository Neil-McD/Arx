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

is_local_url() {
  local value="$1"
  [[ "$value" =~ ^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?([/?#].*)?$ ]]
}

is_truthy() {
  local normalized
  normalized="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$normalized" == "1" || "$normalized" == "true" || "$normalized" == "yes" || "$normalized" == "on" ]]
}

normalize_hostname_like() {
  local value
  value="$(trim "$1")"
  value="${value#http://}"
  value="${value#https://}"
  value="${value%%/*}"
  printf '%s' "$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
}

looks_like_authkit_ui_hostname() {
  local normalized
  normalized="$(normalize_hostname_like "$1")"
  [[ "$normalized" == "authkit.app" || "$normalized" == *.authkit.app ]]
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

echo "[2/5] Validating required browser WorkOS configuration..."
require_key "VITE_WORKOS_CLIENT_ID" "Set the browser WorkOS client id for hosted sign-in."
require_key "VITE_WORKOS_REDIRECT_URI" "Set the browser WorkOS redirect URI, for example https://www.polynet.ai/workspace."
validate_url "VITE_WORKOS_REDIRECT_URI"

echo "[3/5] Validating required Convex JWT verifier configuration..."
auth_client_id="$(lookup_key "ARX_AUTH_CLIENT_ID")"
if [[ -n "$auth_client_id" ]]; then
  echo "OK: ARX_AUTH_CLIENT_ID is set for direct WorkOS JWT verification"
else
  require_key "ARX_AUTH_JWT_ISSUER" "JWT issuer URL. Set this when you verify against a custom OIDC issuer instead of direct WorkOS JWTs."
  require_key "ARX_AUTH_JWT_JWKS_URL" "JWKS URL for your JWT issuer."
fi
validate_url "ARX_AUTH_JWT_ISSUER"
validate_url "ARX_AUTH_JWT_JWKS_URL"

echo "[4/5] Validating fail-closed auth posture..."
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

echo "[5/5] Recommended (not required) settings..."
warn_if_missing "ARX_AUTH_AUTHORIZE_URL" "OAuth authorize endpoint for MCP auth metadata. WorkOS AuthKit example: https://<AUTHKIT_DOMAIN>/oauth2/authorize"
warn_if_missing "ARX_AUTH_TOKEN_URL" "OAuth token endpoint for MCP auth metadata. WorkOS AuthKit example: https://<AUTHKIT_DOMAIN>/oauth2/token"
warn_if_missing "ARX_AUTH_JWT_AUDIENCE" "Set audience when your provider includes aud checks (often the OAuth client id for ID tokens)."
warn_if_missing "VITE_WORKOS_API_HOSTNAME" "Optional hardened browser posture only. Set this only when you have a custom Authentication API domain."

workos_redirect_uri="$(lookup_key "VITE_WORKOS_REDIRECT_URI")"
workos_api_hostname="$(lookup_key "VITE_WORKOS_API_HOSTNAME")"
workos_dev_mode="$(lookup_key "VITE_WORKOS_DEV_MODE")"

if [[ -n "$workos_api_hostname" ]] && looks_like_authkit_ui_hostname "$workos_api_hostname"; then
  echo "FAIL: VITE_WORKOS_API_HOSTNAME points at an AuthKit hosted UI domain (${workos_api_hostname})."
  echo "  hint: This env must be a custom Authentication API domain, not an *.authkit.app hosted sign-in domain."
  missing_count=$((missing_count + 1))
fi

if [[ -n "$workos_api_hostname" && -n "$workos_dev_mode" ]] && is_truthy "$workos_dev_mode"; then
  echo "WARN: VITE_WORKOS_API_HOSTNAME is set but VITE_WORKOS_DEV_MODE is still true."
  echo "  hint: Pick one posture. Custom Authentication API domain + cookie-backed continuity should use VITE_WORKOS_DEV_MODE=false."
  warn_count=$((warn_count + 1))
fi

if [[ -n "$workos_redirect_uri" ]] && ! is_local_url "$workos_redirect_uri"; then
  if [[ -z "$workos_api_hostname" ]]; then
    if [[ -n "$workos_dev_mode" ]] && is_truthy "$workos_dev_mode"; then
      echo "WARN: fallback browser auth posture is active for a non-local redirect URI."
      echo "  hint: This is valid without a custom Authentication API domain, but refresh continuity remains browser-managed."
      warn_count=$((warn_count + 1))
    else
      echo "WARN: VITE_WORKOS_API_HOSTNAME is unset and VITE_WORKOS_DEV_MODE is not true for a non-local redirect URI."
      echo "  hint: Either stay on the fallback posture (VITE_WORKOS_DEV_MODE=true) or configure a custom Authentication API domain."
      warn_count=$((warn_count + 1))
    fi
  fi
fi

if [[ "$missing_count" -gt 0 ]]; then
  echo "FAIL: auth runtime readiness failed (${missing_count} required issues, ${warn_count} warnings)."
  exit 1
fi

echo "PASS: auth runtime readiness check passed (${warn_count} warnings)."
