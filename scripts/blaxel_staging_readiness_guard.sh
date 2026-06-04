#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EXPECTED_BRANCH_PREFIX="codex/blaxel-"
EXPECTED_VERCEL_PROJECT_NAME="polynet-staging"
EXPECTED_VERCEL_PROJECT_ID="prj_plXUH12pm9nZ5lWS5wJOt163maFL"
EXPECTED_VERCEL_ORG_ID="team_TJvbi4UGtg62xteusiC1Cvxy"
EXPECTED_CONVEX_DEPLOYMENT="dev:quick-porcupine-949"
EXPECTED_PREVIEW_PROXY_ORIGIN="https://polynet-preview-proxy.fly.dev"
EXPECTED_PREVIEW_PROXY_APP="polynet-preview-proxy"
EXPECTED_SOURCE_URL_FETCHER_ENDPOINT="https://polynet-staging.vercel.app/api/source-url-fetch"
EXPECTED_COMMUNITY_WIKI_ARCHITECT_MODEL="gpt-5.5"

load_env_if_present() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

ok() {
  echo "OK: $*"
}

load_env_if_present "$ROOT_DIR/.env.staging.local"
load_env_if_present "$ROOT_DIR/.env.blaxel.local"

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" == "main" ]]; then
  fail "refusing to run staging guard on main"
fi
if [[ "$branch" != "$EXPECTED_BRANCH_PREFIX"* ]]; then
  fail "expected branch to start with $EXPECTED_BRANCH_PREFIX, got $branch"
fi
ok "branch is staging-safe: $branch"

if [[ ! -f "$ROOT_DIR/.vercel/project.json" ]]; then
  fail ".vercel/project.json missing; run vercel link for polynet-staging"
fi

project_name="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(".vercel/project.json","utf8")); process.stdout.write(String(p.projectName||""));')"
project_id="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(".vercel/project.json","utf8")); process.stdout.write(String(p.projectId||""));')"
org_id="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(".vercel/project.json","utf8")); process.stdout.write(String(p.orgId||""));')"

if [[ "$project_name" != "$EXPECTED_VERCEL_PROJECT_NAME" ]]; then
  fail "Vercel project must be $EXPECTED_VERCEL_PROJECT_NAME, got ${project_name:-missing}"
fi
if [[ "$project_id" != "$EXPECTED_VERCEL_PROJECT_ID" ]]; then
  fail "Vercel project id mismatch for staging"
fi
if [[ "$org_id" != "$EXPECTED_VERCEL_ORG_ID" ]]; then
  fail "Vercel org id mismatch for staging"
fi
ok "Vercel is linked to $project_name"

vercel_env="$(npx vercel@latest env ls --scope "$EXPECTED_VERCEL_ORG_ID" 2>/dev/null || true)"
if ! printf '%s\n' "$vercel_env" | grep -q '^ VITE_WORKSPACE_PREVIEW_ORIGIN[[:space:]]'; then
  fail "VITE_WORKSPACE_PREVIEW_ORIGIN missing in Vercel staging Production env; previews will fall back to the web app origin"
fi
ok "Vercel staging preview proxy origin is configured; expected value: $EXPECTED_PREVIEW_PROXY_ORIGIN"
if ! printf '%s\n' "$vercel_env" | grep -q '^ ARX_SOURCE_URL_FETCHER_SECRET[[:space:]]'; then
  fail "ARX_SOURCE_URL_FETCHER_SECRET missing in Vercel staging Production env; Knowledge source URL ingestion cannot fetch source material"
fi
ok "Vercel staging source URL fetcher secret is configured"

convex_deployment="${CONVEX_DEPLOYMENT:-}"
if [[ "$convex_deployment" != "$EXPECTED_CONVEX_DEPLOYMENT" ]]; then
  fail "CONVEX_DEPLOYMENT must be $EXPECTED_CONVEX_DEPLOYMENT, got ${convex_deployment:-missing}"
fi
ok "Convex staging target is explicit: $convex_deployment"

convex_env="$(CONVEX_DEPLOYMENT="$convex_deployment" npx convex env list 2>/dev/null || true)"
if ! printf '%s\n' "$convex_env" | grep -q '^ARX_PREVIEW_PROXY_SIGNING_SECRET='; then
  fail "ARX_PREVIEW_PROXY_SIGNING_SECRET missing in Convex staging env; workspace previews cannot mint proxy tokens"
