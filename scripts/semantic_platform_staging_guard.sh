#!/usr/bin/env bash
set -euo pipefail

EXPECTED_ROOT="/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719"
EXPECTED_BRANCH="codex/semantic-platform-staging-20260719"
EXPECTED_UPSTREAM="origin/codex/semantic-platform-staging-20260719"
EXPECTED_CONVEX_DEPLOYMENT="dev:quick-porcupine-949"
EXPECTED_CONVEX_URL="https://quick-porcupine-949.convex.cloud"
EXPECTED_CONVEX_SITE_URL="https://quick-porcupine-949.convex.site"
EXPECTED_VERCEL_PROJECT_NAME="polynet-staging"
EXPECTED_VERCEL_PROJECT_ID="prj_plXUH12pm9nZ5lWS5wJOt163maFL"
EXPECTED_VERCEL_ORG_ID="team_TJvbi4UGtg62xteusiC1Cvxy"
FORBIDDEN_CONVEX_PROD="wry-hawk-715"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_MODE=false

if [[ "${1:-}" == "--release" ]]; then
  RELEASE_MODE=true
elif [[ -n "${1:-}" ]]; then
  echo "FAIL: unknown argument: $1" >&2
  exit 1
fi

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

ok() {
  echo "OK: $*"
}

read_env_value() {
  local file="$1"
  local key="$2"
  local value=""

  if [[ -f "$file" ]]; then
    value="$(awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); sub(/[[:space:]]+#.*/, ""); gsub(/^[[:space:]]+|[[:space:]]+$/, ""); print; exit }' "$file")"
    value="${value#\"}"
    value="${value%\"}"
  fi
  printf '%s' "$value"
}

read_local_selector() {
  local key="$1"
  local file="$ROOT_DIR/.env.staging.local"
  read_env_value "$file" "$key"
}

require_local_selector() {
  local key="$1"
  local expected="$2"
  local value
  value="$(read_local_selector "$key")"
  [[ "$value" == "$expected" ]] || fail "$key in .env.staging.local must be $expected, got ${value:-missing}"
  ok "$key local selector is staging-only"
}

[[ "$ROOT_DIR" == "$EXPECTED_ROOT" ]] || fail "staging worktree must be $EXPECTED_ROOT, got $ROOT_DIR"
ok "worktree path is the dedicated semantic staging lane"

git_root="$(git -C "$ROOT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
[[ "$git_root" == "$EXPECTED_ROOT" ]] || fail "git root must be $EXPECTED_ROOT, got ${git_root:-missing}"
ok "git root is exact"

branch="$(git -C "$ROOT_DIR" branch --show-current)"
[[ "$branch" == "$EXPECTED_BRANCH" ]] || fail "branch must be $EXPECTED_BRANCH, got ${branch:-detached}"
[[ "$branch" != "main" ]] || fail "refusing main"
ok "branch is staging-only: $branch"

upstream="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
[[ "$upstream" == "$EXPECTED_UPSTREAM" ]] || fail "upstream must be $EXPECTED_UPSTREAM, got ${upstream:-missing}"
ok "upstream is the staging branch"

[[ -z "${CONVEX_DEPLOY_KEY:-}" ]] || fail "CONVEX_DEPLOY_KEY must be unset for staging dev deployment work"

convex_deployment="${CONVEX_DEPLOYMENT:-}"
[[ -n "$convex_deployment" ]] || fail "CONVEX_DEPLOYMENT is required"
[[ "$convex_deployment" != "$FORBIDDEN_CONVEX_PROD" ]] || fail "refusing production Convex deployment"
[[ "$convex_deployment" != "prod:$FORBIDDEN_CONVEX_PROD" ]] || fail "refusing production Convex deployment"
[[ "$convex_deployment" == "$EXPECTED_CONVEX_DEPLOYMENT" ]] || fail "CONVEX_DEPLOYMENT must be $EXPECTED_CONVEX_DEPLOYMENT, got $convex_deployment"
ok "Convex selector is staging-only"

deployment_kind="${POLYNET_DEPLOYMENT_KIND:-}"
[[ "$deployment_kind" == "staging" ]] || fail "POLYNET_DEPLOYMENT_KIND must be staging, got ${deployment_kind:-missing}"
ok "deployment kind is staging"

