#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Community admin contract guard =="

COMMUNITY_FILE="convex/community.ts"
COMMUNITY_ADMIN_FILE="convex/communityAdmin.ts"
COMMUNITY_CORE_FILE="convex/communityCore.ts"
ADMIN_GATEWAY_FILE="shared/cloudCommunityAdminGateway.ts"
MEMBERSHIP_GATEWAY_FILE="shared/cloudCommunityMembershipGateway.ts"

if [[ ! -f "$COMMUNITY_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_ADMIN_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_ADMIN_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_CORE_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_CORE_FILE"
  exit 1
fi
if [[ ! -f "$ADMIN_GATEWAY_FILE" ]]; then
  echo "FAIL: missing $ADMIN_GATEWAY_FILE"
  exit 1
fi
if [[ ! -f "$MEMBERSHIP_GATEWAY_FILE" ]]; then
  echo "FAIL: missing $MEMBERSHIP_GATEWAY_FILE"
  exit 1
fi

require_multiline_match() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if ! rg -n -U --pcre2 "$pattern" "$file" >/dev/null; then
    echo "FAIL: missing contract marker: $description"
    exit 1
  fi
  echo "OK: $description"
}

echo "[1/9] Ensuring admin gateway forwards authSubject for member/admin queries..."
require_multiline_match "$MEMBERSHIP_GATEWAY_FILE" \
  'export async function listCloudCommunityMembershipAdminRows<[\s\S]*?client\.query\("community:listCommunityMembershipsAdmin" as any, \{\s*authSubject,\s*communityId:' \
  "members admin gateway forwards authSubject"
require_multiline_match "$MEMBERSHIP_GATEWAY_FILE" \
  'export async function countCloudCommunityMembershipRows<[\s\S]*?client\.query\("community:countCommunityMemberships" as any, \{\s*authSubject,\s*communityId:' \
  "member count gateway forwards authSubject"
require_multiline_match "$ADMIN_GATEWAY_FILE" \
  'export async function listCloudCommunityRevenueSeriesRows<[\s\S]*?client\.query\("community:listCommunityRevenueSeries" as any, \{\s*authSubject,\s*communityId:' \
  "revenue series gateway forwards authSubject"

echo "[2/9] Ensuring admin/member analytics queries accept authSubject..."
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityMembershipsAdmin = query\(\{\s*args:\s*\{\s*userId: v\.optional\(v\.id\("users"\)\),\s*authSubject: v\.optional\(v\.string\(\)\),' \
  "listCommunityMembershipsAdmin accepts authSubject"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const countCommunityMemberships = query\(\{\s*args:\s*\{\s*userId: v\.optional\(v\.id\("users"\)\),\s*authSubject: v\.optional\(v\.string\(\)\),' \
  "countCommunityMemberships accepts authSubject"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityMembershipCreatedAtRows = query\(\{\s*args:\s*\{\s*userId: v\.optional\(v\.id\("users"\)\),\s*authSubject: v\.optional\(v\.string\(\)\),' \
  "listCommunityMembershipCreatedAtRows accepts authSubject"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const communityOwnerHasArchitectAccess = query\(\{\s*args:\s*\{\s*userId: v\.optional\(v\.id\("users"\)\),\s*authSubject: v\.optional\(v\.string\(\)\),' \
  "communityOwnerHasArchitectAccess accepts authSubject"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityRevenueSeries = query\(\{\s*args:\s*\{\s*userId: v\.optional\(v\.id\("users"\)\),\s*authSubject: v\.optional\(v\.string\(\)\),' \
  "listCommunityRevenueSeries accepts authSubject"

echo "[3/9] Ensuring manager access centralizes membership-row reads..."
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export async function listCommunityMembershipRowsForManager\(args: \{' \
  "shared manager-scoped membership helper exists"

echo "[4/9] Ensuring member/admin queries delegate through the manager helper with authSubject..."
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityMembershipsAdmin = query\([\s\S]*?listCommunityMembershipRowsForManager\(\{\s*ctx,\s*communityId: args\.communityId,\s*userId: args\.userId,\s*authSubject: args\.authSubject \?\? null,' \
  "listCommunityMembershipsAdmin delegates through manager helper"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const countCommunityMemberships = query\([\s\S]*?listCommunityMembershipRowsForManager\(\{\s*ctx,\s*communityId: args\.communityId,\s*userId: args\.userId,\s*authSubject: args\.authSubject \?\? null,' \
  "countCommunityMemberships delegates through manager helper"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityMembershipCreatedAtRows = query\([\s\S]*?listCommunityMembershipRowsForManager\(\{\s*ctx,\s*communityId: args\.communityId,\s*userId: args\.userId,\s*authSubject: args\.authSubject \?\? null,' \
  "listCommunityMembershipCreatedAtRows delegates through manager helper"

echo "[5/9] Ensuring public user identity is returned for admin membership rows..."
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'user_id:\s*\(await resolvePublicUserId\(ctx, row\.userId, userIdCache\)\) \?\?\s*String\(row\.userId\)' \
  "admin membership rows resolve public user IDs"

echo "[6/9] Ensuring manager-owned analytics queries resolve authenticated subject before access checks..."
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const communityOwnerHasArchitectAccess = query\([\s\S]*?const userId = await resolveUserIdForAuthenticatedRequest\(\{\s*ctx,\s*userId: args\.userId,\s*authSubject: args\.authSubject \?\? null,' \
  "communityOwnerHasArchitectAccess resolves authenticated subject"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityRevenueSeries = query\([\s\S]*?const userId = await resolveUserIdForAuthenticatedRequest\(\{\s*ctx,\s*userId: args\.userId,\s*authSubject: args\.authSubject \?\? null,' \
  "listCommunityRevenueSeries resolves authenticated subject"

echo "[7/9] Ensuring analytics queries still require manager access..."
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const communityOwnerHasArchitectAccess = query\([\s\S]*?await requireCommunityManager\(\{\s*ctx,\s*communityId: args\.communityId,\s*userId: args\.userId,' \
  "communityOwnerHasArchitectAccess requires manager access"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityRevenueSeries = query\([\s\S]*?await requireCommunityManager\(\{\s*ctx,\s*communityId: args\.communityId,\s*userId: args\.userId,' \
  "listCommunityRevenueSeries requires manager access"

echo "[8/9] Ensuring the canonical auth + funding contract doc exists..."
if [[ ! -f "docs/auth-money-access-matrix.md" ]]; then
  echo "FAIL: missing docs/auth-money-access-matrix.md"
  exit 1
fi
echo "OK: canonical auth + funding contract doc present."

echo "[9/9] Guard passed."
echo "PASS: community admin contract markers are present and hardened."
