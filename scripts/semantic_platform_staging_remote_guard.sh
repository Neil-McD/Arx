#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_GUARD="$ROOT_DIR/scripts/semantic_platform_staging_guard.sh"
EXPECTED_PROJECT_NAME="polynet-staging"
EXPECTED_PROJECT_ID="prj_plXUH12pm9nZ5lWS5wJOt163maFL"
EXPECTED_TEAM_SLUG="neil-mcds-projects"
EXPECTED_PRODUCTION_BRANCH="codex/semantic-platform-staging-20260719"
EXPECTED_DOMAIN="polynet-staging.vercel.app"
ERROR_FILE="$(mktemp)"

cleanup() {
  rm -f "$ERROR_FILE"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

ok() {
  echo "OK: $*"
}

command -v vercel >/dev/null 2>&1 || fail "Vercel CLI is required"
command -v jq >/dev/null 2>&1 || fail "jq is required"

bash "$LOCAL_GUARD"

project_summary="$(
  vercel api "/v9/projects/$EXPECTED_PROJECT_ID" \
    --scope "$EXPECTED_TEAM_SLUG" \
    --raw 2>"$ERROR_FILE" \
    | jq -c '{name, autoAssignCustomDomains, productionBranch: .link.productionBranch}'
)" || {
  cat "$ERROR_FILE" >&2
  fail "could not read the staging Vercel project configuration"
}

project_name="$(jq -r '.name // empty' <<<"$project_summary")"
auto_assign_domains="$(jq -r '.autoAssignCustomDomains // false' <<<"$project_summary")"
production_branch="$(jq -r '.productionBranch // empty' <<<"$project_summary")"

[[ "$project_name" == "$EXPECTED_PROJECT_NAME" ]] \
  || fail "Vercel project must be $EXPECTED_PROJECT_NAME, got ${project_name:-missing}"
[[ "$auto_assign_domains" == "true" ]] \
  || fail "Vercel project must automatically assign production domains"
[[ "$production_branch" == "$EXPECTED_PRODUCTION_BRANCH" ]] \
  || fail "Vercel production branch must be $EXPECTED_PRODUCTION_BRANCH, got ${production_branch:-missing}"
ok "Vercel staging project follows the canonical production branch"

domain_summary="$(
  vercel api "/v9/projects/$EXPECTED_PROJECT_ID/domains/$EXPECTED_DOMAIN" \
    --scope "$EXPECTED_TEAM_SLUG" \
    --raw 2>"$ERROR_FILE" \
    | jq -c '{name, verified, gitBranch, customEnvironmentId, redirect}'
)" || {
  cat "$ERROR_FILE" >&2
  fail "could not read the canonical staging domain configuration"
}

domain_name="$(jq -r '.name // empty' <<<"$domain_summary")"
domain_verified="$(jq -r '.verified // false' <<<"$domain_summary")"
domain_git_branch="$(jq -r 'if .gitBranch == null then "null" else .gitBranch end' <<<"$domain_summary")"
domain_custom_environment="$(jq -r 'if .customEnvironmentId == null then "null" else .customEnvironmentId end' <<<"$domain_summary")"
domain_redirect="$(jq -r 'if .redirect == null then "null" else .redirect end' <<<"$domain_summary")"

[[ "$domain_name" == "$EXPECTED_DOMAIN" ]] \
  || fail "canonical staging domain is missing from the staging project"
[[ "$domain_verified" == "true" ]] \
  || fail "canonical staging domain is not verified"
[[ "$domain_git_branch" == "null" ]] \
  || fail "canonical staging domain must not override the project production branch; got $domain_git_branch"
[[ "$domain_custom_environment" == "null" ]] \
  || fail "canonical staging domain must not target a custom environment"
[[ "$domain_redirect" == "null" ]] \
  || fail "canonical staging domain must not redirect"
ok "canonical staging domain inherits automatic production promotion"

echo "PASS: canonical staging web authority is project-owned and automatic."
