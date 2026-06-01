import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const relationshipCore = read("convex/profileRelationshipCore.ts");
const profiles = read("convex/profiles.ts");
const directMessages = read("convex/directMessages.ts");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const profilePanel = read("apps/web/src/components/WebCommunityProfilePanel.tsx");
const packageJson = read("package.json");

assert.match(
  relationshipCore,
  /export async function resolveViewerProfileRelationship/,
  "profile relationship resolver must be the exported profile context surface",
);
assert.match(
  relationshipCore,
  /export async function resolveViewerDirectMessageRelationship/,
  "DM relationship resolver must be the exported DM authorization surface",
);
assert.doesNotMatch(
  relationshipCore,
  /export async function listActiveCommunityMembershipsByUserId|export async function listOwnedCommunitiesByOwnerId|export async function mapCommunityAvatarSummary/,
  "relationship source/query helpers must stay internal",
);
assert.match(
  relationshipCore,
  /Profile strips and fallback DM discovery are bounded; the preferred-community DM path stays exact\./,
  "relationship caps must carry the MVP tradeoff comment",
);
assert.match(
  relationshipCore,
  /resolvePreferredDirectMessageCommunity[\s\S]*requireCommunityChatAccess[\s\S]*userId: args\.viewerUserId[\s\S]*requireCommunityChatAccess[\s\S]*userId: args\.targetUserId/,
  "preferred-community fast path must require current chat access for both users",
);
assert.match(
  relationshipCore,
  /\.withIndex\("by_user_createdAt"[\s\S]*\.take\(MAX_PROFILE_RELATIONSHIP_MEMBERSHIP_ROWS\)/,
  "relationship fallback membership reads must be bounded",
);
assert.match(
  relationshipCore,
  /\.withIndex\("by_owner_createdAt"[\s\S]*\.take\(MAX_PROFILE_RELATIONSHIP_OWNED_ROWS\)/,
  "relationship fallback owned-community reads must be bounded",
);
assert.doesNotMatch(
  relationshipCore,
  /\.collect\(\)/,
  "relationship fallback must not collect unbounded rows",
);

assert.match(
  profiles,
  /getProfileCommunityContext[\s\S]*resolveViewerProfileRelationship/,
  "profile community context query must use the relationship resolver",
);
assert.match(
  directMessages,
  /requireDirectMessageRelationshipAccess[\s\S]*resolveViewerDirectMessageRelationship/,
  "DM open/send authorization must use the DM relationship resolver",
);
assert.match(
  directMessages,
  /requiredCommunityId: isNewConversation \? args\.communityId : null/,
  "new DM rooms must require the selected source community while existing rooms can use any current mutual context",
);
assert.match(
  chatPanel,
  /profilePanelCommunityContext\.message_context_community_id[\s\S]*openDirectMessage\(profilePanelUserId, profilePanelCommunityContext\.message_context_community_id\)/,
  "profile panel message action must open DMs with backend-selected community context",
);
assert.match(
  profilePanel,
  /canMessageProfile = !isSelfProfile && communityContext\.can_message/,
  "profile panel message button must use backend relationship eligibility",
);
assert.doesNotMatch(
  `${relationshipCore}\n${profiles}\n${directMessages}\n${chatPanel}\n${profilePanel}`,
  /follow|follower|following/i,
  "profile/DM relationship slice must not introduce follow graph semantics",
);
assert.match(
  packageJson,
  /check:profile-dm-relationship-static-smoke/,
  "package scripts must expose this static smoke proof",
);

console.log("PASS: profile/DM relationship static smoke proof keeps resolver, UI, and DM authorization aligned.");
