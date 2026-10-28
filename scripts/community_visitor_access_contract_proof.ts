import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const communityPublic = read("convex/communityPublic.ts");
const communityCore = read("convex/communityCore.ts");
const communityChannelCore = read("convex/communityChannelCore.ts");
const appSource = read("apps/web/src/App.tsx");
const publicFunnel = read("apps/web/src/components/WebPublicCommunityFunnel.tsx");

function sliceExport(source: string, name: string): string {
  const start = source.indexOf(`export const ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const rest = source.slice(start + 1);
  const end = rest.search(/\nexport (const|async function|function) /);
  return source.slice(start, end === -1 ? source.length : start + 1 + end);
}

assert.doesNotMatch(
  communityPublic,
  /export const resolvePublicCommunityAccessBySlug\b/,
  "the unused visitor access query stays deleted; visitors enter through the public funnel projection",
);

assert.match(
  communityCore,
  /: !isBlocked\s*\?\s*"visitor"\s*:\s*null;/,
  "the visitor relation gates on block ONLY — visibility is discovery, never a view gate (unlisted grants visitor exactly like published)",
);
assert.doesNotMatch(
  communityCore,
  /args\.community\.visibility === "published"/,
  "no branch in the access bundle may gate on community visibility — the Discover directory is its sole consumer",
);
assert.match(
  communityCore,
  /export async function requireCommunityChatAccess[\s\S]*community_entitlement_required/,
  "chat access must stay entitlement-gated — visitor mode must never loosen requireCommunityChatAccess",
);

const activityCounts = communityPublic.slice(
  communityPublic.indexOf("async function resolvePublicCommunityActivityCounts"),
  communityPublic.indexOf("async function resolvePublicCommunityStats"),
);
assert.notEqual(activityCounts.length, 0, "public activity counts helper must exist");
assert.match(
  activityCounts,
  /\.take\(cap\)/,
  "every public activity count must be a capped read — this surface serves unauthenticated traffic",
);
assert.doesNotMatch(
  activityCounts,
  /\.collect\(\)/,
  "public activity counts must never collect unbounded rows",
);
assert.match(
  activityCounts,
  /resolvePublicCommunityInteractionActivityCounts/,
  "messages-today must delegate to the canonical active-channel interaction reader",
);
assert.match(
  communityChannelCore,
  /async function listReadableRowsForChannelIds[\s\S]*eq\("status", "live"\)/,
  "the canonical active-channel interaction reader must exclude hidden and deleted rows",
);
assert.match(
  activityCounts,
  /communityResourceIsLiveModulePage/,
  "the public resource count must reuse the member-visibility filter — the visitor number is what a member would see",
);
assert.match(
  activityCounts,
  /visibilityScope === "community" \|\| row\.visibilityScope === "public"/,
  "the public memory count must only include member-readable notes — private and admin notes stay invisible",
);
assert.match(
  communityPublic,
  /const PUBLIC_MEMORY_NOTE_STATUSES = \["promising", "validated", "canonical", "contested", "stale"\]/,
  "public memory statuses must stay in parity with MEMBER_READABLE_STATUSES in communityIntelligenceDirectory",
);

assert.doesNotMatch(
  appSource,
  /isVisitorCommunitySurface|canViewMembers:[\s\S]{0,260}shellPublicRoute\.kind === "community_funnel"/,
  "the public funnel must not inherit visitor shell presence or member-directory controls",
);
assert.match(
  publicFunnel,
  /buildCommunityFunnelRenderModel\(\{[\s\S]*oneLiner: publicCommunity\?\.one_liner,[\s\S]*about: publicCommunity\?\.about,[\s\S]*<WebCommunityFunnelRenderer/,
  "an unpublished public funnel must use the deterministic conversion surface instead of the legacy visitor lens",
);
assert.doesNotMatch(
  publicFunnel,
  /WebCommunityVisitorSurface|CommunityVisitorChrome/,
  "the canonical public funnel must not retain the deleted visitor-chat lens",
);
assert.match(
  communityPublic,
  /messages_today_count[\s\S]*resource_count[\s\S]*memory_note_count/,
  "the public stats payload must carry the lock metadata for the visitor surface",
);
assert.match(
  communityPublic,
  /joined_last_30d_count: stats\.joinedLast30dCount/,
  "the public stats payload must carry the joined-recently social proof count",
);

assert.match(
  communityPublic,
  /const PUBLIC_MEMBER_FACES_PREVIEW_LIMIT = 5/,
  "the public members preview must stay capped at 5 faces",
);
assert.match(
  communityPublic,
  /member_faces_preview: stats\.memberFacesPreview/,
  "the public stats payload must carry the members preview for the visitor rail",
);

const intelligenceDirectory = read("convex/communityIntelligenceDirectory.ts");
const publicMemoryOverview = intelligenceDirectory.slice(
  intelligenceDirectory.indexOf("export const resolvePublicCommunityMemoryOverviewBySlug"),
  intelligenceDirectory.indexOf("export async function searchCommunityMemoryCore"),
);
assert.notEqual(publicMemoryOverview.length, 0, "public memory overview query must exist");
assert.doesNotMatch(
  publicMemoryOverview,
  /visibility !== "published"/,
  "the public memory overview must NOT gate on visibility — unlisted communities serve their memory graph exactly like published",
);
assert.match(
  publicMemoryOverview,
  /isManager: false/,
  "the public memory overview must read with member visibility, never manager",
);
assert.match(
  publicMemoryOverview,
  /label: null,\s*\n\s*title: null/,
  "public memory nodes must strip titles and labels — the shape is public, the content is not",
);
assert.match(
  publicMemoryOverview,
  /recent_runs: \[\]/,
  "the public memory overview must not expose run history",
);
// The ONE legitimate reader of community visibility: the Discover directory.
const discoverQuery = sliceExport(communityPublic, "listPublicDiscoverCommunities");
assert.match(
  discoverQuery,
  /visibility", "published"/,
  "the Discover directory must remain the sole surface that filters on published visibility — visibility = discovery, nothing else",
);

console.log("community visitor access contract proof passed");
