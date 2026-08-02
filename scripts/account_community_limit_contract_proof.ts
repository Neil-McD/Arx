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
const accountController = read("apps/web/src/controllers/useWebAccountPlanController.ts");
const matrix = read("docs/auth-money-access-matrix.md");

assert.match(
  auth,
  /CACHED_CLIENT_UNBOUNDED_COMMUNITY_LIMIT = Number\.MAX_SAFE_INTEGER/,
);
assert.match(auth, /getCanonicalTierByUserIdInternal[\s\S]*return "free"/);
assert.doesNotMatch(auth, /POLYNET_FREE_MAX_COMMUNITIES|PLATFORM_OWNER_COMPLIMENTARY_MAX_COMMUNITIES|maxCommunities/);
assert.doesNotMatch(auth, /if \(tier === "architect"\)/);
assert.match(lifecycle, /resolveAdditionalManagedCommunityAdmission\(ctx, ownerId\)/);
assert.match(lifecycle, /community_funding_required_before_create/);
assert.doesNotMatch(lifecycle, /max_communities|community_owner_limit_reached/);
assert.match(
  founderInference,
  /resolveAdditionalManagedCommunityAdmission[\s\S]*query\("communities"[\s\S]*by_owner[\s\S]*resolveCommunityInferenceFundingAdmission/,
);
assert.doesNotMatch(founderInference, /MAX_COMMUNITIES|fundedCommunityCount\s*[><=]/);
assert.match(createController, /community_funding_required_before_create/);
assert.doesNotMatch(createController, /max_communities|community_owner_limit_reached|onOwnedCommunityLimitReached/);
assert.match(createModal, /Create and continue to payment/);
assert.doesNotMatch(createModal, /max_communities|Community limit reached|needsPlan|limitReached/);
assert.doesNotMatch(shellController, /hasCommunityCreateAccess|setIsFreeAccountInfoOpen/);
assert.doesNotMatch(mobileController, /hasCommunityCreateAccess|setIsFreeAccountInfoOpen/);
assert.equal(existsSync("shared/CommunityLimitModal.tsx"), false);
assert.doesNotMatch(accountController, /Premium|startCloudPremium|setDevAccountTier/i);
assert.match(matrix, /\$79 \/ month \/ managed community/);
assert.match(matrix, /unlimited number of communities/);
assert.match(matrix, /2\.9%/);

console.log("account_community_limit_contract_proof: unlimited paid communities ok");
