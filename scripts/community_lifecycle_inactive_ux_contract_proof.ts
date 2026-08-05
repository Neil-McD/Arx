import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const operations = read("convex/communityLifecycleOperations.ts");
const gateway = read("shared/cloudCommunityLifecycleGateway.ts");
const routeBoundary = read(
  "apps/web/src/controllers/useWebRouteAccessBoundaryController.ts",
);
const routeResolution = read(
  "apps/web/src/controllers/useWebCommunityRouteResolution.ts",
);
const directory = read("shared/useWebCommunityAccessController.ts");
const mainSurface = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");
const fallback = read("apps/web/src/components/WebAppMainSurfaceFallback.tsx");
const terminal = read(
  "apps/web/src/components/WebCommunityLifecycleTerminal.tsx",
);
const inventory = read(
  "apps/web/src/components/WebInactiveCommunityInventory.tsx",
);
const settings = read(
  "apps/web/src/components/WebCommunitySettingsSection.tsx",
);

assert.match(
  operations,
  /getMyCommunityLifecycleManagementBySlug = query[\s\S]*resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityOwnerAnyLifecycle[\s\S]*mapCommunityLifecycleManagement/,
  "owner lifecycle detail must resolve authenticated identity and authorize across lifecycle states",
);
assert.match(
  operations,
  /listMyInactiveCommunityLifecycleRows = query[\s\S]*lifecycleStatus: v\.union\([\s\S]*"archiving"[\s\S]*"archived"[\s\S]*paginationOptsValidator[\s\S]*by_owner_lifecycle_createdAt[\s\S]*\.eq\("lifecycleStatus", args\.lifecycleStatus\)[\s\S]*\.paginate\(/,
  "inactive owner inventory must use one bounded paginated lifecycle-index lane per request",
);
assert.doesNotMatch(
  operations.slice(
    operations.indexOf("export const getMyCommunityLifecycleManagementBySlug"),
    operations.indexOf("export const beginCommunityArchiveOperationInternal"),
  ),
  /communitySubscriptions|founderSubscriptions|communityMemberships|communityInteractionRoots/,
  "lifecycle read models must not expose provider, member, or content surfaces",
);
assert.match(gateway, /communityLifecycleOperations:getMyCommunityLifecycleManagementBySlug/);
assert.match(gateway, /communityLifecycleOperations:listMyInactiveCommunityLifecycleRows/);
assert.doesNotMatch(
  gateway,
  /\.mutation\(/,
  "the browser lifecycle gateway must remain read-only in this slice",
);

assert.match(
  routeResolution,
  /communityLifecycleIsInactive\(access\?\.lifecycle_status\)[\s\S]*inactiveRoute/,
);
assert.match(
  routeBoundary,
  /useWebCommunityRouteResolution[\s\S]*inactiveCommunityRoute: communityResolution\.inactiveCommunityRoute/,
  "the route boundary must delegate community lifecycle resolution to one bounded owner",
);
assert.match(
  directory,
  /preserveUnmatchedActiveCommunitySlug[\s\S]*if \(latest\.preserveUnmatchedActiveCommunitySlug\) return/,
  "the active directory must not race the explicit route-access owner",
);
assert.match(
  mainSurface,
  /showInactiveCommunitySurface[\s\S]*WebCommunityLifecycleTerminal[\s\S]*showCommunitySurface[\s\S]*WebCommunityHost/,
  "terminal lifecycle UI must replace, not overlay, the ordinary community host",
);
assert.match(
  fallback,
  /!props\.showInactiveCommunitySurface/,
  "lazy fallback must not flash chat bootstrap beneath an inactive route",
);
for (const message of [
  "Community is being archived",
  "Community archived",
  "Community archive needs attention",
]) {
  assert.match(terminal, new RegExp(message));
}
assert.match(inventory, /Archived communities/);
assert.match(inventory, /listCloudMyInactiveCommunityLifecycleRows/);
assert.match(
  inventory,
  /INACTIVE_LIFECYCLE_STATUSES[\s\S]*"archiving"[\s\S]*"archived"[\s\S]*continue_cursor[\s\S]*Load more/,
  "owner inventory must page both inactive lifecycle lanes without a fixed result ceiling",
);
assert.match(settings, /Archive controls are not available in this build/);
assert.doesNotMatch(
  [terminal, inventory, settings].join("\n"),
  /beginCommunityArchiveOperation|deleteCommunity|restoreCommunity|\.mutation\(/,
  "inactive UX must not smuggle in archive, restore, or deletion authority",
);

console.log("community_lifecycle_inactive_ux_contract_proof: ok");
