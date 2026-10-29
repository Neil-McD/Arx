import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const controller = read("apps/web/src/controllers/useWebCommunityPolynetController.ts");
const interactionController = read("apps/web/src/controllers/useWebCommunityInteractionProjection.ts");
const viewportController = read("apps/web/src/controllers/useWebPolynetGraphViewport.ts");
const graph = read("apps/web/src/components/CommunityMemoryGraph.tsx");
const gateway = read("shared/cloudCommunityPolynetGateway.ts");
const interactionProjection = read("apps/web/src/components/WebCommunityInteractionProjection.tsx");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const secondaryPanels = read("apps/web/src/components/WebCommunitySecondaryPanels.tsx");
const surfaceProjection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const navigation = read("shared/appShellNavigation.ts");
const app = read("apps/web/src/App.tsx");
const css = [
  read("apps/web/src/base.css"),
  read("apps/web/src/styles/shell-and-onboarding.css"),
  read("apps/web/src/styles/community-and-content.css"),
  read("apps/web/src/styles/settings-runtime-and-theme-overrides.css"),
  read("apps/web/src/index.css"),
].join("\n");

assert.doesNotMatch(
  navigation,
  /case "polynet"|\n\s*"polynet",/,
  "community navigation should not retain a standalone Polynet tab or route case",
);
assert.doesNotMatch(
  `${secondaryPanels}\n${surfaceProjection}`,
  /WebCommunityPolynetSection|communityTab === "polynet"|polynetState|polynetActions|onBackToCommunityChat/,
  "secondary community pages should not retain the deleted full-page memory destination",
);
assert.doesNotMatch(
  app,
  /openCommunityTab\([^)]*"polynet"|communityTab:\s*"polynet"/,
  "opening memory should not navigate away from community chat",
);
assert.match(
  gateway,
  /client\.query\("communityIntelligenceDirectory:getCommunityPolynetOverview" as any/,
  "memory should keep the canonical overview query",
);
assert.match(gateway, /acquireAuthenticatedConvexRealtimeClient/, "memory live updates should lease the shared realtime transport");
assert.match(gateway, /watchQuery\([\s\S]*api\.communityIntelligenceDirectory\.getCommunityPolynetOverview/, "memory should subscribe to the same canonical projection");
assert.doesNotMatch(gateway, /setInterval|setTimeout/, "memory continuity should not poll");
assert.doesNotMatch(gateway, /mutation\(|action\(/, "the memory drawer must remain read-only");

const knowledge = read("apps/web/src/components/WebCommunityKnowledgePanel.tsx");
const nav = read("shared/CommunityNav.tsx");
const navSurface = read("apps/web/src/components/WebCommunityNavSurface.tsx");
const roster = read("apps/web/src/components/ChannelRosterPanel.tsx");
assert.match(roster, /props.onOpenProfile/, "roster retains profile access");
assert.match(roster, /useWebMemberDirectorySearch/, "roster reuses community-wide search");
assert.match(controller, /communityTab === "resources" && isGraphOpen/, "graph only loads while Knowledge graph is visible");
assert.doesNotMatch(controller, /RAIL_NODE_LIMIT|CommunityMemoryPresentation|isMemoryOpen/, "no obsolete rail projection remains");
assert.match(controller, /subscribeCloudCommunityPolynetOverview/, "graph retains canonical realtime updates");
assert.match(controller, /unsubscribe\?\.\(\)/, "graph changes dispose the subscription");
assert.match(knowledge, /<CommunityMemoryGraph/, "Knowledge reuses the canonical graph");
assert.match(knowledge, /hidden=\{activeView !== "resources"\}/, "resource draft state survives switching views");
assert.match(knowledge, /canViewGraph/, "graph retains community access gating");
assert.match(knowledge, /<WebPlatformTabList/, "Knowledge reuses the canonical platform selector");
assert.match(knowledge, /buttonClassName: chip/, "Knowledge views use the shared category chips as their selection indicator");
assert.doesNotMatch(knowledge, /community-knowledge-switcher/, "no bespoke selector remains");
assert.equal((knowledge.match(/aria-pressed=/g) ?? []).length, 1, "only the focus-mode toggle is a pressed button; views stay tabs");
assert.match(nav, /<Brain[\s\S]*Knowledge/, "Knowledge has its brain icon");
assert.doesNotMatch(navSurface, /onOpenMembers=/, "duplicate Members navigation is removed");
assert.doesNotMatch(interactionController, /kind: "memory"|openMemory|memoryTriggerRef/, "chat no longer owns graph navigation");
assert.doesNotMatch(interactionProjection, /community-memory-drawer|compact-context-open|has-context-panel/, "chat only opens explicit thread or profile details");
assert.match(interactionProjection, /hasDetailPanel = Boolean\((?:selectedRoot|showThreadDrawer) \|\| props\.profilePanel\)/, "thread and profile detail remain");
assert.doesNotMatch(app, /communityPolynetController|isCommunityMemoryOpen/, "Knowledge owns graph hydration");

assert.match(graph, /export function CommunityMemoryGraph/, "the retired page should leave one reusable graph surface");
assert.doesNotMatch(graph, /onBackToChat|Back to community chat|community-polynet-header/, "the graph should not retain page navigation chrome");
assert.match(graph, /overview\.graph\.nodes\.map/, "the drawer graph should render backend-projected nodes");
assert.match(graph, /overview\.graph\.edges\.map/, "the drawer graph should render backend-projected edges");
assert.match(graph, /key=\{lineageId\}/, "memory nodes should preserve lifecycle identity");
assert.match(graph, /data-lineage-id=\{lineageId\}/, "memory nodes should expose lineage for browser acceptance");
assert.doesNotMatch(graph, /selectInitialNode/, "Memory should open as a clean graph without an implicit selection");
assert.match(graph, /aria-pressed=\{isSelected\}/, "memory nodes should expose their selected state");
assert.match(graph, /aria-label="Clear selected memory"/, "the selected-memory inspector should support explicit dismissal");
assert.match(graph, /aria-label=\{state\.isLoading \? "Refreshing memory" : "Refresh memory"\}[\s\S]*aria-label="Zoom out"/, "refresh should be an icon control immediately before zoom out");
assert.match(graph, /fitInsets:[\s\S]*bottom: 148/, "selected memory should reserve graph fit space for its inspector");
assert.match(graph, /transform\.scale >= SHOW_ALL_LABELS_SCALE/, "a sparse graph at the fit cap should keep its memory labels visible");
assert.match(graph, /case "resource": return "resource"/, "resource source nodes should keep a distinct visual type");
assert.match(viewportController, /const MIN_SCALE = 0\.08/, "the drawer graph should zoom far enough out for the bounded full projection");
assert.match(viewportController, /const MAX_SCALE = 3[\s\S]*const MAX_FIT_SCALE = 1\.4/, "automatic fit should stay restrained while manual zoom retains its full range");
assert.doesNotMatch(graph, /textarea|contentEditable|onSubmit|mutation/, "the Memory drawer should not introduce editing");

assert.match(css, /\.community-memory-graph-surface/, "the graph should fill the drawer body");
assert.match(css, /\.community-polynet-graph-controls[\s\S]*top: 12px/, "graph controls should own a collision-free top-right region");
assert.doesNotMatch(css, /\.community-memory-drawer \.community-polynet-graph-controls,[\s\S]*bottom: 88px/, "graph controls and selected memory should not share one bottom overlay band");
assert.match(css, /@container community-chat-area \(max-width: 680px\)[\s\S]*\.community-interaction-projection\.has-drawer \.community-interaction-drawer[\s\S]*z-index: 16/, "narrow drawers should sit above the sticky channel header");
assert.doesNotMatch(css, /\.community-polynet-(panel|header|back|heading|subtitle)/, "retired full-page Memory chrome should leave no dead CSS");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, "memory graph motion should respect reduced-motion preferences");

console.log("Community Knowledge UI contract proof passed");
