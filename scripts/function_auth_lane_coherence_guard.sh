#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

AUTH_CORE="shared/supabaseAuthCore.ts"
AUTH_SHARED="supabase/functions/_shared/auth.ts"
SUPABASE_ADMIN="supabase/functions/_shared/supabase_admin.ts"

echo "== Function auth lane coherence guard =="

echo "[1/4] Functions lane must never force-expire a session from 401/403 alone..."
rg -F -q "const verifiedSession = await ensureSupabaseSessionForAuthenticatedSend({" "$AUTH_CORE" || {
  echo "FAIL: functions lane must verify session via /auth/v1/user before expiring locally"
  exit 1
}
rg -F -q "if (!verifiedSession) return await expireSession();" "$AUTH_CORE" || {
  echo "FAIL: functions lane must only expire after authoritative session verification fails"
  exit 1
}
if rg -n "isFunctionsBearerJwtFailure\\(finalFailure\\)\\) return await expireSession\\(\\);" "$AUTH_CORE" >/dev/null; then
  echo "FAIL: direct function-response-driven session expiry reintroduced"
  exit 1
fi
echo "PASS: functions lane local-expiry policy is fail-safe."

echo "[2/4] Function-side auth verifier must classify ambiguous verifier failures as 503..."
rg -F -q "if (includesJwtFailureText(verifyError)) {" "$AUTH_SHARED" || {
  echo "FAIL: explicit JWT failure classification missing in function auth verifier"
  exit 1
}
if rg -F -q "res.status === 401 && !includesVerifierMisconfiguredText(verifyError)" "$AUTH_SHARED"; then
  echo "FAIL: ambiguous 401 fallback-to-invalid-bearer logic reintroduced"
  exit 1
fi
rg -F -q "auth_verifier_misconfigured" "$AUTH_SHARED" || {
  echo "FAIL: verifier misconfiguration classification missing"
  exit 1
}
echo "PASS: function auth verifier contract is strict."

echo "[3/4] Supabase admin env resolution must fail fast on ARX_* vs SUPABASE_* drift..."
rg -F -q "function mismatchError(nameA: string, nameB: string): Error {" "$SUPABASE_ADMIN" || {
  echo "FAIL: missing mismatchError helper in supabase_admin"
  exit 1
}
rg -F -q "throw mismatchError(\"SUPABASE_URL\", \"ARX_SUPABASE_URL\");" "$SUPABASE_ADMIN" || {
  echo "FAIL: missing URL parity guard in supabase_admin"
  exit 1
}
rg -F -q "throw mismatchError(\"SUPABASE_SERVICE_ROLE_KEY\", \"ARX_SUPABASE_SERVICE_ROLE_KEY\");" "$SUPABASE_ADMIN" || {
  echo "FAIL: missing service-role parity guard in supabase_admin"
  exit 1
}
echo "PASS: env parity guard is present."

echo "[4/4] Optional live smoke (requires ARX_SMOKE_EMAIL + ARX_SMOKE_PASSWORD)..."
if [[ -z "${ARX_SMOKE_EMAIL:-}" || -z "${ARX_SMOKE_PASSWORD:-}" ]]; then
  echo "SKIP: live smoke not run (set ARX_SMOKE_EMAIL and ARX_SMOKE_PASSWORD to enable)."
  exit 0
fi

SMOKE_URL="${SUPABASE_URL:-${ARX_SUPABASE_URL:-}}"
SMOKE_ANON_KEY="${SUPABASE_ANON_KEY:-${VITE_SUPABASE_ANON_KEY:-${ARX_SUPABASE_ANON_KEY:-}}}"

if [[ -z "$SMOKE_URL" ]]; then
  echo "FAIL: live smoke requires SUPABASE_URL or ARX_SUPABASE_URL"
  exit 1
fi
if [[ -z "$SMOKE_ANON_KEY" ]]; then
  echo "FAIL: live smoke requires SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY / ARX_SUPABASE_ANON_KEY)"
  exit 1
fi

SMOKE_URL="$SMOKE_URL" \
SMOKE_ANON_KEY="$SMOKE_ANON_KEY" \
ARX_SMOKE_EMAIL="$ARX_SMOKE_EMAIL" \
ARX_SMOKE_PASSWORD="$ARX_SMOKE_PASSWORD" \
ARX_SMOKE_THREAD_ID="${ARX_SMOKE_THREAD_ID:-}" \
node <<'NODE'
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

const url = String(process.env.SMOKE_URL || "").trim().replace(/\/+$/, "");
const anonKey = String(process.env.SMOKE_ANON_KEY || "").trim();
const email = String(process.env.ARX_SMOKE_EMAIL || "").trim();
const password = String(process.env.ARX_SMOKE_PASSWORD || "").trim();
const threadId = String(process.env.ARX_SMOKE_THREAD_ID || "").trim() || crypto.randomUUID();

if (!url || !anonKey || !email || !password) {
  fail("missing required live-smoke inputs");
}

const authRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: {
    apikey: anonKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email, password }),
});
if (!authRes.ok) {
  const text = await authRes.text();
  fail(`password auth failed (${authRes.status}): ${text}`);
}
const authJson = await authRes.json();
const accessToken = String(authJson?.access_token || "").trim();
if (!accessToken) fail("password auth did not return access_token");

const userRes = await fetch(`${url}/auth/v1/user`, {
  method: "GET",
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
  },
});
if (!userRes.ok) {
  const text = await userRes.text();
  fail(`/auth/v1/user failed (${userRes.status}): ${text}`);
}

const fnRes = await fetch(`${url}/functions/v1/agent_turn`, {
  method: "POST",
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    thread_id: threadId,
    stream: false,
    model_id: "deepseek-r1-free",
  }),
});
const bodyText = await fnRes.text();
let bodyJson = null;
try {
  bodyJson = JSON.parse(bodyText);
} catch {
  bodyJson = null;
}

if (fnRes.status === 401) {
  fail(`agent_turn returned 401 for verified token: ${bodyText}`);
}
if (fnRes.status === 403) {
  const code = String(bodyJson?.code || "").trim().toLowerCase();
  const msg = String(bodyJson?.message || bodyJson?.error || "").toLowerCase();
  if (code.startsWith("auth_") || msg.includes("invalid bearer token") || msg.includes("missing bearer token")) {
    fail(`agent_turn returned auth-like 403 for verified token: ${bodyText}`);
  }
}
if (fnRes.status === 503) {
  const code = String(bodyJson?.code || "").trim().toLowerCase();
  if (code === "auth_verifier_misconfigured") {
    fail(`agent_turn verifier is misconfigured: ${bodyText}`);
  }
}

console.log(`PASS: live auth lane smoke passed (agent_turn status=${fnRes.status}).`);
NODE
