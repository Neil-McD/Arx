import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const schema = read("convex/schema.ts");
const membershipLifecycle = read("convex/communityMembershipLifecycle.ts");
const communityPublic = read("convex/communityPublic.ts");
const communityAdmin = read("convex/communityAdmin.ts");
const communityCommerce = read("convex/communityCommerce.ts");
const founderBilling = read("convex/founderBilling.ts");
const publicMemory = read("convex/communityIntelligenceDirectory.ts");
const capabilityDirectory = read("convex/communityCapabilityContext.ts");
const profileRelationship = read("convex/profileRelationshipCore.ts");
const routeBoundary = read(
  "apps/web/src/controllers/useWebRouteAccessBoundaryController.ts",
);
const publicRoute = read(
  "apps/web/src/controllers/useWebPublicCommunityRouteController.ts",
);
const publicActions = read(
  "apps/web/src/controllers/useWebPublicFunnelActions.ts",
);
const publicFunnel = read(
  "apps/web/src/components/WebPublicCommunityFunnel.tsx",
);
const communityAccess = read("shared/useWebCommunityAccessController.ts");

assert.match(
  membershipLifecycle,
  /if \(existing && communityMembershipRowIsActive\(existing\)\)[\s\S]*?return \{[\s\S]*?accessGranted: false[\s\S]*?const community = await args\.ctx\.db\.get\(args\.communityId\);[\s\S]*?requireActiveCommunity\(community\)/,
  "existing memberships may refresh, but every new activation must cross the active lifecycle boundary",
);

assert.match(
  communityPublic,
  /listPublicDiscoverCommunities[\s\S]*?by_lifecycle_visibility_updatedAt[\s\S]*?lifecycleStatus", undefined[\s\S]*?lifecycleStatus", "active/,
  "discover must merge legacy-active and explicit-active index lanes without scanning archived communities",
);
assert.match(communityPublic, /joinPublicCommunityInternal[\s\S]*?requireActiveCommunity\(args\.community\)/);
assert.match(communityAdmin, /approveCommunityJoinRequestForFreeAccess[\s\S]*?requireActiveCommunity\(args\.community\)/);
assert.match(communityAdmin, /listCommunityMemberships[\s\S]*?communityIsOperational/);
assert.match(profileRelationship, /listOwnedCommunitiesByOwnerId[\s\S]*?communityIsOperational/);
assert.match(capabilityDirectory, /listAccessibleCommunityDirectoryPage[\s\S]*?communityIsOperational/);
assert.match(publicMemory, /resolvePublicCommunityMemoryOverviewBySlug[\s\S]*?communityAcceptsNewOperations/);

for (const marker of [
  "communityLifecycleGeneration: v.optional(v.number())",
  "communityLifecycleGeneration: v.number()",
]) {
  assert.ok(
    schema.includes(marker) || communityCommerce.includes(marker),
    `lifecycle containment requires ${marker}`,
  );
}
assert.match(
  communityCommerce,
  /createPendingPublicCommunityCheckoutSessionInternal[\s\S]*?requireActiveCommunity\(community\)[\s\S]*?community_checkout_lifecycle_stale/,
);
assert.match(
  communityCommerce,
  /redeemPurchaseClaim[\s\S]*?redeemClaimRow/,
);
assert.match(
  founderBilling,
  /createPendingFounderSubscriptionCheckoutInternal[\s\S]*?requireActiveCommunity\(community\)/,
);

for (const [name, source] of [
  ["route boundary", routeBoundary],
  ["public route", publicRoute],
  ["public actions", publicActions],
] as const) {
  assert.doesNotMatch(
    source,
    /can_enter_community\s*\|\|\s*[^\n]*is_owner|is_owner\s*\|\|\s*[^\n]*can_enter_community/,
    `${name} must not turn ownership into content-access authority`,
  );
}

assert.match(publicActions, /Community archived\./);
assert.match(publicActions, /setPublicCommunity\(null\)[\s\S]*?setPublicCommunityPlans\(\[\]\)/);
assert.match(publicFunnel, /!publicCommunity && publicCommunityError[\s\S]*?public-funnel-state-card/);
assert.match(
  communityAccess,
  /if \(!list\.some[\s\S]*?applyCommunityShellState\(\{ communitySlug: nextCommunitySlug \}\)/,
  "a removed final community must clear stale shell selection instead of leaving cached content mounted",
);

console.log("community_lifecycle_containment_contract_proof: ok");