[[ -f "$ROOT_DIR/.env.staging.local" ]] || fail ".env.staging.local is required"
git -C "$ROOT_DIR" check-ignore -q .env.staging.local || fail ".env.staging.local must remain ignored"
require_local_selector "CONVEX_DEPLOYMENT" "$EXPECTED_CONVEX_DEPLOYMENT"
require_local_selector "POLYNET_DEPLOYMENT_KIND" "staging"
require_local_selector "VERCEL_PROJECT_NAME" "$EXPECTED_VERCEL_PROJECT_NAME"
require_local_selector "VERCEL_PROJECT_ID" "$EXPECTED_VERCEL_PROJECT_ID"
require_local_selector "VERCEL_ORG_ID" "$EXPECTED_VERCEL_ORG_ID"

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  git -C "$ROOT_DIR" check-ignore -q .env.local || fail ".env.local must remain ignored"
  local_convex_deployment="$(read_env_value "$ROOT_DIR/.env.local" "CONVEX_DEPLOYMENT")"
  local_convex_url="$(read_env_value "$ROOT_DIR/.env.local" "VITE_CONVEX_URL")"
  local_convex_site_url="$(read_env_value "$ROOT_DIR/.env.local" "VITE_CONVEX_SITE_URL")"
  [[ "$local_convex_deployment" == "$EXPECTED_CONVEX_DEPLOYMENT" ]] || fail ".env.local CONVEX_DEPLOYMENT must be staging, got ${local_convex_deployment:-missing}"
  [[ "$local_convex_url" == "$EXPECTED_CONVEX_URL" ]] || fail ".env.local VITE_CONVEX_URL must be the staging client URL"
  [[ "$local_convex_site_url" == "$EXPECTED_CONVEX_SITE_URL" ]] || fail ".env.local VITE_CONVEX_SITE_URL must be the staging HTTP actions URL"
  ok ".env.local is bound to Convex staging"
fi

PROJECT_JSON="$ROOT_DIR/.vercel/project.json"
[[ -f "$PROJECT_JSON" ]] || fail ".vercel/project.json is required"
git -C "$ROOT_DIR" check-ignore -q .vercel/project.json || fail ".vercel/project.json must remain ignored"

project_name="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(String(p.projectName || ""));' "$PROJECT_JSON")"
project_id="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(String(p.projectId || ""));' "$PROJECT_JSON")"
org_id="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(String(p.orgId || ""));' "$PROJECT_JSON")"

[[ "$project_name" != "polynet" ]] || fail "refusing production Vercel project"
[[ "$project_name" == "$EXPECTED_VERCEL_PROJECT_NAME" ]] || fail "Vercel project must be $EXPECTED_VERCEL_PROJECT_NAME, got ${project_name:-missing}"
[[ "$project_id" == "$EXPECTED_VERCEL_PROJECT_ID" ]] || fail "Vercel staging project id mismatch"
[[ "$org_id" == "$EXPECTED_VERCEL_ORG_ID" ]] || fail "Vercel staging org id mismatch"
ok "Vercel link is the canonical non-production project"

if git -C "$ROOT_DIR" diff --name-only --cached --diff-filter=ACMR \
  | grep -vE '\.example$' \
  | grep -E '(^|/)(node_modules|dist|\.vercel)(/|$)|(^|/)\.env(\.|$)' >/dev/null; then
  fail "staged dependency, build, environment, or Vercel linkage file detected"
fi
ok "no forbidden generated or environment files are staged"

if [[ "$RELEASE_MODE" == "true" ]]; then
  [[ -z "$(git -C "$ROOT_DIR" status --porcelain=v1)" ]] || fail "release mode requires a clean worktree"
  divergence="$(git -C "$ROOT_DIR" rev-list --left-right --count 'HEAD...@{upstream}')"
  [[ "$divergence" == $'0\t0' || "$divergence" == "0 0" ]] || fail "release mode requires HEAD to match $EXPECTED_UPSTREAM, got $divergence"
  ok "release commit is clean and matches its remote staging branch"
fi

echo "PASS: semantic platform staging identity is isolated from production."
