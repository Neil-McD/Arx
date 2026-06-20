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
assert.doesNotMatch(
  gateway,
  /client\.mutation|sendCloudCommunityMessage|communityChatMessages/,
  "projection gateway should stay read-only and should not fall back to legacy chat tables",
);

assert.match(
  projection,
  /selectedRoot[\s\S]*community-interaction-drawer/,
  "projection should render a one-level drawer for the selected root",
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
  /Current UI Projection Slice[\s\S]*VITE_ENABLE_COMMUNITY_INTERACTION_PROJECTION[\s\S]*existing legacy chat timeline remains[\s\S]*projection does not create a second send\/write path[\s\S]*stale interaction reads must not overwrite/,
  "interaction contract should document the active UI projection slice",
);

console.log("community interaction projection UI contract proof passed");
