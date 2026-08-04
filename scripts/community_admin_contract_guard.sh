#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

echo "== Community admin contract guard =="

COMMUNITY_COMPATIBILITY_FACADE_FILE="convex/community.ts"
COMMUNITY_ADMIN_FILE="convex/communityAdmin.ts"
COMMUNITY_CORE_FILE="convex/communityCore.ts"
COMMUNITY_LIFECYCLE_FILE="convex/communityLifecycle.ts"
COMMUNITY_MEMBERSHIP_LIFECYCLE_FILE="convex/communityMembershipLifecycle.ts"
COMMUNITY_PUBLIC_FILE="convex/communityPublic.ts"
COMMUNITY_COMMERCE_FILE="convex/communityCommerce.ts"
BILLING_CORE_FILE="convex/billingCore.ts"
PLATFORM_HOME_COMMUNITY_FILE="convex/platformHomeCommunity.ts"
SCHEMA_FILE="convex/schema.ts"
ADMIN_GATEWAY_FILE="shared/cloudCommunityAdminGateway.ts"
MEMBERSHIP_GATEWAY_FILE="shared/cloudCommunityMembershipGateway.ts"
WEB_APP_FILE="apps/web/src/App.tsx"
WEB_CONTEXT_PANEL_FILE="apps/web/src/components/CommunityContextPanel.tsx"
WEB_MEMBER_DIALOG_FILE="apps/web/src/components/CommunityMemberSettingsDialog.tsx"
WEB_INTERACTION_PROJECTION_FILE="apps/web/src/components/WebCommunityInteractionProjection.tsx"
WEB_MEMBER_MANAGEMENT_CONTROLLER_FILE="apps/web/src/controllers/useWebCommunityMemberManagementController.ts"
WEB_JOIN_REQUESTS_CONTROLLER_FILE="apps/web/src/controllers/useWebCommunityJoinRequestsController.ts"
ADMIN_CONTROLLER_FILE="shared/useCommunityAdminController.ts"

if [[ ! -f "$COMMUNITY_COMPATIBILITY_FACADE_FILE" ]]; then
  echo "FAIL: missing bounded rolling compatibility facade: $COMMUNITY_COMPATIBILITY_FACADE_FILE"
  exit 1
fi
community_compatibility_export_count="$(
  awk '/^export const / { count += 1 } END { print count + 0 }' \
    "$COMMUNITY_COMPATIBILITY_FACADE_FILE"
)"
if [[ "$community_compatibility_export_count" -ne 114 ]]; then
  echo "FAIL: cached-production community facade must expose exactly 114 pinned operations"
  exit 1
