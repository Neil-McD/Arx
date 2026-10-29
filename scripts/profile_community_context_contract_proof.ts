import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing start marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing end marker after ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

const profiles = read("convex/profiles.ts");
const relationshipCore = read("convex/profileRelationshipCore.ts");
const gateway = read("shared/cloudProfilesGateway.ts");
const communityTypes = read("shared/communityTypes.ts");

const querySlice = sliceBetween(
  profiles,
  "export const getProfileCommunityContext = query({",
  "export const getProfileDetailByUserId = query({",
);

assert.match(
  communityTypes,
  /export type CommunityAvatarSummary = \{[\s\S]*id: string;[\s\S]*slug: string;[\s\S]*name: string;[\s\S]*avatar_url: string \| null;[\s\S]*avatar_focus_x: number;[\s\S]*avatar_focus_y: number;[\s\S]*avatar_zoom: number;/,
  "shared community avatar summary must expose only the fields the UI needs to render canonical avatars",
);
assert.match(
  communityTypes,
  /export type ProfileCommunityContext = \{[\s\S]*owned_communities: (?:CommunityAvatarSummary|Array<CommunityAvatarSummary & \{ co_creator\?: boolean \}>)\[?\]?;[\s\S]*mutual_communities: CommunityAvatarSummary\[];[\s\S]*is_self: boolean;[\s\S]*can_message: boolean;[\s\S]*message_context_community_id: string \| null;[\s\S]*message_unavailable_reason: "self" \| "no_mutual_community" \| null;/,
  "profile community context must include display buckets plus viewer-relative message eligibility",
);

assert.match(
  relationshipCore,
  /communityMembershipRowIsActive/,
  "profile community context must use the canonical active membership predicate",
);
assert.match(
  relationshipCore,
  /resolveCommunityBrandingFields/,
  "profile community context must reuse the canonical community branding/avatar projection",
);
assert.match(
  relationshipCore,
  /function listActiveCommunityMembershipsByUserId[\s\S]*withIndex\("by_user_createdAt"/,
  "profile community context must read memberships through the bounded user-createdAt index",
);
assert.match(
  relationshipCore,
  /function listOwnedCommunitiesByOwnerId[\s\S]*withIndex\("by_owner_createdAt"/,
  "owned communities must read through the bounded owner-createdAt index",
);
assert.match(
  relationshipCore,
  /MAX_PROFILE_RELATIONSHIP_OWNED_ROWS[\s\S]*MAX_PROFILE_RELATIONSHIP_MEMBERSHIP_ROWS[\s\S]*MAX_PROFILE_RELATIONSHIP_MUTUAL_ROWS/,
  "profile relationship resolution must use explicit read and fanout caps",
);
assert.match(
  relationshipCore,
  /\.take\(MAX_PROFILE_RELATIONSHIP_MEMBERSHIP_ROWS\)[\s\S]*\.take\(MAX_PROFILE_RELATIONSHIP_OWNED_ROWS\)/,
  "profile relationship source reads must be bounded",
);
assert.doesNotMatch(
  relationshipCore,
  /\.collect\(\)/,
  "profile relationship resolver must not collect unbounded owned or membership rows",
);
assert.match(
  relationshipCore,
  /listOwnedCommunitiesByOwnerId\(args\.ctx, args\.targetUserId\)[\s\S]*listOwnedCommunitiesByOwnerId\(args\.ctx, args\.viewerUserId\)[\s\S]*listActiveCommunityMembershipsByUserId\(args\.ctx, args\.viewerUserId\)[\s\S]*listActiveCommunityMembershipsByUserId\(args\.ctx, args\.targetUserId\)/,
  "mutual communities must be derived from effective participation: owned communities plus active membership sets",
);
assert.match(
  querySlice,
  /resolveUserIdForAuthenticatedRequest/,
  "profile community context must require an authenticated viewer",
);
assert.match(
  relationshipCore,
  /community\.visibility === "published"/,
  "published owned communities may be visible as public community identity",
);
assert.match(
  relationshipCore,
  /viewerIsTarget/,
  "target users must be able to see their own owned community context",
);
assert.match(
  relationshipCore,
  /viewerCommunityIds\.has\(String\(community\._id\)\)/,
  "unlisted owned communities must only appear to active co-members",
);
assert.match(
  relationshipCore,
  /viewerMemberships\.map\(\(row\) => String\(row\.communityId\)\)/,
  "viewer membership rows must count toward mutual community intersections",
);
assert.match(
  relationshipCore,
  /viewerOwnedCommunities\.map\(\(community\) => String\(community\._id\)\)/,
  "viewer-owned communities must count toward mutual community intersections even without membership rows",
);
assert.match(
  relationshipCore,
  /ownedCommunities\.map\(\(community\) => community\._id\)/,
  "target-owned communities must count toward mutual community intersections even without membership rows",
);
assert.doesNotMatch(
  relationshipCore,
  /!ownedCommunityIds\.has/,
  "ownership must not remove a community from mutuals because ownership and mutual participation are separate facts",
);
assert.match(
  querySlice,
  /owned_communities:[\s\S]*mutual_communities:/,
  "query must return owned and mutual community arrays",
);
assert.match(
  querySlice,
  /resolveViewerProfileRelationship/,
  "profile context query must delegate relationship logic to the central resolver",
);
assert.match(
  relationshipCore,
  /requireCommunityChatAccess/,
  "message eligibility must be based on current chat access, not only stale membership rows",
);
assert.match(
  relationshipCore,
  /resolvePreferredDirectMessageCommunity[\s\S]*requireCommunityChatAccess[\s\S]*userId: args\.viewerUserId[\s\S]*requireCommunityChatAccess[\s\S]*userId: args\.targetUserId/,
  "DM relationship resolution must fast-path a valid preferred community before broader bounded discovery",
);
assert.match(
  relationshipCore,
  /resolveViewerDirectMessageRelationship[\s\S]*const preferredCommunity = await resolvePreferredDirectMessageCommunity\(args\)[\s\S]*if \(preferredCommunity\)/,
  "DM relationship resolution must return from the preferred-community fast path",
);
assert.match(
  relationshipCore,
  /viewerIsTarget[\s\S]*"self"[\s\S]*"no_mutual_community"/,
  "relationship context must explain why the profile cannot be messaged",
);

assert.match(
  gateway,
  /fetchCloudProfileCommunityContext/,
  "cloud gateway must expose a profile community context wrapper",
);
assert.match(
  gateway,
  /"profiles:getProfileCommunityContext"/,
  "cloud gateway must call the canonical Convex profile community context query",
);
assert.match(
  gateway,
  /authSubject,[\s\S]*targetUserId,[\s\S]*preferredCommunityId,/,
  "cloud gateway must send authenticated viewer, target user, and preferred community identity",
);

console.log("PASS: profile relationship context uses canonical community avatars and fail-closed message eligibility.");
