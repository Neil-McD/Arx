import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const app = read("apps/web/src/App.tsx");
const communityAdmin = read("convex/communityAdmin.ts");
const contextPanel = read("apps/web/src/components/CommunityContextPanel.tsx");
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
  /isJoinRequestDecisionPending = Boolean\(props\.decidingJoinRequestId\)[\s\S]*?disabled=\{isJoinRequestDecisionPending\}[\s\S]*?disabled=\{isJoinRequestDecisionPending\}/,
  "every request action must disable while any decision is pending",
);
assert.match(
  communityAdmin,
  /resolveCommunityJoinRequestDecision\([\s\S]*?currentStatus === targetStatus[\s\S]*?currentStatus !== "pending"[\s\S]*?join_request_already_decided/,
  "terminal request decisions must be idempotent only for the same decision",
);
assert.match(
  communityAdmin,
  /approveCommunityJoinRequest = mutation\([\s\S]*?requireCommunityModerator[\s\S]*?resolveCommunityJoinRequestDecision\(request, "approved"\)/,
  "approval must authorize before applying the pending-only transition",
);
assert.match(
  communityAdmin,
  /denyCommunityJoinRequest = mutation\([\s\S]*?requireCommunityModerator[\s\S]*?resolveCommunityJoinRequestDecision\(request, "denied"\)/,
  "denial must authorize before applying the pending-only transition",
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
