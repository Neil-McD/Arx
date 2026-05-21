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
const landingPage = read("apps/web/src/components/WebLandingPage.tsx");

assert.match(
  auth,
  /if \(tier === "architect"\) \{[\s\S]*?maxCommunities: 3,/,
  "architect tier should retain the internal three-community limit",
);
assert.match(
  auth,
  /return \{[\s\S]*?maxCommunities: 2,[\s\S]*?platformFeeBps: 1500,/,
  "free account tier should allow two communities",
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
  ["landing page", landingPage],
] as const) {
  assert.doesNotMatch(contents, /one communit(y|ies)/i, `${label} should not describe a one-community free limit`);
}

assert.match(accountModal, /two communities/i, "free account modal must describe two communities");
assert.match(accountMatrix, /two communities/i, "auth money access matrix must describe two communities");
assert.match(builderQuickstart, /two communities/i, "builder quickstart must describe two communities");
assert.match(landingPage, /two communities/i, "landing page must describe two communities");
