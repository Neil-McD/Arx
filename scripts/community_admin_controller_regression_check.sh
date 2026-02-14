#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP="src/App.tsx"
WEB_APP="apps/web/src/App.tsx"
WEB_AGENT_MEMBERS_HOOK="apps/web/src/controllers/useWebCommunityAgentMembersLifecycle.ts"
SHARED_HOOK="shared/useCommunityAdminController.ts"
SHARED_LIFECYCLE_HOOK="shared/useCommunityAdminAnalyticsAutomationsLifecycle.ts"

echo "== Community admin controller regression checks =="

echo "[1/8] App shells should import shared admin controller..."
if ! grep -q 'from "../shared/useCommunityAdminController"' "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not importing useCommunityAdminController"
  exit 1
fi
if ! grep -q 'from "../../../shared/useCommunityAdminController"' "$WEB_APP"; then
  echo "FAIL: web app is not importing useCommunityAdminController"
  exit 1
fi

echo "[2/8] Shared admin controller should exist and export expected API..."
if [[ ! -f "$SHARED_HOOK" ]]; then
  echo "FAIL: $SHARED_HOOK is missing"
  exit 1
fi
if ! grep -q "export function useCommunityAdminController" "$SHARED_HOOK"; then
  echo "FAIL: $SHARED_HOOK missing useCommunityAdminController export"
  exit 1
fi

echo "[3/8] App shells should instantiate the shared admin controller..."
if ! grep -q "useCommunityAdminController<" "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not instantiating useCommunityAdminController"
  exit 1
fi
if ! grep -q "useCommunityAdminController<" "$WEB_APP"; then
  echo "FAIL: web app is not instantiating useCommunityAdminController"
  exit 1
fi

echo "[4/8] App shells should not define local admin handlers..."
for pattern in \
  "function loadCommunityMembers(" \
  "function loadSelfProfile(" \
  "function saveProfileToCloud(" \
  "function loadCommunityAnalytics(" \
  "function loadCommunityAutomations(" \
  "function resetAutomationForm(" \
  "function openBrandosConnect(" \
  "function closeBrandosConnect(" \
  "function handleSaveBrandosConnector(" \
  "function handleDeleteBrandosConnector(" \
  "function handleCreateAutomationEndpoint(" \
  "function handleToggleAutomationEndpointEnabled(" \
  "function handleRotateAutomationEndpointSecret(" \
  "function handleDeleteAutomationEndpoint(" \
  "function handleTestAutomationEndpoint(" \
  "function handleSetCommunityMemberRole(" \
  "function handleRemoveCommunityMember("; do
  if grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app still defines local $pattern"
    exit 1
  fi
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still defines local $pattern"
    exit 1
  fi
done

echo "[5/8] Desktop should preserve admin controller behavior wiring..."
for pattern in \
  'profileSaveUnauthenticatedErrorMessage: "Sign in to save your profile."' \
  'getMemberRefreshIncludeStatus: () => Boolean(activeCommunityAccess?.can_manage_members)' \
  'reloadCommunities: loadCommunities' \
  'reloadCommunityAccess: loadCommunityAccess'; do
  if ! grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop admin controller wiring missing: $pattern"
    exit 1
  fi
done

echo "[6/8] Web should preserve auth-intent and profile/BrandOS wiring..."
for pattern in \
  'profileSaveUnauthenticatedErrorMessage: null' \
  'openAuthGate({ reason: "save_profile", payload: {} });' \
  'loadUserProfiles: (userIds, session) => void loadUserProfiles(userIds, session)'; do
  if ! grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web admin controller wiring missing: $pattern"
    exit 1
  fi
done

echo "[7/8] Critical admin UI bindings should remain connected..."
for pattern in \
  'void saveProfileToCloud()' \
  'void handleRemoveCommunityMember(' \
  'loadCommunityMembers('; do
  if ! grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app missing binding: $pattern"
    exit 1
  fi
  if [[ "$pattern" == 'loadCommunityMembers(' ]]; then
    if ! grep -q "$pattern" "$WEB_APP" && ! grep -q "$pattern" "$WEB_AGENT_MEMBERS_HOOK"; then
      echo "FAIL: web app missing binding: $pattern"
      exit 1
    fi
    continue
  fi
  if ! grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app missing binding: $pattern"
    exit 1
  fi
done

if ! grep -q 'loadCommunityAnalytics(' "$DESKTOP_APP" && ! grep -q 'useCommunityAdminAnalyticsAutomationsLifecycle' "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing analytics lifecycle wiring"
  exit 1
fi
if ! grep -q 'loadCommunityAutomations(' "$DESKTOP_APP" && ! grep -q 'useCommunityAdminAnalyticsAutomationsLifecycle' "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing automations lifecycle wiring"
  exit 1
fi
if ! grep -q 'loadCommunityAnalytics(' "$WEB_APP" && ! grep -q 'useCommunityAdminAnalyticsAutomationsLifecycle' "$WEB_APP"; then
  echo "FAIL: web app missing analytics lifecycle wiring"
  exit 1
fi
if ! grep -q 'loadCommunityAutomations(' "$WEB_APP" && ! grep -q 'useCommunityAdminAnalyticsAutomationsLifecycle' "$WEB_APP"; then
  echo "FAIL: web app missing automations lifecycle wiring"
  exit 1
fi
if ! grep -q "export function useCommunityAdminAnalyticsAutomationsLifecycle" "$SHARED_LIFECYCLE_HOOK"; then
  echo "FAIL: shared analytics/automations lifecycle hook is missing"
  exit 1
fi

echo "[8/8] Admin RPC literals should move out of app shells into shared hook..."
for pattern in \
  "list_automation_endpoints" \
  "list_automation_deliveries" \
  "upsert_brandos_connector" \
  "delete_brandos_connector" \
  "set_member_role" \
  "remove_member" \
  "community_revenue_series"; do
  if grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app still contains admin RPC literal: $pattern"
    exit 1
  fi
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still contains admin RPC literal: $pattern"
    exit 1
  fi
done

echo "PASS: community admin controller regression checks passed."
