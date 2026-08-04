import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const schema = read("convex/schema.ts");
const sharedLifecycle = read("shared/communityLifecycle.ts");
const lifecycleCore = read("convex/communityLifecycleCore.ts");
const communityCore = read("convex/communityCore.ts");
const lifecycleApi = read("convex/communityLifecycle.ts");
const migration = read("convex/communityLifecycleMigration.ts");
const platformHome = read("convex/platformHomeCommunity.ts");
const sharedTypes = read("shared/communityTypes.ts");
const accessViewModel = read("shared/communityAccessViewModel.ts");
const capabilityContract = read("shared/communityCapabilityContract.ts");
const contract = read("docs/community-lifecycle-contract-v1.md");

for (const marker of [
  "lifecycleStatus: v.optional(",
  "lifecycleGeneration: v.optional(v.number())",
  "archiveRequestedAt: v.optional(v.number())",
  "archiveEffectiveAt: v.optional(v.number())",
  "archivedAt: v.optional(v.number())",
  'archiveRequestedByUserId: v.optional(v.id("users"))',
  'index("by_owner_lifecycle_createdAt"',
  'index("by_lifecycle_updatedAt"',
  'index("by_lifecycle_visibility_updatedAt"',
]) {
  assert.ok(schema.includes(marker), `schema must include ${marker}`);
}

assert.match(sharedLifecycle, /DEFAULT_COMMUNITY_LIFECYCLE_STATUS[^]*"active"/);
assert.match(sharedLifecycle, /DEFAULT_COMMUNITY_LIFECYCLE_GENERATION = 0/);
assert.match(sharedLifecycle, /communityIsOperational/);
assert.match(sharedLifecycle, /communityAcceptsNewOperations/);
assert.match(sharedLifecycle, /PLATFORM_HOME_COMMUNITY_SLUG = "polynet"/);

assert.match(lifecycleCore, /requireOperationalCommunity/);
assert.match(lifecycleCore, /requireActiveCommunity/);
assert.match(lifecycleCore, /requireCommunityOwnerAnyLifecycle/);
assert.match(lifecycleCore, /assertCommunityMayBeArchived/);

for (const guard of [
  "requireCommunityChatAccess",
  "requireCommunityManager",
  "requireCommunityOwner",
  "requireCommunityModerator",
]) {
  assert.match(
    communityCore,
    new RegExp(
      `export async function ${guard}[^]*?requireOperationalCommunity\\(community\\)`,
    ),
    `${guard} must reject archived communities centrally`,
  );
}
assert.match(
  communityCore,
  /resolveCommunityMembershipEntitlementState[^]*?if \(!communityIsOperational\(args\.community\)\)[^]*?isEntitled: false/,
);
assert.match(communityCore, /lifecycle_status: lifecycleStatus/);
assert.match(communityCore, /lifecycle_generation: lifecycleGeneration/);
assert.match(communityCore, /const primaryCta[^]*?!isOperational[^]*?null/);
assert.match(
  lifecycleApi,
  /export const deleteCommunity[^]*?requireCommunityOwnerAnyLifecycle[^]*?COMMUNITY_DELETION_QUARANTINE_CODE/,
  "deletion must remain quarantined across lifecycle states",
);

assert.match(platformHome, /PLATFORM_HOME_COMMUNITY_SLUG/);
assert.match(platformHome, /if \(!communityIsOperational\(community\)\)/);
assert.match(sharedTypes, /lifecycle_status\?: CommunityLifecycleStatus/);
assert.match(sharedTypes, /lifecycle_generation\?: number/);
assert.match(
  accessViewModel,
  /const isArchived = access\?\.lifecycle_status === "archived"/,
);
assert.match(
  capabilityContract,
  /const isArchived = access\.lifecycle_status === "archived"/,
);
assert.match(capabilityContract, /availableCapabilities[^]*isArchived[^]*\[\]/);
assert.match(
  capabilityContract,
  /communityAccessIsOpen[^]*lifecycle_status !== "archived"/,
);

for (const marker of [
  "MAX_BATCH_SIZE = 100",
  "auditCommunityLifecyclePageInternal",
  "backfillCommunityLifecyclePageInternal",
  "paginationOptsValidator",
  "maximumRowsRead: numItems",
  "blocked",
  "alreadyCanonical",
]) {
  assert.ok(migration.includes(marker), `migration must include ${marker}`);
}
assert.doesNotMatch(migration, /\.collect\(\)/);
assert.doesNotMatch(migration, /updatedAt\s*:/);
assert.match(contract, /does not expose an archive or restore command/);
assert.match(contract, /absent `lifecycleStatus` is `active`/);
assert.match(
  contract,
  /No runtime query may rely exclusively on lifecycle indexes/,
);

console.log("community_lifecycle_foundation_contract_proof: ok");
