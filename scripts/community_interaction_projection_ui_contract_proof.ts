import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const packageJson = read("package.json");
const app = read("apps/web/src/App.tsx");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const projection = read("apps/web/src/components/WebCommunityInteractionProjection.tsx");
const feed = read("apps/web/src/components/communityInteractionFeed.tsx");
const surfaceProjection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const gateway = read("shared/cloudCommunityInteractionsGateway.ts");
const sendController = read("shared/useCommunityChatMutationController.ts");
const interactions = read("convex/communityInteractions.ts");
const baseCss = read("apps/web/src/base.css");
const contract = read("docs/community-interaction-substrate-contract-v1.md");
const envExample = read(".env.example");
const stagingEnvExample = read(".env.staging.local.example");

assert.match(
  packageJson,
  /"check:community-interaction-projection-ui-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_interaction_projection_ui_contract_proof\.ts"/,
  "package scripts should expose the community interaction projection UI proof",
);

assert.match(
  app,
  /VITE_ENABLE_COMMUNITY_INTERACTION_PROJECTION/,
  "App should gate the projection behind an explicit Vite flag",
);
assert.match(
  app,
  /listCloudCommunityInteractionRoots[\s\S]*listCloudCommunityInteractionReplies/,
  "App should read canonical interaction roots and drawer replies",
);
assert.match(
  app,
  /interactionProjection:\s*\{[\s\S]*enabled:\s*COMMUNITY_INTERACTION_PROJECTION_ENABLED[\s\S]*roots:\s*appendPendingRoots\(communityInteractionRoots, pendingCanonicalInteractions, activeCommunityId\)[\s\S]*selectedRootId:\s*selectedCommunityInteractionRootId/,
  "App should pass a feature-flagged canonical projection with optimistic roots into the chat panel",
);
assert.match(
  app,
  /subscribeCloudCommunityInteractionRoots[\s\S]*subscribeCloudCommunityInteractionReplies/,
  "App should subscribe to canonical interaction roots and replies directly",
);
assert.match(
  app,
  /useCommunityChatRealtime\(\{[\s\S]*isEnabled: activePage === "community" && hasResolvedCommunityChat && !COMMUNITY_INTERACTION_PROJECTION_ENABLED/,
  "legacy chat realtime should run only for the legacy timeline fallback",
);
assert.match(
  app,
  /onCommunityMessageSent:[\s\S]*loadCommunityInteractionRoots\(communityId, session\)/,
  "send completion should request canonical projection refresh through canonical reads",
);
assert.match(
  app,
  /communityInteractionRootsRequestIdRef[\s\S]*activeCommunityInteractionCommunityIdRef[\s\S]*activeCommunityInteractionCommunityIdRef\.current !== communityId/,
  "App should guard the projection against stale roots after community switches",
);
assert.match(
  app,
  /visibleCommunityProfileIds[\s\S]*communityInteractionRoots[\s\S]*bundle\.root\.actor_user_id[\s\S]*communityInteractionRepliesByRootId[\s\S]*bundle\.reply\.actor_user_id/,
  "App should hydrate profiles for canonical root and reply actors",
);

assert.match(
  chatPanel,
  /WebCommunityInteractionProjection/,
  "chat panel should render the canonical projection component",
);
assert.match(
  chatPanel,
  /showInteractionProjection[\s\S]*interactionProjection\?\.enabled[\s\S]*hasResolvedCommunityChat[\s\S]*!isLoadingChat/,
  "chat panel should only switch projections once the authenticated chat surface is resolved",
);
assert.match(
  chatPanel,
  /showInteractionProjection && interactionProjection[\s\S]*community-interaction-scroll[\s\S]*WebCommunityInteractionProjection[\s\S]*:\s*\([\s\S]*className="chat-messages"/,
  "chat panel should keep the legacy message timeline as the fallback projection",
);
assert.match(
  chatPanel,
  /WebCommunityInteractionProjection[\s\S]*profilesByUserId=\{profilesByUserId\}/,
  "chat panel should pass hydrated profile rows into the canonical projection",
);

assert.match(
  surfaceProjection,
  /interactionProjection: WebCommunityChatPanelProps\["interactionProjection"\]/,
  "surface builder should accept the interaction projection prop explicitly",
);
assert.match(
  surfaceProjection,
  /interactionProjection: params\.interactionProjection/,
  "surface builder should pass the projection through to WebCommunityChatPanel",
);

assert.match(
  gateway,
  /client\.query\("community:listCommunityInteractionRoots" as any/,
  "gateway should read roots through the community interaction query",
);
assert.match(
  gateway,
  /client\.query\("community:listCommunityInteractionReplies" as any/,
  "gateway should read drawer replies through the community interaction query",
);
assert.match(
  gateway,
  /client\.mutation\("community:createCommunityInteractionComposerMessage" as any/,
  "gateway should expose the canonical composer bridge mutation",
);
assert.match(
  sendController,
  /resolveCommunityChatSendRoute[\s\S]*projection_disabled[\s\S]*writer_missing[\s\S]*community_interaction_reply_target_unmapped/,
  "send controller should keep canonical projection writes behind one explicit route decision",
);
assert.match(
  sendController,
  /onCanonicalOptimisticInsert[\s\S]*idempotencyKey: sendRoute\.idempotencyKey[\s\S]*attachments: preparedAttachments[\s\S]*serializedAttachments/,
  "canonical optimistic projection rows should use the route idempotency key and prepared attachments",
);
assert.match(
  app,
  /function appendPendingRoots[\s\S]*new Set\(roots\.map\(\(bundle\) => bundle\.root\.idempotency_key\)\)[\s\S]*composerStoredIdempotencyKey\(p\.idempotencyKey, "root"\)/,
  "pending root overlays should dedupe against visible canonical roots by stored idempotency key",
);
assert.match(
  app,
  /function appendPendingReplies[\s\S]*new Set\(replies\.map\(\(bundle\) => bundle\.reply\.idempotency_key\)\)[\s\S]*composerStoredIdempotencyKey\(p\.idempotencyKey, "reply"\)/,
  "pending reply overlays should dedupe against visible canonical replies by stored idempotency key",
);
assert.match(
  chatPanel,
  /const rootReplyTarget[\s\S]*if \(!root\?\.id \|\| !root\.actor_user_id\) return null[\s\S]*id: root\.legacy_message_id \?\? root\.id[\s\S]*legacy_message_id: root\.legacy_message_id \?\? null/,
  "canonical drawer root reply target should not require a legacy message id",
);
assert.match(
  projection,
  /onReply=\{\(\) => \{[\s\S]*if \(!reply\.actor_user_id\) return[\s\S]*id: reply\.legacy_message_id \?\? reply\.id[\s\S]*interaction_root_id: reply\.root_id[\s\S]*legacy_message_id: reply\.legacy_message_id \?\? null/,
  "canonical drawer reply action should carry canonical root id and optional legacy metadata",
);
assert.doesNotMatch(
  gateway,
  /createThreadUserMessage|sendCloudCommunityMessage|communityChatMessages/,
  "interaction gateway should not fall back to legacy chat tables",
);
assert.match(
  interactions,
  /mapRootBundle[\s\S]*resolvePublicUserId\(ctx, root\.actorUserId[\s\S]*actor_user_id: publicActorUserId/,
  "root read bundles should expose public actor user ids for UI profile hydration",
);
assert.match(
  interactions,
  /mapReplyBundle[\s\S]*resolvePublicUserId\(ctx, reply\.actorUserId[\s\S]*actor_user_id: publicActorUserId/,
  "reply read bundles should expose public actor user ids for UI profile hydration",
);

assert.match(
  projection,
  /selectedRoot[\s\S]*community-interaction-drawer/,
  "projection should render a one-level drawer for the selected root",
);
assert.match(
  projection,
  /CommunityInteractionFeedList[\s\S]*density="full"/,
  "projection shell should delegate main feed rows to the shared full-density interaction feed",
);
assert.match(
  projection,
  /profilesByUserId: Record<string, UserProfile>/,
  "projection props should carry hydrated profile rows for avatar rendering",
);
assert.match(
  feed,
  /export function ActorAvatar[\s\S]*UserAvatar[\s\S]*imageUrl=\{props\.profile\?\.avatar_url \?\? null\}[\s\S]*focusX=\{props\.profile\?\.avatar_focus_x \?\? 0\.5\}[\s\S]*focusY=\{props\.profile\?\.avatar_focus_y \?\? 0\.5\}[\s\S]*zoom=\{props\.profile\?\.avatar_zoom \?\? 1\}/,
  "shared feed renderer should render avatars from the hydrated profile cache",
);
assert.match(
  projection,
  /props\.replies\.map/,
  "projection drawer should render replies supplied by the bounded reply query",
);
assert.doesNotMatch(
  projection,
  /onStartReply|onSendCommunityMessage|client\.mutation|sendCloudCommunityMessage/,
  "projection component should not introduce a second writer path",
);
assert.match(
  feed,
  /export function CommunityInteractionFeedList[\s\S]*density: "full" \| "compact"[\s\S]*props\.roots[\s\S]*community-interaction-message/,
  "shared feed renderer should own root row rendering for full and compact projections",
);
assert.match(
  app,
  /workspaceRecentSignalFeed[\s\S]*<CommunityInteractionFeedList[\s\S]*density="compact"/,
  "workspace panel should use the shared compact interaction feed projection",
);

[
  ".community-interaction-projection.has-drawer",
  ".community-interaction-drawer",
  ".community-interaction-root.selected",
  ".community-interaction-thread-anchor",
  ".community-interaction-avatar-image",
  ".community-interaction-reply-list",
  ".app-root.mobile-shell .community-chat .community-interaction-drawer",
].forEach((selector) => {
  assert.ok(baseCss.includes(selector), `base.css should include ${selector}`);
});

assert.match(
  baseCss,
  /\.community-interaction-feed-scroll\s*\{[\s\S]*padding:\s*calc\(var\(--web-topbar-height,\s*48px\)\s*\+\s*10px\)\s+18px\s+4px;/,
  "projection feed should reserve the web topbar while leaving space for the pane-scoped composer",
);
assert.match(
  baseCss,
  /\.community-interaction-drawer-scroll\s*\{[\s\S]*padding-top:\s*calc\(var\(--web-topbar-height,\s*48px\)\s*\+\s*12px\);/,
  "projection drawer scroll region should reserve the web topbar and floating back button before rendering replies",
);
assert.match(
  baseCss,
  /\.community-interaction-avatar\s*\{[\s\S]*position:\s*relative;[\s\S]*width:\s*36px;[\s\S]*height:\s*36px;[\s\S]*overflow:\s*hidden;/,
  "projection avatars should be stable positioned clipping boxes",
);
assert.match(
  baseCss,
  /\.community-interaction-avatar-image\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*object-fit:\s*cover;/,
  "projection avatar images should fill the avatar clipping box",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell\s+\.community-chat\s+\.community-interaction-feed-scroll\s*\{[\s\S]*padding:\s*8px\s+12px\s+18px;/,
  "mobile projection feed should use compact pane padding because the mobile shell owns topbar clearance",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell\s+\.community-chat\s+\.community-interaction-drawer-scroll\s*\{[\s\S]*padding-top:\s*calc\(var\(--mobile-topbar-clearance\)\s*\+\s*62px\);/,
  "mobile projection drawer should reserve the mobile topbar clearance and floating back button",
);

assert.match(
  envExample,
  /VITE_ENABLE_COMMUNITY_INTERACTION_PROJECTION=/,
  ".env.example should document the projection flag without enabling it globally",
);
assert.match(
  stagingEnvExample,
  /VITE_ENABLE_COMMUNITY_INTERACTION_PROJECTION=true/,
  ".env.staging.local.example should enable the projection for the staging/dev chat lane",
);

assert.match(
  contract,
  /Current UI Projection Slice[\s\S]*VITE_ENABLE_COMMUNITY_INTERACTION_PROJECTION[\s\S]*existing legacy chat timeline remains[\s\S]*projection subscribes to canonical interaction roots and replies directly[\s\S]*legacy chat realtime is disabled while canonical interaction projection is active[\s\S]*canonical interaction read bundles expose public actor user ids[\s\S]*top-level composer sends may use the canonical composer bridge, including prepared attachments[\s\S]*canonical projection does not rely on legacy chat realtime[\s\S]*stale interaction reads must not overwrite/,
  "interaction contract should document the active UI projection slice",
);
assert.match(
  contract,
  /Current Canonical Composer Bridge Slice[\s\S]*createCommunityInteractionComposerMessage[\s\S]*canonical roots\/replies before legacy compatibility rows[\s\S]*bounded, already-prepared attachment metadata[\s\S]*communityInteractionAttachments/,
  "interaction contract should document the active canonical composer bridge slice",
);

console.log("community interaction projection UI contract proof passed");