fi
ok "Convex staging preview proxy signing secret is configured"
if ! printf '%s\n' "$convex_env" | grep -q '^ARX_CODEX_BRIDGE_SIGNING_SECRET='; then
  fail "ARX_CODEX_BRIDGE_SIGNING_SECRET missing in Convex staging env; Codex bridge callbacks cannot be verified"
fi
ok "Convex staging Codex bridge signing secret is configured"
if ! printf '%s\n' "$convex_env" | grep -q '^POLYNET_CODEX_BRIDGE_OPERATOR_SECRET='; then
  fail "POLYNET_CODEX_BRIDGE_OPERATOR_SECRET missing in Convex staging env; Codex bridge smokes are not operator-gated"
fi
ok "Convex staging Codex bridge operator secret is configured"
if ! printf '%s\n' "$convex_env" | grep -q '^POLYNET_CODEX_BRIDGE_OPENAI_API_KEY='; then
  fail "POLYNET_CODEX_BRIDGE_OPENAI_API_KEY missing in Convex staging env; Codex exec smoke cannot authenticate with a dedicated bridge key"
fi
ok "Convex staging Codex bridge dedicated OpenAI key is configured"
if printf '%s\n' "$convex_env" | grep -q '^POLYNET_CODEX_BRIDGE_ALLOW_SHARED_OPENAI_KEY='; then
  fail "POLYNET_CODEX_BRIDGE_ALLOW_SHARED_OPENAI_KEY must be removed; Codex bridge may not reuse shared OPENAI_API_KEY fallback"
fi
ok "Convex staging Codex bridge shared OpenAI fallback is disabled"
if ! printf '%s\n' "$convex_env" | grep -q '^ARX_SOURCE_URL_FETCHER_ENDPOINT='; then
  fail "ARX_SOURCE_URL_FETCHER_ENDPOINT missing in Convex staging env; Knowledge source URL ingestion cannot reach the broker"
fi
if ! printf '%s\n' "$convex_env" | grep -q '^ARX_SOURCE_URL_FETCHER_SECRET='; then
  fail "ARX_SOURCE_URL_FETCHER_SECRET missing in Convex staging env; Knowledge source URL ingestion cannot authenticate to the broker"
fi
source_url_fetcher_endpoint="$(CONVEX_DEPLOYMENT="$convex_deployment" npx convex env get ARX_SOURCE_URL_FETCHER_ENDPOINT 2>/dev/null | tr -d '\r' || true)"
if [[ "$source_url_fetcher_endpoint" != "$EXPECTED_SOURCE_URL_FETCHER_ENDPOINT" ]]; then
  fail "ARX_SOURCE_URL_FETCHER_ENDPOINT must be $EXPECTED_SOURCE_URL_FETCHER_ENDPOINT, got ${source_url_fetcher_endpoint:-missing}"
fi
ok "Convex staging source URL fetcher endpoint and secret are configured"

if ! printf '%s\n' "$convex_env" | grep -q '^OPENAI_API_KEY='; then
  fail "OPENAI_API_KEY missing in Convex staging env; Knowledge resource assembly cannot call OpenAI"
fi
if ! printf '%s\n' "$convex_env" | grep -q '^ARX_COMMUNITY_WIKI_ARCHITECT_MODEL='; then
  fail "ARX_COMMUNITY_WIKI_ARCHITECT_MODEL missing in Convex staging env; Knowledge resource structure cannot be organized"
fi
community_wiki_architect_model="$(CONVEX_DEPLOYMENT="$convex_deployment" npx convex env get ARX_COMMUNITY_WIKI_ARCHITECT_MODEL 2>/dev/null | tr -d '\r' || true)"
if [[ "$community_wiki_architect_model" != "$EXPECTED_COMMUNITY_WIKI_ARCHITECT_MODEL" ]]; then
  fail "ARX_COMMUNITY_WIKI_ARCHITECT_MODEL must be $EXPECTED_COMMUNITY_WIKI_ARCHITECT_MODEL, got ${community_wiki_architect_model:-missing}"
fi
ok "Convex staging community wiki architect model is configured"

