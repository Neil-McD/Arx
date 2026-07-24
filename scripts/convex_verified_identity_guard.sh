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
BUSINESS_ANALYTICS_FILE="convex/businessAnalytics.ts"
ENTITLEMENTS_FILE="convex/entitlements.ts"
THREADS_FILE="convex/threads.ts"
PROJECTS_FILE="convex/projects.ts"
COMMUNITY_FILE="convex/community.ts"
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

echo "[1/14] Ensuring Convex identity verification is present..."
require_contains "$AUTH_IDENTITY_FILE" 'ctx\.auth\.getUserIdentity\(\)' \
  "runtime auth must use Convex verified identity"

echo "[2/14] Ensuring verified identity helper is present and wired..."
require_contains "$TARGET_FILE" 'async function requireVerifiedIdentity\(' \
  "requireVerifiedIdentity helper exists"
require_contains "$TARGET_FILE" 'identity = await readAuthenticatedIdentityProfile\(ctx\)' \
  "requireVerifiedIdentity delegates to authIdentity helper"

echo "[3/14] Ensuring legacy manual JWT-claim trust helpers are absent..."
LEGACY_PATTERN='function\s+extractBearerToken\s*\(|function\s+decodeJwtClaims\s*\(|decodeJwtClaims\s*\(|extractBearerToken\s*\('
if rg -n --pcre2 "$LEGACY_PATTERN" "$TARGET_FILE"; then
  echo "FAIL: manual JWT parsing helpers were reintroduced in $TARGET_FILE."
  exit 1
fi
echo "OK: no manual JWT parsing helpers remain in $TARGET_FILE."

echo "[4/14] Ensuring authenticated-subject resolver is fail-closed by default..."
require_contains "$AUTH_IDENTITY_FILE" 'throw new Error\("verified_identity_required"\)' \
  "authIdentity requires verified identity when fallback is disabled"
require_contains "$AUTH_IDENTITY_FILE" 'ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT' \
  "authIdentity fallback is explicitly env-gated"
if rg -n --fixed-strings 'const subject = verifiedSubject || explicitSubject;' "$AUTH_IDENTITY_FILE"; then
  echo "FAIL: unconditional explicit subject fallback reintroduced in $AUTH_IDENTITY_FILE."
  exit 1
fi
echo "OK: no unconditional explicit-subject fallback in $AUTH_IDENTITY_FILE."

echo "[5/14] Ensuring auth functions resolve authenticated subject via identity helper..."
require_contains "$AUTH_ACTOR_FILE" 'resolveAuthenticatedSubject\(' \
  "convex/authActor.ts must resolve authenticated subject via identity helper"
require_contains "$AUTH_FILE" 'ensureAuthenticatedActor\(|findAuthenticatedActorState\(|resolveAuthenticatedActor\(' \
  "convex/auth.ts delegates authenticated actor resolution through authActor seam"
require_contains "$GATES_FILE" 'findAuthenticatedActorState\(' \
  "convex/gates.ts must resolve authenticated accounts through authActor"

echo "[6/14] Ensuring authActor exclusively owns verified subject-to-account selection..."
while IFS= read -r file; do
  case "$file" in
    "$AUTH_IDENTITY_FILE"|"$AUTH_ACTOR_FILE") ;;
    *)
      echo "FAIL: parallel authenticated-subject authority remains in $file."
      exit 1
      ;;
  esac
done < <(rg -l --pcre2 'resolveAuthenticatedSubject\(' convex --glob '*.ts' --glob '!**/*.test.ts' | sort)
require_contains "$BUSINESS_ANALYTICS_FILE" 'findAuthenticatedActorState\(' \
  "business visitor identity binding uses authActor"
require_contains "$THREADS_FILE" 'resolveUserIdForAuthenticatedRequest\(' \
  "thread ownership uses authActor"
if rg -n --pcre2 'export const (resolveGateContext|resolveGateBundle|getEffectiveTierByAuthSubject|getUserByAuthSubjectInternal)\b' \
  "$GATES_FILE" "$ENTITLEMENTS_FILE" "$THREADS_FILE"; then
  echo "FAIL: deleted duplicate identity/gate surfaces were reintroduced."
  exit 1
