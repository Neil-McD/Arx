#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

echo "== Convex verified identity guard =="

TARGET_FILE="convex/http.ts"
AUTH_FILE="convex/auth.ts"
AUTH_ACTOR_FILE="convex/authActor.ts"
GATES_FILE="convex/gates.ts"
THREADS_FILE="convex/threads.ts"
COMMUNITY_LIFECYCLE_FILE="convex/communityLifecycle.ts"
AUTH_IDENTITY_FILE="convex/authIdentity.ts"

require_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if ! rg -n --pcre2 "$pattern" "$file" >/dev/null; then
    echo "FAIL: $message"
    exit 1
  fi
  echo "OK: $message"
}

echo "[1/13] Ensuring Convex identity verification is present..."
require_contains "$AUTH_IDENTITY_FILE" 'ctx\.auth\.getUserIdentity\(\)' \
  "runtime auth must use Convex verified identity"

echo "[2/13] Ensuring verified identity helper is present and wired..."
require_contains "$TARGET_FILE" 'async function requireVerifiedIdentity\(' \
  "requireVerifiedIdentity helper exists"
require_contains "$TARGET_FILE" 'identity = await readAuthenticatedIdentityProfile\(ctx\)' \
  "requireVerifiedIdentity delegates to authIdentity helper"

echo "[3/13] Ensuring legacy manual JWT-claim trust helpers are absent..."
LEGACY_PATTERN='function\s+extractBearerToken\s*\(|function\s+decodeJwtClaims\s*\(|decodeJwtClaims\s*\(|extractBearerToken\s*\('
guard_rg_assert_absent \
  "manual JWT parsing helpers in $TARGET_FILE" \
  -n --pcre2 "$LEGACY_PATTERN" "$TARGET_FILE"
echo "OK: no manual JWT parsing helpers remain in $TARGET_FILE."

echo "[4/13] Ensuring authenticated-subject resolver is fail-closed by default..."
require_contains "$AUTH_IDENTITY_FILE" 'throw new Error\("verified_identity_required"\)' \
  "authIdentity requires verified identity when fallback is disabled"
require_contains "$AUTH_IDENTITY_FILE" 'ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT' \
  "authIdentity fallback is explicitly env-gated"
guard_rg_assert_absent \
  "unconditional explicit subject fallback in $AUTH_IDENTITY_FILE" \
  -n --fixed-strings 'const subject = verifiedSubject || explicitSubject;' "$AUTH_IDENTITY_FILE"
echo "OK: no unconditional explicit-subject fallback in $AUTH_IDENTITY_FILE."

echo "[5/13] Ensuring auth functions resolve authenticated subject via identity helper..."
require_contains "$AUTH_ACTOR_FILE" 'resolveAuthenticatedSubject\(' \
  "convex/authActor.ts must resolve authenticated subject via identity helper"
require_contains "$AUTH_FILE" 'ensureAuthenticatedActor\(|findAuthenticatedActorState\(|resolveAuthenticatedActor\(' \
  "convex/auth.ts delegates authenticated actor resolution through authActor seam"
if [[ -e "$GATES_FILE" ]]; then
  echo "FAIL: $GATES_FILE was retired (POL-10) and must stay deleted"
  exit 1
fi

echo "[6/13] Ensuring thread functions resolve owner via verified identity..."
require_contains "$THREADS_FILE" 'resolveOwnerIdForAuthenticatedRequest\(' \
  "convex/threads.ts must resolve owner identity through authenticated subject helper"

echo "[7/13] Ensuring community create path resolves actor identity via authenticated subject..."
require_contains "$COMMUNITY_LIFECYCLE_FILE" 'resolveUserIdForAuthenticatedRequest\(' \
  "convex/communityLifecycle.ts must resolve user identity through authenticated subject helper"
guard_rg_assert_absent \
  "hard-required ownerId in createCommunity" \
  -n --fixed-strings 'ownerId: v.id("users")' "$COMMUNITY_LIFECYCLE_FILE"
