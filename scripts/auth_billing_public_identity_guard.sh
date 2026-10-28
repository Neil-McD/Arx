#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

echo "== Auth and billing public identity guard =="

AUTH_FILE="convex/auth.ts"
GATEWAY_FILE="shared/accountCommerceStatusGateway.ts"

if [[ ! -f "$AUTH_FILE" ]]; then
  echo "FAIL: missing $AUTH_FILE"
  exit 1
fi
if [[ ! -f "$GATEWAY_FILE" ]]; then
  echo "FAIL: missing $GATEWAY_FILE"
  exit 1
fi

require_multiline_match() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if ! rg -n -U --pcre2 "$pattern" "$file" >/dev/null; then
    echo "FAIL: missing contract marker: $description"
    exit 1
  fi
  echo "OK: $description"
}

reject_multiline_match() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  guard_rg_assert_absent \
    "unexpected contract marker: $description" \
    -n -U --pcre2 "$pattern" "$file"
  echo "OK: $description"
}

echo "[1/5] Ensuring browser-facing auth/billing queries resolve authenticated subject..."
require_multiline_match "$AUTH_FILE" \
  'export const getAccountCommerceStatus = query\([\s\S]*?const \{ authSubject, actor \} = await findAuthenticatedActorState\(\{\s*ctx,\s*authSubject: args\.authSubject \?\? null,' \
  "getAccountCommerceStatus resolves authenticated subject"

echo "[2/5] Ensuring account commerce status returns public user IDs..."
require_multiline_match "$AUTH_FILE" \
  'export const getAccountCommerceStatus = query\([\s\S]*?user_id: actor\.authSubject' \
  "getAccountCommerceStatus returns public user_id"

echo "[3/5] Ensuring the retired dev-tier endpoint stays deleted..."
reject_multiline_match "$AUTH_FILE" \
  'export const setDevTierOverride' \
  "setDevTierOverride stays deleted"

echo "[4/5] Ensuring account commerce gateway uses the canonical auth query seam..."
require_multiline_match "$GATEWAY_FILE" \
  'const row = \(await client\.query\("auth:getAccountCommerceStatus" as any, \{\s*authSubject,\s*\}\)\) as AccountCommerceStatus \| null;' \
  "account commerce gateway uses canonical auth query"

echo "[5/5] Guard passed."
echo "PASS: auth/billing browser-facing user references are normalized to public IDs."
