#!/usr/bin/env bash
set -euo pipefail

EXPECTED_ROOTS=(
  "/Users/neilmcdevitt/code/arx-daytona-codex-runtime-spike"
  "/Users/neilmcdevitt/code/arx-daytona-spike-mainline-adapt-20260626"
)
EXPECTED_BRANCH_PREFIX="codex/daytona-codex-runtime-spike-"
EXPECTED_SPLIT_BRANCH_PREFIX="codex/daytona-runtime-core-slice-"
EXPECTED_TOOL_AUTHORITY_BRANCH_PREFIX="codex/daytona-tool-authority-slice-"
EXPECTED_PREVIEW_COMPUTER_BRANCH_PREFIX="codex/daytona-preview-computer-slice-"
EXPECTED_MAINLINE_ADAPT_BRANCH_PREFIX="codex/daytona-spike-mainline-adapt-"
EXPECTED_CONVEX_DEPLOYMENT="dev:quick-porcupine-949"
FORBIDDEN_CONVEX_PROD="wry-hawk-715"
EXPECTED_VERCEL_PROJECT_NAME="polynet-staging"
EXPECTED_VERCEL_PROJECT_ID="prj_plXUH12pm9nZ5lWS5wJOt163maFL"
EXPECTED_VERCEL_ORG_ID="team_TJvbi4UGtg62xteusiC1Cvxy"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

ok() {
  echo "OK: $*"
}

root_allowed=false
for expected_root in "${EXPECTED_ROOTS[@]}"; do
  if [[ "$ROOT_DIR" == "$expected_root" ]]; then
    root_allowed=true
  fi
done
if [[ "$root_allowed" != "true" ]]; then
  fail "expected Daytona Codex runtime staging worktree at one of: ${EXPECTED_ROOTS[*]}, got $ROOT_DIR"
fi
ok "Daytona Codex runtime staging worktree path is exact: $ROOT_DIR"

cd "$ROOT_DIR"

git_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
git_root_allowed=false
for expected_root in "${EXPECTED_ROOTS[@]}"; do
  if [[ "$git_root" == "$expected_root" ]]; then
    git_root_allowed=true
  fi
done
if [[ "$git_root_allowed" != "true" ]]; then
  fail "git root must be one of: ${EXPECTED_ROOTS[*]}, got ${git_root:-missing}"
fi
ok "git root is exact"

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" == "main" ]]; then
  fail "refusing Daytona Codex runtime staging work from main"
fi
if [[ "$branch" != "$EXPECTED_BRANCH_PREFIX"* && "$branch" != "$EXPECTED_SPLIT_BRANCH_PREFIX"* && "$branch" != "$EXPECTED_TOOL_AUTHORITY_BRANCH_PREFIX"* && "$branch" != "$EXPECTED_PREVIEW_COMPUTER_BRANCH_PREFIX"* && "$branch" != "$EXPECTED_MAINLINE_ADAPT_BRANCH_PREFIX"* ]]; then
  fail "expected branch to start with $EXPECTED_BRANCH_PREFIX, $EXPECTED_SPLIT_BRANCH_PREFIX, $EXPECTED_TOOL_AUTHORITY_BRANCH_PREFIX, $EXPECTED_PREVIEW_COMPUTER_BRANCH_PREFIX, or $EXPECTED_MAINLINE_ADAPT_BRANCH_PREFIX, got $branch"
fi
ok "branch is Daytona Codex runtime staging safe: $branch"

convex_deployment="${CONVEX_DEPLOYMENT:-}"
if [[ -z "$convex_deployment" ]]; then
  fail "CONVEX_DEPLOYMENT must be $EXPECTED_CONVEX_DEPLOYMENT, got missing"
fi
if [[ "$convex_deployment" == "$FORBIDDEN_CONVEX_PROD" || "$convex_deployment" == "prod:$FORBIDDEN_CONVEX_PROD" ]]; then
  fail "refusing Convex prod deployment $convex_deployment"
fi
if [[ "$convex_deployment" != "$EXPECTED_CONVEX_DEPLOYMENT" ]]; then
  fail "CONVEX_DEPLOYMENT must be $EXPECTED_CONVEX_DEPLOYMENT, got $convex_deployment"
fi
ok "Convex target is staging dev: $convex_deployment"

deployment_kind="${POLYNET_DEPLOYMENT_KIND:-}"
if [[ -n "$deployment_kind" && "$deployment_kind" != "staging" ]]; then
  fail "POLYNET_DEPLOYMENT_KIND must be staging when set, got $deployment_kind"
fi
ok "deployment kind is staging-compatible"

if [[ -f "$ROOT_DIR/.vercel/project.json" ]]; then
  project_name="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(".vercel/project.json","utf8")); process.stdout.write(String(p.projectName||""));')"
  project_id="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(".vercel/project.json","utf8")); process.stdout.write(String(p.projectId||""));')"
  org_id="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(".vercel/project.json","utf8")); process.stdout.write(String(p.orgId||""));')"
  if [[ "$project_name" == "polynet" ]]; then
    fail "refusing production Vercel project polynet"
  fi
  if [[ "$project_name" != "$EXPECTED_VERCEL_PROJECT_NAME" ]]; then
    fail "Vercel project must be $EXPECTED_VERCEL_PROJECT_NAME, got ${project_name:-missing}"
  fi
  if [[ "$project_id" != "$EXPECTED_VERCEL_PROJECT_ID" ]]; then
    fail "Vercel project id mismatch for polynet-staging"
  fi
  if [[ "$org_id" != "$EXPECTED_VERCEL_ORG_ID" ]]; then
    fail "Vercel org id mismatch for staging"
  fi
  ok "Vercel is linked to staging project: $project_name"
else
  if [[ "${POLYNET_CODEX_WORKER_REQUIRE_VERCEL_LINK:-}" == "true" ]]; then
    fail ".vercel/project.json missing; link this worktree to polynet-staging before Vercel work"
  fi
  ok "Vercel link absent; local-only worker work is allowed"
fi

if [[ -f "$ROOT_DIR/.env.blaxel.local" ]] && ! git check-ignore -q .env.blaxel.local; then
  fail ".env.blaxel.local must remain ignored"
fi
if [[ -f "$ROOT_DIR/.env.staging.local" ]] && ! git check-ignore -q .env.staging.local; then
  fail ".env.staging.local must remain ignored"
fi
if [[ -e "$ROOT_DIR/.vercel" ]] && ! git check-ignore -q .vercel; then
  fail ".vercel must remain ignored"
fi
ok "local secret/linkage paths are ignored when present"

if git diff --name-only --cached --diff-filter=ACMR | grep -vE '\.example$' | grep -E '(^|/)node_modules(/|$)|(^|/)dist(/|$)|(^|/)\.env(\.|$)|(^|/)\.vercel(/|$)' >/dev/null; then
  fail "staged generated/secret/linkage files detected"
fi
ok "no staged dependency/build/secret/linkage files"

echo "PASS: Daytona Codex runtime staging guard is correct."
