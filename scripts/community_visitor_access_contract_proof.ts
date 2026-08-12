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
const funnelRenderer = read("apps/web/src/components/WebCommunityFunnelRenderer.tsx");
const memberProof = read("apps/web/src/components/CommunityFunnelMemberProof.tsx");

function sliceExport(source: string, name: string): string {
  const start = source.indexOf(`export const ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const rest = source.slice(start + 1);
  const end = rest.search(/\nexport (const|async function|function) /);
  return source.slice(start, end === -1 ? source.length : start + 1 + end);
}

const accessQuery = sliceExport(communityPublic, "resolvePublicCommunityAccessBySlug");

assert.match(
  accessQuery,
  /query\(\{[\s\S]*communitySlug: v\.string\(\)/,
  "public access resolution must be a public query keyed by slug only — no identity args",
);
assert.doesNotMatch(
  accessQuery,
  /authSubject: v\.|userId: v\./,
  "public access resolution must not accept caller-supplied identity — identity comes from ctx.auth alone",
);
assert.match(
  accessQuery,
  /try \{[\s\S]*findAuthenticatedActorState\(\{ ctx, authSubject: null \}\)[\s\S]*\} catch \{[\s\S]*userId = null/,
  "anonymous callers must resolve through the canonical identity path and fall back to userId null — one path, no fork",
);
assert.match(
  accessQuery,
  /if \(userId\) \{[\s\S]*communityMemberships[\s\S]*by_community_user/,
  "membership lookup must only run for identified callers",
);
assert.match(
  accessQuery,
  /resolveCommunityAccessBundle\(\{/,
  "the visitor state must come from the same access bundle members use — relation decides, no parallel ladder",
);
assert.match(
  accessQuery,
  /if \(!access\.relation\) return \{ ok: false as const \}/,
  "null relation (blocked callers only) must be absent, not teased",
);
assert.match(
  accessQuery,
  /user_id: userId \? access\.user_id : null/,
  "anonymous callers must get user_id null, never a stringified null",
);
assert.doesNotMatch(
  accessQuery,
  /communityMessages|requireCommunityChatAccess/,
  "the access query must not read chat content — visitor content flows through the public funnel projection only",
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
  /isVisitorCommunitySurface|visitorShellActiveCommunity|visitorGateNonce/,
  "the public marketing funnel must not manufacture a parallel community-chat shell",
);
assert.match(
  publicFunnel,
  /buildCommunityFunnelRenderModel[\s\S]*<WebCommunityFunnelRenderer/,
  "the public route must reduce public data into one canonical marketing renderer",
);
assert.match(
  funnelRenderer,
  /<CommunityFunnelMemberProof[\s\S]*<FunnelAction action=\{props\.action\} position="final"/,
  "the marketing renderer must pair bounded member proof with the canonical admission action",
);
assert.match(
  memberProof,
  /slice\(0, MAX_VISIBLE_MEMBER_FACES\)[\s\S]*<UserAvatar/,
  "public social proof must remain bounded and reuse the canonical user avatar",
);
assert.doesNotMatch(
  funnelRenderer,
  /communityMessages|WebMobileDrawer|CommunityContextPanel/,
  "the public marketing surface must not project member chat or directory UI",
);
assert.match(
  communityPublic,
  /messages_today_count[\s\S]*resource_count[\s\S]*memory_note_count/,
  "the public payload may retain bounded activity metadata without exposing private content",
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
  "the public payload must carry the bounded members preview for social proof",
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
