import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const communityPublic = read("convex/communityPublic.ts");
const communityCore = read("convex/communityCore.ts");
const communityChannelCore = read("convex/communityChannelCore.ts");
const appSource = read("apps/web/src/App.tsx");

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

assert.match(
  communityChannelCore,
  /async function listReadableRowsForChannelIds[\s\S]*eq\("status", "live"\)/,
  "the canonical active-channel interaction reader must exclude hidden and deleted rows",
);

assert.doesNotMatch(
  appSource,
  /isVisitorCommunitySurface|canViewMembers:[\s\S]{0,260}shellPublicRoute\.kind === "community_funnel"/,
  "the public funnel must not inherit visitor shell presence or member-directory controls",
);
// Studio's /c/<slug> only hands over to the community's own site.
assert.match(
  read("apps/web/src/components/WebCommunityHandoff.tsx"),
  /communitySiteRedirectTarget[\s\S]*window\.location\.replace\([^)]*\btarget\b/,
  "Studio's /c/<slug> must hand visitors over to the community's site",
);


// The ONE legitimate reader of community visibility: the Discover directory.
const discoverQuery = sliceExport(communityPublic, "listPublicDiscoverCommunities");
assert.match(
  discoverQuery,
  /visibility", "published"/,
  "the Discover directory must remain the sole surface that filters on published visibility — visibility = discovery, nothing else",
);

console.log("community visitor access contract proof passed");
