#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EXPECTED_BRANCH_PREFIX="codex/blaxel-"
EXPECTED_VERCEL_PROJECT_NAME="polynet-staging"
EXPECTED_VERCEL_PROJECT_ID="prj_plXUH12pm9nZ5lWS5wJOt163maFL"
EXPECTED_VERCEL_ORG_ID="team_TJvbi4UGtg62xteusiC1Cvxy"
EXPECTED_CONVEX_DEPLOYMENT="quick-porcupine-949"

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

convex_deployment="${CONVEX_DEPLOYMENT:-}"
if [[ "$convex_deployment" != "$EXPECTED_CONVEX_DEPLOYMENT" ]]; then
  fail "CONVEX_DEPLOYMENT must be $EXPECTED_CONVEX_DEPLOYMENT, got ${convex_deployment:-missing}"
fi
ok "Convex staging target is explicit: $convex_deployment"

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
