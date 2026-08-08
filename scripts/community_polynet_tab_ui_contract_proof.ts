import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const controller = read("apps/web/src/controllers/useWebCommunityPolynetController.ts");
const interactionController = read("apps/web/src/controllers/useWebCommunityInteractionProjection.ts");
const viewportController = read("apps/web/src/controllers/useWebPolynetGraphViewport.ts");
const graph = read("apps/web/src/components/CommunityMemoryGraph.tsx");
const preview = read("apps/web/src/components/CommunityMemoryGraphPreview.tsx");
const gateway = read("shared/cloudCommunityPolynetGateway.ts");
const contextPanel = read("apps/web/src/components/CommunityContextPanel.tsx");
const interactionProjection = read("apps/web/src/components/WebCommunityInteractionProjection.tsx");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const secondaryPanels = read("apps/web/src/components/WebCommunitySecondaryPanels.tsx");
const surfaceProjection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const navigation = read("shared/appShellNavigation.ts");
const app = read("apps/web/src/App.tsx");
const emailDigests = read("convex/emailDigests.ts");
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
assert.doesNotMatch(
  emailDigests,
  /itemUrlPath\(args\.communitySlug, "polynet"\)/,
  "memory digest links should not emit the retired route",
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

assert.match(controller, /activePage === "community" && communityTab === "chat"/, "memory should load only inside community chat");
assert.match(controller, /type CommunityMemoryPresentation = "rail" \| "drawer"/, "the controller should distinguish compact rail and full drawer projections");
assert.match(controller, /COMMUNITY_POLYNET_RAIL_NODE_LIMIT = 12/, "the right rail should retain the compact projection");
assert.match(controller, /presentation === "rail" \? COMMUNITY_POLYNET_RAIL_NODE_LIMIT : undefined/, "the drawer should request the full bounded overview");
assert.match(controller, /resolveCommunityMemoryPresentation\(current\.isMemoryOpen\) !== presentation/, "stale compact and full responses should not cross presentation boundaries");
assert.match(controller, /subscribeCloudCommunityPolynetOverview/, "the active presentation should retain realtime updates");
assert.match(controller, /unsubscribe\?\.\(\)/, "presentation changes should dispose the prior subscription");
assert.match(controller, /closeLiveClient\?\.\(\)/, "presentation changes should close the prior realtime client");

assert.match(
  interactionController,
  /export type CommunityInteractionSidecar =[\s\S]*kind: "context"[\s\S]*kind: "memory"[\s\S]*kind: "thread"; rootId: string/,
  "thread and memory should share one canonical interaction sidecar state",
);
assert.match(interactionController, /const openMemory = useCallback\([\s\S]*setSidecar\(\{ kind: "memory" \}\)/, "the interaction owner should open memory without navigation");
assert.match(interactionController, /setSidecar\(\{ kind: "thread", rootId \}\)/, "opening a thread should replace memory in the same sidecar");
assert.match(interactionController, /setSidecar\(\{ kind: "context" \}\)/, "closing a detail should restore the context rail");
assert.match(interactionController, /memoryTriggerRef[\s\S]*button\[aria-label="Open community memory"\][\s\S]*focusTarget\?\.focus\(\{ preventScroll: true \}\)/, "closing Memory should restore focus to the newly mounted rail trigger");

assert.match(contextPanel, /CommunityMemoryGraphPreview/, "the default rail should keep the live compact preview");
assert.match(contextPanel, /onOpenMemory/, "the compact preview should remain the Memory entry point");
assert.match(interactionProjection, /community-memory-drawer/, "the interaction projection should render Memory in the existing drawer shell");
assert.match(interactionProjection, /aria-label="Community memory"/, "the drawer should expose an accessible label");
assert.match(interactionProjection, /event\.key !== "Escape"[\s\S]*onCloseCommunityMemory/, "Escape should close Memory through the canonical transition");
assert.match(interactionProjection, /memoryBackButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/, "opening Memory should move keyboard focus into the drawer");
assert.match(interactionProjection, /community-memory-drawer-header[\s\S]*ref=\{memoryBackButtonRef\}[\s\S]*aria-label="Back to community"/, "the Memory back control should own the drawer focus ref");
assert.match(interactionProjection, /onCloseCommunityMemory \?\? props\.onCloseDrawer/, "Memory should use the canonical close transition");
assert.match(interactionProjection, /<CommunityMemoryGraph/, "the drawer should reuse the canonical graph rather than a duplicate list");
assert.match(interactionProjection, /hasDetailPanel[\s\S]*has-drawer/, "Memory, thread, and profile details should share drawer geometry");
assert.match(chatPanel, /handleSelectCommunityRoot[\s\S]*setProfilePanelUserId\(null\)/, "opening a thread should close the profile sidecar");
assert.match(chatPanel, /handleOpenCommunityProfile[\s\S]*onCloseDrawer\(\)/, "opening a profile should close thread or Memory first");
assert.match(app, /isMemoryOpen: communityInteractionSidecar\.kind === "memory"/, "the data projection should follow canonical sidecar state");
assert.match(app, /isCommunityMemoryOpen: communityInteractionSidecar\.kind === "memory"/, "the visual drawer should follow the same canonical sidecar state");

assert.match(graph, /export function CommunityMemoryGraph/, "the retired page should leave one reusable graph surface");
assert.doesNotMatch(graph, /onBackToChat|Back to community chat|community-polynet-header/, "the graph should not retain page navigation chrome");
assert.match(graph, /overview\.graph\.nodes\.map/, "the drawer graph should render backend-projected nodes");
assert.match(graph, /overview\.graph\.edges\.map/, "the drawer graph should render backend-projected edges");
assert.match(graph, /key=\{lineageId\}/, "memory nodes should preserve lifecycle identity");
assert.match(graph, /data-lineage-id=\{lineageId\}/, "memory nodes should expose lineage for browser acceptance");
assert.match(graph, /case "resource": return "resource"/, "resource source nodes should keep a distinct visual type");
assert.match(preview, /case "resource": return "resource"/, "the compact preview should preserve resource node type");
assert.match(viewportController, /const MIN_SCALE = 0\.08/, "the drawer graph should zoom far enough out for the bounded full projection");
assert.doesNotMatch(graph, /textarea|contentEditable|onSubmit|mutation/, "the Memory drawer should not introduce editing");

assert.match(css, /\.community-memory-drawer-scroll/, "Memory should have a full-height drawer viewport");
assert.match(css, /\.community-memory-graph-surface/, "the graph should fill the drawer body");
assert.match(css, /\.community-memory-drawer \.community-polynet-graph-controls,[\s\S]*bottom: 88px/, "graph controls should clear the member-agent dock");
assert.match(css, /\.community-member-chat \.community-memory-drawer \.community-interaction-drawer-back/, "Memory should reuse the stable thread header band");
assert.doesNotMatch(css, /\.community-polynet-(panel|header|back|heading|subtitle)/, "retired full-page Memory chrome should leave no dead CSS");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, "memory graph motion should respect reduced-motion preferences");

console.log("Community memory drawer UI contract proof passed");
