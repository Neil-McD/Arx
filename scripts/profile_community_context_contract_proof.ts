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
  /export type ProfileCommunityContext = \{[\s\S]*owned_communities: CommunityAvatarSummary\[];[\s\S]*mutual_communities: CommunityAvatarSummary\[];/,
  "profile community context must have exactly owned and mutual community buckets",
);

assert.match(
  profiles,
  /communityMembershipRowIsActive/,
  "profile community context must use the canonical active membership predicate",
);
assert.match(
  profiles,
  /resolveCommunityBrandingFields/,
  "profile community context must reuse the canonical community branding/avatar projection",
);
assert.match(
  profiles,
  /function listActiveCommunityMembershipsByUserId[\s\S]*withIndex\("by_user"/,
  "profile community context must read memberships through the user index",
);
assert.match(querySlice, /withIndex\("by_owner"/, "owned communities must read through the owner index");
assert.match(
  querySlice,
  /listActiveCommunityMembershipsByUserId\(ctx, viewerUserId\)[\s\S]*listActiveCommunityMembershipsByUserId\(ctx, targetUser\._id\)/,
  "mutual communities must be derived from active viewer and target membership sets",
);
assert.match(
  querySlice,
  /resolveUserIdForAuthenticatedRequest/,
  "profile community context must require an authenticated viewer",
);
assert.match(
  querySlice,
  /community\.visibility === "published"/,
  "published owned communities may be visible as public community identity",
);
assert.match(
  querySlice,
  /viewerIsTarget/,
  "target users must be able to see their own owned community context",
);
assert.match(
  querySlice,
  /viewerCommunityIds\.has\(String\(community\._id\)\)/,
  "unlisted owned communities must only appear to active co-members",
);
assert.match(
  querySlice,
  /viewerCommunityIds\.has\(String\(row\.communityId\)\)/,
  "mutual communities must be active membership intersections",
);
assert.match(
  querySlice,
  /!ownedCommunityIds\.has\(String\(row\.communityId\)\)/,
  "owned communities must not be duplicated in the mutual bucket",
);
assert.match(
  querySlice,
  /owned_communities:[\s\S]*mutual_communities:/,
  "query must return owned and mutual community arrays",
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
  /authSubject,[\s\S]*targetUserId,/,
  "cloud gateway must send authenticated viewer and target user identity",
);

console.log("PASS: profile community context contract uses canonical community avatars and fail-closed membership visibility.");
