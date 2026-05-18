#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Community admin contract guard =="

COMMUNITY_FILE="convex/community.ts"
COMMUNITY_ADMIN_FILE="convex/communityAdmin.ts"
COMMUNITY_CORE_FILE="convex/communityCore.ts"
SCHEMA_FILE="convex/schema.ts"
ADMIN_GATEWAY_FILE="shared/cloudCommunityAdminGateway.ts"
MEMBERSHIP_GATEWAY_FILE="shared/cloudCommunityMembershipGateway.ts"
WEB_MEMBERS_FILE="apps/web/src/components/WebCommunityMembersSection.tsx"
WEB_PEOPLE_CONTROLLER_FILE="apps/web/src/controllers/useWebCommunityPeopleController.ts"

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
if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "FAIL: missing $SCHEMA_FILE"
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

require_no_match() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if rg -n -U --pcre2 "$pattern" "$file" >/dev/null; then
    echo "FAIL: forbidden contract marker present: $description"
    exit 1
  fi
  echo "OK: $description"
}

echo "[1/9] Ensuring admin gateway forwards authSubject for member/admin queries..."
require_multiline_match "$MEMBERSHIP_GATEWAY_FILE" \
  'export async function listCloudCommunityMembershipAdminPage<[\s\S]*?client\.query\("community:listCommunityMembershipsAdminPage" as any, \{\s*authSubject,\s*communityId:' \
  "paginated members admin gateway forwards authSubject"
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
  'export const listCommunityMembershipsAdminPage = query\(\{\s*args:\s*\{\s*userId: v\.optional\(v\.id\("users"\)\),\s*authSubject: v\.optional\(v\.string\(\)\),\s*communityId: v\.id\("communities"\),\s*paginationOpts: paginationOptsValidator,' \
  "listCommunityMembershipsAdminPage accepts authSubject and pagination options"
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

echo "[4/9] Ensuring member/admin roster reads are paginated, release-safe, and count context is explicit..."
require_multiline_match "$SCHEMA_FILE" \
  'communityMemberships: defineTable\([\s\S]*?\.index\("by_community_createdAt", \["communityId", "createdAt"\]\)' \
  "communityMemberships has community creation-order index"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityMembershipsAdminPage = query\([\s\S]*?withIndex\("by_community_createdAt", \(q\) =>[\s\S]*?q\.eq\("communityId", args\.communityId\)[\s\S]*?\.paginate\(\{' \
  "listCommunityMembershipsAdminPage paginates membership rows by community creation order"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityMembershipsAdminPage = query\([\s\S]*?rawPage\.page\.filter\([\s\S]*?communityMembershipRowIsActive\(row\)' \
  "listCommunityMembershipsAdminPage keeps legacy rows release-safe through the canonical active predicate"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityMembershipsAdmin = query\([\s\S]*?withIndex\("by_community_createdAt"[\s\S]*?\.take\(scanLimit\)' \
  "legacy listCommunityMembershipsAdmin is bounded by take"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const countCommunityMemberships = query\([\s\S]*?resolveCommunityAdminMembersContext\(\{\s*ctx,\s*userId: args\.userId,\s*authSubject: args\.authSubject \?\? null,\s*communityId: args\.communityId,' \
  "countCommunityMemberships uses entitled community context"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const countCommunityMemberships = query\([\s\S]*?withIndex\("by_community_createdAt", \(q\) =>[\s\S]*?q\.eq\("communityId", args\.communityId\)' \
  "countCommunityMemberships reads membership rows by community creation order"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const countCommunityMemberships = query\([\s\S]*?!communityMembershipRowIsActive\(row\)' \
  "countCommunityMemberships keeps legacy rows release-safe through the canonical active predicate"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityMembershipCreatedAtRows = query\([\s\S]*?listCommunityMembershipRowsForManager\(\{\s*ctx,\s*communityId: args\.communityId,\s*userId: args\.userId,\s*authSubject: args\.authSubject \?\? null,' \
  "listCommunityMembershipCreatedAtRows delegates through manager helper"
require_no_match "$WEB_PEOPLE_CONTROLLER_FILE" \
  'filteredCommunityMembers|communityMembersRoleFilter|communityMembersPlanFilter' \
  "members controller does not keep loaded-subset filter state"
require_no_match "$WEB_MEMBERS_FILE" \
  'filteredCommunityMembers|communityMembersRoleFilter|communityMembersPlanFilter|members-filter-row|members-filter-field' \
  "members UI does not expose loaded-subset filters"

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

echo "[9/11] Ensuring paid member removal cancels provider subscriptions and preserves revoked membership state..."
require_multiline_match "$ADMIN_GATEWAY_FILE" \
  'export async function removeCloudCommunityMember<[\s\S]*?client\.action\("community:removeCommunityMember" as any, \{\s*authSubject,\s*communityId:' \
  "remove member gateway calls action for provider cancellation"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const removeCommunityMember = action\(' \
  "removeCommunityMember is action-backed"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'stripe\.subscriptions\.cancel\(subscriptionId\)' \
  "remove member cancels Stripe subscription"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'await ctx\.db\.patch\(membership\._id as any, \{\s*active: false,\s*revokedAt: nowMs,\s*revokedReason:' \
  "remove member preserves revoked membership row"
if awk '
  /export const revokeCommunityMemberInternal = internalMutation\(/ { in_block = 1 }
  /async function cancelStripeSubscriptionIfActive/ { in_block = 0 }
  in_block { print }
' "$COMMUNITY_ADMIN_FILE" | rg 'await ctx\.db\.delete\(membership\._id as any\)' >/dev/null; then
  echo "FAIL: revokeCommunityMemberInternal must not delete paid membership audit rows"
  exit 1
fi
echo "OK: revokeCommunityMemberInternal does not delete membership rows"

echo "[10/11] Ensuring ban and unban are distinct from remove..."
require_multiline_match "$ADMIN_GATEWAY_FILE" \
  'export async function banCloudCommunityMember<[\s\S]*?client\.action\("community:banCommunityMember" as any, \{\s*authSubject,\s*communityId:' \
  "ban member gateway calls action"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const banCommunityMember = action\(' \
  "banCommunityMember is action-backed"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const blockCommunityUserInternal = internalMutation\(' \
  "ban writes durable community block state"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const unbanCommunityUser = mutation\(' \
  "unbanCommunityUser mutation exists"
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export const COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS = 14 \* 24 \* 60 \* 60 \* 1000;' \
  "removed member reapply cooldown is 14 days"

echo "[11/11] Guard passed."
echo "PASS: community admin contract markers are present and hardened."
