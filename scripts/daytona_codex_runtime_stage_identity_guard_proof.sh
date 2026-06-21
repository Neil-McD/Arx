#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERCEL_DIR="$ROOT_DIR/.vercel"
PROJECT_JSON="$VERCEL_DIR/project.json"
BACKUP_DIR=""

EXPECTED_PROJECT_NAME="polynet-staging"
EXPECTED_PROJECT_ID="prj_plXUH12pm9nZ5lWS5wJOt163maFL"
EXPECTED_ORG_ID="team_TJvbi4UGtg62xteusiC1Cvxy"
PROD_PROJECT_ID="prj_VnjQSvvvuznl4AffYtjylQAg1c6q"

cleanup() {
  rm -rf "$VERCEL_DIR"
  if [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR/.vercel" ]]; then
    mv "$BACKUP_DIR/.vercel" "$VERCEL_DIR"
  fi
  if [[ -n "$BACKUP_DIR" ]]; then
    rm -rf "$BACKUP_DIR"
  fi
}
trap cleanup EXIT

if [[ -e "$VERCEL_DIR" ]]; then
  BACKUP_DIR="$(mktemp -d)"
  mv "$VERCEL_DIR" "$BACKUP_DIR/.vercel"
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
  CONVEX_DEPLOYMENT=dev:quick-porcupine-949 \
  POLYNET_DEPLOYMENT_KIND=staging \
  POLYNET_CODEX_WORKER_REQUIRE_VERCEL_LINK=true \
  bash "$ROOT_DIR/scripts/daytona_codex_runtime_staging_guard.sh" >/tmp/daytona_codex_runtime_stage_identity_guard.out 2>&1
}

expect_fail() {
  local label="$1"
  if run_guard; then
    echo "FAIL: guard accepted $label" >&2
    cat /tmp/daytona_codex_runtime_stage_identity_guard.out >&2
    exit 1
  fi
  echo "OK: guard rejected $label"
}

expect_pass() {
  local label="$1"
  if ! run_guard; then
    echo "FAIL: guard rejected $label" >&2
    cat /tmp/daytona_codex_runtime_stage_identity_guard.out >&2
    exit 1
  fi
  echo "OK: guard accepted $label"
}

rm -rf "$VERCEL_DIR"
expect_fail "missing Vercel link when link is required"

write_project_json "polynet" "$PROD_PROJECT_ID" "$EXPECTED_ORG_ID"
expect_fail "production Vercel project"

write_project_json "PolyAppStage" "$EXPECTED_PROJECT_ID" "$EXPECTED_ORG_ID"
expect_fail "informal PolyAppStage project name"

write_project_json "$EXPECTED_PROJECT_NAME" "wrong-project-id" "$EXPECTED_ORG_ID"
expect_fail "staging project name with wrong project id"

write_project_json "$EXPECTED_PROJECT_NAME" "$EXPECTED_PROJECT_ID" "wrong-org-id"
expect_fail "staging project name with wrong org id"

write_project_json "$EXPECTED_PROJECT_NAME" "$EXPECTED_PROJECT_ID" "$EXPECTED_ORG_ID"
expect_pass "canonical staging Vercel project"

echo "PASS: Daytona Codex runtime stage identity guard proof is correct."
