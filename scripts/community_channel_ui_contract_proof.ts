import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function assertIncludes(path: string, source: string, required: string): void {
  if (!source.includes(required)) {
    throw new Error(`${path} missing required channel UI contract: ${required}`);
  }
}

function assertMatches(path: string, source: string, required: RegExp): void {
  if (!required.test(source)) {
    throw new Error(`${path} missing required channel UI contract: ${required}`);
  }
}

function assertNotMatches(path: string, source: string, forbidden: RegExp): void {
  if (forbidden.test(source)) {
    throw new Error(`${path} contains forbidden channel UI behavior: ${forbidden}`);
  }
}

const navPath = "shared/CommunityNav.tsx";
const nav = read(navPath);
[
  '"Add Channel"',
  "canManageMembersActiveCommunity && onCreateChannel",
  "Everyone in the community can read and post here.",
  "Next you pick who's in it; owners and admins always are.",
  "channelAccessMode",
  'className="community-channel-loading-row web-skeleton-row"',
  'className="community-channel-loading-row is-short web-skeleton-row"',
  "MODAL_FOCUSABLE_SELECTOR",
  "trapModalFocus",
  "onReorderChannels",
  "onReorderChannels(orderedIds, movedChannelId)",
  "usePointerSortableList",
  "getChannelItemBindings",
  "community-channel-reorder-trigger",
  "onPointerDown={sortableBindings?.onPointerDown}",
  "onClickCapture={sortableBindings?.onClickCapture}",
  "Move up",
  "Move down",
  "setReorderControlsChannelId(null)",
].forEach((required) => assertIncludes(navPath, nav, required));
assertNotMatches(
  navPath,
  nav,
  /channels\.length\s*>\s*0[\s\S]*name:\s*"General"/,
);
assertNotMatches(navPath, nav, /community-channel-menu-trigger|Rename channel|Delete channel/);
assertNotMatches(navPath, nav, /DragEvent|dataTransfer|draggable=|onDragStart|onDragOver|onDrop/);

const pointerSortablePath = "shared/usePointerSortableList.ts";
const pointerSortable = read(pointerSortablePath);
[
  "DRAG_START_THRESHOLD_PX",
  "claimInlineUserSelect",
  "releaseInlineUserSelect",
  "shouldCommitPointerSort",
  "computeProjectedIndex",
  "computeSiblingShift",
  "computeAutoScrollStep",
  "pointercancel",
  "suppressNextClickRef",
  "firstSortableElement",
  "lastSortableElement",
].forEach((required) => assertIncludes(pointerSortablePath, pointerSortable, required));
assertNotMatches(pointerSortablePath, pointerSortable, /dragActive/);
assertNotMatches(pointerSortablePath, pointerSortable, /document\.body\.style\.userSelect\s*=\s*""/);
assertNotMatches(pointerSortablePath, pointerSortable, /type DragVisualState\s*=\s*{[^}]*startIndex:/);
if (existsSync(resolve(root, "shared/useRailPointerReorder.ts"))) {
  throw new Error("legacy rail-only pointer reorder primitive must be deleted");
}

const railOrderPath = "shared/useCommunityRailOrder.ts";
const railOrder = read(railOrderPath);
assertNotMatches(railOrderPath, railOrder, /moveIdBefore|moveCommunityBefore/);

const headerPath = "apps/web/src/components/WebCommunityChannelHeader.tsx";
const header = read(headerPath);
[
  "community-channel-header",
  'aria-haspopup="menu"',
  'aria-label={`Channel options for ${channel.name}`}',
  "canOpenChannelMenu",
  "community-channel-header-menu-system-note",
  "Default channel",
  "Can’t be renamed or deleted",
  "Rename channel",
  "Delete channel",
  "!channel.is_general",
  "Existing messages will be retained.",
  "MODAL_FOCUSABLE_SELECTOR",
  "trapModalFocus",
].forEach((required) => assertIncludes(headerPath, header, required));

const gatewayPath = "shared/cloudCommunityChannelsGateway.ts";
const gateway = read(gatewayPath);
[
  ".communityChannels.listCommunityChannelPage",
  '"communityChannels:createCommunityChannel"',
  '"communityChannels:renameCommunityChannel"',
  '"communityChannels:deleteCommunityChannel"',
  '"communityChannels:moveCommunityChannel"',
  '"communityChannels:setCommunityChannelPinnedRoot"',
  "authSubject",
].forEach((required) => assertIncludes(gatewayPath, gateway, required));

