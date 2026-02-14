#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_APP="apps/web/src/App.tsx"

echo "== Web app init-order guard =="

line_of() {
  local pattern="$1"
  local line
  line="$(rg -n "$pattern" "$WEB_APP" | head -n 1 | cut -d: -f1 || true)"
  if [[ -z "$line" ]]; then
    echo "FAIL: missing pattern in $WEB_APP: $pattern"
    exit 1
  fi
  echo "$line"
}

ACCESS_CONTROLLER_LINE="$(line_of "const \\{ loadCommunities, loadCommunityAccess, loadUserProfiles \\} = useWebCommunityAccessController<")"
AUTH_SESSION_LIFECYCLE_LINE="$(line_of "useWebAuthSessionLifecycle<")"
COMMUNITY_ADMIN_CONTROLLER_LINE="$(line_of "useCommunityAdminController<")"
SETTINGS_GOVERNANCE_CONTROLLER_LINE="$(line_of "useCommunitySettingsGovernanceController<")"
DELETE_CONTROLLER_LINE="$(line_of "useCommunityDeleteController<")"

echo "Checking controller ordering..."

require_before() {
  local source_line="$1"
  local target_line="$2"
  local source_label="$3"
  local target_label="$4"
  if (( source_line >= target_line )); then
    echo "FAIL: ${source_label} (line ${source_line}) must be defined before ${target_label} (line ${target_line})"
    exit 1
  fi
}

require_before "$ACCESS_CONTROLLER_LINE" "$AUTH_SESSION_LIFECYCLE_LINE" "community-access controller" "auth-session lifecycle"
require_before "$ACCESS_CONTROLLER_LINE" "$COMMUNITY_ADMIN_CONTROLLER_LINE" "community-access controller" "community-admin controller"
require_before "$ACCESS_CONTROLLER_LINE" "$SETTINGS_GOVERNANCE_CONTROLLER_LINE" "community-access controller" "settings-governance controller"
require_before "$ACCESS_CONTROLLER_LINE" "$DELETE_CONTROLLER_LINE" "community-access controller" "delete-community controller"

echo "PASS: web app init-order guard passed."
