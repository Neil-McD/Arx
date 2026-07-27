import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const app = read("apps/web/src/App.tsx");
const threadDataController = read("shared/useWebThreadDataController.ts");
const baseCss = read("apps/web/src/base.css");
const operatorDashboardDataHook = read("apps/web/src/components/useOperatorDashboardData.ts");
const operatorPlatformPanelView = read("apps/web/src/components/OperatorPlatformPanelView.tsx");
const operatorBusinessPanelView = read("apps/web/src/components/OperatorBusinessPanelView.tsx");
const operatorCommunitiesPanelView = read("apps/web/src/components/OperatorCommunitiesPanelView.tsx");
const resourcesPanel = read("apps/web/src/components/CommunityResourcesPanel.tsx");
const eventsPanel = read("apps/web/src/components/WebCommunityEventsSection.tsx");
const aiFeedPanel = read("apps/web/src/components/CommunityAiFeedPanel.tsx");

assert.match(
  app,
  /const initialWorkspaceWantsNewChat = true;/,
  "retained thread runtime state must begin without an implicit route-selected thread",
);
assert.doesNotMatch(
  app,
  /nextAppRoute\.threadId|nextAppRoute\.projectId|nextAppRoute\.page === "workspace"/,
  "browser route reconciliation must remain independent from retained thread and project state",
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
  operatorDashboardDataHook,
  /if \(!params\.enabled\) \{[\s\S]*setIsLoading\(false\);[\s\S]*return;[\s\S]*\}/,
  "closed operator panel must stop loading without clearing the last loaded snapshot",
);
assert.match(
  operatorDashboardDataHook,
  /setState\(\(prev\) => \(\{[\s\S]*overview: nextState\.overview \?\? prev\.overview[\s\S]*authAccess: nextState\.authAccess \?\? prev\.authAccess[\s\S]*communityRows: nextState\.communityRows \?\? prev\.communityRows[\s\S]*events: nextState\.events \?\? prev\.events[\s\S]*\}\)\)/,
  "operator panel refresh must merge loaded sections over the previous snapshot",
);
assert.match(
  operatorDashboardDataHook,
  /message\.includes\("operator_access_forbidden"\)[\s\S]*setState\(createEmptyOperatorDashboardState\(\)\)/,
  "operator panel must still clear stale operator data on confirmed access denial",
);
assert.match(
  operatorDashboardDataHook,
  /export function useOperatorDashboardData/,
  "operator data loading must live in the dedicated hook module",
);
assert.match(
  operatorPlatformPanelView,
  /export function OperatorPlatformPanelView[\s\S]*Web &amp; deploy[\s\S]*Auth &amp; access[\s\S]*Trust boundary[\s\S]*Runtime execution/,
  "platform operator view must own platform diagnostics presentation",
);
assert.match(
  operatorBusinessPanelView,
  /export function OperatorBusinessPanelView[\s\S]*Acquisition funnel[\s\S]*<OperatorAccountSetupInsights snapshot=\{props\.accountSetup\} \/>[\s\S]*Partner payout cycles/,
  "business operator view must own business readiness and payout presentation",
);
assert.match(
  operatorBusinessPanelView,
  /function OperatorAccountSetupInsights[\s\S]*User readiness/,
  "business operator view must keep user readiness presentation colocated with the business view",
);
assert.match(
  operatorCommunitiesPanelView,
  /export function OperatorCommunitiesPanelView[\s\S]*Community performance overview[\s\S]*Top communities/,
  "communities operator view must own community performance presentation",
);
assert.doesNotMatch(
  app,
  /workspaceCommunityPreviewPanel|workspaceCommunityRecentChatPreview|handleOpenWorkspacePanelCommunity/,
  "App must not project the retired Workspace community preview",
);
assert.doesNotMatch(
  app,
  /buildWorkspaceRightPanelUserData/,
  "App must not assemble data for the retired Workspace right panel",
);
assert.match(
  app,
  /const activeThreadProjectId = useMemo\(\(\) => \{[\s\S]*if \(!activeThreadId \|\| workspaceWantsNewChat\) return null;[\s\S]*threads\.find\(\(thread\) => thread\.id === activeThreadId\)\?\.project_id[\s\S]*String\(projectId \?\? ""\)\.trim\(\) \|\| null/,
  "browser telemetry and retained thread mutation must derive project identity directly from the active thread and keep new drafts standalone",
);
assert.doesNotMatch(
  app,
  /workspaceProject|resolveWorkspaceActiveProject|loadProjects|setActiveProjectId/,
  "App must not retain browser project-list, draft-selection, or default-project authority",
);
assert.doesNotMatch(
  app,
  /onProjectToggled|props\.onProjectToggled/,
  "retained App orchestration must not carry retired thread-browser folder toggles",
);
assert.doesNotMatch(
  app,
  /buildWebWorkspaceSurfaceProjection|buildWorkspaceRightPanelUserData|buildWebWorkspaceLandingProjection/,
  "the retired Workspace presentation must not be projected from App",
);
assert.match(
  baseCss,
  /\.workspace-composer-lane \{[\s\S]*?max-width: var\(--web-chat-max-width\);[\s\S]*?margin: 0 auto;[\s\S]*?padding-inline: var\(--web-chat-gutter\);[\s\S]*?\}/,
  "workspace composer lane must be the canonical centered max-width contract in both right-panel states",
);
assert.match(
  resourcesPanel,
  /showInitialResourceLoading[\s\S]*Refreshing knowledge\.\.\.[\s\S]*\{showInitialResourceLoading \?/,
  "resources tab must keep existing content visible during background refresh",
);
assert.match(
  eventsPanel,
  /state\.isLoadingEvents && !showInitialEventsLoading[\s\S]*Updating…[\s\S]*\{showInitialEventsLoading \?/,
  "events tab must keep existing content visible during background refresh",
);
assert.match(
  aiFeedPanel,
  /showInitialFeedLoading[\s\S]*Refreshing AI feed\.\.\.[\s\S]*: showInitialFeedLoading \?/,
  "AI feed tab must keep existing posts visible during background refresh",
);

console.log("ui_stability_contract_proof: ok");
