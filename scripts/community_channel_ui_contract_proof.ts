import { readFileSync } from "node:fs";
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
  'name: "General"',
  '"Add Channel"',
  "canManageMembersActiveCommunity && onCreateChannel",
  "Channels are visible to every community member.",
].forEach((required) => assertIncludes(navPath, nav, required));

const gatewayPath = "shared/cloudCommunityChannelsGateway.ts";
const gateway = read(gatewayPath);
[
  ".communityChannels.listCommunityChannels",
  '"communityChannels:createCommunityChannel"',
  "authSubject",
].forEach((required) => assertIncludes(gatewayPath, gateway, required));

const channelControllerPath = "apps/web/src/controllers/useWebCommunityChannelsController.ts";
const channelController = read(channelControllerPath);
[
  'status: "loading"',
  'status: "failed"',
  'status: "not_found"',
  'selection.status === "resolved"',
  "retryChannels",
  "A channel with that name already exists.",
].forEach((required) => assertIncludes(channelControllerPath, channelController, required));
assertNotMatches(
  channelControllerPath,
  channelController,
  /selection\.status\s*!==\s*"not_found"[\s\S]*?setRequestedChannelSlug\(null\)/,
);

const channelApiPath = "convex/communityChannels.ts";
assertIncludes(channelApiPath, read(channelApiPath), "listReadableCommunityChannels");

const appPath = "apps/web/src/App.tsx";
const app = read(appPath);
[
  "activeChannelCommunityId",
  "isActiveCommunityChannelReady && canPostMessagesActiveCommunity",
  'activeCommunityChannelResolutionStatus === "failed"',
  'activeCommunityChannelResolutionStatus === "not_found"',
  '"Return to General"',
  "retryActiveCommunityChannels",
].forEach((required) => assertIncludes(appPath, app, required));

const shellStylesPath = "apps/web/src/styles/shell-and-onboarding.css";
assertMatches(
  shellStylesPath,
  read(shellStylesPath),
  /\.community-nav\s*\{[\s\S]*?overflow-y:\s*auto;/,
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
  "apps/web/src/controllers/useWebJoinedCommunityRouteResolution.ts";
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
  'channelId ?? "general"',
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
