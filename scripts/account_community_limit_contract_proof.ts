import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const auth = read("convex/auth.ts");
const communityLifecycle = read("convex/communityLifecycle.ts");
const createController = read("shared/useCommunityCreateController.ts");
const accountModal = read("shared/FreeAccountIncludedModal.tsx");
const accountMatrix = read("docs/auth-money-access-matrix.md");
const builderQuickstart = read("docs/product/guides/builder-quickstart.md");

assert.match(
  auth,
  /if \(tier === "architect"\) \{[\s\S]*?maxCommunities: POLYNET_FREE_MAX_COMMUNITIES,[\s\S]*?platformFeeBps: POLYNET_COMMUNITY_PLATFORM_FEE_BPS,/,
  "Personal Premium must not increase community count or change community fees",
);
assert.match(
  auth,
  /POLYNET_FREE_MAX_COMMUNITIES[\s\S]*return \{[\s\S]*?maxCommunities: POLYNET_FREE_MAX_COMMUNITIES,[\s\S]*?platformFeeBps: POLYNET_COMMUNITY_PLATFORM_FEE_BPS,/,
  "free account tier should allow one community with the universal community platform fee",
);
assert.match(
  auth,
  /max_communities: meta\.maxCommunities/,
  "account commerce status must project the canonical tier max_communities value",
);
assert.match(
  communityLifecycle,
  /ctx\.runQuery\(api\.auth\.getAccountCommerceStatus,[\s\S]*?billingStatus\.max_communities/,
  "community creation must load max_communities from account commerce status",
);
assert.match(
  communityLifecycle,
  /ownedCommunities\.length >= maxCommunities[\s\S]*?community_owner_limit_reached/,
  "community creation must enforce the server-side owner limit",
);
assert.match(
  createController,
  /accountCommerceStatus\?\.max_communities/,
  "community create modal open path must use backend max_communities",
);
assert.match(
  createController,
  /status\.max_communities/,
  "community create submit path must use backend max_communities",
);

for (const [label, contents] of [
  ["free account modal", accountModal],
  ["auth money access matrix", accountMatrix],
  ["builder quickstart", builderQuickstart],
] as const) {
  assert.doesNotMatch(contents, /free (authenticated )?(user|account)s? (can|may).*(own|create|build) two communit/i, `${label} should not describe a two-community free limit`);
}

assert.match(accountModal, /Community funding is managed separately/i, "free account modal must separate community funding from Premium");
assert.match(accountMatrix, /can own one community/i, "auth money access matrix must describe one free community");
assert.match(builderQuickstart, /Community creation and funding are separate from Polynet Premium/i, "builder quickstart must separate community funding from Premium");
