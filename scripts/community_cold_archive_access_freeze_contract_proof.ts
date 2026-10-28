import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const core = read("convex/communityCore.ts");
const admin = read("convex/communityAdmin.ts");
const access = read("convex/communityAccessQueries.ts");
const publicCommunity = read("convex/communityPublic.ts");
const publicMemory = read("convex/communityIntelligenceDirectory.ts");
const profiles = read("convex/profileRelationshipCore.ts");
const analytics = read("convex/businessAnalytics.ts");
const platformOperationExecutor = read("convex/platformOperationExecutor.ts");
const platformHome = read("convex/platformHomeCommunity.ts");
const cognitionLifecycle = read("convex/communityCognitionLifecycle.ts");
const founderInference = read("convex/founderInferenceCore.ts");
const email = read("convex/email.ts");
const schema = read("convex/schema.ts");

assert.match(
  core,
  /export function requireActiveCommunity\([\s\S]*communityIsActive\(community\)[\s\S]*throw new Error\("community_archived"\)/,
  "one canonical ordinary-access guard must own the archived error",
);
assert.match(
  core,
  /export async function getCommunityAndMembership[\s\S]*requireActiveCommunity\(community\)[\s\S]*query\("communityMemberships"\)/,
  "ordinary access must reject archived communities before membership work",
);
assert.match(
  core,
  /export async function resolveCommunityAccessBundle[\s\S]*requireActiveCommunity\(args\.community\)/,
  "direct access-bundle callers must share the same lifecycle guard",
);

assert.match(
  admin,
  /ownedCommunities[\s\S]*filter\(\(row\) => communityIsActive\(row\)\)/,
  "the ordinary owner rail must omit archived communities",
);
assert.match(
  admin,
  /if \(!community \|\| !communityIsActive\(community\)\) continue/,
  "the ordinary member rail must omit archived communities",
);
assert.match(
  access,
  /if \(!community \|\| !communityIsActive\(community\)\) return null/,
  "slug access resolution must treat archived communities as absent",
);

for (const projection of [
  "resolvePublicFunnelBySlug",
  "resolvePublicFunnelStatsBySlug",
  "recordPublicFunnelVisitBySlug",
]) {
  const start = publicCommunity.indexOf(`export const ${projection}`);
  assert.notEqual(start, -1, `${projection} must exist`);
  const next = publicCommunity.indexOf("\nexport const ", start + 1);
  const block = publicCommunity.slice(start, next === -1 ? undefined : next);
  assert.match(
    block,
    /communityIsActive\(community\)/,
    `${projection} must omit archived communities`,
  );
}
assert.match(
  publicCommunity,
  /published\.map\(async \(community\) => \{[\s\S]*communityIsActive\(community\)[\s\S]*resolveCommunityBuilderAccess[\s\S]*builderAccess\.operational[\s\S]*slice\(0, limit\)/,
  "Discover must remain bounded while omitting archived and commercially unavailable communities",
);
assert.match(
  publicCommunity,
  /async function joinPublicCommunityInternal[\s\S]*throw new Error\("community_archived"\)/,
  "both public join selectors must converge on one archived-state mutation guard",
);
assert.match(
  publicMemory,
  /resolvePublicCommunityMemoryOverviewBySlug[\s\S]*!communityIsActive\(community\)/,
  "the public memory projection must omit archived communities",
);
assert.match(
  profiles,
  /listOwnedCommunitiesByOwnerId[\s\S]*filter\(\(community\) => communityIsActive\(community\)\)/,
  "ordinary profile community projections must omit archived communities",
);
assert.match(
  analytics,
  /pathKind === "community_funnel"[\s\S]*!communityIsActive\(community\)/,
  "archived funnel visits must not produce analytics writes",
);
assert.match(
  platformOperationExecutor,
  /error\.message === "community_archived"[\s\S]*"semantic_not_found"[\s\S]*"Semantic path not found or not accessible\."/,
  "external semantic access must not disclose archived-community lifecycle state",
);
assert.doesNotMatch(
  platformHome,
  /db\.insert\("communityMemberships"/,
  "platform-home autojoin stays removed (Sept 2026), so it cannot write memberships for archived communities",
);
assert.match(
  cognitionLifecycle,
  /communityIsActive\(community as Record<string, unknown>\)[\s\S]*throw new Error\("community_archived"\)/,
  "one canonical cognition-write guard must freeze archived communities",
);
assert.match(
  founderInference,
  /if \(!communityIsActive\(community\)\) \{[\s\S]*code: "community_not_found"[\s\S]*hasPlatformOwnerComplimentaryAccess/,
  "archived communities must fail compute admission before entitlement work",
);
assert.match(
  email,
  /enqueueEmailJobInternal[\s\S]*communityLifecycleGenerationMatches\([\s\S]*args\.communityLifecycleGeneration[\s\S]*reason: "community_inactive"/,
  "email enqueue must transactionally reject stale community generations",
);
assert.match(
  schema,
  /emailOutbox: defineTable\(\{[\s\S]*communityId: v\.optional\(v\.id\("communities"\)\),[\s\S]*communityLifecycleGeneration: v\.optional\(v\.number\(\)\)/,
  "community-bound outbox rows must persist the lifecycle generation",
);
assert.match(
  email,
  /claimDueEmailOutboxBatchInternal[\s\S]*communityLifecycleGenerationMatches\([\s\S]*row\.communityLifecycleGeneration[\s\S]*failureReason: "community_inactive"/,
  "queued community email must be suppressed if archive wins before delivery",
);
for (const path of [
  "convex/communityChat.ts",
  "convex/communityInteractions.ts",
  "convex/communityResources.ts",
  "convex/communityEvents.ts",
  "convex/communityAgent.ts",
  "convex/runtimeCommunityResourceLane.ts",
]) {
  const source = read(path);
  assert.doesNotMatch(
    source,
    /communityIsActive|lifecycleStatus|community_archived/,
    `${path} must inherit lifecycle policy instead of creating a parallel branch`,
  );
}

console.log("community cold archive access freeze contract proof passed");
