import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const communityPublic = read("convex/communityPublic.ts");
const communityModule = read("convex/community.ts");
const communityAccessQueries = read("convex/communityAccessQueries.ts");
const communityCore = read("convex/communityCore.ts");
const appSource = read("apps/web/src/App.tsx");
const visitorSurface = read("apps/web/src/components/WebCommunityVisitorSurface.tsx");
const visitorChrome = read("apps/web/src/components/CommunityVisitorChrome.tsx");
const publicFunnel = read("apps/web/src/components/WebPublicCommunityFunnel.tsx");

function sliceExport(source: string, name: string): string {
  const start = source.indexOf(`export const ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const rest = source.slice(start + 1);
  const end = rest.search(/\nexport (const|async function|function) /);
  return source.slice(start, end === -1 ? source.length : start + 1 + end);
}

const accessQuery = sliceExport(communityAccessQueries, "getMyCommunityAccessBySlug");

assert.match(
  accessQuery,
  /query\(\{[\s\S]*authSubject: v\.optional\(v\.string\(\)\)[\s\S]*communitySlug: v\.string\(\)/,
  "signed-in access resolution must be an authenticated query keyed by slug",
);
assert.match(
  accessQuery,
  /resolveUserIdForAuthenticatedRequest\(\{[\s\S]*authSubject: args\.authSubject \?\? null/,
  "signed-in access must resolve its actor through the canonical fail-closed identity owner",
);
assert.match(
  accessQuery,
  /getUniqueCommunityMembershipByPair\(\{[\s\S]*communityId: community\._id,[\s\S]*userId/,
  "signed-in access must use the canonical unique membership pair",
);
assert.match(
  accessQuery,
  /mapCommunityAccessRow\(\{/,
  "signed-in access must project the canonical access bundle",
);
assert.doesNotMatch(
  communityPublic,
  /export const resolvePublicCommunityAccessBySlug\s*=/,
  "the mixed anonymous/authenticated access query must remain deleted from its former source",
);
assert.doesNotMatch(
  communityModule,
  /resolvePublicCommunityAccessBySlug as resolvePublicCommunityAccessBySlugImpl|export const resolvePublicCommunityAccessBySlug\s*=/,
  "the outer community wire must not restore the mixed anonymous/authenticated access query",
);
assert.match(
  communityModule,
  /getMyCommunityAccessBySlug as getMyCommunityAccessBySlugImpl/,
  "community.ts must import the authenticated slug access query directly from its owner",
);
assert.match(
  communityModule,
  /export const getMyCommunityAccessBySlug = getMyCommunityAccessBySlugImpl;/,
  "community.ts must expose the authenticated slug access query",
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
  /eq\("status", "live"\)/,
  "messages-today must count only live interactions — hidden and deleted rows are not truths",
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

assert.match(
  appSource,
  /isVisitorCommunitySurface[\s\S]*resolvedPublicCommunity\?\.online_faces \?\? \[\][\s\S]*resolvedPublicCommunity\?\.member_count \?\? null/,
  "the visitor mobile top bar must use public online faces but the total community member count",
);
assert.match(
  appSource,
  /canViewMembers:[\s\S]*shellPublicRoute\.kind === "community_funnel"[\s\S]*Boolean\(resolvedPublicCommunity\)/,
  "the mobile shell must allow the visitor-safe Members drawer without granting private directory access",
);
assert.match(
  publicFunnel,
  /mobileMembersOverlayOpen=\{props\.mobileMembersOverlayOpen\}[\s\S]*onCloseMobileMembersOverlay=\{props\.onCloseMobileMembersOverlay\}/,
  "the public funnel must carry the shared mobile overlay state into the visitor surface",
);
assert.match(
  visitorSurface,
  /<WebMobileDrawer[\s\S]*className="mobile-members-drawer cvs-members-drawer"[\s\S]*lockedSections=\{\{ members: true \}\}[\s\S]*membersPreview=\{memberPreviewFaces\}/,
  "the visitor Members drawer must reuse the canonical drawer and render only locked public member preview data",
);
assert.match(
  visitorSurface,
  /firstRootBodyExpansion=\{props\.isMobileLayout/,
  "the mobile visitor funnel must bound the host-intro preview",
);
assert.match(
  visitorSurface,
  /<CommunityVisitorMobileJoinDock/,
  "the mobile visitor funnel must expose one persistent join dock",
);
assert.match(
  visitorChrome,
  /className="cvs-mobile-join-dock"[\s\S]*action\.primaryActionLabel/,
  "the persistent mobile conversion action must use the canonical funnel action label and handler",
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
assert.match(
  communityModule,
  /export const resolvePublicCommunityMemoryOverviewBySlug = resolvePublicCommunityMemoryOverviewBySlugImpl/,
  "community.ts must expose the public memory overview (re-export chain)",
);

// The ONE legitimate reader of community visibility: the Discover directory.
const discoverQuery = sliceExport(communityPublic, "listPublicDiscoverCommunities");
assert.match(
  discoverQuery,
  /visibility", "published"/,
  "the Discover directory must remain the sole surface that filters on published visibility — visibility = discovery, nothing else",
);

console.log("community visitor access contract proof passed");
