import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const app = read("apps/web/src/App.tsx");
const communityAdmin = read("convex/communityAdmin.ts");
const joinRequestCore = read("convex/communityJoinRequestCore.ts");
const communityPublic = read("convex/communityPublic.ts");
const membershipLifecycle = read("convex/communityMembershipLifecycle.ts");
const memberOntology = read("convex/memberOntology.ts");
const releaseContract = read("docs/community-join-request-canonicalization.md");
const contextPanel = read("apps/web/src/components/CommunityJoinRequestReview.tsx");
const administrationState = read(
  "apps/web/src/controllers/useWebCommunityAdministrationState.ts",
);
const joinRequestState = read(
  "apps/web/src/controllers/useWebCommunityJoinRequestsController.ts",
);
const reviewController = read("shared/useCommunityMembersReviewController.ts");
const reviewLifecycle = read("shared/useCommunityMembersReviewLifecycle.ts");

assert.match(
  communityAdmin,
  /listCommunityJoinRequests = query\([\s\S]*?id: String\(row\._id\),[\s\S]*?community_id: String\(row\.communityId\),[\s\S]*?user_id:/,
  "the canonical review payload must identify its community before App filters it",
);
assert.match(
  app,
  /request\.community_id === activeCommunityId/,
  "the right-panel projection must remain scoped to the active community",
);
assert.doesNotMatch(
  administrationState,
  /decided_at|decided_by|denied_until/,
  "the web request row must not retain fields absent from the canonical payload",
);
assert.match(
  reviewController,
  /const generation = \+\+loadGenerationRef\.current;[\s\S]*?generation === loadGenerationRef\.current[\s\S]*?argsRef\.current\.activeCommunityId === communityId/,
  "loads must be guarded by both generation and active community",
);
assert.match(
  reviewController,
  /if \(!isCurrentLoad\(\)\) return;[\s\S]*?setCommunityJoinRequests\(normalizedRows\)[\s\S]*?finally \{[\s\S]*?if \(isCurrentLoad\(\)\)/,
  "stale loads must not write rows or clear a newer loading state",
);
assert.match(
  reviewController,
  /activeDecisionRef\.current\?\.communityId === communityId\) return;/,
  "the controller must reject overlapping decisions for one community",
);
assert.match(
  contextPanel,
  /isJoinRequestDecisionPending = Boolean\(props\.decidingJoinRequestId\)[\s\S]*?disabled=\{isJoinRequestDecisionPending[^}]*\}[\s\S]*?disabled=\{isJoinRequestDecisionPending[^}]*\}/,
  "every request action must disable while any decision is pending",
);
assert.match(joinRequestCore, /COMMUNITY_JOIN_REQUEST_PAIR_READ_LIMIT = 4[\s\S]*?\.withIndex\("by_community_user"[\s\S]*?\.take\(COMMUNITY_JOIN_REQUEST_PAIR_READ_LIMIT\)/,
  "the compatibility reader must remain pair-scoped and strictly bounded");
assert.match(joinRequestCore, /resolveCompatibleCommunityJoinRequestPair[\s\S]*?community_join_request_state_ambiguous/,
  "unknown legacy request shapes must fail closed");
assert.match(joinRequestCore, /cancelPendingCommunityJoinRequest[\s\S]*?deletePairRowsExcept/,
  "cancellation must delete temporary state");
assert.match(joinRequestCore, /ensurePendingCommunityJoinRequest[\s\S]*?status: "pending"[\s\S]*?deniedAt: undefined[\s\S]*?reapplyAt: undefined/,
  "elapsed denials must reopen the same row as clean pending state");
assert.match(
  communityAdmin,
  /approveCommunityJoinRequestForFreeAccess[\s\S]*?community_owner_join_request_forbidden[\s\S]*?requireCommunityUserNotBlocked[\s\S]*?activateCommunityMembershipCore/,
  "approval must reject owners and blocked targets before activation",
);
assert.match(
  communityAdmin,
  /community_join_request_approved:[\s\S]*?criticalAuditEvents[\s\S]*?recordCriticalAuditEvent/,
  "approval retries must converge through a durable operation receipt",
);
assert.match(
  communityAdmin,
  /includeStatuses[\s\S]*?filter\(\(status\) => status === "pending" \|\| status === "denied"\)[\s\S]*?statuses\.length === 0\) return \[\]/,
  "cached admin filters must ignore legacy terminal statuses before querying rows",
);
assert.match(
  communityAdmin,
  /denyCommunityJoinRequest = mutation\([\s\S]*?requireCommunityModerator[\s\S]*?resolveCommunityJoinRequestDecision\(request, "denied"\)/,
  "denial must authorize before applying the pending-only transition",
);
assert.match(membershipLifecycle, /deleteCommunityJoinRequestByPair\([\s\S]*?communityId: args\.communityId[\s\S]*?userId: args\.userId/,
  "every membership activation must consume residual request state");
assert.match(membershipLifecycle, /getUniqueCommunityMembershipByPair\([\s\S]*?communityId: args\.communityId[\s\S]*?userId: args\.userId/,
  "membership activation must fail closed on duplicate authority rows");
assert.doesNotMatch(communityPublic, /status: "canceled"|status: "approved"/,
  "public admission must not persist terminal request statuses");
assert.match(
  memberOntology,
  /async function confirmMemberInterviewFactsHandler\([\s\S]*?requireCommunityUserNotBlocked\([\s\S]*?loadActiveMembership[\s\S]*?hasPendingJoinRequest/,
  "a block must supersede both membership and pending-request authority for interview facts",
);
assert.match(
  communityPublic,
  /String\(args\.community\.ownerId\) === String\(args\.userId\)[\s\S]*?outcome: "joined"[\s\S]*?requireCommunityUserNotBlocked/,
  "owner admission must bypass request and membership creation",
);
assert.match(
  releaseContract,
  /Release A: compatibility cutover[\s\S]*Release B: bounded reconciliation[\s\S]*Release C: strict enforcement/,
  "release contract must preserve compatibility, repair, then strict ordering",
);
assert.doesNotMatch(
  joinRequestState,
  /activeCommunityId|useEffect/,
  "the state container must not duplicate lifecycle reset ownership",
);
assert.match(
  reviewController,
  /resetCommunityJoinRequests = useCallback\(\(\) => \{[\s\S]*?loadGenerationRef\.current \+= 1;[\s\S]*?decisionGenerationRef\.current \+= 1;[\s\S]*?activeDecisionRef\.current = null;[\s\S]*?setCommunityJoinRequests\(\[\]\)/,
  "one reset operation must invalidate pending async work and clear queue state",
);
assert.match(
  reviewLifecycle,
  /resetCommunityJoinRequests: \(\) => void;[\s\S]*?params\.resetCommunityJoinRequests\(\)/,
  "the lifecycle must delegate reset ownership to the review controller",
);
assert.doesNotMatch(
  reviewLifecycle,
  /Promise\.resolve\([\s\S]*?\.catch\(/,
  "the lifecycle trigger must not duplicate controller error ownership",
);

console.log("community join-request correctness contract passed");
