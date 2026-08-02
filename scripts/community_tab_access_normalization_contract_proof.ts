import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isCommunityTabAllowedForAccess,
  normalizeCommunityTabForAccess,
  parseCommunityTab,
  type CommunityTabAccess,
} from "../shared/appShellNavigation.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const memberAccess: CommunityTabAccess = {
  canViewSettings: true,
  canViewPolynet: true,
  canManageMembers: false,
  canViewAnalytics: false,
};

const builderAccess: CommunityTabAccess = {
  canViewSettings: true,
  canViewPolynet: true,
  canManageMembers: true,
  canViewAnalytics: true,
};

for (const tab of ["chat", "ai_feed", "resources", "events", "settings", "polynet"] as const) {
  assert.equal(
    normalizeCommunityTabForAccess(tab, memberAccess),
    tab,
    `members should keep member-safe tab ${tab}`,
  );
}

assert.equal(
  parseCommunityTab("members"),
  "chat",
  "legacy /members routes should collapse to the member-facing chat/right-panel surface",
);

for (const tab of ["ai_agent", "funnel", "analytics"] as const) {
  assert.equal(
    isCommunityTabAllowedForAccess(tab, memberAccess),
    false,
    `members must not be allowed to stay on builder-only tab ${tab}`,
  );
  assert.equal(
    normalizeCommunityTabForAccess(tab, memberAccess),
    "chat",
    `builder-only tab ${tab} must fall back to chat for members`,
  );
  assert.equal(
    normalizeCommunityTabForAccess(tab, builderAccess),
    tab,
    `builders should keep builder tab ${tab}`,
  );
}

const app = read("apps/web/src/App.tsx");
const navigation = read("shared/appShellNavigation.ts");
const activeCommunityShellController = read("apps/web/src/controllers/useWebActiveCommunityShellController.ts");
const tabAccessGuard = read("apps/web/src/controllers/useWebCommunityTabAccessGuard.ts");
const membersReviewController = read("shared/useCommunityMembersReviewController.ts");

assert.match(
  navigation,
  /export type CommunityTabAccess = \{[\s\S]*canViewSettings: boolean;[\s\S]*canViewPolynet: boolean;[\s\S]*canManageMembers: boolean;[\s\S]*canViewAnalytics: boolean;[\s\S]*\};/,
  "community tab access contract must stay centralized",
);
assert.doesNotMatch(
  navigation,
  /canViewMembers: boolean;/,
  "CommunityTabAccess must not keep a deleted Members-tab permission",
);
assert.match(
  navigation,
  /case "ai_agent":[\s\S]*case "funnel":[\s\S]*return access\.canManageMembers;/,
  "AI Agent and Funnel tabs must remain builder-only",
);
assert.match(
  tabAccessGuard,
  /params\.isLoadingCommunityAccess \|\|[\s\S]*params\.activeCommunityAccessId !== params\.activeCommunityId/,
  "tab normalization must wait for the current community access row",
);
assert.match(
  activeCommunityShellController,
  /const currentActiveCommunityAccess =[\s\S]*scopedCommunityAccessResolution\.status === "resolved"[\s\S]*\? scopedCommunityAccessResolution\.access[\s\S]*: null/,
  "active community shell must expose mutation authority only from resolved scoped access",
);
assert.match(
  activeCommunityShellController,
  /deriveCommunityAccessCapabilities\(currentActiveCommunityAccess\)/,
  "community capability booleans must derive from current-community access only",
);
assert.match(
  activeCommunityShellController,
  /activeCommunityAccess: currentActiveCommunityAccess/,
  "downstream surfaces must receive current-community access only",
);
assert.match(
  tabAccessGuard,
  /normalizeCommunityTabForAccess\([\s\S]*params\.communityTab,[\s\S]*canViewSettings: params\.canViewSettings,[\s\S]*canViewPolynet: params\.canViewPolynet,[\s\S]*canManageMembers: params\.canManageMembers,[\s\S]*canViewAnalytics: params\.canViewAnalytics/,
  "the tab guard must normalize from current authoritative capability booleans",
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
