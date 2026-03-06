#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

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

echo "[1/6] Ensuring bootstrapActor returns public userId for authenticated sessions..."
require_multiline_match "$AUTH_FILE" \
  'export const bootstrapActor = mutation\([\s\S]*?authSubject: subject,[\s\S]*?userId: String\(user\?\.authSubject \?\? subject\)\.trim\(\) \|\| String\(userId\)' \
  "bootstrapActor returns public userId"

echo "[2/6] Ensuring getActor returns public userId for authenticated sessions..."
require_multiline_match "$AUTH_FILE" \
  'export const getActor = query\([\s\S]*?authSubject: subject,[\s\S]*?userId: String\(user\.authSubject \?\? subject\)\.trim\(\) \|\| String\(user\._id\)' \
  "getActor returns public userId"

echo "[3/6] Ensuring authenticated bootstrap client expects authSubject-aligned user IDs..."
require_multiline_match "$CLIENT_FILE" \
  'const actorAuthSubject = String\(actor\?\.authSubject \?\? ""\)\.trim\(\);' \
  "bootstrap client reads actor authSubject"
require_multiline_match "$CLIENT_FILE" \
  'if \(actorAuthSubject && actorAuthSubject !== authSubject\) \{\s*throw new Error\("convex_auth_subject_mismatch"\);' \
  "bootstrap client rejects authSubject mismatch"
require_multiline_match "$CLIENT_FILE" \
  'if \(userId !== authSubject\) \{\s*throw new Error\("convex_auth_subject_mismatch"\);' \
  "bootstrap client rejects non-public bootstrap userId"

echo "[4/6] Ensuring bootstrap client still fails closed if no bootstrap userId is returned..."
require_multiline_match "$CLIENT_FILE" \
  'if \(!userId\) \{\s*throw new Error\("convex_owner_not_found"\);' \
  "bootstrap client requires bootstrap userId"

echo "[5/6] Ensuring the probe uses the canonical auth:getActor seam..."
require_multiline_match "$PROBE_FILE" \
  'client\.query\("auth:getActor" as any, \{\s*authState: "authenticated",\s*authSubject,' \
  "auth session probe uses auth:getActor"

echo "[6/6] Guard passed."
echo "PASS: authenticated bootstrap identity contract is normalized to public IDs."
