#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

echo "== Auth bootstrap public identity guard =="

AUTH_FILE="convex/auth.ts"
CLIENT_FILE="shared/convexAuthenticatedClient.ts"
PROBE_FILE="shared/convexAuthSessionProbe.ts"

for file in "$AUTH_FILE" "$CLIENT_FILE" "$PROBE_FILE"; do
  if [[ ! -f "$file" ]]; then
    echo "FAIL: missing $file"
    exit 1
  fi
done

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

echo "[1/4] Ensuring bootstrapActor returns authSubject for authenticated sessions..."
require_multiline_match "$AUTH_FILE" \
  'export const bootstrapActor = mutation\([\s\S]*?ensureAuthenticatedActorDetailed\([\s\S]*?return \{[\s\S]*?authSubject: actor\.authSubject,' \
  "bootstrapActor returns authSubject"

echo "[2/4] Ensuring getActor returns authSubject for authenticated sessions..."
require_multiline_match "$AUTH_FILE" \
  'export const getActor = query\([\s\S]*?findAuthenticatedActorState\([\s\S]*?return \{[\s\S]*?authSubject,' \
  "getActor returns authSubject"
reject_multiline_match "$AUTH_FILE" \
  'authSubject: subject,' \
  "anonymous actor subject persistence removed"

echo "[3/4] Ensuring authenticated bootstrap client expects authSubject-aligned actor payloads..."
require_multiline_match "$CLIENT_FILE" \
  'const actorAuthSubject = String\(actor\?\.authSubject \?\? ""\)\.trim\(\);' \
  "bootstrap client reads actor authSubject"
require_multiline_match "$CLIENT_FILE" \
  'if \(actorAuthSubject && actorAuthSubject !== authSubject\) \{\s*throw new Error\("convex_auth_subject_mismatch"\);' \
  "bootstrap client rejects authSubject mismatch"
reject_multiline_match "$CLIENT_FILE" \
  'if \(userId !== authSubject\)' \
  "bootstrap client no longer uses public userId comparison"

echo "[4/4] Ensuring the probe uses the canonical auth:getActor seam..."
require_multiline_match "$PROBE_FILE" \
  'client\.query\("auth:getActor" as any, \{\s*authState: "authenticated",\s*authSubject,' \
  "auth session probe uses auth:getActor"

echo "Guard passed."
echo "PASS: authenticated bootstrap identity contract is normalized to authSubject."
