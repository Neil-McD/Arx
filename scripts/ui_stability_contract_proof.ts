import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const app = read("apps/web/src/App.tsx");
const threadDataController = read("shared/useWebThreadDataController.ts");
const workspaceRightPanel = read("apps/web/src/components/WebWorkspaceRightPanel.tsx");
const workspaceRightPanelData = read("apps/web/src/components/workspaceRightPanelData.ts");
const resourcesPanel = read("apps/web/src/components/CommunityResourcesPanel.tsx");
const eventsPanel = read("apps/web/src/components/WebCommunityEventsSection.tsx");
const aiFeedPanel = read("apps/web/src/components/CommunityAiFeedPanel.tsx");

assert.match(
  app,
  /const initialWorkspaceWantsNewChat = !\([\s\S]*initialAppRoute\.page === "workspace"[\s\S]*initialAppRoute\.threadId[\s\S]*\);/,
  "workspace should default to draft mode unless the initial route explicitly names a thread",
);
assert.match(
  app,
  /if \(nextAppRoute\.page === "workspace" && nextAppRoute\.view === "home"\) \{[\s\S]*setActiveThreadId\(nextThreadId\);[\s\S]*setWorkspaceWantsNewChatMode\(nextThreadId === null\);[\s\S]*\}/,
  "route reconciliation must only overwrite workspace thread/draft selection on workspace home routes",
);
assert.doesNotMatch(
  threadDataController,
  /visible\[0\]/,
  "thread hydration must not auto-select the most recent visible thread",
);
assert.match(
  threadDataController,
  /if \(!current\.activeThreadId\) \{[\s\S]*current\.setWorkspaceWantsNewChatMode\(true\);[\s\S]*return;[\s\S]*\}/,
  "empty active-thread hydration must preserve draft workspace mode",
);

assert.match(
  workspaceRightPanel,
  /if \(!params\.enabled\) \{[\s\S]*setIsLoading\(false\);[\s\S]*return;[\s\S]*\}/,
  "closed operator panel must stop loading without clearing the last loaded snapshot",
);
assert.match(
  workspaceRightPanel,
  /setState\(\(prev\) => \(\{[\s\S]*overview: nextState\.overview \?\? prev\.overview[\s\S]*authAccess: nextState\.authAccess \?\? prev\.authAccess[\s\S]*communityRows: nextState\.communityRows \?\? prev\.communityRows[\s\S]*events: nextState\.events \?\? prev\.events[\s\S]*\}\)\)/,
  "operator panel refresh must merge loaded sections over the previous snapshot",
);
assert.match(
  workspaceRightPanel,
  /message\.includes\("operator_access_forbidden"\)[\s\S]*setState\(createEmptyOperatorDashboardState\(\)\)/,
  "operator panel must still clear stale operator data on confirmed access denial",
);
assert.match(
  app,
  /buildWorkspaceRightPanelRecentSignals\(\{[\s\S]*communityMessages[\s\S]*aiFeedPosts: activeCommunityFeedState\.live[\s\S]*resources: communityResources[\s\S]*events: communityEvents/,
  "workspace right panel recent signal projection must be centralized in the panel data builder",
);
assert.match(
  app,
  /buildWorkspaceRightPanelCommunityData\(\{[\s\S]*recentSignals: workspacePanelCommunityRecentSignals[\s\S]*integrations: workspacePanelCommunityIntegrations/,
  "workspace right panel community projection must be centralized before rendering",
);
assert.match(
  app,
  /buildWorkspaceRightPanelUserData\(\{[\s\S]*workspaceCreditBalance[\s\S]*activeCommunity: workspaceUserDataPanelCommunity[\s\S]*onTurnOnComputer: turnOnWorkspaceComputer/,
  "workspace right panel user data props must be assembled through the panel data builder",
);
assert.match(
  workspaceRightPanelData,
  /kind: "chat"[\s\S]*kind: "ai_feed"[\s\S]*kind: "resource"[\s\S]*kind: "event"/,
  "recent signal builder must include only real content/activity signal types",
);
assert.doesNotMatch(
  workspaceRightPanelData,
  /kind:\s*"(joined|member|membership)"/,
  "recent signal builder must not reintroduce joined-member items as signal feed items",
);

assert.match(
  resourcesPanel,
  /showInitialResourceLoading[\s\S]*Refreshing resources\.\.\.[\s\S]*\{showInitialResourceLoading \?/,
  "resources tab must keep existing content visible during background refresh",
);
assert.match(
  eventsPanel,
  /showInitialEventsLoading[\s\S]*Refreshing events\.\.\.[\s\S]*\{showInitialEventsLoading \?/,
  "events tab must keep existing content visible during background refresh",
);
assert.match(
  aiFeedPanel,
  /showInitialFeedLoading[\s\S]*Refreshing AI feed\.\.\.[\s\S]*: showInitialFeedLoading \?/,
  "AI feed tab must keep existing posts visible during background refresh",
);

console.log("ui_stability_contract_proof: ok");