const channelControllerPath = "apps/web/src/controllers/useWebCommunityChannelsController.ts";
const channelController = read(channelControllerPath);
[
  "GENERAL_FALLBACK_CHANNEL",
  'name: "General"',
  'status: "loading"',
  'status: "failed"',
  'status: "not_found"',
  'selection.status === "resolved"',
  "retryChannels",
  "A channel with that name already exists.",
  "renameCloudCommunityChannel",
  "deleteCloudCommunityChannel",
  "manageInFlightChannelIdRef",
  "onChannelDeleted",
  "resolveWebCommunityChannelDeleteCompletion(paramsRef, communityId)",
  "moveCloudCommunityChannel",
  "channel.id === movedChannelId && !channel.is_general",
  "channelId: moved.id",
  "lastSubscribedChannelsRef",
  "reorderInFlightCommunityIdRef",
].forEach((required) => assertIncludes(channelControllerPath, channelController, required));
assertNotMatches(
  channelControllerPath,
  channelController,
  /selection\.status\s*!==\s*"not_found"[\s\S]*?setRequestedChannelSlug\(null\)/,
);
assertNotMatches(
  channelControllerPath,
  channelController,
  /current\.onChannelDeleted\?\.\(/,
);

const channelApiPath = "convex/communityChannels.ts";
const channelApi = read(channelApiPath);
[
  "listAuthorizedCommunityChannelPage",
  "renameCommunityChannel",
  "deleteCommunityChannel",
  "requireCommunityManager",
  "renameActiveCommunityChannel",
  "archiveActiveCommunityChannel",
  "moveCommunityChannel",
  "setCommunityChannelPinnedRoot",
].forEach((required) => assertIncludes(channelApiPath, channelApi, required));

const channelCorePath = "convex/communityChannelCore.ts";
const channelCore = read(channelCorePath);
[
  "requireCommunityChannelLineage",
  "community_general_channel_immutable",
  "renameActiveCommunityChannel",
  "archiveActiveCommunityChannel",
  'status: "archived"',
  'if (channel.status === "archived") return channel',
  "moveActiveCommunityChannel",
  "setActiveCommunityChannelPinnedRoot",
  "community_channel_order_stale",
  "community_channel_pin_target_invalid",
  'root.actorType === "system"',
].forEach((required) => assertIncludes(channelCorePath, channelCore, required));

const appPath = "apps/web/src/App.tsx";
const app = read(appPath);
[
  "activeChannelCommunityId",
  "isActiveCommunityChannelReady && canPostMessagesActiveCommunity",
  'activeCommunityChannelResolutionStatus === "failed"',
  'activeCommunityChannelResolutionStatus === "not_found"',
  '"Return to General"',
  "retryActiveCommunityChannels",
  "selectedChannel: activeCommunityChannel",
  "canManageActiveChannel",
  "canManageMembersActiveCommunity &&\n          Boolean(activeCommunityChannel)",
  "onRenameChannel: handleRenameCommunityChannel",
  "onDeleteChannel: handleDeleteCommunityChannel",
  "handleReorderCommunityChannels",
  "pinnedRoot: isActiveCommunityChannelReady",
  "onSetPinnedRoot: handleSetPinnedCommunityInteractionRoot",
].forEach((required) => assertIncludes(appPath, app, required));

const interactionApiPath = "convex/communityInteractions.ts";
const interactionApi = read(interactionApiPath);
[
  "getCommunityChannelPinnedRoot",
  "getCommunityChannelInteractionRoot",
  "clearPinnedRootIfMatches",
  'reason: "root_tombstoned"',
  "pinned_at: null",
].forEach((required) => assertIncludes(interactionApiPath, interactionApi, required));

const interactionGatewayPath = "shared/cloudCommunityInteractionsGateway.ts";
const interactionGateway = read(interactionGatewayPath);
[
  "subscribeCloudCommunityChannelPinnedRoot",
  "subscribeCloudCommunityChannelInteractionRoot",
  ".communityInteractions.getCommunityChannelPinnedRoot",
  ".communityInteractions.getCommunityChannelInteractionRoot",
].forEach((required) => assertIncludes(interactionGatewayPath, interactionGateway, required));

const interactionControllerPath = "apps/web/src/controllers/useWebCommunityInteractionProjection.ts";
const interactionController = read(interactionControllerPath);
[
  "subscribeCloudCommunityChannelPinnedRoot",
  "subscribeCloudCommunityChannelInteractionRoot",
  "setCloudCommunityChannelPinnedRoot",
  "lastSubscribedPinnedRootRef",
  "pinMutationBoundaryRef",
  "setSelectedRoot(root)",
  "setPinnedRoot(null)",
].forEach((required) => assertIncludes(interactionControllerPath, interactionController, required));

const pinnedProjectionPath = "apps/web/src/components/WebCommunityInteractionProjection.tsx";
const pinnedProjection = read(pinnedProjectionPath);
[
  "CommunityPinnedRootSurface",
  "CommunityInteractionFeedList",
  "canManagePinnedRoot",
  "onSetPinnedRoot",
  "resolveSelectedCommunityInteractionRoot",
  "communityInteractionRootHasRichContent",
  "roots={[props.pinnedRoot]}",
  "selected={props.pinnedRoot.root.id === props.selectedRootId}",
  "selectedRootId={null}",
  "showDayDividers={false}",
  "onOpen={() => props.onSelectRoot",
].forEach((required) => assertIncludes(pinnedProjectionPath, pinnedProjection, required));
assertNotMatches(pinnedProjectionPath, pinnedProjection, /community-channel-pinned-root-header/);
assertNotMatches(pinnedProjectionPath, pinnedProjection, />\s*Pinned\s*</);
assertNotMatches(
  pinnedProjectionPath,
  pinnedProjection,
  /community-channel-pinned-root-copy/,
);
assertNotMatches(pinnedProjectionPath, pinnedProjection, /density=/);
assertNotMatches(pinnedProjectionPath, pinnedProjection, /showReactions/);

const pinnedSurfacePath = "apps/web/src/components/CommunityPinnedRootSurface.tsx";
const pinnedSurface = read(pinnedSurfacePath);
[
  "community-channel-pinned-root",
  "community-channel-pinned-root-viewport",
  "community-channel-pinned-root-preview-open",
  "community-channel-pinned-root-fade",
  "community-channel-pinned-root-open",
  "community-channel-pinned-root-pin",
  "community-channel-pinned-root-pin is-action",
  'aria-label="Pinned post"',
  'aria-label="Unpin from channel"',
  "View full post",
  "ResizeObserver",
  "props.children",
  "inert",
  'aria-hidden="true"',
  "scrollHeight",
  "clientHeight",
  "data-community-pinned-body-overflow",
  "<Pin size={15}",
  "<PinOff size={15}",
].forEach((required) => assertIncludes(pinnedSurfacePath, pinnedSurface, required));
assertMatches(
  pinnedSurfacePath,
  pinnedSurface,
  /props\.canUnpin\s*\?\s*\([\s\S]*?<button[\s\S]*?community-channel-pinned-root-pin is-action[\s\S]*?<PinOff[\s\S]*?\)\s*:\s*\([\s\S]*?<span className="community-channel-pinned-root-pin" aria-hidden="true">[\s\S]*?<Pin/,
);
assertNotMatches(
  pinnedSurfacePath,
  pinnedSurface,
  /More below|Scrollable pinned post content|onScroll=|tabIndex=|community-channel-pinned-root-footer/,
);
assertNotMatches(
  pinnedSurfacePath,
  pinnedSurface,
  /bundleText|InteractionContent|InteractionAttachments|hiddenContentLabel|Includes .*attachments?|Includes .*link previews?/,
);

const interactionFeedPath = "apps/web/src/components/communityInteractionFeed.tsx";
const interactionFeed = read(interactionFeedPath);
[
  "Pin to {pinPlace}",
  "Unpin from {pinPlace}",
  "props.canManagePinnedRoot",
].forEach((required) => assertIncludes(interactionFeedPath, interactionFeed, required));

const interactionRowPartsPath = "apps/web/src/components/communityInteractionRowParts.tsx";
const interactionRowParts = read(interactionRowPartsPath);
[
  "const reactedByViewer = viewer.has(row.emoji);",
  "aria-pressed={reactedByViewer}",
  '", reacted by you"',
].forEach((required) =>
  assertIncludes(interactionRowPartsPath, interactionRowParts, required),
);

const interactionContractPath = "docs/community-interaction-substrate-contract-v1.md";
const interactionContract = read(interactionContractPath);
[
  "Every active channel may point to at most one live root",
  "General remains fixed at position zero",
  "chronological feed's canonical content primitives",
  "bounded teaser, not a second message renderer",
  "authorized root-by-id thread",
  "Short text-only pins retain their natural height",
].forEach((required) => assertIncludes(interactionContractPath, interactionContract, required));

const schemaPath = "convex/schema.ts";
const schema = read(schemaPath);
assertMatches(
  schemaPath,
  schema,
  /communityChannels: defineTable\(\{[\s\S]*pinnedRootId: v\.optional\(v\.id\("communityInteractionRoots"\)\)/,
);
assertNotMatches(
  schemaPath,
  schema,
  /communityInteractionRoots: defineTable\(\{[\s\S]*?pinnedAt: v\.optional\(v\.number\(\)\)/,
);
assertNotMatches(
  appPath,
  app,
  /canManageActiveChannel:[\s\S]*?activeCommunityChannel\s*&&\s*!activeCommunityChannel\.is_general/,
);

const interactionProjectionPath =
  "apps/web/src/components/WebCommunityInteractionProjection.tsx";
const interactionProjection = read(interactionProjectionPath);
[
  "WebCommunityChannelHeader",
  "props.activeChannel",
  "props.canManageActiveChannel",
  "props.onRenameChannel",
  "props.onDeleteChannel",
].forEach((required) =>
  assertIncludes(interactionProjectionPath, interactionProjection, required),
);

const shellStylesPath = "apps/web/src/styles/shell-and-onboarding.css";
const shellStyles = read(shellStylesPath);
assertMatches(
  shellStylesPath,
  shellStyles,
  /\.community-nav\s*\{[\s\S]*?overflow-y:\s*auto;/,
);
assertMatches(
  shellStylesPath,
  shellStyles,
  /\.community-channel-reorder\s*\{[\s\S]*?top:\s*0;[\s\S]*?bottom:\s*2px;[\s\S]*?align-items:\s*center;/,
);
assertMatches(
  shellStylesPath,
  shellStyles,
  /\.community-channel-reorder-trigger:hover:not\(:disabled\)\s*\{[\s\S]*?background:\s*transparent;/,
);
assertNotMatches(
  shellStylesPath,
  shellStyles,
  /\.community-channel-reorder-trigger:hover:not\(:disabled\)[^{]*\{[^}]*background:\s*var\(--hover-overlay\)/,
);

const interactionStylesPath = "apps/web/src/styles/community-and-content.css";
const interactionStyles = read(interactionStylesPath);
[
  ".community-channel-header",
  ".community-channel-header-menu-trigger",
  ".community-channel-header-menu",
  ".community-channel-header-menu-system-note",
].forEach((required) =>
  assertIncludes(interactionStylesPath, interactionStyles, required),
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-header\s*\{[\s\S]*?padding:\s*0\s+18px;[\s\S]*?border-bottom:\s*1px\s+solid\s+var\(--border-default\);/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-header-identity\s*\{[\s\S]*?color:\s*var\(--text-muted\);[\s\S]*?\.community-channel-header-identity h1\s*\{[\s\S]*?font-weight:\s*500;/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-interaction-projection\s*\{[\s\S]*?--community-chat-surface:\s*color-mix\(in srgb, var\(--bg-workspace\) 94%, var\(--bg-card\) 6%\);[\s\S]*?background:\s*var\(--community-chat-surface\);/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-pinned-root\s*\{[\s\S]*?--community-channel-pinned-surface:\s*color-mix\(\s*in srgb,\s*var\(--bg-workspace\) 92%,\s*var\(--accent-attention\) 8%\s*\);[\s\S]*?position:\s*relative;[\s\S]*?max-block-size:\s*min\(23dvh, 196px\);[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\);[\s\S]*?overflow:\s*hidden;[\s\S]*?border-bottom:\s*2px solid var\(--community-chat-surface\);[\s\S]*?background:\s*var\(--community-channel-pinned-surface\);/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.community-channel-pinned-root\s*\{[\s\S]*?max-block-size:\s*min\(22dvh, 196px\);/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-pinned-root-viewport\s*\{[\s\S]*?overflow:\s*hidden;/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-interaction-message\.is-self-mentioned,[\s\S]*?\.community-interaction-reply\.is-self-mentioned\s*\{[\s\S]*?border-left:\s*2px solid var\(--accent-attention\);/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-interaction-reply-pill\s*\{[^}]*color:\s*var\(--accent-attention\);/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-interaction-reaction\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--accent-attention\)[^}]*color:\s*var\(--accent-attention\);/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-interaction-reaction\.is-mine\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--bg-card\) 82%, var\(--accent-attention\) 18%\);[^}]*border-color:\s*var\(--accent-attention\);/,
);
assertNotMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-interaction-reaction\.is-mine\s*\{[^}]*var\(--status-approved\)/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-pinned-root-viewport \.community-interaction-message\.is-self-mentioned\s*\{[\s\S]*?background:\s*transparent;/,
);
assertNotMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-pinned-root-viewport\s*\{[^}]*overflow-y:\s*auto|\.community-channel-pinned-root-overflow-label/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-pinned-root-pin\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?color:\s*var\(--accent-attention\);[\s\S]*?pointer-events:\s*none;/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-pinned-root-pin\.is-action\s*\{[\s\S]*?cursor:\s*pointer;[\s\S]*?pointer-events:\s*auto;/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-pinned-root\.has-rich-content[\s\S]*?\.community-interaction-body\[data-community-pinned-body-overflow\][\s\S]*?-webkit-mask-image:\s*linear-gradient\([\s\S]*?mask-image:\s*linear-gradient\(/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-pinned-root-fade\s*\{[\s\S]*?bottom:\s*0;[\s\S]*?linear-gradient\([\s\S]*?var\(--community-channel-pinned-surface\) 88%/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-pinned-root-preview-open\s*\{[\s\S]*?inset:\s*0;/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-pinned-root-open\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*18px;[\s\S]*?bottom:\s*10px;[\s\S]*?padding:\s*4px 8px;[\s\S]*?border:\s*1px solid transparent;[\s\S]*?border-radius:\s*10px;[\s\S]*?background:\s*var\(--community-channel-pinned-surface\);[\s\S]*?backdrop-filter:\s*blur\(16px\) saturate\(130%\);[\s\S]*?-webkit-backdrop-filter:\s*blur\(16px\) saturate\(130%\);[\s\S]*?color:\s*var\(--accent-attention\);/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-pinned-root-open:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus-ring\);/,
);
assertNotMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-pinned-root-open:(?:hover|focus-visible)\s*\{[^}]*background:/,
);
assertNotMatches(interactionStylesPath, interactionStyles, /\.community-channel-pinned-root-footer/);
assertNotMatches(interactionStylesPath, interactionStyles, /\.community-channel-pinned-root-header/);
assertNotMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-header:has\(\+ \.community-channel-pinned-root\)\s*\{[\s\S]*?border-bottom:\s*0;/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-header\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--border-default\);/,
);
assertMatches(
  interactionStylesPath,
  interactionStyles,
  /\.community-channel-header-menu-trigger\s*\{[\s\S]*?color:\s*var\(--text-muted\);/,
);

const routePath = "shared/webAppRouteState.ts";
const route = read(routePath);
[
  "communityChannelSlug?: string | null",
  'communityTab === "chat" && channelSlug && channelSlug !== "general"',
  'communityTab === "chat" ? String(segments[3]',
].forEach((required) => assertIncludes(routePath, route, required));

const communityRouteControllerPath =
  "apps/web/src/controllers/useWebCommunityRouteController.ts";
const communityRouteController = read(communityRouteControllerPath);
[
  "preserveChannel?: boolean",
  '...(opts.preserveChannel ? {} : { communityChannelSlug: null })',
].forEach((required) =>
  assertIncludes(communityRouteControllerPath, communityRouteController, required),
);

const joinedRouteResolutionPath =
  "apps/web/src/controllers/useWebRouteAccessBoundaryController.ts";
assertIncludes(
  joinedRouteResolutionPath,
  read(joinedRouteResolutionPath),
  "preserveChannel: true",
);

const projectionPath = "apps/web/src/controllers/useWebCommunityInteractionProjection.ts";
const projection = read(projectionPath);
[
  "activeChannelId: string | null",
  "channel_id: pending.channelId",
  'activeChannelId ?? "general"',
  "channelId: interaction.channelId",
].forEach((required) => assertIncludes(projectionPath, projection, required));
assertMatches(
  projectionPath,
  projection,
  /listCloudCommunityInteractionRootsPage[\s\S]*communityId,[\s\S]*channelId,/,
);
assertMatches(
  projectionPath,
  projection,
  /subscribeCloudCommunityInteractionRoots[\s\S]*communityId: activeCommunityId,[\s\S]*channelId: activeChannelId,/,
);

const composerPath = "apps/web/src/controllers/useWebCommunityChatController.ts";
const composer = read(composerPath);
[
  'channelId ?? "general"',
  "current.activeChannelId",
  "channelId: current.activeChannelId",
].forEach((required) => assertIncludes(composerPath, composer, required));

const attentionPath = "apps/web/src/controllers/useWebCommunityAttentionController.ts";
const attention = read(attentionPath);
[
  "activeChannelId",
  '`${communityId}:chat:${channelId ?? "general"}`',
  "channelId,",
].forEach((required) => assertIncludes(attentionPath, attention, required));

const sharedAttentionPath = "shared/useCommunityAttentionController.ts";
assertIncludes(sharedAttentionPath, read(sharedAttentionPath), "channels: Array.isArray(row.channels)");

console.log("community channel UI contract proof passed");
