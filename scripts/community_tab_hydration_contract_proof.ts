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
const rosterLifecycle = read("shared/useCommunityMemberRosterLifecycle.ts");
const rosterHookCall = sliceBetween(
  app,
  "useCommunityMemberRosterLifecycle<AuthSession>({",
  "  const activeCommunityMembersJoinReviewMode",
);

const rosterPredicate = sliceBetween(
  rosterLifecycle,
  "function needsCommunityMemberRoster",
  "\n}\n\nexport function",
);

assert.match(
  rosterPredicate,
  /communityTab === "members"/,
  "member roster hydration must be reserved for the Members tab",
);
assert.doesNotMatch(
  rosterPredicate,
  /communityTab === "funnel"|communityTab === "ai_agent"/,
  "Funnel and AI Agent tabs must not hydrate the full member roster",
);
assert.doesNotMatch(
  rosterLifecycle,
  /shouldLoad/,
  "member roster lifecycle must not expose a broad preload override",
);

const socialSummarySlice = sliceBetween(
  shellController,
  "const communitySocialSummary",
  "const funnelPreviewAdminCount",
);
assert.match(
  socialSummarySlice,
  /member_count[\s\S]*admin_count[\s\S]*online_count[\s\S]*online_faces/,
  "Funnel/workspace social proof must be backed by the cheap presence summary",
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
assert.match(
  app,
  /previewMemberCount: activeCommunitySocialMemberCount/,
  "Funnel preview must use the summary-backed member count",
);
assert.match(
  app,
  /buildWorkspaceRightPanelCommunityData\(\{[\s\S]*memberCount: activeCommunitySocialMemberCount/,
  "workspace right panel must use the summary-backed member count",
);
assert.doesNotMatch(
  rosterHookCall,
  /shouldLoad:/,
  "workspace right panel must not force the member roster lifecycle",
);

console.log("PASS: community tab hydration keeps roster reads on Members and uses summary social proof elsewhere.");
