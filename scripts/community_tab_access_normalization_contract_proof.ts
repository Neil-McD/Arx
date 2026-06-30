import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isCommunityTabAllowedForAccess,
  normalizeCommunityTabForAccess,
  type CommunityTabAccess,
} from "../shared/appShellNavigation.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const memberAccess: CommunityTabAccess = {
  canViewMembers: true,
  canViewSettings: true,
  canViewPolynet: true,
  canManageMembers: false,
  canViewAnalytics: false,
};

const builderAccess: CommunityTabAccess = {
  canViewMembers: true,
  canViewSettings: true,
  canViewPolynet: true,
  canManageMembers: true,
  canViewAnalytics: true,
};

for (const tab of ["chat", "ai_feed", "resources", "events", "members", "settings", "polynet"] as const) {
  assert.equal(
    normalizeCommunityTabForAccess(tab, memberAccess),
    tab,
    `members should keep member-safe tab ${tab}`,
  );
}

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
const membersReviewController = read("shared/useCommunityMembersReviewController.ts");

assert.match(
  navigation,
  /export type CommunityTabAccess = \{[\s\S]*canViewMembers: boolean;[\s\S]*canViewSettings: boolean;[\s\S]*canViewPolynet: boolean;[\s\S]*canManageMembers: boolean;[\s\S]*canViewAnalytics: boolean;[\s\S]*\};/,
  "community tab access contract must stay centralized",
);
assert.match(
  navigation,
  /case "ai_agent":[\s\S]*case "funnel":[\s\S]*return access\.canManageMembers;/,
  "AI Agent and Funnel tabs must remain builder-only",
);
assert.match(
  app,
  /if \(isLoadingCommunityAccess\) return;[\s\S]*if \(activeCommunityAccess\?\.community_id !== activeCommunityId\) return;/,
  "tab normalization must wait for the current community access row",
);
assert.match(
  activeCommunityShellController,
  /const currentActiveCommunityAccess = useMemo\(\(\) => \{[\s\S]*if \(activeCommunityAccess\?\.community_id !== communityId\) return null;[\s\S]*return activeCommunityAccess;/,
  "active community shell must fail closed when the loaded access row belongs to another community",
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
  app,
  /const normalizedTab = normalizeCommunityTabForAccess\(communityTab, \{[\s\S]*canViewMembers: canViewMembersActiveCommunity,[\s\S]*canViewSettings: canViewActiveCommunitySettings,[\s\S]*canViewPolynet: canViewActiveCommunityPolynet,[\s\S]*canManageMembers: canManageMembersActiveCommunity,[\s\S]*canViewAnalytics: canViewActiveCommunityAnalytics,[\s\S]*\}\);/,
  "App must normalize the active tab from the same capability booleans used by CommunityNav",
);
assert.match(
  app,
  /if \(normalizedTab === communityTab\) return;[\s\S]*setCommunityResourceModuleId\(null\);[\s\S]*applyCommunityShellState\(\{ communityTab: normalizedTab \}\);/,
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
