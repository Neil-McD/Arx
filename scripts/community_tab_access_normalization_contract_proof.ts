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
  canViewSettings: false,
  canViewPolynet: false,
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

for (const tab of ["chat", "ai_feed", "resources", "events", "members"] as const) {
  assert.equal(
    normalizeCommunityTabForAccess(tab, memberAccess),
    tab,
    `members should keep member-safe tab ${tab}`,
  );
}

for (const tab of ["settings", "polynet", "ai_agent", "funnel", "analytics"] as const) {
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
  app,
  /const normalizedTab = normalizeCommunityTabForAccess\(communityTab, \{[\s\S]*canViewMembers: canViewMembersActiveCommunity,[\s\S]*canViewSettings: canViewActiveCommunitySettings,[\s\S]*canViewPolynet: canViewActiveCommunityPolynet,[\s\S]*canManageMembers: canManageMembersActiveCommunity,[\s\S]*canViewAnalytics: canViewActiveCommunityAnalytics,[\s\S]*\}\);/,
  "App must normalize the active tab from the same capability booleans used by CommunityNav",
);
assert.match(
  app,
  /if \(normalizedTab === communityTab\) return;[\s\S]*setCommunityResourceModuleId\(null\);[\s\S]*applyCommunityShellState\(\{ communityTab: normalizedTab \}\);/,
  "invalid active community tabs must collapse to a valid tab and clear stale resource selection",
);

console.log("PASS: community tab access normalization redirects invalid role tabs to chat.");
