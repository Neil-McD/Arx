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
const surfaceProjection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const gateway = read("shared/cloudCommunityInteractionsGateway.ts");
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
  /interactionProjection:\s*\{[\s\S]*enabled:\s*COMMUNITY_INTERACTION_PROJECTION_ENABLED[\s\S]*roots:\s*communityInteractionRoots[\s\S]*selectedRootId:\s*selectedCommunityInteractionRootId/,
  "App should pass a feature-flagged canonical projection into the chat panel",
);
assert.match(
  app,
  /onCommunityMessageSent:[\s\S]*loadCommunityInteractionRoots\(communityId, session\)/,
  "legacy chat writes should refresh the canonical projection after send",
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
  /profilesByUserId: Record<string, UserProfile>[\s\S]*UserAvatar[\s\S]*profile=\{profile\}/,
  "projection should render root/reply avatars from the hydrated profile cache",
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
  /Current UI Projection Slice[\s\S]*VITE_ENABLE_COMMUNITY_INTERACTION_PROJECTION[\s\S]*existing legacy chat timeline remains[\s\S]*canonical interaction read bundles expose public actor user ids[\s\S]*text-only top-level composer sends may use the canonical composer bridge[\s\S]*stale interaction reads must not overwrite/,
  "interaction contract should document the active UI projection slice",
);
assert.match(
  contract,
  /Current Canonical Composer Bridge Slice[\s\S]*createCommunityInteractionComposerMessage[\s\S]*canonical roots\/replies before legacy compatibility rows[\s\S]*attachment sends stay on `createThreadUserMessage`/,
  "interaction contract should document the active canonical composer bridge slice",
);

console.log("community interaction projection UI contract proof passed");
