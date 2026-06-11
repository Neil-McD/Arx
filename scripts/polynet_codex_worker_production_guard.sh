#!/usr/bin/env bash
set -euo pipefail

FORBIDDEN_STAGING_ROOT="/Users/neilmcdevitt/code/arx-polynet-codex-worker"
FORBIDDEN_STAGING_BRANCH_PREFIX="codex/polynet-owned-codex-worker-"
EXPECTED_CONVEX_DEPLOYMENT="prod:wry-hawk-715"
FORBIDDEN_CONVEX_STAGING="dev:quick-porcupine-949"
EXPECTED_DEPLOYMENT_KIND="production"
EXPECTED_FLY_APP="polynet-codex-worker"
FORBIDDEN_FLY_APP="polynet-codex-worker-staging"
EXPECTED_FLY_CONFIG_SUFFIX="services/polynet-codex-worker/fly.production.toml"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

ok() {
  echo "OK: $*"
}

if [[ "$ROOT_DIR" == "$FORBIDDEN_STAGING_ROOT" ]]; then
  fail "refusing production worker work from staging worktree $ROOT_DIR"
fi
ok "worker production guard root is not the staging worktree: $ROOT_DIR"

cd "$ROOT_DIR"

git_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ "$git_root" != "$ROOT_DIR" ]]; then
  fail "git root must be $ROOT_DIR, got ${git_root:-missing}"
fi
ok "git root is exact"

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" == "$FORBIDDEN_STAGING_BRANCH_PREFIX"* ]]; then
  fail "refusing production worker work from staging branch $branch"
fi
ok "branch is not the worker-staging branch: $branch"

convex_deployment="${CONVEX_DEPLOYMENT:-}"
if [[ -z "$convex_deployment" ]]; then
  fail "CONVEX_DEPLOYMENT must be $EXPECTED_CONVEX_DEPLOYMENT, got missing"
fi
if [[ "$convex_deployment" == "$FORBIDDEN_CONVEX_STAGING" ]]; then
  fail "refusing Convex staging deployment $convex_deployment"
fi
if [[ "$convex_deployment" != "$EXPECTED_CONVEX_DEPLOYMENT" ]]; then
  fail "CONVEX_DEPLOYMENT must be $EXPECTED_CONVEX_DEPLOYMENT, got $convex_deployment"
fi
ok "Convex target is production: $convex_deployment"

deployment_kind="${POLYNET_DEPLOYMENT_KIND:-}"
if [[ "$deployment_kind" != "$EXPECTED_DEPLOYMENT_KIND" ]]; then
  fail "POLYNET_DEPLOYMENT_KIND must be $EXPECTED_DEPLOYMENT_KIND, got ${deployment_kind:-missing}"
fi
ok "deployment kind is production"

app_name="${POLYNET_CODEX_WORKER_FLY_APP:-$EXPECTED_FLY_APP}"
if [[ "$app_name" == "$FORBIDDEN_FLY_APP" || "$app_name" == *staging* ]]; then
  fail "refusing staging Fly app: $app_name"
fi
if [[ "$app_name" != "$EXPECTED_FLY_APP" ]]; then
  fail "POLYNET_CODEX_WORKER_FLY_APP must be $EXPECTED_FLY_APP, got $app_name"
fi
ok "Fly app is production: $app_name"

fly_config="${POLYNET_CODEX_WORKER_FLY_CONFIG:-"$ROOT_DIR/$EXPECTED_FLY_CONFIG_SUFFIX"}"
case "$fly_config" in
  "$ROOT_DIR/$EXPECTED_FLY_CONFIG_SUFFIX") ;;
  "$EXPECTED_FLY_CONFIG_SUFFIX") ;;
  *) fail "Fly config must be $EXPECTED_FLY_CONFIG_SUFFIX, got $fly_config" ;;
esac
ok "Fly config is production-only"

if [[ -f "$ROOT_DIR/.vercel/project.json" ]]; then
  project_name="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(".vercel/project.json","utf8")); process.stdout.write(String(p.projectName||""));')"
  if [[ "$project_name" == "polynet-staging" ]]; then
    fail "refusing staging Vercel project link in production worker path"
  fi
  if [[ "${POLYNET_CODEX_WORKER_REQUIRE_VERCEL_PROD_LINK:-}" == "true" && "$project_name" != "polynet" ]]; then
    fail "Vercel project must be polynet when POLYNET_CODEX_WORKER_REQUIRE_VERCEL_PROD_LINK=true, got ${project_name:-missing}"
  fi
  ok "Vercel link is not staging: ${project_name:-missing}"
else
  ok "Vercel link absent; Fly-only production worker checks do not require it"
fi

if [[ -f "$ROOT_DIR/.env.blaxel.local" ]] && ! git check-ignore -q .env.blaxel.local; then
  fail ".env.blaxel.local must remain ignored"
fi
if [[ -f "$ROOT_DIR/.env.production.local" ]] && ! git check-ignore -q .env.production.local; then
  fail ".env.production.local must remain ignored"
fi
if [[ -e "$ROOT_DIR/.vercel" ]] && ! git check-ignore -q .vercel; then
  fail ".vercel must remain ignored"
fi
ok "local secret/linkage paths are ignored when present"

if git diff --name-only --cached --diff-filter=ACMR | grep -vE '\.example$' | grep -E '(^|/)node_modules(/|$)|(^|/)dist(/|$)|(^|/)\.env(\.|$)|(^|/)\.vercel(/|$)' >/dev/null; then
  fail "staged generated/secret/linkage files detected"
fi
ok "no staged dependency/build/secret/linkage files"

echo "PASS: PolyNet Codex worker production guard is correct."