fi
if sed '/Cached clients may still invoke the retired third-party MCP names/,$d' \
  "$COMMUNITY_COMPATIBILITY_FACADE_FILE" |
  rg -n '\b(query|mutation|action)[[:space:]]*\(|\bctx\.|\bdb\.' >/dev/null; then
  echo "FAIL: cached-production community aliases must not own behavior"
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
if [[ ! -f "$COMMUNITY_LIFECYCLE_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_LIFECYCLE_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_MEMBERSHIP_LIFECYCLE_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_MEMBERSHIP_LIFECYCLE_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_PUBLIC_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_PUBLIC_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_COMMERCE_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_COMMERCE_FILE"
  exit 1
fi
if [[ ! -f "$BILLING_CORE_FILE" ]]; then
  echo "FAIL: missing $BILLING_CORE_FILE"
  exit 1
fi
if [[ ! -f "$PLATFORM_HOME_COMMUNITY_FILE" ]]; then
  echo "FAIL: missing $PLATFORM_HOME_COMMUNITY_FILE"
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
if [[ ! -f "$WEB_APP_FILE" ]]; then
  echo "FAIL: missing $WEB_APP_FILE"
  exit 1
fi
if [[ -f "apps/web/src/components/WebCommunityMembersSection.tsx" ]]; then
  echo "FAIL: legacy Members tab component should stay deleted"
  exit 1
fi
if [[ ! -f "$WEB_CONTEXT_PANEL_FILE" ]]; then
  echo "FAIL: missing $WEB_CONTEXT_PANEL_FILE"
  exit 1
fi
if [[ ! -f "$WEB_MEMBER_DIALOG_FILE" ]]; then
  echo "FAIL: missing $WEB_MEMBER_DIALOG_FILE"
  exit 1
fi
if [[ ! -f "$WEB_INTERACTION_PROJECTION_FILE" ]]; then
  echo "FAIL: missing $WEB_INTERACTION_PROJECTION_FILE"
  exit 1
fi
if [[ ! -f "$WEB_MEMBER_MANAGEMENT_CONTROLLER_FILE" ]]; then
  echo "FAIL: missing $WEB_MEMBER_MANAGEMENT_CONTROLLER_FILE"
  exit 1
fi
if [[ ! -f "$WEB_JOIN_REQUESTS_CONTROLLER_FILE" ]]; then
  echo "FAIL: missing $WEB_JOIN_REQUESTS_CONTROLLER_FILE"
  exit 1
fi
if [[ ! -f "$ADMIN_CONTROLLER_FILE" ]]; then
  echo "FAIL: missing $ADMIN_CONTROLLER_FILE"
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
  guard_rg_assert_absent \
    "forbidden contract marker: $description" \
    -n -U --pcre2 "$pattern" "$file"
  echo "OK: $description"
}

require_block_no_match() {
  local file="$1"
  local start_pattern="$2"
  local end_pattern="$3"
  local forbidden_pattern="$4"
  local description="$5"
  if ! awk -v start="$start_pattern" -v end="$end_pattern" '
    $0 ~ start { in_block = 1 }
    in_block { print }
    $0 ~ end && in_block { in_block = 0 }
  ' "$file" | guard_rg_assert_absent \
    "forbidden contract marker in selected block: $description" \
    -n -U --pcre2 "$forbidden_pattern"; then
    exit 1
  fi
  echo "OK: $description"
}

echo "[1/12] Ensuring admin gateway forwards authSubject for member/admin queries..."
require_multiline_match "$MEMBERSHIP_GATEWAY_FILE" \
  'export async function listCloudCommunityMembershipAdminPage<[\s\S]*?client\.query\("communityAdmin:listCommunityMembershipsAdminPage" as any, \{\s*authSubject,\s*communityId:' \
  "paginated members admin gateway forwards authSubject"
require_multiline_match "$MEMBERSHIP_GATEWAY_FILE" \
  'export async function countCloudCommunityMembershipRows<[\s\S]*?client\.mutation\("communityAdmin:syncCommunityMembershipCount" as any, \{\s*authSubject,\s*communityId:' \
  "member count gateway forwards authSubject through durable count sync"
require_multiline_match "$ADMIN_GATEWAY_FILE" \
  'export async function listCloudCommunityRevenueSeriesRows<[\s\S]*?client\.query\("communityAdmin:listCommunityRevenueSeries" as any, \{\s*authSubject,\s*communityId:' \
  "revenue series gateway forwards authSubject"

echo "[2/12] Ensuring admin/member analytics queries accept authSubject..."
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
  'export const syncCommunityMembershipCount = mutation\(\{\s*args:\s*\{\s*userId: v\.optional\(v\.id\("users"\)\),\s*authSubject: v\.optional\(v\.string\(\)\),\s*communityId: v\.id\("communities"\),' \
  "syncCommunityMembershipCount accepts authSubject"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityMembershipCreatedAtRows = query\(\{\s*args:\s*\{\s*userId: v\.optional\(v\.id\("users"\)\),\s*authSubject: v\.optional\(v\.string\(\)\),' \
  "listCommunityMembershipCreatedAtRows accepts authSubject"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityRevenueSeries = query\(\{\s*args:\s*\{\s*userId: v\.optional\(v\.id\("users"\)\),\s*authSubject: v\.optional\(v\.string\(\)\),' \
  "listCommunityRevenueSeries accepts authSubject"

echo "[3/12] Ensuring manager access centralizes membership-row reads..."
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export async function listCanonicalCommunityMemberMembershipRows\(args: \{[\s\S]*?communityMembershipCountsTowardActiveMemberCount' \
  "canonical member row helper owns active non-owner membership semantics"
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export function countCanonicalCommunityMembersFromRows\([\s\S]*?return 1 \+ \(rows\?\.length \?\? 0\)' \
  "canonical member count is synthesized owner plus active non-owner rows"
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export async function listCommunityMembershipRowsForManager\(args: \{' \
  "shared manager-scoped membership helper exists"

echo "[4/12] Ensuring member/admin roster reads are paginated, release-safe, and count context is explicit..."
require_multiline_match "$SCHEMA_FILE" \
  'communityMemberships: defineTable\([\s\S]*?\.index\("by_community_createdAt", \["communityId", "createdAt"\]\)' \
  "communityMemberships has community creation-order index"
require_multiline_match "$SCHEMA_FILE" \
  'communityJoinRequests: defineTable\([\s\S]*?\.index\("by_community_status_createdAt", \["communityId", "status", "createdAt"\]\)' \
  "communityJoinRequests has community status creation-order index"
require_multiline_match "$SCHEMA_FILE" \
  'communities: defineTable\([\s\S]*?activeMemberCount: v\.optional\(v\.number\(\)\)' \
  "communities carry a durable active member count"
require_multiline_match "$COMMUNITY_LIFECYCLE_FILE" \
  'ctx\.db\.insert\("communities", \{[\s\S]*?activeMemberCount: 1,' \
  "new communities initialize active member count with owner"
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export async function adjustCommunityActiveMemberCountForMembershipTransition\([\s\S]*?syncCommunityActiveMemberCount' \
  "membership transitions go through the durable member-count helper"
require_multiline_match "$COMMUNITY_MEMBERSHIP_LIFECYCLE_FILE" \
  'export async function activateCommunityMembershipCore[\s\S]*?syncCommunityActiveMemberCount' \
  "membership activations reconcile member counts through one canonical helper"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const countCommunityMemberships = query\([\s\S]*?if \(sinceMs === null\) \{[\s\S]*?return await countCanonicalCommunityMembers\(\{' \
  "countCommunityMemberships computes current count from canonical rows"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const syncCommunityMembershipCount = mutation\([\s\S]*?return await syncCommunityActiveMemberCount\(\{' \
  "syncCommunityMembershipCount reconciles durable cache from canonical rows"
require_block_no_match "$COMMUNITY_ADMIN_FILE" \
  'export const syncCommunityMembershipCount = mutation' \
  'export const listCommunityMembershipCreatedAtRows = query' \
  'readCommunityActiveMemberCount\(community\)[\s\S]*?return activeMemberCount' \
  "syncCommunityMembershipCount must not return stale cached count"
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
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityJoinRequests = query\([\s\S]*?withIndex\("by_community_status_createdAt", \(q: any\) =>[\s\S]*?q\.eq\("communityId", args\.communityId\)\.eq\("status", status\)[\s\S]*?\.order\("desc"\)[\s\S]*?\.take\(limit\)' \
  "listCommunityJoinRequests reads join requests by community status creation order"
require_block_no_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityJoinRequests = query' \
  '^\}\);' \
  'withIndex\("by_community",[\s\S]*?\.collect\(\)' \
  "listCommunityJoinRequests does not collect every community join request"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'function requireOwnerForAdminAuthorityChange\([\s\S]*?currentRole === "admin" \|\| nextRole === "admin"[\s\S]*?community_owner_required_for_admin_role' \
  "admin authority changes require an explicit owner-only helper"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const setCommunityMemberRole = mutation\([\s\S]*?requireOwnerForAdminAuthorityChange\(\{\s*community,\s*actorUserId: args\.userId,\s*targetMembership: membership,\s*nextRole: role,' \
  "setCommunityMemberRole requires owner for admin promotion or demotion"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'prepareCommunityMemberRemovalInternal[\s\S]*?requireOwnerForAdminAuthorityChange\(\{\s*community,\s*actorUserId: userId,\s*targetMembership: membership,' \
  "member removal preparation requires owner for admin targets"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'revokeCommunityMemberInternal[\s\S]*?requireOwnerForAdminAuthorityChange\(\{\s*community,\s*actorUserId: userId,\s*targetMembership: membership,' \
  "member revocation requires owner for admin targets"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'blockCommunityUserInternal[\s\S]*?targetMembershipRows[\s\S]*?pickMostRelevantCommunityMembership\(targetMembershipRows\)[\s\S]*?requireOwnerForAdminAuthorityChange\(\{\s*community,\s*actorUserId: userId,\s*targetMembership,' \
  "member ban requires owner for admin targets"
require_no_match "$WEB_APP_FILE" \
  'filteredCommunityMembers|communityMembersRoleFilter|communityMembersPlanFilter|useCommunityMemberRosterLifecycle|loadCommunityMembers|handleShowMoreCommunityMembers' \
  "App does not keep legacy loaded-subset member roster state"
require_no_match "$WEB_JOIN_REQUESTS_CONTROLLER_FILE" \
  'communityMembers|filteredCommunityMembers|communityMembersRoleFilter|communityMembersPlanFilter|isJoinRequestsModalOpen' \
  "join-request controller does not keep member roster or deleted modal state"
require_multiline_match "$WEB_CONTEXT_PANEL_FILE" \
  'const canOpenSettings = Boolean\([\s\S]*props\.canManageMembers[\s\S]*props\.onOpenMemberSettings[\s\S]*!isOwnerMember[\s\S]*!String\(member\.id \?\? ""\)\.startsWith\("owner:"\)' \
  "right-panel member settings action is manager-gated and hidden for owner rows"
require_multiline_match "$WEB_INTERACTION_PROJECTION_FILE" \
  'const canManageCommunityMembers = Boolean\([\s\S]*props\.canManageCommunityMembers[\s\S]*props\.communityId[\s\S]*props\.onSetCommunityMemberRole[\s\S]*props\.onRemoveCommunityMember[\s\S]*props\.onBanCommunityMember' \
  "right-panel member settings fail closed unless manager callbacks are wired"
require_multiline_match "$WEB_MEMBER_DIALOG_FILE" \
  'const canChangeRole = Boolean\([\s\S]*props\.canManageMembers[\s\S]*!memberIsOwner[\s\S]*\(props\.isActiveCommunityOwner \|\| !memberIsAdmin\)' \
  "member settings dialog prevents non-owners from role-changing owners or admins"
require_multiline_match "$WEB_MEMBER_DIALOG_FILE" \
  'props\.isActiveCommunityOwner[\s\S]*\(\["member", "moderator", "admin"\] as const\)[\s\S]*memberIsAdmin[\s\S]*\(\["admin"\] as const\)[\s\S]*\(\["member", "moderator"\] as const\)' \
  "member settings dialog reserves admin role controls for owners"
require_multiline_match "$WEB_MEMBER_DIALOG_FILE" \
  'disabled=\{!canChangeRole\}[\s\S]*roleOptions\.map' \
  "member settings dialog disables admin role changes for non-owner admins"
require_multiline_match "$WEB_MEMBER_DIALOG_FILE" \
  'disabled=\{!canRemoveMember\}[\s\S]*Only owners can remove admins[\s\S]*disabled=\{!canRemoveMember\}[\s\S]*Only owners can ban admins' \
  "member settings dialog disables admin removal and ban actions for non-owner admins"
require_no_match "$WEB_MEMBER_DIALOG_FILE" \
  '\(\["member", "moderator", "admin"\] as const\)\.map' \
  "member settings dialog does not render admin role options unconditionally"
require_no_match "$ADMIN_CONTROLLER_FILE" \
  'patchCommunityMemberRoleLocally|removeCommunityMemberLocally|setCommunityMembers|setCommunityMemberCount|listCloudCommunityMembershipAdminPage|loadCommunityMembers|handleShowMoreCommunityMembers' \
  "member mutations no longer patch a deleted local Members-tab roster"
require_multiline_match "$ADMIN_CONTROLLER_FILE" \
  'const reconcileCommunityMembershipViews = useCallback\([\s\S]*?void \(async \(\) =>[\s\S]*?Promise\.allSettled\(\[[\s\S]*?countCloudCommunityMembershipRows[\s\S]*?reloadCommunities[\s\S]*?reloadCommunityAccess' \
  "member mutations use non-blocking narrow background reconciliation"
require_multiline_match "$ADMIN_CONTROLLER_FILE" \
  'handleSetCommunityMemberRole[\s\S]*?await setCloudCommunityMemberRole[\s\S]*?reconcileCommunityMembershipViews\(communityId, session\)' \
  "role mutation reconciles only after backend success"
require_multiline_match "$ADMIN_CONTROLLER_FILE" \
  'handleRemoveCommunityMember[\s\S]*?await removeCloudCommunityMember[\s\S]*?reconcileCommunityMembershipViews\(communityId, session\)' \
  "remove mutation reconciles only after backend success"
require_multiline_match "$ADMIN_CONTROLLER_FILE" \
  'handleBanCommunityMember[\s\S]*?await banCloudCommunityMember[\s\S]*?reconcileCommunityMembershipViews\(communityId, session\)' \
  "ban mutation reconciles only after backend success"
require_no_match "$ADMIN_CONTROLLER_FILE" \
  'refreshCommunityMembershipViews' \
  "member mutations do not keep the old full refresh helper"
require_block_no_match "$ADMIN_CONTROLLER_FILE" \
  'const handleSetCommunityMemberRole = useCallback' \
  '^\s*\}, \[reconcileCommunityMembershipViews\]\);' \
  'finally|await reconcileCommunityMembershipViews|await reloadCommunities|await reloadCommunityAccess' \
  "role mutation does not block on refresh or reconciliation"
require_block_no_match "$ADMIN_CONTROLLER_FILE" \
  'const handleRemoveCommunityMember = useCallback' \
  '^\s*\}, \[reconcileCommunityMembershipViews\]\);' \
  'finally|await reconcileCommunityMembershipViews|await reloadCommunities|await reloadCommunityAccess' \
  "remove mutation does not block on refresh or reconciliation"
require_block_no_match "$ADMIN_CONTROLLER_FILE" \
  'const handleBanCommunityMember = useCallback' \
  '^\s*\}, \[reconcileCommunityMembershipViews\]\);' \
  'finally|await reconcileCommunityMembershipViews|await reloadCommunities|await reloadCommunityAccess' \
  "ban mutation does not block on refresh or reconciliation"
require_no_match "$ADMIN_CONTROLLER_FILE" \
  'await countCloudCommunityMembershipRows' \
  "member reconciliation does not block mutation handlers on count sync"
require_no_match "$ADMIN_CONTROLLER_FILE" \
  'Promise\.all\([\s\S]*?(listCloudCommunityMembershipAdminPage[\s\S]*?countCloudCommunityMembershipRows|countCloudCommunityMembershipRows[\s\S]*?listCloudCommunityMembershipAdminPage)' \
  "frontend no longer joins admin roster and count promises"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'approveCommunityJoinRequest[\s\S]*activateCommunityMembershipCore' \
  "join approvals maintain active member count"
require_multiline_match "$COMMUNITY_PUBLIC_FILE" \
  'grantFreeMembership[\s\S]*activateCommunityMembershipCore' \
  "public joins maintain active member count"
require_multiline_match "$BILLING_CORE_FILE" \
  'ensureCommunityMembership[\s\S]*activateCommunityMembershipCore' \
  "paid membership creation maintains active member count"
require_multiline_match "$COMMUNITY_COMMERCE_FILE" \
  'syncCommunitySubscriptionLifecycleInternal[\s\S]*adjustCommunityActiveMemberCountForMembershipTransition' \
  "subscription status changes maintain active member count"
require_multiline_match "$PLATFORM_HOME_COMMUNITY_FILE" \
  'ensurePlatformHomeCommunityMembership[\s\S]*activateCommunityMembershipCore' \
  "platform autojoin maintains active member count"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'revokeCommunityMemberInternal[\s\S]*adjustCommunityActiveMemberCountForMembershipTransition' \
  "member removal and ban maintain active member count"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'leaveCommunity[\s\S]*adjustCommunityActiveMemberCountForMembershipTransition' \
  "member leave maintains active member count"

echo "[5/12] Ensuring public user identity is returned for admin membership rows..."
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'user_id:\s*\(await resolvePublicUserId\(ctx, row\.userId, userIdCache\)\) \?\?\s*String\(row\.userId\)' \
  "admin membership rows resolve public user IDs"

echo "[6/12] Ensuring manager-owned analytics queries resolve authenticated subject before access checks..."
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityRevenueSeries = query\([\s\S]*?const userId = await resolveUserIdForAuthenticatedRequest\(\{\s*ctx,\s*userId: args\.userId,\s*authSubject: args\.authSubject \?\? null,' \
  "listCommunityRevenueSeries resolves authenticated subject"

echo "[7/12] Ensuring analytics queries still require manager access..."
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityRevenueSeries = query\([\s\S]*?await requireCommunityManager\(\{\s*ctx,\s*communityId: args\.communityId,\s*userId: args\.userId,' \
  "listCommunityRevenueSeries requires manager access"

echo "[8/12] Ensuring the canonical auth + funding contract doc exists..."
if [[ ! -f "docs/auth-money-access-matrix.md" ]]; then
  echo "FAIL: missing docs/auth-money-access-matrix.md"
  exit 1
fi
echo "OK: canonical auth + funding contract doc present."

echo "[9/12] Ensuring member billing history is real, authenticated, and manager-gated..."
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const getCommunityMemberBillingHistory = query\(\{\s*args:\s*\{\s*userId: v\.optional\(v\.id\("users"\)\),\s*authSubject: v\.optional\(v\.string\(\)\),\s*communityId: v\.id\("communities"\),\s*targetMembershipId: v\.id\("communityMemberships"\),' \
  "canonical member billing history query accepts authenticated subject and target membership"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const getCommunityMemberBillingHistory = query\([\s\S]*?resolveCommunityAdminMembersContext\(\{[\s\S]*?if \(!viewerCanManageMembers\) throw new Error\("community_forbidden"\)' \
  "member billing history fails closed to managers only"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const getCommunityMemberBillingHistory = query\([\s\S]*?listCommunitySubscriptionRowsForMembership\(\{[\s\S]*?membershipId: membership\._id,' \
  "member billing history is backed by persisted subscription rows"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const getCommunityMemberBillingHistory = query\([\s\S]*?current_plan: currentPlan,[\s\S]*?events,' \
  "member billing history returns current plan from billing detail path"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'listCheckoutBillingHistoryEventsForSubscriptions\([\s\S]*?query\("checkoutSessions" as any\)[\s\S]*?withIndex\("by_providerSubscriptionId"' \
  "member billing history includes persisted checkout sessions by provider subscription"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'listSubscriptionAuditBillingHistoryEvents\([\s\S]*?query\("criticalAuditEvents" as any\)[\s\S]*?withIndex\("by_providerObject"' \
  "member billing history includes persisted subscription audit events"
require_multiline_match "$ADMIN_GATEWAY_FILE" \
  'export async function fetchCloudCommunityMemberBillingHistory<[\s\S]*?client\.query\("communityAdmin:getCommunityMemberBillingHistory" as any, \{\s*authSubject,\s*communityId: params\.communityId,\s*targetMembershipId: params\.membershipId,' \
  "member billing history gateway forwards authSubject and target membership"
require_multiline_match "$WEB_MEMBER_MANAGEMENT_CONTROLLER_FILE" \
  'fetchCloudCommunityMemberBillingHistory\(\{[\s\S]*?session,\s*communityId,\s*membershipId,' \
  "member-management controller loads authenticated billing history"
require_multiline_match "$WEB_MEMBER_DIALOG_FILE" \
  'useEffect\(\(\) => \{[\s\S]*?if \(!memberId \|\| !canViewMemberPlanDetails\) return;[\s\S]*?void loadMemberBillingHistory\(memberId\)' \
  "member settings dialog loads billing history on demand"
require_no_match "$WEB_MEMBER_DIALOG_FILE" \
  'Payment history|Historical payments unavailable|No payment history' \
  "member settings dialog does not expose unbacked payment-history placeholder text"
require_block_no_match "$COMMUNITY_ADMIN_FILE" \
  '^async function mapCommunityOwnerAdminMemberRow' \
  '^async function mapCommunityAdminMembershipRow' \
  'price_point_id|billing_period|amount_base_units|currency_decimals|communitySubscriptions|pricePoint' \
  "owner roster row has no billing/detail fields"
require_block_no_match "$COMMUNITY_ADMIN_FILE" \
  '^async function mapCommunityAdminMembershipRow' \
  '^async function endCommunitySubscriptionsForMembership' \
  'price_point_id|billing_period|amount_base_units|currency_decimals|communitySubscriptions|pricePoint' \
  "member roster rows do not hydrate billing detail"
require_no_match "$MEMBERSHIP_GATEWAY_FILE" \
  'price_point_id|billing_period|amount_base_units|currency_decimals|CommunityBillingPeriod' \
  "membership admin gateway row type excludes billing detail"
require_no_match "$WEB_INTERACTION_PROJECTION_FILE" \
  'member-price-label|formatMemberAccess|member\.(price_point_id|billing_period|amount_base_units|currency_decimals)' \
  "right-panel member directory projection excludes plan badges and billing detail fields"

echo "[10/12] Ensuring paid member removal cancels provider subscriptions and preserves revoked membership state..."
require_multiline_match "$ADMIN_GATEWAY_FILE" \
  'export async function removeCloudCommunityMember<[\s\S]*?client\.action\("communityAdmin:removeCommunityMember" as any, \{\s*authSubject,\s*communityId:' \
  "remove member gateway calls action for provider cancellation"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const removeCommunityMember = action\(' \
  "removeCommunityMember is action-backed"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'planConnectedStripeSubscriptionCancellations\(subscriptionRows\)[\s\S]*?cancelPreparedStripeSubscriptionEffects' \
  "remove member plans one canonical account-scoped subscription effect set"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'applyStripeSubscriptionEffect\(\{[\s\S]*?kind: "connected",[\s\S]*?providerAccountId: effect\.provider_account_id,[\s\S]*?intent: "cancel_now"' \
  "remove member executes canonical connected-account cancellation effects"
require_no_match "$COMMUNITY_ADMIN_FILE" \
  'cancelStripeSubscriptionIfActive|provider_subscription_ids' \
  "retired unscoped Stripe cancellation helper and DTO remain deleted"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'await ctx\.db\.patch\(membership\._id as any, \{\s*active: false,\s*revokedAt: nowMs,\s*revokedReason:' \
  "remove member preserves revoked membership row"
if ! awk '
  /export const revokeCommunityMemberInternal = internalMutation\(/ { in_block = 1 }
  /async function cancelPreparedStripeSubscriptionEffects/ { in_block = 0 }
  in_block { print }
' "$COMMUNITY_ADMIN_FILE" | guard_rg_assert_absent \
  "revokeCommunityMemberInternal deletion of paid membership audit rows" \
  'await ctx\.db\.delete\(membership\._id as any\)'; then
  exit 1
fi
echo "OK: revokeCommunityMemberInternal does not delete membership rows"

echo "[11/12] Ensuring ban and unban are distinct from remove..."
require_multiline_match "$ADMIN_GATEWAY_FILE" \
  'export async function banCloudCommunityMember<[\s\S]*?client\.action\("communityAdmin:banCommunityMember" as any, \{\s*authSubject,\s*communityId:' \
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

echo "[12/12] Guard passed."
echo "PASS: community admin contract markers are present and hardened."
