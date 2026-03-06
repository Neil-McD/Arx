#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Auth and billing public identity guard =="

AUTH_FILE="convex/auth.ts"
GATEWAY_FILE="shared/builderBillingStatusGateway.ts"

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

echo "[1/5] Ensuring browser-facing auth/billing queries resolve authenticated subject..."
require_multiline_match "$AUTH_FILE" \
  'export const getBuilderBillingStatus = query\([\s\S]*?const subject = await resolveAuthenticatedSubject\(\{\s*ctx,\s*authSubject: args\.authSubject \?\? null,' \
  "getBuilderBillingStatus resolves authenticated subject"

echo "[2/5] Ensuring builder billing status returns public user IDs..."
require_multiline_match "$AUTH_FILE" \
  'export const getBuilderBillingStatus = query\([\s\S]*?user_id: String\(user\.authSubject \?\? subject\)\.trim\(\) \|\| String\(user\._id\)' \
  "getBuilderBillingStatus returns public user_id"

echo "[3/5] Ensuring dev-tier override response also avoids leaking internal IDs..."
require_multiline_match "$AUTH_FILE" \
  'export const setDevTierOverride = mutation\([\s\S]*?userId: String\(user\.authSubject \?\? subject\)\.trim\(\) \|\| String\(user\._id\)' \
  "setDevTierOverride returns public userId"

echo "[4/5] Ensuring browser billing gateway uses the canonical auth query seam..."
require_multiline_match "$GATEWAY_FILE" \
  'const row = \(await client\.query\("auth:getBuilderBillingStatus" as any, \{\s*authSubject,\s*\}\)\) as BuilderBillingStatus \| null;' \
  "builder billing gateway uses canonical auth query"

echo "[5/5] Guard passed."
echo "PASS: auth/billing browser-facing user references are normalized to public IDs."