fi
echo "OK: duplicate identity/gate surfaces remain absent."

echo "[7/14] Ensuring thread/project functions resolve owner via authenticated subject..."
require_contains "$THREADS_FILE" 'resolveOwnerIdForAuthenticatedRequest\(' \
  "convex/threads.ts must resolve owner identity through authenticated subject helper"
require_contains "$PROJECTS_FILE" 'resolveOwnerIdForAuthenticatedRequest\(' \
  "convex/projects.ts must resolve owner identity through authenticated subject helper"

echo "[8/14] Ensuring community create path resolves actor identity via authenticated subject..."
require_contains "$COMMUNITY_LIFECYCLE_FILE" 'resolveUserIdForAuthenticatedRequest\(' \
  "convex/communityLifecycle.ts must resolve user identity through authenticated subject helper"
if rg -n --fixed-strings 'ownerId: v.id("users")' "$COMMUNITY_LIFECYCLE_FILE"; then
  echo "FAIL: createCommunity reintroduced hard-required ownerId."
  exit 1
fi
echo "OK: createCommunity allows authenticated-subject-first identity resolution."

echo "[9/14] Ensuring direct authSubject-required guards are not reintroduced in gates..."
if rg -n --fixed-strings 'if (!authSubject) throw new Error("auth_subject_required")' "$GATES_FILE"; then
  echo "FAIL: direct authSubject-required guard reintroduced in $GATES_FILE."
  exit 1
fi
echo "OK: gates relies on authenticated subject helper."

echo "[10/14] Ensuring thread/project APIs are no longer hard-required to caller ownerId..."
if ! python - "$THREADS_FILE" "$PROJECTS_FILE" <<'PY'
import pathlib
import re
import sys

bad = []
pattern = re.compile(
    r'export const (\w+) = (mutation|query|action)\(\{\s*args:\s*\{(?P<body>.*?)\n\s*\},',
    re.S,
)

for raw_path in sys.argv[1:]:
    path = pathlib.Path(raw_path)
    text = path.read_text()
    for match in pattern.finditer(text):
        if 'ownerId: v.id("users")' not in match.group("body"):
            continue
        bad.append(f"{path}:{match.group(1)}")

if bad:
    print("\n".join(bad))
    sys.exit(1)
PY
then
  echo "FAIL: required ownerId argument reintroduced in public thread/project Convex functions."
  exit 1
fi
echo "OK: public thread/project APIs allow authenticated-subject-first identity resolution."
if rg -n --fixed-strings 'owner_identity_required' "$THREADS_FILE" "$PROJECTS_FILE"; then
  echo "FAIL: ownerId-only fallback path reintroduced in thread/project resolvers."
  exit 1
fi
echo "OK: thread/project resolvers do not allow ownerId-only fallback."

echo "[11/14] Ensuring community create API accepts authSubject..."
if ! rg -n --fixed-strings 'authSubject: v.optional(v.string())' "$COMMUNITY_LIFECYCLE_FILE" >/dev/null; then
  echo "FAIL: createCommunity missing optional authSubject input."
  exit 1
fi
echo "OK: community create API accepts optional authSubject."

echo "[12/14] Ensuring community APIs avoid hard-required caller userId..."
if rg -n --fixed-strings 'userId: v.id("users")' "$COMMUNITY_LIFECYCLE_FILE" 'convex/communityAdmin.ts' 'convex/communityAgent.ts' 'convex/communityChat.ts'; then
  echo "FAIL: required userId argument reintroduced in community Convex functions."
  exit 1
fi
echo "OK: community APIs avoid hard-required caller userId."
if rg -n --fixed-strings 'user_identity_required' "$COMMUNITY_LIFECYCLE_FILE" 'convex/communityAdmin.ts' 'convex/communityAgent.ts' 'convex/communityChat.ts'; then
  echo "FAIL: userId-only fallback path reintroduced in community resolver."
  exit 1
fi
echo "OK: community resolver does not allow userId-only fallback."

echo "[13/14] Ensuring env templates include verified-identity fallback toggle..."
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

echo "[14/14] Guard passed."
echo "PASS: Convex verified identity guard checks runtime + gate/auth surfaces."
