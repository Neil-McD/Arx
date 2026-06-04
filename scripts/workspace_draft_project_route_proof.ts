import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const routeState = read("shared/webAppRouteState.ts");
const routeController = read("apps/web/src/controllers/useWebWorkspaceRouteController.ts");
const coreController = read("apps/web/src/controllers/useWebWorkspaceCoreController.ts");
const projectStateController = read("apps/web/src/controllers/useWebWorkspaceProjectStateController.ts");
const app = read("apps/web/src/App.tsx");

assert.match(
  routeState,
  /export const WORKSPACE_DRAFT_PROJECT_SEARCH_PARAM = "project";/,
  "workspace draft project id must use one canonical URL search parameter",
);
assert.match(
  routeState,
  /export function normalizeWorkspaceDraftProjectId[\s\S]*\/\^\[A-Za-z0-9_-\]\{1,160\}\$\/\.test\(normalized\)/,
  "draft project route ids must be tightly normalized before entering state or URLs",
);
assert.match(
  routeState,
  /export function normalizeWorkspaceThreadId[\s\S]*\/\^\[A-Za-z0-9_-\]\{1,160\}\$\/\.test\(normalized\)/,
  "workspace thread route ids must accept safe Convex ids without falling back to draft mode",
);
assert.match(
  routeState,
  /export function buildWorkspaceThreadPath\(threadId: string \| null \| undefined\): string \{[\s\S]*const normalized = normalizeWorkspaceThreadId\(threadId\);[\s\S]*return `\/workspace\/thread\/\$\{encodeURIComponent\(normalized\)\}`;/,
  "workspace thread route builder must preserve normalized non-UUID thread ids",
);
assert.match(
  routeState,
  /if \(segments\[1\] === "thread" && segments\.length >= 3\) \{[\s\S]*threadId: normalizeWorkspaceThreadId\(rawThreadId\),[\s\S]*\}/,
  "workspace thread route parser must preserve normalized non-UUID thread ids",
);
assert.match(
  routeState,
  /function appendWorkspaceDraftProjectSearch\(path: string, projectId\?: string \| null\)[\s\S]*parsed\.searchParams\.set\(WORKSPACE_DRAFT_PROJECT_SEARCH_PARAM, normalizedProjectId\)/,
  "draft routes must append the normalized project id as query state",
);
assert.match(
  routeState,
  /export function buildWorkspaceDraftPath\(projectId\?: string \| null\): string \{[\s\S]*return appendWorkspaceDraftProjectSearch\("\/workspace", projectId\);[\s\S]*\}/,
  "plain workspace drafts must be able to carry project route state",
);
assert.match(
  routeState,
  /export function buildWorkspaceCommunityDraftPath\([\s\S]*projectId\?: string \| null,[\s\S]*return appendWorkspaceDraftProjectSearch\(path, projectId\);[\s\S]*\}/,
  "community workspace drafts must be able to carry project route state",
);
assert.match(
  routeState,
  /fromPath\.page === "workspace" && fromPath\.view === "home" && !fromPath\.threadId[\s\S]*new URLSearchParams\(window\.location\.search\)\.get\(WORKSPACE_DRAFT_PROJECT_SEARCH_PARAM\)/,
  "only draft workspace routes should read project id from search params",
);
assert.match(
  routeState,
  /if \(state\.threadId\) \{[\s\S]*return buildWorkspaceThreadPath\(state\.threadId\);[\s\S]*\}[\s\S]*buildWorkspaceCommunityDraftPath\(state\.communitySlug, state\.projectId\)[\s\S]*buildWorkspaceDraftPath\(state\.projectId\)/,
  "thread routes must ignore draft project query state while draft routes preserve it",
);

assert.match(
  routeController,
  /activeProjectId\?: string \| null/,
  "draft route controller must receive the current draft computer id",
);
assert.match(
  routeController,
  /setActiveProjectId\?\.\(normalizeWorkspaceDraftProjectId\(opts\.projectId\)\)/,
  "explicit draft project changes must be normalized before reaching project state",
);
assert.match(
  routeController,
  /buildWorkspaceCommunityDraftPath\(requestedSlug, requestedProjectId\)[\s\S]*buildWorkspaceDraftPath\(requestedProjectId\)/,
  "opening a workspace draft must persist the selected computer into the route",
);
assert.match(
  coreController,
  /activeProjectId: params\.project\.state\.activeProjectId \?\? params\.project\.derived\.resolvedActiveProjectId/,
  "draft route controller must receive raw route project state while project rows are still loading",
);

assert.match(
  app,
  /initialActiveProjectId: initialAppRoute\?\.projectId \?\? null/,
  "initial draft computer route state must seed the workspace project controller",
);
assert.match(
  projectStateController,
  /useState<string \| null>\(\(\) =>[\s\S]*normalizeWorkspaceDraftProjectId\(params\.initialActiveProjectId\)/,
  "workspace project controller must normalize initial project route state",
);
assert.match(
  app,
  /if \(nextThreadId === null\) \{[\s\S]*workspaceProject\.actions\.setActiveProjectId\(nextAppRoute\.projectId \?\? null\);[\s\S]*\}/,
  "draft route reconciliation must apply the route-owned project id",
);
assert.match(
  app,
  /projectId:[\s\S]*activePage === "workspace" && activeView === "home" && !activeThreadId[\s\S]*workspaceProject\.state\.activeProjectId \?\? workspaceProject\.derived\.resolvedActiveProjectId/,
  "navigation snapshots must preserve draft computer identity",
);
assert.match(
  app,
  /if \(activePage !== "workspace" \|\| activeView !== "home" \|\| activeThreadId\) return;[\s\S]*const draftProjectId = workspaceProject\.state\.activeProjectId \?\? currentWorkspaceProjectId;[\s\S]*window\.history\.replaceState/,
  "draft route URLs must be reconciled when the selected draft computer changes",
);

console.log("workspace_draft_project_route_proof: ok");
