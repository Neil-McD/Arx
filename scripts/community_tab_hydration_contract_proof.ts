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

const app = read("apps/web/src/App.tsx");
const shellController = read("apps/web/src/controllers/useWebActiveCommunityShellController.ts");
const directoryLifecycle = read("shared/useCommunityDirectoryLifecycle.ts");
const communityPublic = read("convex/communityPublic.ts");
const communityCore = read("convex/communityCore.ts");
const directoryHookCall = sliceBetween(
  app,
  "useCommunityDirectoryLifecycle<AuthSession>({",
  "  const activeCommunityMembersJoinReviewMode",
);

const directoryPredicate = sliceBetween(
  directoryLifecycle,
  "function needsCommunityDirectory",
  "\n}\n\nexport function",
);

assert.doesNotMatch(
  app,
  /useCommunityMemberRosterLifecycle|loadCommunityMembers|handleShowMoreCommunityMembers/,
  "App must not hydrate or page the deleted admin Members-tab roster",
);
assert.match(
  directoryPredicate,
  /activePage === "community"[\s\S]*communityTab === "chat"/,
  "chat context and the durable mobile Members view must hydrate the member-facing community directory",
);
assert.doesNotMatch(
  directoryPredicate,
  /communityTab === "members"/,
  "deleted Members tab must not own the member-facing directory lifecycle",
);
assert.doesNotMatch(
  app,
  /listCommunityMembershipsAdminPage|CloudCommunityMembershipAdminRow/,
  "App must not depend on the admin membership page query for member-facing context",
);

const socialSummarySlice = sliceBetween(
  shellController,
  "const communitySocialSummary",
  "const funnelPreviewAdminCount",
);
assert.match(
  socialSummarySlice,
  /member_count[\s\S]*admin_count[\s\S]*online_count[\s\S]*online_faces/,
  "Funnel social proof must be backed by the cheap presence summary",
);
assert.doesNotMatch(
  socialSummarySlice,
  /communityMembers|filter\(\(member\)/,
  "social proof must not derive admin/member counts from the hydrated roster",
);
assert.match(
  shellController,
  /const funnelPreviewAdminCount = communitySocialSummary\.adminCount;[\s\S]*const funnelPreviewOnlineCount = communitySocialSummary\.onlineCount;[\s\S]*const funnelPreviewOnlineFaces = communitySocialSummary\.onlineFaces;/,
  "legacy Funnel preview props must project from the shared social summary",
);

assert.match(
  app,
  /const activeCommunitySocialMemberCount = activeCommunity && typeof communitySocialSummary\.memberCount === "number"[\s\S]*\? communitySocialSummary\.memberCount[\s\S]*: null;/,
  "App must derive public social member count from the presence summary",
);
assert.doesNotMatch(
  app,
  /buildWorkspaceRightPanelCommunityData|workspacePanelCommunityRecentSignals|workspacePanelCommunityIntegrations/,
  "workspace right panel must not keep a duplicate community member-count projection",
);
assert.match(
  directoryHookCall,
  /loadCommunityDirectoryMembers/,
  "chat right rail must load member-facing directory rows",
);
assert.match(
  communityCore,
  /export async function listCanonicalCommunityMemberMembershipRows[\s\S]*communityMembershipCountsTowardActiveMemberCount/,
  "backend must centralize canonical active non-owner member rows",
);
assert.match(
  communityCore,
  /export function countCanonicalCommunityMembersFromRows[\s\S]*return 1 \+ \(rows\?\.length \?\? 0\)/,
  "backend canonical member count must be synthesized owner plus active non-owner rows",
);
assert.match(
  communityPublic,
  /resolvePublicCommunityStats[\s\S]*listCanonicalCommunityMemberMembershipRows[\s\S]*countCanonicalCommunityMembersFromRows/,
  "presence/social summary counts must use the canonical member count helper",
);

console.log("PASS: community tab hydration uses the member-facing directory and leaves no Members-tab roster read.");
