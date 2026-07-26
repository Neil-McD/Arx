import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const app = read("apps/web/src/App.tsx");
const threadDataController = read("shared/useWebThreadDataController.ts");
const workspaceRightPanel = read("apps/web/src/components/WebWorkspaceRightPanel.tsx");
const baseCss = read("apps/web/src/base.css");
const operatorDashboardDataHook = read("apps/web/src/components/useOperatorDashboardData.ts");
const workspaceRightPanelData = read("apps/web/src/components/workspaceRightPanelData.ts");
const workspaceRightPanelModel = read("apps/web/src/components/workspaceRightPanelModel.ts");
const operatorPlatformPanelView = read("apps/web/src/components/OperatorPlatformPanelView.tsx");
const operatorBusinessPanelView = read("apps/web/src/components/OperatorBusinessPanelView.tsx");
const operatorCommunitiesPanelView = read("apps/web/src/components/OperatorCommunitiesPanelView.tsx");
const resourcesPanel = read("apps/web/src/components/CommunityResourcesPanel.tsx");
const eventsPanel = read("apps/web/src/components/WebCommunityEventsSection.tsx");
const aiFeedPanel = read("apps/web/src/components/CommunityAiFeedPanel.tsx");
const threadSidebarSelectors = read("shared/threadSidebarSelectors.ts");
const workspaceActiveProjectSelector = read("shared/workspaceActiveProjectSelector.ts");
const workspaceProjectStateController = read("apps/web/src/controllers/useWebWorkspaceProjectStateController.ts");
const workspaceSidebarStateHost = read("apps/web/src/components/WebWorkspaceSidebarStateHost.tsx");
const threadSidebarPanel = read("apps/web/src/components/WebThreadSidebarPanel.tsx");

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
assert.doesNotMatch(
  workspaceRightPanel,
  /export function useOperatorDashboardData/,
  "right panel shell must not own operator data loading",
);
assert.match(
  operatorDashboardDataHook,
  /export function useOperatorDashboardData/,
  "operator data loading must live in the dedicated hook module",
);
assert.match(
  workspaceRightPanel,
  /<OperatorPlatformPanelView[\s\S]*<OperatorBusinessPanelView[\s\S]*<OperatorCommunitiesPanelView/,
  "right panel shell must delegate operator tab rendering to extracted panel views",
);
assert.doesNotMatch(
  workspaceRightPanel,
  /function Operator(Platform|Business|Community)Insights/,
  "right panel shell must not re-accumulate operator tab view implementations",
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
  workspaceRightPanelModel,
  /const OPERATOR_INSIGHT_TABS:[\s\S]*= \[[^\]]*id: "community"/,
  "workspace community preview tab must stay in user mode and not leak into operator tabs",
);
assert.match(
  workspaceRightPanelModel,
  /WorkspaceRightPanelTab = "workspace" \| "community" \| "partner" \| OperatorInsightTab/,
  "workspace right panel should expose the restored community preview tab in user mode",
);
assert.match(
  workspaceRightPanel,
  /activeInsightTab === "community" && props\.workspaceCommunityPreviewPanel[\s\S]*<WorkspaceCommunityPreviewPanelContent/,
  "workspace right panel shell should render the restored read-only community preview tab",
);
assert.doesNotMatch(
  app,
  /workspaceCommunityPreviewPanel|workspaceCommunityRecentChatPreview|handleOpenWorkspacePanelCommunity/,
  "App must not project the retired Workspace community preview",
);
assert.doesNotMatch(
  workspaceRightPanel,
  /CommunityPanelContent/,
  "workspace right panel shell must not render the deleted community projection",
);
assert.doesNotMatch(
  workspaceRightPanelData + app,
  /buildWorkspaceRightPanelCommunityData|buildWorkspaceRightPanelRecentSignals|workspacePanelCommunityRecentSignals|workspacePanelCommunityIntegrations/,
  "workspace right panel data must stay workspace-only after community context moved to the chat rail",
);
assert.doesNotMatch(
  app,
  /buildWorkspaceRightPanelUserData/,
  "App must not assemble data for the retired Workspace right panel",
);
assert.match(
  app,
  /const currentWorkspaceProjectSelection = resolveWorkspaceActiveProject\(\{[\s\S]*activeThread,[\s\S]*activeThreadId,[\s\S]*workspaceWantsNewChat,[\s\S]*resolvedActiveProjectId: workspaceProject\.state\.activeProjectId,[\s\S]*resolvedActiveProjectName: workspace\.derived\.resolvedActiveProjectName,[\s\S]*projectById: workspace\.derived\.projectById,[\s\S]*resolveThreadProjectId: workspace\.derived\.resolveThreadProjectId/,
  "workspace current project authority must be centralized in the active project selector",
);
assert.match(
  workspaceActiveProjectSelector,
  /const hasActiveThread = Boolean\(params\.activeThread\) && !params\.workspaceWantsNewChat;[\s\S]*const activeThreadProjectId =[\s\S]*params\.resolveThreadProjectId\(params\.activeThread\)[\s\S]*const currentProjectId = isPendingThreadProject[\s\S]*hasActiveThread[\s\S]*\? activeThreadProjectId[\s\S]*: params\.resolvedActiveProjectId/,
  "workspace current project must prefer explicit active thread projects, keep standalone threads standalone, and avoid default-project flash while the thread is loading",
);
assert.match(
  workspaceActiveProjectSelector,
  /const isFromActiveThread =[\s\S]*currentProjectId === activeThreadProjectId[\s\S]*const currentProjectName =[\s\S]*isFromActiveThread[\s\S]*"Loading project"[\s\S]*params\.resolvedActiveProjectName/,
  "right panel project name must not fall back to the default project while an active thread project row is still loading",
);
assert.match(
  threadSidebarSelectors,
  /const direct = String\(thread\.project_id \?\? ""\)\.trim\(\);[\s\S]*if \(direct\) return direct;[\s\S]*return null;/,
  "thread project ids must be authoritative and missing project ids must remain standalone chats",
);
assert.match(
  workspaceProjectStateController,
  /const requestedActiveProjectId = activeProjectId;[\s\S]*setActiveProjectId\(\(current\) =>[\s\S]*resolveExistingCloudProjectId\(next, current \?\? requestedActiveProjectId\)/,
  "project reloads must preserve the newest explicit draft project instead of clobbering it or defaulting it from provider rows",
);
assert.match(
  workspaceProjectStateController,
  /const resolvedActiveProjectId = useMemo\([\s\S]*resolveExistingCloudProjectId\(projects, activeProjectId\)/,
  "project state must resolve the active project from explicit state only",
);
assert.doesNotMatch(
  workspaceProjectStateController,
  /resolvePreferredCloudProjectId\(projects, activeProjectId\)/,
  "project state must not treat the first project as ambient active context",
);
assert.doesNotMatch(
  app + workspaceSidebarStateHost,
  /onProjectToggled|props\.onProjectToggled|setActiveProjectId\}\s*$/m,
  "expanding or collapsing a computer folder must not mutate the active computer",
);
assert.match(
  workspaceSidebarStateHost,
  /const generalThreads = useMemo\(\(\) => \{[\s\S]*return visibleThreads\.filter\(\(thread\) => \{[\s\S]*const projectId = props\.resolveThreadProjectId\(thread\);[\s\S]*return !projectId;[\s\S]*\}\);/,
  "threads with explicit but temporarily unloaded project ids must not be recategorized as General",
);
assert.doesNotMatch(
  app,
  /buildWebWorkspaceSurfaceProjection|buildWorkspaceRightPanelUserData|buildWebWorkspaceLandingProjection/,
  "the retired Workspace presentation must not be projected from App",
);
assert.match(
  threadSidebarPanel,
  /className="project-group-new"[\s\S]*title="New thread in this project"/,
  "project new-thread affordance must make project scope explicit",
);
assert.match(
  app,
  /const turnOnWorkspaceComputer = useCallback[\s\S]*const projectId = currentWorkspaceProjectId[\s\S]*startProjectWorkspaceComputer\(\{[\s\S]*projectId/,
  "turn-on computer action must target the same current workspace project shown in the panel",
);
assert.doesNotMatch(
  workspaceRightPanelData,
  /WorkspaceRightPanelRecentSignal|buildWorkspaceRightPanelRecentSignals|kind: "chat"[\s\S]*kind: "ai_feed"/,
  "workspace right panel data must not reintroduce a community recent-signal builder",
);
assert.doesNotMatch(
  workspaceRightPanelData,
  /kind:\s*"(joined|member|membership)"/,
  "workspace right panel data must not reintroduce joined-member signal feed items",
);
assert.match(
  baseCss,
  /\.workspace-composer-shell\.workspace-right-panel-open \{[\s\S]*?padding-right: var\(--workspace-right-panel-width\);[\s\S]*?\}/,
  "right-panel workspace composer shell must reserve the panel through padding, matching the workspace body lane",
);
assert.doesNotMatch(
  baseCss,
  /\.workspace-composer-shell\.workspace-right-panel-open \{[\s\S]*?margin-right: var\(--workspace-right-panel-width\);[\s\S]*?\}/,
  "right-panel workspace composer must not add a separate margin offset from the transcript lane",
);
assert.match(
  baseCss,
  /\.workspace-composer-lane \{[\s\S]*?max-width: var\(--web-chat-max-width\);[\s\S]*?margin: 0 auto;[\s\S]*?padding-inline: var\(--web-chat-gutter\);[\s\S]*?\}/,
  "workspace composer lane must be the canonical centered max-width contract in both right-panel states",
);
assert.doesNotMatch(
  baseCss,
  /\.workspace-composer-shell\.workspace-right-panel-open \.workspace-composer-lane/,
  "right-panel workspace composer must not switch centering authority while opening or closing",
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
