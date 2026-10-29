import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isCommunityTabAllowedForAccess,
  listCommunitySettingsPanesForAccess,
  normalizeCommunityTabForAccess,
  parseCommunityTab,
  type CommunityTabAccess,
} from "../shared/appShellNavigation.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const memberAccess: CommunityTabAccess = {
  canViewSettings: true,
  canManageMembers: false,
  canViewAnalytics: false,
};

const builderAccess: CommunityTabAccess = {
  canViewSettings: true,
  canManageMembers: true,
  canViewAnalytics: true,
};

for (const tab of ["chat", "resources", "events", "settings"] as const) {
  assert.equal(
    normalizeCommunityTabForAccess(tab, memberAccess),
    tab,
    `members should keep member-safe tab ${tab}`,
  );
}

for (const retiredTab of ["ai_feed", "ai-feed", "feed"] as const) {
  assert.equal(
    parseCommunityTab(retiredTab),
    "chat",
    `retired AI Feed route ${retiredTab} should collapse to chat`,
  );
}

assert.equal(
  parseCommunityTab("members"),
  "members",
  "/members is the member directory tab again (a chat-backed view of who is in the community)",
);
assert.equal(
  parseCommunityTab("polynet"),
  "chat",
  "legacy /polynet routes should collapse to chat because Memory is a chat sidecar",
);

assert.equal(isCommunityTabAllowedForAccess("analytics", memberAccess), false);
assert.equal(normalizeCommunityTabForAccess("analytics", memberAccess), "chat");
assert.equal(normalizeCommunityTabForAccess("analytics", builderAccess), "analytics");
assert.equal(isCommunityTabAllowedForAccess("workflows", memberAccess), false);
assert.equal(normalizeCommunityTabForAccess("workflows", memberAccess), "chat");
assert.equal(normalizeCommunityTabForAccess("workflows", builderAccess), "workflows");
assert.equal(parseCommunityTab("ai_agent"), "settings");
assert.equal(parseCommunityTab("funnel"), "settings");
assert.equal(parseCommunityTab("workflows"), "workflows");
assert.deepEqual(
  listCommunitySettingsPanesForAccess({
    canViewSettings: true,
    canManageSettings: true,
    canManageMembers: true,
    isOwner: false,
  }),
  ["community", "sales_page", "offers", "appearance", "agent", "creators", "access"],
  "admins must receive configuration panes without the owner-only Danger pane",
);

const navigation = read("shared/appShellNavigation.ts");
const communityNav = read("shared/CommunityNav.tsx");
const activeCommunityShellController = read("apps/web/src/controllers/useWebActiveCommunityShellController.ts");
const tabAccessGuard = read("apps/web/src/controllers/useWebCommunityTabAccessGuard.ts");
const membersReviewController = read("shared/useCommunityMembersReviewController.ts");

assert.match(
  navigation,
  /export type CommunityTabAccess = \{[\s\S]*canViewSettings: boolean;[\s\S]*canManageMembers: boolean;[\s\S]*canViewAnalytics: boolean;[\s\S]*\};/,
  "community tab access contract must stay centralized",
);
assert.doesNotMatch(
  navigation.slice(
    navigation.indexOf("export const COMMUNITY_TABS"),
    navigation.indexOf("export type CommunityTab"),
  ),
  /"ai_agent"/,
  "Agent must not remain a first-class community tab",
);
assert.doesNotMatch(
  navigation.slice(navigation.indexOf("export const COMMUNITY_TABS"), navigation.indexOf("export type CommunityTab")),
  /"funnel"/,
  "retired Funnel must not remain a community tab",
);
assert.doesNotMatch(
  navigation,
  /canViewPolynet: boolean;/,
  "CommunityTabAccess must not keep the deleted standalone Memory-tab permission",
);
assert.doesNotMatch(
  navigation,
  /canViewMembers: boolean;/,
  "CommunityTabAccess must not keep a deleted Members-tab permission",
);
assert.match(
  navigation,
  /case "workflows":[\s\S]*return access\.canManageMembers;/,
  "Workflows must remain builder-only",
);
assert.match(
  navigation,
  /case "agent":[\s\S]*return access\.canManageMembers;/,
  "Agent settings must remain builder-only",
);
assert.doesNotMatch(communityNav, /onSelectTab\("funnel"\)/, "retired Funnel navigation must be absent");
assert.match(
  tabAccessGuard,
  /params\.isLoadingCommunityAccess[\s\S]*params\.activeCommunityAccessId !== params\.activeCommunityId/,
  "tab normalization must wait for the current community access row",
);
assert.match(
  activeCommunityShellController,
  /if \(accessSessionIdentityRef\.current !== sessionIdentity\) \{[\s\S]*type: "reset"[\s\S]*\}[\s\S]*const activeCommunityAccess =[\s\S]*isAccessSessionIdentityScoped[\s\S]*scopedCommunityAccessResolution\.access/,
  "active community shell must scope retained access to the signed-in presentation identity",
);
assert.match(
  activeCommunityShellController,
  /deriveCommunityAccessCapabilities\(activeCommunityAccess\)/,
  "community capability booleans must derive from current-community access only",
);
assert.match(
  activeCommunityShellController,
  /return \{[\s\S]*activeCommunityAccess,/,
  "downstream surfaces must receive current-community access only",
);
assert.doesNotMatch(
  activeCommunityShellController,
  /currentActiveCommunityAccess|authoritativeCommunityAccessCapabilities|authoritativeCommunityNavVisibility/,
  "active community shell must not keep a second transient capability owner",
);
assert.match(
  tabAccessGuard,
  /normalizeCommunityTabForAccess\([\s\S]*canViewSettings: params\.canViewSettings,[\s\S]*canManageMembers: params\.canManageMembers,[\s\S]*canViewAnalytics: params\.canViewAnalytics/,
  "the tab guard must normalize from the same capability booleans used by CommunityNav",
);
assert.match(
  tabAccessGuard,
  /if \(normalizedTab === params\.communityTab\) return;[\s\S]*params\.setCommunityResourceModuleId\(null\);[\s\S]*params\.applyCommunityShellState\(\{ communityTab: normalizedTab \}\);/,
  "invalid active community tabs must collapse to a valid tab and clear stale resource selection",
);
assert.match(
  membersReviewController,
  /function formatCommunityJoinRequestError\([\s\S]*normalized\.includes\("\[request id:"\)[\s\S]*return fallback;/,
  "join-request review errors must not render raw Convex request IDs or server traces",
);
assert.doesNotMatch(
  membersReviewController,
  /setCommunityJoinRequestsError\(message\)/,
  "join-request review controller must pass errors through the user-facing formatter",
);

console.log("PASS: community tab access normalization redirects invalid role tabs to chat.");
