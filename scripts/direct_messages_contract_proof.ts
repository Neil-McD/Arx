import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const schema = read("convex/schema.ts");
const directMessages = read("convex/directMessages.ts");
const gateway = read("shared/cloudDirectMessagesGateway.ts");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const profilePanel = read("apps/web/src/components/WebCommunityProfilePanel.tsx");
const messageRow = read("shared/CommunityChatMessageRow.tsx");
const projection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const dmPanel = read("apps/web/src/components/WebDirectMessagePanel.tsx");
const css = read("apps/web/src/base.css");
const packageJson = read("package.json");

assert.match(schema, /dmConversations: defineTable\(\{[\s\S]*kind: v\.literal\("direct"\)[\s\S]*canonicalKey: v\.string\(\)[\s\S]*createdFromCommunityId: v\.id\("communities"\)/, "DM conversations must be direct rooms created from community context");
assert.match(schema, /dmParticipants: defineTable\(\{[\s\S]*participantType: v\.union\(v\.literal\("user"\), v\.literal\("agent"\)\)/, "DM participants must support users and future agents");
assert.match(schema, /dmMessages: defineTable\(\{[\s\S]*conversationId: v\.id\("dmConversations"\)[\s\S]*senderType: v\.union\(v\.literal\("user"\), v\.literal\("agent"\), v\.literal\("system"\)\)/, "DM messages must be conversation-scoped and agent-native");
assert.match(schema, /\.index\("by_canonicalKey", \["canonicalKey"\]\)/, "direct conversations must have a canonical pair key");
assert.match(schema, /\.index\("by_user_status", \["userId", "status"\]\)/, "participants must support a current-user inbox query");

assert.match(directMessages, /ensureDirectConversationFromCommunity = mutation/, "backend must expose community-context DM creation");
assert.match(directMessages, /targetUserId: v\.string\(\)/, "DM creation must target a public user id");
assert.match(directMessages, /requireCommunityChatAccess\(\{[\s\S]*communityId: args\.communityId,[\s\S]*userId: viewerUserId/, "viewer must have access to the source community");
assert.match(directMessages, /requireCommunityChatAccess\(\{[\s\S]*communityId: args\.communityId,[\s\S]*userId: targetUser\._id/, "target must have access to the source community");
assert.match(directMessages, /throw new Error\("dm_target_self"\)/, "users must not open self-DMs");
assert.match(directMessages, /requireProfileSetupCompleteForUser\(ctx, viewerUserId\)/, "DM writes must require profile setup");
assert.match(directMessages, /listMyDirectConversations = query/, "backend must expose current-user DM inbox query even if UI inbox is deferred");
assert.match(directMessages, /sendDirectMessage = mutation/, "backend must expose direct message sending");
assert.doesNotMatch(directMessages, /follow|follower|following/i, "first DM slice must not introduce follow graph semantics");

assert.match(gateway, /ensureCloudDirectConversationFromCommunity/, "web gateway must open or create direct conversations");
assert.match(gateway, /listCloudDirectMessages/, "web gateway must list direct messages");
assert.match(gateway, /subscribeCloudDirectMessages/, "web gateway must expose live direct message subscriptions");
assert.match(gateway, /sendCloudDirectMessage/, "web gateway must send direct messages");

assert.match(projection, /activeCommunity:[\s\S]*id: params\.activeCommunity\.id/, "chat panel must receive active community id for DM source context");
assert.match(chatPanel, /ensureCloudDirectConversationFromCommunity/, "community chat panel must create DMs from profile actions");
assert.match(chatPanel, /communityId: activeCommunity\.id/, "DM creation must use the active community as source context");
assert.match(chatPanel, /subscribeCloudDirectMessages<DirectMessage>/, "open DM panels must subscribe to live message rows");
assert.doesNotMatch(chatPanel, /messages: \[\.\.\.previous\.messages, message\]/, "DM sends must not use local append as the source of truth");
assert.match(chatPanel, /onMessageSender=\{openDirectMessage\}/, "profile hover message button must open the DM flow");
assert.match(chatPanel, /<WebDirectMessagePanel/, "community chat panel must render the right-side DM panel");
assert.match(chatPanel, /setDirectMessagePanel\(null\)/, "DM panel must close without route changes");
assert.doesNotMatch(chatPanel, /follow|follower|following/i, "DM UI slice must not add follow controls");

assert.match(profilePanel, /onMessage\?: \(\) => void \| Promise<void>/, "right profile card must expose a message action");
assert.match(profilePanel, /disabled=\{isSelfProfile \|\| isMessageDisabled \|\| !onMessage\}/, "right profile message action must be disabled for self or unavailable contexts");
assert.match(messageRow, /onMessageSender\?: \(userId: string\) => void \| Promise<void>/, "hover profile card must expose a message action");
assert.match(messageRow, /disabled=\{!canMessageSender\}/, "hover profile message action must be disabled until DM context is available");

assert.match(dmPanel, /From \{communityName\}/, "DM panel must surface source community context");
assert.match(dmPanel, /participant_type === "user"/, "DM panel must resolve the human peer from participants");
assert.match(dmPanel, /Start a direct message from this shared community/, "empty DM state must explain the community-origin model");
assert.match(dmPanel, /DM_AUTO_SCROLL_THRESHOLD_PX/, "DM panel must keep chat-like auto-scroll constrained by a bottom threshold");
assert.match(dmPanel, /scrollMessagesToBottom/, "DM panel must scroll opened or followed conversations to the newest message");
assert.match(dmPanel, /onScroll=\{\(event\) =>/, "DM panel must track whether the viewer is reading older messages before auto-following");
assert.match(css, /\.community-dm-panel/, "DM panel must have glass side-panel styling");
assert.match(packageJson, /check:direct-messages-contract-proof/, "package scripts must expose the DM contract proof");

console.log("PASS: direct messages are community-origin, participant-based, and follow-free.");
