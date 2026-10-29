import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const auth = read("convex/auth.ts");
const lifecycle = read("convex/communityLifecycle.ts");
const founderInference = read("convex/founderInferenceCore.ts");
const createController = read("shared/useCommunityCreateController.ts");
const createModal = read("apps/web/src/components/WebCreateCommunityModal.tsx");
const shellController = read("apps/web/src/controllers/buildWebShellChromeHostProps.ts");
const mobileController = read("apps/web/src/controllers/useWebMobileShellController.ts");
const matrix = read("docs/auth-money-access-matrix.md");

assert.match(
  auth,
  /CACHED_CLIENT_UNBOUNDED_COMMUNITY_LIMIT = Number\.MAX_SAFE_INTEGER/,
);
assert.match(auth, /getCanonicalTierByUserIdInternal[\s\S]*return "free"/);
assert.doesNotMatch(auth, /POLYNET_FREE_MAX_COMMUNITIES|PLATFORM_OWNER_COMPLIMENTARY_MAX_COMMUNITIES|maxCommunities/);
assert.doesNotMatch(auth, /if \(tier === "architect"\)/);
assert.match(
  lifecycle,
  /founderSubscriptionId: v\.optional\(v\.id\("founderSubscriptions"\)\)[\s\S]*founder_subscription_forbidden[\s\S]*founder_subscription_already_attached/,
);
// Pricing v2: creating is free; the brake is a bounded number of live
// communities per owner (the platform owner is exempt).
assert.doesNotMatch(lifecycle, /community_funding_required_before_create/);
assert.match(lifecycle, /if \(!operatorComped && !founderSubscription\) await requireOwnerBelowFreeCommunityLimit\(ctx, ownerId\)/);
const coreSource = read("convex/communityCore.ts");
assert.match(coreSource, /FREE_COMMUNITIES_PER_OWNER = \d+;[\s\S]*requireOwnerBelowFreeCommunityLimit[\s\S]*community_owner_limit_reached/);
assert.match(read("convex/communityColdArchive.ts"), /requireOwnerBelowFreeCommunityLimit\(ctx, community\.ownerId\)/);
assert.doesNotMatch(lifecycle, /max_communities/);
assert.match(
  founderInference,
  /resolveAdditionalManagedCommunityAdmission[\s\S]*query\("communities"[\s\S]*by_owner[\s\S]*resolveCommunityInferenceFundingAdmission/,
);
assert.doesNotMatch(founderInference, /MAX_COMMUNITIES|fundedCommunityCount\s*[><=]/);
assert.match(createController, /community_owner_limit_reached/);
assert.doesNotMatch(createController, /max_communities|community_funding_required_before_create|onOwnedCommunityLimitReached/);
assert.match(createModal, /Community handle[\s\S]*Create community/);
assert.doesNotMatch(createModal, /max_communities|Community limit reached|needsPlan|limitReached/);
assert.doesNotMatch(shellController, /hasCommunityCreateAccess|setIsFreeAccountInfoOpen/);
assert.doesNotMatch(mobileController, /hasCommunityCreateAccess|setIsFreeAccountInfoOpen/);
assert.equal(existsSync("shared/CommunityLimitModal.tsx"), false);
assert.match(matrix, /\$79 \/ month \/ community/);
assert.match(matrix, /Creating a community needs no payment; an owner may have at most 10 live communities/);
assert.doesNotMatch(matrix, /Every newly created non-operator community is subscription-required/);
assert.match(matrix, /2\.9%/);

console.log("account_community_limit_contract_proof: one verified subscription per paid community ok");
