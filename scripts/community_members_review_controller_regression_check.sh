#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_APP="apps/web/src/App.tsx"
SHARED_HOOK="shared/useCommunityMembersReviewController.ts"
LIFECYCLE_HOOK="shared/useCommunityMembersReviewLifecycle.ts"

echo "== Community members-review controller regression checks =="

echo "[1/11] Web app should import the shared members-review controller..."
if ! grep -q 'from "../../../shared/useCommunityMembersReviewController"' "$WEB_APP"; then
  echo "FAIL: web app is not importing useCommunityMembersReviewController"
  exit 1
fi

echo "[2/11] Web app should import the shared members-review lifecycle hook..."
if ! grep -q 'from "../../../shared/useCommunityMembersReviewLifecycle"' "$WEB_APP"; then
  echo "FAIL: web app is not importing useCommunityMembersReviewLifecycle"
  exit 1
fi

echo "[3/11] Shared members-review controller should exist and export expected API..."
if [[ ! -f "$SHARED_HOOK" ]]; then
  echo "FAIL: $SHARED_HOOK is missing"
  exit 1
fi
if ! grep -q "export function useCommunityMembersReviewController" "$SHARED_HOOK"; then
  echo "FAIL: $SHARED_HOOK missing useCommunityMembersReviewController export"
  exit 1
fi

echo "[4/11] Shared members-review lifecycle hook should exist and export expected API..."
if [[ ! -f "$LIFECYCLE_HOOK" ]]; then
  echo "FAIL: $LIFECYCLE_HOOK is missing"
  exit 1
fi
if ! grep -q "export function useCommunityMembersReviewLifecycle" "$LIFECYCLE_HOOK"; then
  echo "FAIL: $LIFECYCLE_HOOK missing useCommunityMembersReviewLifecycle export"
  exit 1
fi

echo "[5/11] Web app should instantiate the shared members-review controller..."
if ! grep -q "useCommunityMembersReviewController<" "$WEB_APP"; then
  echo "FAIL: web app is not instantiating useCommunityMembersReviewController"
  exit 1
fi

echo "[6/11] Web app should instantiate the shared members-review lifecycle hook..."
if ! grep -q "useCommunityMembersReviewLifecycle<" "$WEB_APP"; then
  echo "FAIL: web app is not instantiating useCommunityMembersReviewLifecycle"
  exit 1
fi

echo "[7/11] Web app should not define local members-review handlers..."
for pattern in \
  "function loadCommunityJoinRequests(" \
  "function loadCommunityFunnelLeads(" \
  "function handleApproveCommunityJoinRequest(" \
  "function handleDenyCommunityJoinRequest(" \
  "function handleSetCommunityFreeJoinRequiresApproval("; do
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still defines local $pattern"
    exit 1
  fi
done

echo "[8/11] Members UI should still bind review + approval handlers..."
for pattern in \
  "void handleSetCommunityFreeJoinRequiresApproval(" \
  "void handleApproveCommunityJoinRequest(" \
  "void handleDenyCommunityJoinRequest("; do
  if ! grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app missing members UI binding: $pattern"
    exit 1
  fi
done

echo "[9/11] Join/funnel/pricing RPC literals should move out of web app..."
for pattern in \
  "get_community_pricing" \
  "list_community_join_requests" \
  "list_community_funnel_leads" \
  "approve_community_join_request" \
  "deny_community_join_request" \
  "set_community_free_join_requires_approval"; do
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still contains members-review RPC literal: $pattern"
    exit 1
  fi
done

echo "[10/11] Shared lifecycle hook should own members tab lifecycle orchestration..."
for pattern in \
  'params.communityTab !== "members"' \
  "loadCommunityJoinRequestsRef.current" \
  "setIsJoinRequestsModalOpen(false)"; do
  if ! grep -q "$pattern" "$LIFECYCLE_HOOK"; then
    echo "FAIL: shared members-review lifecycle hook missing orchestration marker: $pattern"
    exit 1
  fi
done
if grep -q "loadCommunityFunnelLeadsRef.current" "$LIFECYCLE_HOOK"; then
  echo "FAIL: lifecycle hook should not reference loadCommunityFunnelLeadsRef.current"
  exit 1
fi
if grep -q "setIsFunnelLeadsModalOpen(false)" "$LIFECYCLE_HOOK"; then
  echo "FAIL: lifecycle hook should not reference setIsFunnelLeadsModalOpen"
  exit 1
fi

echo "[11/11] Shared controller should own the join/funnel/pricing RPC calls..."
for pattern in \
  "get_community_pricing" \
  "list_community_join_requests" \
  "approve_community_join_request" \
  "deny_community_join_request" \
  "set_community_free_join_requires_approval"; do
  if ! grep -q "$pattern" "$SHARED_HOOK"; then
    echo "FAIL: shared members-review hook missing RPC literal: $pattern"
    exit 1
  fi
done
if grep -q "list_community_funnel_leads" "$SHARED_HOOK"; then
  echo "FAIL: shared members-review hook should not call list_community_funnel_leads"
  exit 1
fi

echo "PASS: community members-review controller regression checks passed."
