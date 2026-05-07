import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const app = read("apps/web/src/App.tsx");
const threadDataController = read("shared/useWebThreadDataController.ts");
const operatorPanel = read("apps/web/src/components/WebOperatorDataPanel.tsx");
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
  operatorPanel,
  /if \(!params\.enabled\) \{[\s\S]*setIsLoading\(false\);[\s\S]*return;[\s\S]*\}/,
  "closed operator panel must stop loading without clearing the last loaded snapshot",
);
assert.match(
  operatorPanel,
  /setState\(\(prev\) => \(\{[\s\S]*overview: nextState\.overview \?\? prev\.overview[\s\S]*builders: nextState\.builders \?\? prev\.builders[\s\S]*\}\)\)/,
  "operator panel refresh must merge loaded sections over the previous snapshot",
);
assert.match(
  operatorPanel,
  /message\.includes\("operator_access_forbidden"\)[\s\S]*setState\(createEmptyOperatorDashboardState\(\)\)/,
  "operator panel must still clear stale operator data on confirmed access denial",
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
