#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERCEL_DIR="$ROOT_DIR/.vercel"
PROJECT_JSON="$VERCEL_DIR/project.json"
GUARD="$ROOT_DIR/scripts/semantic_platform_staging_guard.sh"
DEPLOY_SCRIPT="$ROOT_DIR/scripts/deploy_semantic_platform_staging_convex.sh"
BACKUP_DIR="$(mktemp -d)"
OUTPUT_FILE="$BACKUP_DIR/guard.out"

EXPECTED_PROJECT_NAME="polynet-staging"
EXPECTED_PROJECT_ID="prj_plXUH12pm9nZ5lWS5wJOt163maFL"
EXPECTED_ORG_ID="team_TJvbi4UGtg62xteusiC1Cvxy"

grep -q 'semantic_platform_staging_guard.sh" --release' "$DEPLOY_SCRIPT" || {
  echo "FAIL: staging Convex deploy must require the clean release guard" >&2
  exit 1
}
grep -q 'npx convex dev --once' "$DEPLOY_SCRIPT" || {
  echo "FAIL: staging Convex deploy must use convex dev --once" >&2
  exit 1
}
if grep -q 'convex deploy' "$DEPLOY_SCRIPT"; then
  echo "FAIL: staging Convex deploy must not use convex deploy" >&2
  exit 1
fi
echo "OK: staging Convex deploy is bound to the clean dev-deployment path"

cleanup() {
  rm -rf "$VERCEL_DIR"
  if [[ -d "$BACKUP_DIR/original-vercel" ]]; then
    mv "$BACKUP_DIR/original-vercel" "$VERCEL_DIR"
  fi
  rm -rf "$BACKUP_DIR"
}
trap cleanup EXIT

if [[ -d "$VERCEL_DIR" ]]; then
  mv "$VERCEL_DIR" "$BACKUP_DIR/original-vercel"
fi

write_project_json() {
  local project_name="$1"
  local project_id="$2"
  local org_id="$3"
  mkdir -p "$VERCEL_DIR"
  node - "$PROJECT_JSON" "$project_name" "$project_id" "$org_id" <<'NODE'
const fs = require("fs");
const [path, projectName, projectId, orgId] = process.argv.slice(2);
fs.writeFileSync(path, `${JSON.stringify({ projectName, projectId, orgId }, null, 2)}\n`);
NODE
}

run_guard() {
  CONVEX_DEPLOYMENT="${TEST_CONVEX_DEPLOYMENT:-dev:quick-porcupine-949}" \
  POLYNET_DEPLOYMENT_KIND="${TEST_DEPLOYMENT_KIND:-staging}" \
  CONVEX_DEPLOY_KEY="${TEST_CONVEX_DEPLOY_KEY:-}" \
  bash "$GUARD" >"$OUTPUT_FILE" 2>&1
}

expect_fail() {
  local label="$1"
  if run_guard; then
    echo "FAIL: staging guard accepted $label" >&2
    cat "$OUTPUT_FILE" >&2
    exit 1
  fi
  echo "OK: staging guard rejected $label"
}

expect_pass() {
  local label="$1"
  if ! run_guard; then
    echo "FAIL: staging guard rejected $label" >&2
    cat "$OUTPUT_FILE" >&2
    exit 1
  fi
  echo "OK: staging guard accepted $label"
}

expect_fail "missing Vercel linkage"

write_project_json "polynet" "production-project" "$EXPECTED_ORG_ID"
expect_fail "production Vercel project"

write_project_json "$EXPECTED_PROJECT_NAME" "wrong-project" "$EXPECTED_ORG_ID"
expect_fail "wrong Vercel project id"

write_project_json "$EXPECTED_PROJECT_NAME" "$EXPECTED_PROJECT_ID" "wrong-org"
expect_fail "wrong Vercel organization"

write_project_json "$EXPECTED_PROJECT_NAME" "$EXPECTED_PROJECT_ID" "$EXPECTED_ORG_ID"
TEST_CONVEX_DEPLOYMENT="prod:wry-hawk-715" expect_fail "production Convex selector"
TEST_CONVEX_DEPLOYMENT="dev:somewhere-else" expect_fail "unknown Convex selector"
TEST_DEPLOYMENT_KIND="production" expect_fail "production deployment kind"
TEST_CONVEX_DEPLOY_KEY="production-shaped-key" expect_fail "deploy-key authority"
expect_pass "canonical staging identity"

echo "PASS: semantic platform staging guard rejects production-shaped identities."