source_fetcher_probe_status="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 -X POST "$EXPECTED_SOURCE_URL_FETCHER_ENDPOINT" -H 'Content-Type: application/json' --data '{"url":"https://www.iana.org/help/example-domains"}' 2>/dev/null || true)"
if [[ "$source_fetcher_probe_status" != "401" ]]; then
  fail "source URL fetcher unauthenticated probe expected HTTP 401, got ${source_fetcher_probe_status:-no response}"
fi
ok "Vercel source URL fetcher is deployed and fail-closed"

if ! fly secrets list --app "$EXPECTED_PREVIEW_PROXY_APP" 2>/dev/null | grep -q '^ ARX_PREVIEW_PROXY_SIGNING_SECRET[[:space:]]'; then
  fail "ARX_PREVIEW_PROXY_SIGNING_SECRET missing in Fly preview proxy env; workspace previews cannot verify tokens"
fi
ok "Fly preview proxy signing secret is configured"

preview_proxy_health="$(curl -sS -I --max-time 10 "$EXPECTED_PREVIEW_PROXY_ORIGIN/health" 2>/dev/null || true)"
if ! printf '%s\n' "$preview_proxy_health" | grep -q '^HTTP/.* 200'; then
  fail "preview proxy health check failed for $EXPECTED_PREVIEW_PROXY_ORIGIN"
fi
ok "Fly preview proxy health check passed"

preview_proxy_secret="$(CONVEX_DEPLOYMENT="$convex_deployment" npx convex env get ARX_PREVIEW_PROXY_SIGNING_SECRET 2>/dev/null || true)"
if [[ -z "$preview_proxy_secret" ]]; then
  fail "could not read Convex preview proxy signing secret for proxy compatibility check"
fi
preview_probe_token="$(ARX_PREVIEW_PROXY_SIGNING_SECRET="$preview_proxy_secret" node --input-type=module <<'NODE'
import { mintPreviewProxySessionToken } from "./apps/preview-proxy/previewProxySessionToken.js";
const result = await mintPreviewProxySessionToken({
  kind: "workspace_preview",
  previewUrl: "https://polynet-staging-smoke.preview.bl.run/",
  previewToken: null,
  expiresAtMs: Date.now() + 60_000,
});
if (!result.ok) {
  console.error(result.code);
  process.exit(1);
}
process.stdout.write(result.token);
NODE
)"
preview_probe_headers="$(curl -sS -I --max-time 15 "$EXPECTED_PREVIEW_PROXY_ORIGIN/_preview/start/${preview_probe_token}/" 2>/dev/null || true)"
preview_probe_reason="$(printf '%s\n' "$preview_probe_headers" | awk 'BEGIN{IGNORECASE=1} /^x-arx-proxy-reason:/ {print tolower($2); exit}' | tr -d '\r')"
case "$preview_probe_reason" in
  bad_signature_or_payload|host_rejected|missing_token|wrong_kind|missing_preview_token)
    fail "preview proxy rejected Convex-minted Blaxel preview token: $preview_probe_reason"
    ;;
esac
if ! printf '%s\n' "$preview_probe_headers" | grep -q '^HTTP/'; then
  fail "preview proxy compatibility check did not return an HTTP response"
fi
ok "Fly preview proxy accepts Convex-minted Blaxel preview tokens"

if ! git check-ignore -q .env.blaxel.local; then
  fail ".env.blaxel.local must be ignored"
fi
if ! git check-ignore -q .env.staging.local; then
  fail ".env.staging.local must be ignored"
fi
if ! git check-ignore -q .vercel; then
  fail ".vercel must be ignored"
fi
ok "local secret/linkage files are ignored"

if [[ -z "${BL_WORKSPACE:-}" ]]; then
  fail "BL_WORKSPACE missing in .env.blaxel.local"
fi
if [[ -z "${BL_API_KEY:-}" ]]; then
  fail "BL_API_KEY missing in .env.blaxel.local"
fi
ok "Blaxel credentials are present for workspace: $BL_WORKSPACE"

if [[ "$project_name" == "polynet" ]]; then
  fail "refusing production Vercel project"
fi
if [[ "$convex_deployment" == prod:* ]]; then
  fail "refusing production Convex deployment"
fi

echo "PASS: Blaxel staging readiness guard passed."