echo "OK: createCommunity allows authenticated-subject-first identity resolution."

echo "[8/13] Ensuring the retired funding-gate queries stay deleted..."
echo "OK: $GATES_FILE is absent (checked in step 5)."

echo "[9/13] Ensuring public APIs allow authenticated-subject-first identity resolution..."
if ! python - "$THREADS_FILE" "$COMMUNITY_LIFECYCLE_FILE" 'convex/communityAdmin.ts' 'convex/communityAgent.ts' 'convex/communityChat.ts' <<'PYGUARD'
import pathlib
import re
import sys

# Internal functions receive an already resolved actor from trusted server code.
# Public query/mutation/action arguments must keep authenticated-subject-first entry.
pattern = re.compile(
    r'export const (\w+) = (mutation|query|action)\(\{\s*args:\s*\{(?P<body>.*?)\}\s*,\s*handler\s*:',
    re.S,
)
def violations(text, field):
    required = re.compile(r'\b' + field + r'\s*:\s*v\.id\(\s*["\']users["\']\s*\)')
    return [match.group(1) for match in pattern.finditer(text) if required.search(match.group("body"))]

for kind in ("query", "mutation", "action"):
    assert violations(f'export const unsafe = {kind}({{args: {{ userId: v.id("users") }}, handler: x}})', "userId") == ["unsafe"]
    assert violations(f'export const safe = {kind}({{args: {{ userId: v.optional(v.id("users")) }}, handler: x}})', "userId") == []
    assert violations(f'export const trusted = internal{kind.title()}({{args: {{ userId: v.id("users") }}, handler: x}})', "userId") == []

bad = []
for index, raw_path in enumerate(sys.argv[1:]):
    path = pathlib.Path(raw_path)
    field = "ownerId" if index == 0 else "userId"
    bad.extend(f"{path}:{name}" for name in violations(path.read_text(), field))
if bad:
    print("\n".join(bad))
    sys.exit(1)
PYGUARD
then
  echo "FAIL: required caller ID reintroduced in public thread/community Convex functions."
  exit 1
fi
echo "OK: public thread/community APIs allow authenticated-subject-first identity resolution."
guard_rg_assert_absent \
  "ownerId-only fallback in thread resolvers" \
  -n --fixed-strings 'owner_identity_required' "$THREADS_FILE"
echo "OK: thread resolvers do not allow ownerId-only fallback."

echo "[10/13] Ensuring community create API accepts authSubject..."
if ! rg -n --fixed-strings 'authSubject: v.optional(v.string())' "$COMMUNITY_LIFECYCLE_FILE" >/dev/null; then
  echo "FAIL: createCommunity missing optional authSubject input."
  exit 1
fi
echo "OK: community create API accepts optional authSubject."

echo "[11/13] Ensuring community APIs avoid hard-required caller userId..."
# Public argument validation runs with the thread check above; internal readers
# intentionally take a server-resolved actor ID.
echo "OK: community public caller ID arguments were checked in step 9."
guard_rg_assert_absent \
  "userId-only fallback in community resolver" \
  -n --fixed-strings 'user_identity_required' "$COMMUNITY_LIFECYCLE_FILE" 'convex/communityAdmin.ts' 'convex/communityAgent.ts' 'convex/communityChat.ts'
echo "OK: community resolver does not allow userId-only fallback."

echo "[12/13] Ensuring env templates include verified-identity fallback toggle..."
if ! rg -n --fixed-strings 'ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT=' '.env.example' >/dev/null; then
  echo "FAIL: .env.example missing ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT toggle."
  exit 1
fi
echo "OK: .env.example documents verified-identity fallback toggle."
if ! rg -n --fixed-strings 'ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT' 'apps/web/.env.example' >/dev/null; then
  echo "FAIL: apps/web/.env.example missing ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT toggle note."
  exit 1
fi
echo "OK: apps/web/.env.example documents verified-identity fallback toggle."

echo "[13/13] Guard passed."
echo "PASS: Convex verified identity guard checks runtime + gate/auth surfaces."
