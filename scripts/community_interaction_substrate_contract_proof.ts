import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function assertIncludes(path: string, haystack: string, needle: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${path} missing required contract text: ${needle}`);
  }
}

function assertExcludes(path: string, haystack: string, needle: string): void {
  if (haystack.includes(needle)) {
    throw new Error(`${path} still contains deleted contract text: ${needle}`);
  }
}

const contractPath = "docs/community-interaction-substrate-contract-v1.md";
const contract = read(contractPath);
const schemaPath = "convex/schema.ts";
const schema = read(schemaPath);
const directoryPath = "convex/communityIntelligenceDirectory.ts";
const directory = read(directoryPath);

[
  "# Community Interaction Substrate Contract v1",
  "Community communication is not modeled as Slack, X, Telegram, or Skool.",
  "Slack, post, Telegram, and Skool are UI projections over the same substrate.",
  "No separate Slack backend. No separate post backend.",
  "### Delete UI-style Backends",
  "### Delete Recursive Drawers",
  "Threads are one drawer deep.",
  "### Delete Untyped Message Payloads",
  "`contentJson: v.any()` is migration compatibility only.",
  "### Delete All-Chat Memory",
  "Raw chat is not community intelligence.",
  "### Delete Hard Delete As Normal Moderation",
  "### Delete Accidental Workspace Sharing",
  "### Delete Synchronous Unfurls",
  "### Delete Human-Only Room Assumption",
  "### Delete Post-Versus-Chat Fork",
  "### `interactionRoots`",
  "### `interactionReplies`",
  "### `interactionContentBlocks`",
  "### `interactionAttachments`",
  "### `interactionEmbeds`",
  "### `interactionMentions`",
  "### `interactionReactions`",
  "### `interactionReadState`",
  "### `interactionModerationEvents`",
  "### `interactionSourceTraceBridge`",
  "The legacy community chat implementation is a migration adapter, not the final substrate.",
  "The active migration residue inventory lives in `docs/community-interaction-migration-residue-map.md`.",
  "`communityInteractionRoots`",
  "`communityInteractionReplies`",
  "`communityInteractionContentBlocks`",
  "`communityInteractionAttachments`",
  "`communityInteractionEmbeds`",
  "`communityInteractionMentions`",
  "`communityInteractionReactions`",
  "`communityInteractionModerationEvents`",
  "`communityInteractionLegacyChatLinks`",
  "`communityReadCursors`",
  "monotonic server-authorized",
  "Legacy",
  "there is no intermediate source-trace link table",
  "`interaction` as a product-owned",
  "`communitySourceTraces.sourceType`",
  "## Current Link Presentation Slice",
  "ordinary links render as authored blue links",
  "YouTube videos and explicit HTTPS PDF links",
  "community chat does not invoke an interaction-preview mode",
].forEach((needle) => assertIncludes(contractPath, contract, needle));

const corePath = "docs/core-contract.md";
const core = read(corePath);
assertIncludes(
  corePath,
  core,
  "Canonical community interaction substrate + canonical community UX.",
);
assertExcludes(corePath, core, "Canonical chat + canonical community UX.");
assertIncludes(corePath, core, "- Events.");
assertIncludes(
  corePath,
  core,
  "Member context in the community right rail; there is no standalone Members",
);
assertIncludes(
  corePath,
  core,
  "The member's private conversation under the selected community context uses",
);
assertIncludes(corePath, core, "the desktop Agent page and mobile Agent root.");
assertIncludes(corePath, core, "member interactions and autonomous community-agent authority remain separate.");
assertExcludes(corePath, core, "\n- Members\n");
assertExcludes(corePath, core, "\n- AI Agent\n");

function blockBetween(path: string, source: string, startToken: string, endToken: string): string {
  const start = source.indexOf(startToken);
  if (start < 0) {
    throw new Error(`${path} missing block start: ${startToken}`);
  }
  const end = source.indexOf(endToken, start + startToken.length);
  if (end < 0) {
    throw new Error(`${path} missing block end after ${startToken}: ${endToken}`);
  }
  return source.slice(start, end);
}

function schemaTable(tableName: string, nextTableName: string): string {
  return blockBetween(
    schemaPath,
    schema,
    `${tableName}: defineTable({`,
    `\n\n  ${nextTableName}: defineTable`,
  );
}

function exportedConstBlock(path: string, source: string, exportName: string): string {
  const startToken = `export const ${exportName}`;
  const start = source.indexOf(startToken);
  if (start < 0) {
    throw new Error(`${path} missing export: ${exportName}`);
  }
  const next = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, next < 0 ? source.length : next);
}

const rootTable = schemaTable("communityInteractionRoots", "communityInteractionReplies");
[
  "actorType: v.union(",
  'v.literal("human")',
  'v.literal("personal_agent")',
  'v.literal("community_agent")',
  'v.literal("system")',
  'v.literal("discussion")',
  'v.literal("announcement")',
  'v.literal("question")',
  'v.literal("resource_share")',
  'v.literal("agent_signal")',
  "replyCount: v.number()",
  "reactionSummary: v.array(v.object({",
  "idempotencyKey: v.string()",
  '.index("by_community_status_createdAt", ["communityId", "status", "createdAt"])',
  '.index("by_community_kind_status_createdAt", ["communityId", "kind", "status", "createdAt"])',
  '.index("by_community_idempotencyKey", ["communityId", "idempotencyKey"])',
].forEach((needle) => assertIncludes(schemaPath, rootTable, needle));

const replyTable = schemaTable("communityInteractionReplies", "communityInteractionAttachments");
[
  'rootId: v.id("communityInteractionRoots")',
  "seq: v.number()",
  'targetReplyId: v.optional(v.id("communityInteractionReplies"))',
  "idempotencyKey: v.string()",
  '.index("by_root_seq", ["rootId", "seq"])',
  '.index("by_root_status_createdAt", ["rootId", "status", "createdAt"])',
  '.index("by_community_idempotencyKey", ["communityId", "idempotencyKey"])',
].forEach((needle) => assertIncludes(schemaPath, replyTable, needle));
assertExcludes(schemaPath, replyTable, "parentReplyId");
assertExcludes(schemaPath, replyTable, "replyId: v.id(\"communityInteractionReplies\")");

const attachmentsTable = schemaTable("communityInteractionAttachments", "communityInteractionEmbeds");
[
  'attachmentKind: v.union(v.literal("image"), v.literal("video"), v.literal("file"))',
  'storageId: v.optional(v.id("_storage"))',
  "createdByActorType: v.union(",
  '.index("by_storage", ["storageId"])',
  '.index("by_contentHash", ["contentHash"])',
].forEach((needle) => assertIncludes(schemaPath, attachmentsTable, needle));

const embedsTable = schemaTable("communityInteractionEmbeds", "communityInteractionContentBlocks");
[
  'embedKind: v.union(v.literal("link"), v.literal("workspace_ref"))',
  'v.literal("pending")',
  'v.literal("ready")',
  'v.literal("unavailable")',
  'v.literal("redacted")',
  "normalizedSourceUrl: v.optional(v.string())",
  "workspaceRefKind: v.optional(",
  "providerPostId: v.optional(v.string())",
  "publishedAt: v.optional(v.number())",
  "postContext: v.optional(",
  "nextRefreshAt: v.optional(v.number())",
  "refreshFailureCount: v.optional(v.number())",
  '.index("by_provider_status_nextRefreshAt", ["provider", "status", "nextRefreshAt"])',
  '.index("by_community_normalizedSourceUrl", ["communityId", "normalizedSourceUrl"])',
  '.index("by_community_workspaceRef", ["communityId", "workspaceRefKind", "workspaceRefId"])',
].forEach((needle) => assertIncludes(schemaPath, embedsTable, needle));
assertExcludes(schemaPath, embedsTable, "payloadJson");
assertExcludes(schemaPath, embedsTable, "v.any()");

const contentTable = schemaTable("communityInteractionContentBlocks", "communityInteractionMentions");
[
  'v.literal("markdown_text")',
  'v.literal("image")',
  'v.literal("video")',
  'v.literal("file")',
  'v.literal("link")',
  'v.literal("workspace_ref")',
  'v.literal("mention")',
  'attachmentId: v.optional(v.id("communityInteractionAttachments"))',
  'embedId: v.optional(v.id("communityInteractionEmbeds"))',
  '.index("by_root_order", ["rootId", "blockOrder"])',
  '.index("by_reply_order", ["replyId", "blockOrder"])',
].forEach((needle) => assertIncludes(schemaPath, contentTable, needle));
assertExcludes(schemaPath, contentTable, "payloadJson");
assertExcludes(schemaPath, contentTable, "contentJson");
assertExcludes(schemaPath, contentTable, "v.any()");

const mentionsTable = schemaTable("communityInteractionMentions", "communityInteractionReactions");
[
  'v.literal("user")',
  'v.literal("community_agent")',
  'v.literal("role")',
  "notifyState: v.union(",
  '.index("by_mentionedUser_createdAt", ["mentionedUserId", "createdAt"])',
  '.index("by_mentionedAgent_createdAt", ["mentionedAgentKey", "createdAt"])',
  '.index("by_mentionedRole_createdAt", ["mentionedRoleKey", "createdAt"])',
].forEach((needle) => assertIncludes(schemaPath, mentionsTable, needle));
assertExcludes(schemaPath, mentionsTable, 'v.literal("personal_agent")');

const reactionsTable = schemaTable("communityInteractionReactions", "communityInteractionModerationEvents");
[
  'targetType: v.union(v.literal("root"), v.literal("reply"))',
  "actorKey: v.string()",
  "emoji: v.string()",
  '.index("by_root_actor_emoji", ["rootId", "actorKey", "emoji"])',
  '.index("by_reply_actor_emoji", ["replyId", "actorKey", "emoji"])',
].forEach((needle) => assertIncludes(schemaPath, reactionsTable, needle));

const moderationTable = schemaTable("communityInteractionModerationEvents", "communityInteractionLegacyChatLinks");
[
  'v.literal("tombstone")',
  'v.literal("privacy_purge_requested")',
  'v.literal("privacy_purged")',
  "previousStatus: v.optional(",
  "nextStatus: v.optional(",
  '.index("by_community_idempotencyKey", ["communityId", "idempotencyKey"])',
].forEach((needle) => assertIncludes(schemaPath, moderationTable, needle));
assertExcludes(schemaPath, moderationTable, "delete: v.literal");

assertExcludes(schemaPath, schema, "communityInteractionReadStates: defineTable");
assertExcludes(schemaPath, schema, "communityInteractionSourceTraceLinks: defineTable");

const legacyChatLinkTable = schemaTable("communityInteractionLegacyChatLinks", "dmConversations");
[
  'threadId: v.id("communityChatThreads")',
  'messageId: v.id("communityChatMessages")',
  'targetMessageId: v.optional(v.id("communityChatMessages"))',
  'linkKind: v.union(v.literal("root"), v.literal("reply"))',
  'rootId: v.optional(v.id("communityInteractionRoots"))',
  'replyId: v.optional(v.id("communityInteractionReplies"))',
  '.index("by_message", ["messageId"])',
  '.index("by_thread_message", ["threadId", "messageId"])',
  '.index("by_root", ["rootId"])',
  '.index("by_reply", ["replyId"])',
].forEach((needle) => assertIncludes(schemaPath, legacyChatLinkTable, needle));

const sourceTraceTable = schemaTable("communitySourceTraces", "communityIntelligenceNodes");
assertIncludes(schemaPath, sourceTraceTable, 'v.literal("interaction")');
assertIncludes(
  directoryPath,
  directory,
  '| "interaction"',
);
assertExcludes(directoryPath, directory, "export const recordCommunitySourceTrace = mutation");

console.log("community_interaction_substrate_contract_proof: ok");
