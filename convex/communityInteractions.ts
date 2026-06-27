import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
  normalizeIdValue,
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { requireProfileSetupCompleteForUser } from "./accountSetupCore";

type InteractionActorType = "human" | "personal_agent" | "community_agent" | "system";
type InteractionRootKind = "discussion" | "announcement" | "question" | "resource_share" | "agent_signal";
type InteractionStatus = "live" | "hidden" | "deleted";
type InteractionVisibilityScope = "private" | "admin" | "community" | "public";
type InteractionBlockType = "markdown_text" | "link" | "workspace_ref" | "mention";
type WorkspaceRefKind = "thread" | "project" | "file" | "artifact" | "run" | "resource";
type MentionKind = "user" | "personal_agent" | "community_agent" | "role";

type InteractionRootRow = {
  _id: any;
  communityId: any;
  actorType: InteractionActorType;
  actorUserId?: any;
  actorAgentKey?: string;
  kind: InteractionRootKind;
  status: InteractionStatus;
  visibilityScope: InteractionVisibilityScope;
  title?: string;
  contentSummary: string;
  replyCount: number;
  reactionSummary: Array<{ emoji: string; count: number }>;
  idempotencyKey: string;
  lastReplyAt?: number;
  pinnedAt?: number;
  lockedAt?: number;
  hiddenAt?: number;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type InteractionReplyRow = {
  _id: any;
  communityId: any;
  rootId: any;
  seq: number;
  actorType: InteractionActorType;
  actorUserId?: any;
  actorAgentKey?: string;
  targetReplyId?: any;
  status: InteractionStatus;
  visibilityScope: InteractionVisibilityScope;
  contentSummary: string;
  reactionSummary: Array<{ emoji: string; count: number }>;
  idempotencyKey: string;
  hiddenAt?: number;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type ContentBlockRow = {
  _id: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  blockOrder: number;
  blockType: string;
  text?: string;
  url?: string;
  attachmentId?: any;
  embedId?: any;
  workspaceRefKind?: WorkspaceRefKind;
  workspaceRefId?: string;
  mentionKind?: MentionKind;
  mentionedUserId?: any;
  mentionedAgentKey?: string;
  mentionedRoleKey?: string;
  createdAt: number;
  updatedAt: number;
};

type EmbedRow = {
  _id: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  embedKind: "link" | "workspace_ref";
  status: "pending" | "ready" | "failed" | "redacted";
  visibilityScope: InteractionVisibilityScope;
  sourceUrl?: string;
  normalizedSourceUrl?: string;
  workspaceRefKind?: WorkspaceRefKind;
  workspaceRefId?: string;
  provider?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  videoUrl?: string;
  fetchedAt?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

type MentionRow = {
  _id: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  mentionKind: MentionKind;
  mentionedUserId?: any;
  mentionedAgentKey?: string;
  mentionedRoleKey?: string;
  notifyState: "pending" | "sent" | "suppressed" | "read";
  createdAt: number;
  updatedAt: number;
};

type LegacyChatLinkRow = {
  _id: any;
  communityId: any;
  threadId: any;
  messageId: any;
  targetMessageId?: any;
  linkKind: "root" | "reply";
  rootId?: any;
  replyId?: any;
  createdAt: number;
  updatedAt: number;
};

type NormalizedContentBlock =
  | {
      blockType: "markdown_text";
      text: string;
    }
  | {
      blockType: "link";
      url: string;
      normalizedSourceUrl: string;
      text?: string;
    }
  | {
      blockType: "workspace_ref";
      workspaceRefKind: WorkspaceRefKind;
      workspaceRefId: string;
      text?: string;
    }
  | {
      blockType: "mention";
      mentionKind: MentionKind;
      mentionedUserId?: any;
      mentionedAgentKey?: string;
      mentionedRoleKey?: string;
      text?: string;
    };

const MAX_INTERACTION_BLOCKS_PER_WRITE = 24;
const MAX_INTERACTION_TEXT_CHARS = 8000;
const MAX_INTERACTION_SUMMARY_CHARS = 500;
const MAX_INTERACTION_TITLE_CHARS = 180;
const MAX_INTERACTION_IDEMPOTENCY_KEY_CHARS = 160;
const MAX_INTERACTION_URL_CHARS = 2048;
const MAX_WORKSPACE_REF_ID_CHARS = 512;
const MAX_MENTION_KEY_CHARS = 160;
const MAX_INTERACTION_ROOT_READ_LIMIT = 50;
const MAX_INTERACTION_REPLY_READ_LIMIT = 100;
const MAX_INTERACTION_EMBEDS_PER_BUNDLE = 24;
const MAX_INTERACTION_MENTIONS_PER_BUNDLE = 24;

const visibilityScopeValidator = v.union(
  v.literal("private"),
  v.literal("admin"),
  v.literal("community"),
  v.literal("public"),
);

const rootKindValidator = v.union(
  v.literal("discussion"),
  v.literal("announcement"),
  v.literal("question"),
  v.literal("resource_share"),
  v.literal("agent_signal"),
);

const workspaceRefKindValidator = v.union(
  v.literal("thread"),
  v.literal("project"),
  v.literal("file"),
  v.literal("artifact"),
  v.literal("run"),
  v.literal("resource"),
);

const mentionKindValidator = v.union(
  v.literal("user"),
  v.literal("personal_agent"),
  v.literal("community_agent"),
  v.literal("role"),
);

const contentBlockInputValidator = v.union(
  v.object({
    blockType: v.literal("markdown_text"),
    text: v.string(),
  }),
  v.object({
    blockType: v.literal("link"),
    url: v.string(),
    text: v.optional(v.string()),
  }),
  v.object({
    blockType: v.literal("workspace_ref"),
    workspaceRefKind: workspaceRefKindValidator,
    workspaceRefId: v.string(),
    text: v.optional(v.string()),
  }),
  v.object({
    blockType: v.literal("mention"),
    mentionKind: mentionKindValidator,
    mentionedUserId: v.optional(v.id("users")),
    mentionedAgentKey: v.optional(v.string()),
    mentionedRoleKey: v.optional(v.string()),
    text: v.optional(v.string()),
  }),
);

function normalizeBoundedText(raw: unknown, maxLength: number): string {
  return String(raw ?? "").trim().slice(0, maxLength);
}

function normalizeOptionalBoundedText(raw: unknown, maxLength: number): string | undefined {
  const text = normalizeBoundedText(raw, maxLength);
  return text || undefined;
}

function normalizeIdempotencyKey(raw: unknown): string {
  const key = normalizeBoundedText(raw, MAX_INTERACTION_IDEMPOTENCY_KEY_CHARS);
  if (!key) throw new Error("interaction_idempotency_key_required");
  return key;
}

function normalizeReadLimit(raw: unknown, maxLimit: number, defaultLimit: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return defaultLimit;
  return Math.max(1, Math.min(maxLimit, Math.floor(parsed)));
}

function normalizeBeforeNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

function legacyChatIdempotencyKey(messageId: any, kind: "root" | "reply"): string {
  return `legacy_chat_message:${normalizeIdValue(messageId)}:${kind}`;
}

function extractLegacyChatMessageText(message: CommunityChatMessageLike): string {
  const contentJson = message.contentJson;
  let text = "";
  let attachments: unknown[] = [];
  if (typeof contentJson === "string") {
    text = contentJson.trim();
  } else if (contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)) {
    const record = contentJson as Record<string, unknown>;
    text = String(record.text ?? record.body ?? "").trim();
    attachments = Array.isArray(record.attachments) ? record.attachments : [];
  }
  const attachmentNames = attachments
    .map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
      const record = raw as Record<string, unknown>;
      return String(record.name ?? "").trim();
    })
    .filter(Boolean)
    .slice(0, 8);
  if (attachmentNames.length > 0) {
    const attachmentSummary =
      attachmentNames.length === 1
        ? `Shared attachment: ${attachmentNames[0]}`
        : `Shared attachments: ${attachmentNames.join(", ")}`;
    text = text ? `${text}\n\n${attachmentSummary}` : attachmentSummary;
  }
  return normalizeBoundedText(text || "Legacy chat message", MAX_INTERACTION_TEXT_CHARS);
}

function legacyChatContentBlocks(message: CommunityChatMessageLike): NormalizedContentBlock[] {
  return [{ blockType: "markdown_text", text: extractLegacyChatMessageText(message) }];
}

function normalizeUrl(raw: unknown): { sourceUrl: string; normalizedSourceUrl: string } {
  const input = normalizeBoundedText(raw, MAX_INTERACTION_URL_CHARS);
  if (!input) throw new Error("interaction_link_url_required");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("interaction_link_url_invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("interaction_link_url_invalid");
  }
  url.hash = "";
  return {
    sourceUrl: input,
    normalizedSourceUrl: url.toString().slice(0, MAX_INTERACTION_URL_CHARS),
  };
}

function normalizeWorkspaceRefId(raw: unknown): string {
  const id = normalizeBoundedText(raw, MAX_WORKSPACE_REF_ID_CHARS);
  if (!id) throw new Error("interaction_workspace_ref_id_required");
  return id;
}

function normalizeMentionKey(raw: unknown): string | undefined {
  return normalizeOptionalBoundedText(raw, MAX_MENTION_KEY_CHARS);
}

function normalizeContentBlocks(rawBlocks: unknown[]): NormalizedContentBlock[] {
  const out: NormalizedContentBlock[] = [];
  for (const raw of rawBlocks.slice(0, MAX_INTERACTION_BLOCKS_PER_WRITE)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const block = raw as Record<string, unknown>;
    const blockType = block.blockType;
    if (blockType === "markdown_text") {
      const text = normalizeBoundedText(block.text, MAX_INTERACTION_TEXT_CHARS);
      if (text) out.push({ blockType, text });
      continue;
    }
    if (blockType === "link") {
      const { sourceUrl, normalizedSourceUrl } = normalizeUrl(block.url);
      out.push({
        blockType,
        url: sourceUrl,
        normalizedSourceUrl,
        text: normalizeOptionalBoundedText(block.text, MAX_INTERACTION_TEXT_CHARS),
      });
      continue;
    }
    if (blockType === "workspace_ref") {
      const workspaceRefKind = block.workspaceRefKind as WorkspaceRefKind;
      out.push({
        blockType,
        workspaceRefKind,
        workspaceRefId: normalizeWorkspaceRefId(block.workspaceRefId),
        text: normalizeOptionalBoundedText(block.text, MAX_INTERACTION_TEXT_CHARS),
      });
      continue;
    }
    if (blockType === "mention") {
      const mentionKind = block.mentionKind as MentionKind;
      const mentionedAgentKey = normalizeMentionKey(block.mentionedAgentKey);
      const mentionedRoleKey = normalizeMentionKey(block.mentionedRoleKey);
      if (mentionKind === "user" && !block.mentionedUserId) {
        throw new Error("interaction_mention_user_required");
      }
      if ((mentionKind === "personal_agent" || mentionKind === "community_agent") && !mentionedAgentKey) {
        throw new Error("interaction_mention_agent_required");
      }
      if (mentionKind === "role" && !mentionedRoleKey) {
        throw new Error("interaction_mention_role_required");
      }
      out.push({
        blockType,
        mentionKind,
        ...(block.mentionedUserId ? { mentionedUserId: block.mentionedUserId } : {}),
        ...(mentionedAgentKey ? { mentionedAgentKey } : {}),
        ...(mentionedRoleKey ? { mentionedRoleKey } : {}),
        text: normalizeOptionalBoundedText(block.text, MAX_INTERACTION_TEXT_CHARS),
      });
    }
  }
  if (out.length === 0) throw new Error("interaction_content_required");
  return out;
}

function contentSummary(blocks: NormalizedContentBlock[]): string {
  const parts = blocks.map((block) => {
    if (block.blockType === "markdown_text") return block.text;
    if (block.blockType === "link") return block.text ?? block.normalizedSourceUrl;
    if (block.blockType === "workspace_ref") return block.text ?? `${block.workspaceRefKind}:${block.workspaceRefId}`;
    if (block.blockType === "mention") return block.text ?? `@${block.mentionedRoleKey ?? block.mentionedAgentKey ?? "member"}`;
    return "";
  });
  const summary = parts.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_INTERACTION_SUMMARY_CHARS);
  if (!summary) throw new Error("interaction_content_required");
  return summary;
}

function visibilityRank(scope: InteractionVisibilityScope): number {
  if (scope === "private") return 0;
  if (scope === "admin") return 1;
  if (scope === "community") return 2;
  return 3;
}

function resolveReplyVisibilityScope(
  requested: InteractionVisibilityScope | undefined,
  rootScope: InteractionVisibilityScope,
): InteractionVisibilityScope {
  const next = requested ?? rootScope;
  if (visibilityRank(next) > visibilityRank(rootScope)) {
    throw new Error("interaction_reply_visibility_exceeds_root");
  }
  return next;
}

async function getExistingRootByIdempotencyKey(ctx: any, communityId: any, idempotencyKey: string) {
  return (await ctx.db
    .query("communityInteractionRoots" as any)
    .withIndex("by_community_idempotencyKey", (q: any) =>
      q.eq("communityId", communityId).eq("idempotencyKey", idempotencyKey),
    )
    .first()) as InteractionRootRow | null;
}

async function getExistingReplyByIdempotencyKey(ctx: any, communityId: any, idempotencyKey: string) {
  return (await ctx.db
    .query("communityInteractionReplies" as any)
    .withIndex("by_community_idempotencyKey", (q: any) =>
      q.eq("communityId", communityId).eq("idempotencyKey", idempotencyKey),
    )
    .first()) as InteractionReplyRow | null;
}

async function getLegacyChatLinkByMessage(ctx: any, messageId: any): Promise<LegacyChatLinkRow | null> {
  return (await ctx.db
    .query("communityInteractionLegacyChatLinks" as any)
    .withIndex("by_message", (q: any) => q.eq("messageId", messageId))
    .first()) as LegacyChatLinkRow | null;
}

async function getLegacyChatLinkByRoot(ctx: any, rootId: any): Promise<LegacyChatLinkRow | null> {
  return (await ctx.db
    .query("communityInteractionLegacyChatLinks" as any)
    .withIndex("by_root", (q: any) => q.eq("rootId", rootId))
    .first()) as LegacyChatLinkRow | null;
}

async function getLegacyChatLinkByReply(ctx: any, replyId: any): Promise<LegacyChatLinkRow | null> {
  return (await ctx.db
    .query("communityInteractionLegacyChatLinks" as any)
    .withIndex("by_reply", (q: any) => q.eq("replyId", replyId))
    .first()) as LegacyChatLinkRow | null;
}

async function insertLegacyChatLinkIfMissing(args: {
  ctx: any;
  communityId: any;
  threadId: any;
  messageId: any;
  targetMessageId?: any;
  linkKind: "root" | "reply";
  rootId?: any;
  replyId?: any;
  nowMs: number;
}): Promise<LegacyChatLinkRow> {
  const existing = await getLegacyChatLinkByMessage(args.ctx, args.messageId);
  if (existing) {
    if (
      existing.linkKind !== args.linkKind ||
      (args.rootId && normalizeIdValue(existing.rootId) !== normalizeIdValue(args.rootId)) ||
      (args.replyId && normalizeIdValue(existing.replyId) !== normalizeIdValue(args.replyId)) ||
      (args.targetMessageId && normalizeIdValue(existing.targetMessageId) !== normalizeIdValue(args.targetMessageId))
    ) {
      throw new Error("legacy_chat_interaction_link_conflict");
    }
    return existing;
  }
  const linkId = await args.ctx.db.insert("communityInteractionLegacyChatLinks" as any, {
    communityId: args.communityId,
    threadId: args.threadId,
    messageId: args.messageId,
    ...(args.targetMessageId ? { targetMessageId: args.targetMessageId } : {}),
    linkKind: args.linkKind,
    ...(args.rootId ? { rootId: args.rootId } : {}),
    ...(args.replyId ? { replyId: args.replyId } : {}),
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = (await args.ctx.db.get(linkId as any)) as LegacyChatLinkRow | null;
  if (!created) throw new Error("legacy_chat_interaction_link_create_failed");
  return created;
}

async function listContentBlocksForRoot(ctx: any, rootId: any): Promise<ContentBlockRow[]> {
  return (await ctx.db
    .query("communityInteractionContentBlocks" as any)
    .withIndex("by_root_order", (q: any) => q.eq("rootId", rootId))
    .take(MAX_INTERACTION_BLOCKS_PER_WRITE)) as ContentBlockRow[];
}

async function listContentBlocksForReply(ctx: any, replyId: any): Promise<ContentBlockRow[]> {
  return (await ctx.db
    .query("communityInteractionContentBlocks" as any)
    .withIndex("by_reply_order", (q: any) => q.eq("replyId", replyId))
    .take(MAX_INTERACTION_BLOCKS_PER_WRITE)) as ContentBlockRow[];
}

async function listEmbedsForRoot(ctx: any, rootId: any): Promise<EmbedRow[]> {
  return (await ctx.db
    .query("communityInteractionEmbeds" as any)
    .withIndex("by_root", (q: any) => q.eq("rootId", rootId))
    .take(MAX_INTERACTION_EMBEDS_PER_BUNDLE)) as EmbedRow[];
}

async function listEmbedsForReply(ctx: any, replyId: any): Promise<EmbedRow[]> {
  return (await ctx.db
    .query("communityInteractionEmbeds" as any)
    .withIndex("by_reply", (q: any) => q.eq("replyId", replyId))
    .take(MAX_INTERACTION_EMBEDS_PER_BUNDLE)) as EmbedRow[];
}

async function listMentionsForRoot(ctx: any, rootId: any): Promise<MentionRow[]> {
  return (await ctx.db
    .query("communityInteractionMentions" as any)
    .withIndex("by_root", (q: any) => q.eq("rootId", rootId))
    .take(MAX_INTERACTION_MENTIONS_PER_BUNDLE)) as MentionRow[];
}

async function listMentionsForReply(ctx: any, replyId: any): Promise<MentionRow[]> {
  return (await ctx.db
    .query("communityInteractionMentions" as any)
    .withIndex("by_reply", (q: any) => q.eq("replyId", replyId))
    .take(MAX_INTERACTION_MENTIONS_PER_BUNDLE)) as MentionRow[];
}

function mapReactionSummary(rows: Array<{ emoji: string; count: number }> | undefined) {
  return Array.isArray(rows)
    ? rows
        .map((row) => ({
          emoji: String(row.emoji ?? "").trim().slice(0, 32),
          count: Math.max(0, Math.floor(Number(row.count) || 0)),
        }))
        .filter((row) => row.emoji && row.count > 0)
    : [];
}

function mapContentBlock(row: ContentBlockRow) {
  return {
    id: normalizeIdValue(row._id),
    block_order: Math.max(0, Math.floor(row.blockOrder ?? 0)),
    block_type: row.blockType,
    text: row.text ?? null,
    url: row.url ?? null,
    attachment_id: row.attachmentId ? normalizeIdValue(row.attachmentId) : null,
    embed_id: row.embedId ? normalizeIdValue(row.embedId) : null,
    workspace_ref_kind: row.workspaceRefKind ?? null,
    workspace_ref_id: row.workspaceRefId ?? null,
    mention_kind: row.mentionKind ?? null,
    mentioned_user_id: row.mentionedUserId ? normalizeIdValue(row.mentionedUserId) : null,
    mentioned_agent_key: row.mentionedAgentKey ?? null,
    mentioned_role_key: row.mentionedRoleKey ?? null,
  };
}

function mapEmbed(row: EmbedRow) {
  return {
    id: normalizeIdValue(row._id),
    embed_kind: row.embedKind,
    status: row.status,
    visibility_scope: row.visibilityScope,
    source_url: row.sourceUrl ?? null,
    normalized_source_url: row.normalizedSourceUrl ?? null,
    workspace_ref_kind: row.workspaceRefKind ?? null,
    workspace_ref_id: row.workspaceRefId ?? null,
    provider: row.provider ?? null,
    title: row.title ?? null,
    description: row.description ?? null,
    image_url: row.imageUrl ?? null,
    video_url: row.videoUrl ?? null,
    fetched_at: typeof row.fetchedAt === "number" ? toIsoString(row.fetchedAt) : null,
    error: row.error ?? null,
  };
}

function mapMention(row: MentionRow) {
  return {
    id: normalizeIdValue(row._id),
    mention_kind: row.mentionKind,
    mentioned_user_id: row.mentionedUserId ? normalizeIdValue(row.mentionedUserId) : null,
    mentioned_agent_key: row.mentionedAgentKey ?? null,
    mentioned_role_key: row.mentionedRoleKey ?? null,
    notify_state: row.notifyState,
  };
}

async function mapRootBundle(ctx: any, root: InteractionRootRow, deduped: boolean) {
  const blocks = await listContentBlocksForRoot(ctx, root._id);
  const embeds = await listEmbedsForRoot(ctx, root._id);
  const mentions = await listMentionsForRoot(ctx, root._id);
  const legacyLink = await getLegacyChatLinkByRoot(ctx, root._id);
  return {
    deduped,
    root: {
      id: normalizeIdValue(root._id),
      community_id: normalizeIdValue(root.communityId),
      actor_type: root.actorType,
      actor_user_id: root.actorUserId ? normalizeIdValue(root.actorUserId) : null,
      actor_agent_key: root.actorAgentKey ?? null,
      kind: root.kind,
      status: root.status,
      visibility_scope: root.visibilityScope,
      title: root.title ?? null,
      content_summary: root.contentSummary,
      reply_count: Math.max(0, Math.floor(root.replyCount ?? 0)),
      reaction_summary: mapReactionSummary(root.reactionSummary),
      idempotency_key: root.idempotencyKey,
      last_reply_at: typeof root.lastReplyAt === "number" ? toIsoString(root.lastReplyAt) : null,
      pinned_at: typeof root.pinnedAt === "number" ? toIsoString(root.pinnedAt) : null,
      locked_at: typeof root.lockedAt === "number" ? toIsoString(root.lockedAt) : null,
      legacy_thread_id: legacyLink?.threadId ? normalizeIdValue(legacyLink.threadId) : null,
      legacy_message_id: legacyLink?.messageId ? normalizeIdValue(legacyLink.messageId) : null,
      created_at: toIsoString(root.createdAt),
      updated_at: toIsoString(root.updatedAt),
    },
    content_blocks: blocks.map(mapContentBlock),
    embeds: embeds.map(mapEmbed),
    mentions: mentions.map(mapMention),
  };
}

async function mapReplyBundle(ctx: any, reply: InteractionReplyRow, deduped: boolean) {
  const blocks = await listContentBlocksForReply(ctx, reply._id);
  const embeds = await listEmbedsForReply(ctx, reply._id);
  const mentions = await listMentionsForReply(ctx, reply._id);
  const legacyLink = await getLegacyChatLinkByReply(ctx, reply._id);
  return {
    deduped,
    reply: {
      id: normalizeIdValue(reply._id),
      community_id: normalizeIdValue(reply.communityId),
      root_id: normalizeIdValue(reply.rootId),
      seq: Math.max(0, Math.floor(reply.seq ?? 0)),
      actor_type: reply.actorType,
      actor_user_id: reply.actorUserId ? normalizeIdValue(reply.actorUserId) : null,
      actor_agent_key: reply.actorAgentKey ?? null,
      target_reply_id: reply.targetReplyId ? normalizeIdValue(reply.targetReplyId) : null,
      status: reply.status,
      visibility_scope: reply.visibilityScope,
      content_summary: reply.contentSummary,
      reaction_summary: mapReactionSummary(reply.reactionSummary),
      idempotency_key: reply.idempotencyKey,
      legacy_thread_id: legacyLink?.threadId ? normalizeIdValue(legacyLink.threadId) : null,
      legacy_message_id: legacyLink?.messageId ? normalizeIdValue(legacyLink.messageId) : null,
      legacy_target_message_id: legacyLink?.targetMessageId ? normalizeIdValue(legacyLink.targetMessageId) : null,
      created_at: toIsoString(reply.createdAt),
      updated_at: toIsoString(reply.updatedAt),
    },
    content_blocks: blocks.map(mapContentBlock),
    embeds: embeds.map(mapEmbed),
    mentions: mentions.map(mapMention),
  };
}

async function insertContentBlocksForTarget(args: {
  ctx: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  visibilityScope: InteractionVisibilityScope;
  blocks: NormalizedContentBlock[];
  nowMs: number;
}) {
  const contentBlockIds: string[] = [];
  const embedIds: string[] = [];
  const mentionIds: string[] = [];
  if (Boolean(args.rootId) === Boolean(args.replyId)) {
    throw new Error("interaction_content_target_required");
  }
  for (let index = 0; index < args.blocks.length; index += 1) {
    const block = args.blocks[index]!;
    let embedId: any | undefined;
    if (block.blockType === "link") {
      embedId = await args.ctx.db.insert("communityInteractionEmbeds" as any, {
        communityId: args.communityId,
        ...(args.rootId ? { rootId: args.rootId } : {}),
        ...(args.replyId ? { replyId: args.replyId } : {}),
        embedKind: "link",
        status: "pending",
        visibilityScope: args.visibilityScope,
        sourceUrl: block.url,
        normalizedSourceUrl: block.normalizedSourceUrl,
        createdAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      embedIds.push(normalizeIdValue(embedId));
    }
    if (block.blockType === "workspace_ref") {
      embedId = await args.ctx.db.insert("communityInteractionEmbeds" as any, {
        communityId: args.communityId,
        ...(args.rootId ? { rootId: args.rootId } : {}),
        ...(args.replyId ? { replyId: args.replyId } : {}),
        embedKind: "workspace_ref",
        status: "pending",
        visibilityScope: args.visibilityScope,
        workspaceRefKind: block.workspaceRefKind,
        workspaceRefId: block.workspaceRefId,
        createdAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      embedIds.push(normalizeIdValue(embedId));
    }
    if (block.blockType === "mention") {
      const mentionId = await args.ctx.db.insert("communityInteractionMentions" as any, {
        communityId: args.communityId,
        ...(args.rootId ? { rootId: args.rootId } : {}),
        ...(args.replyId ? { replyId: args.replyId } : {}),
        mentionKind: block.mentionKind,
        ...(block.mentionedUserId ? { mentionedUserId: block.mentionedUserId } : {}),
        ...(block.mentionedAgentKey ? { mentionedAgentKey: block.mentionedAgentKey } : {}),
        ...(block.mentionedRoleKey ? { mentionedRoleKey: block.mentionedRoleKey } : {}),
        notifyState: "pending",
        createdAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      mentionIds.push(normalizeIdValue(mentionId));
    }

    const contentBlockId = await args.ctx.db.insert("communityInteractionContentBlocks" as any, {
      communityId: args.communityId,
      ...(args.rootId ? { rootId: args.rootId } : {}),
      ...(args.replyId ? { replyId: args.replyId } : {}),
      blockOrder: index,
      blockType: block.blockType,
      ...("text" in block && block.text ? { text: block.text } : {}),
      ...(block.blockType === "link" ? { url: block.url } : {}),
      ...(embedId ? { embedId } : {}),
      ...(block.blockType === "workspace_ref"
        ? { workspaceRefKind: block.workspaceRefKind, workspaceRefId: block.workspaceRefId }
        : {}),
      ...(block.blockType === "mention"
        ? {
            mentionKind: block.mentionKind,
            ...(block.mentionedUserId ? { mentionedUserId: block.mentionedUserId } : {}),
            ...(block.mentionedAgentKey ? { mentionedAgentKey: block.mentionedAgentKey } : {}),
            ...(block.mentionedRoleKey ? { mentionedRoleKey: block.mentionedRoleKey } : {}),
          }
        : {}),
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    contentBlockIds.push(normalizeIdValue(contentBlockId));
  }
  return { contentBlockIds, embedIds, mentionIds };
}

export type LegacyChatRootInteractionPlan =
  | {
      planKind: "existing_root";
      root: InteractionRootRow;
      communityId: any;
      threadId: any;
      messageId: any;
      nowMs: number;
      needsLegacyLink: boolean;
    }
  | {
      planKind: "create_root";
      communityId: any;
      threadId: any;
      messageId: any;
      actorUserId?: any;
      idempotencyKey: string;
      contentBlocks: NormalizedContentBlock[];
      summary: string;
      createdAt: number;
      updatedAt: number;
      nowMs: number;
    };

export type LegacyChatReplyInteractionPlan =
  | {
      planKind: "existing_reply";
      root: InteractionRootRow;
      reply: InteractionReplyRow;
      communityId: any;
      threadId: any;
      messageId: any;
      targetMessageId: any;
      nowMs: number;
      needsLegacyLink: boolean;
    }
  | {
      planKind: "create_reply";
      root: InteractionRootRow;
      communityId: any;
      threadId: any;
      messageId: any;
      targetMessageId: any;
      actorUserId?: any;
      targetReplyId?: any;
      idempotencyKey: string;
      contentBlocks: NormalizedContentBlock[];
      visibilityScope: InteractionVisibilityScope;
      summary: string;
      seq: number;
      createdAt: number;
      updatedAt: number;
      nowMs: number;
    };

export async function planInteractionRootFromLegacyChatMessageCore(args: {
  ctx: any;
  thread: CommunityChatThreadLike;
  message: CommunityChatMessageLike;
  nowMs?: number;
}): Promise<LegacyChatRootInteractionPlan> {
  if (normalizeIdValue(args.message.threadId) !== normalizeIdValue(args.thread._id)) {
    throw new Error("legacy_chat_interaction_thread_mismatch");
  }
  if (args.message.replyToMessageId) {
    throw new Error("legacy_chat_interaction_root_cannot_target_message");
  }

  const nowMs = args.nowMs ?? Date.now();
  const existingLink = await getLegacyChatLinkByMessage(args.ctx, args.message._id);
  if (existingLink) {
    if (existingLink.linkKind !== "root" || !existingLink.rootId) {
      throw new Error("legacy_chat_interaction_link_conflict");
    }
    const linkedRoot = (await args.ctx.db.get(existingLink.rootId as any)) as InteractionRootRow | null;
    if (!linkedRoot) throw new Error("legacy_chat_interaction_link_target_missing");
    if (normalizeIdValue(linkedRoot.communityId) !== normalizeIdValue(args.thread.communityId)) {
      throw new Error("legacy_chat_interaction_link_target_invalid");
    }
    return {
      planKind: "existing_root",
      root: linkedRoot,
      communityId: args.thread.communityId,
      threadId: args.thread._id,
      messageId: args.message._id,
      nowMs,
      needsLegacyLink: false,
    };
  }

  const idempotencyKey = legacyChatIdempotencyKey(args.message._id, "root");
  const existingRoot = await getExistingRootByIdempotencyKey(args.ctx, args.thread.communityId, idempotencyKey);
  if (existingRoot) {
    return {
      planKind: "existing_root",
      root: existingRoot,
      communityId: args.thread.communityId,
      threadId: args.thread._id,
      messageId: args.message._id,
      nowMs,
      needsLegacyLink: true,
    };
  }

  const contentBlocks = legacyChatContentBlocks(args.message);
  const createdAt = Math.max(0, Math.floor(Number(args.message.createdAt) || nowMs));
  const updatedAt = Math.max(0, Math.floor(Number(args.message.updatedAt) || nowMs));
  return {
    planKind: "create_root",
    communityId: args.thread.communityId,
    threadId: args.thread._id,
    messageId: args.message._id,
    ...(args.message.senderUserId ? { actorUserId: args.message.senderUserId } : {}),
    idempotencyKey,
    contentBlocks,
    summary: contentSummary(contentBlocks),
    createdAt,
    updatedAt,
    nowMs,
  };
}

export async function materializeLegacyChatRootInteractionPlan(ctx: any, plan: LegacyChatRootInteractionPlan) {
  if (plan.planKind === "existing_root") {
    if (plan.needsLegacyLink) {
      await insertLegacyChatLinkIfMissing({
        ctx,
        communityId: plan.communityId,
        threadId: plan.threadId,
        messageId: plan.messageId,
        linkKind: "root",
        rootId: plan.root._id,
        nowMs: plan.nowMs,
      });
    }
    return await mapRootBundle(ctx, plan.root, true);
  }

  const rootId = await ctx.db.insert("communityInteractionRoots" as any, {
    communityId: plan.communityId,
    actorType: "human",
    ...(plan.actorUserId ? { actorUserId: plan.actorUserId } : {}),
    kind: "discussion",
    status: "live",
    visibilityScope: "community",
    contentSummary: plan.summary,
    replyCount: 0,
    reactionSummary: [],
    idempotencyKey: plan.idempotencyKey,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  });
  await insertContentBlocksForTarget({
    ctx,
    communityId: plan.communityId,
    rootId,
    visibilityScope: "community",
    blocks: plan.contentBlocks,
    nowMs: plan.createdAt,
  });
  await insertLegacyChatLinkIfMissing({
    ctx,
    communityId: plan.communityId,
    threadId: plan.threadId,
    messageId: plan.messageId,
    linkKind: "root",
    rootId,
    nowMs: plan.nowMs,
  });

  const root = (await ctx.db.get(rootId as any)) as InteractionRootRow | null;
  if (!root) throw new Error("legacy_chat_interaction_root_create_failed");
  return await mapRootBundle(ctx, root, false);
}

export async function createInteractionRootFromLegacyChatMessageCore(args: {
  ctx: any;
  thread: CommunityChatThreadLike;
  message: CommunityChatMessageLike;
  nowMs?: number;
}) {
  const plan = await planInteractionRootFromLegacyChatMessageCore(args);
  return await materializeLegacyChatRootInteractionPlan(args.ctx, plan);
}

export async function planInteractionReplyFromLegacyChatMessageCore(args: {
  ctx: any;
  thread: CommunityChatThreadLike;
  message: CommunityChatMessageLike;
  nowMs?: number;
}): Promise<LegacyChatReplyInteractionPlan> {
  if (normalizeIdValue(args.message.threadId) !== normalizeIdValue(args.thread._id)) {
    throw new Error("legacy_chat_interaction_thread_mismatch");
  }
  if (!args.message.replyToMessageId) {
    throw new Error("legacy_chat_interaction_reply_target_required");
  }

  const nowMs = args.nowMs ?? Date.now();
  const existingLink = await getLegacyChatLinkByMessage(args.ctx, args.message._id);
  if (existingLink) {
    if (existingLink.linkKind !== "reply" || !existingLink.replyId) {
      throw new Error("legacy_chat_interaction_link_conflict");
    }
    const linkedReply = (await args.ctx.db.get(existingLink.replyId as any)) as InteractionReplyRow | null;
    if (!linkedReply) throw new Error("legacy_chat_interaction_link_target_missing");
    const linkedRoot = (await args.ctx.db.get(linkedReply.rootId as any)) as InteractionRootRow | null;
    if (!linkedRoot) throw new Error("legacy_chat_interaction_link_target_missing");
    if (normalizeIdValue(linkedRoot.communityId) !== normalizeIdValue(args.thread.communityId)) {
      throw new Error("legacy_chat_interaction_link_target_invalid");
    }
    return {
      planKind: "existing_reply",
      root: linkedRoot,
      reply: linkedReply,
      communityId: linkedReply.communityId,
      threadId: args.thread._id,
      messageId: args.message._id,
      targetMessageId: args.message.replyToMessageId,
      nowMs,
      needsLegacyLink: false,
    };
  }

  const targetLink = await getLegacyChatLinkByMessage(args.ctx, args.message.replyToMessageId);
  if (!targetLink || !targetLink.rootId) {
    throw new Error("legacy_chat_interaction_target_missing");
  }
  const root = (await args.ctx.db.get(targetLink.rootId as any)) as InteractionRootRow | null;
  if (!root || normalizeIdValue(root.communityId) !== normalizeIdValue(args.thread.communityId)) {
    throw new Error("legacy_chat_interaction_target_invalid");
  }
  if (root.status !== "live" || root.lockedAt) {
    throw new Error("legacy_chat_interaction_root_closed");
  }

  let targetReplyId: any | undefined;
  if (targetLink.replyId) {
    const targetReply = (await args.ctx.db.get(targetLink.replyId as any)) as InteractionReplyRow | null;
    if (!targetReply || normalizeIdValue(targetReply.rootId) !== normalizeIdValue(root._id)) {
      throw new Error("legacy_chat_interaction_target_reply_invalid");
    }
    targetReplyId = targetReply._id;
  }

  const idempotencyKey = legacyChatIdempotencyKey(args.message._id, "reply");
  const existingReply = await getExistingReplyByIdempotencyKey(args.ctx, root.communityId, idempotencyKey);
  if (existingReply) {
    if (normalizeIdValue(existingReply.rootId) !== normalizeIdValue(root._id)) {
      throw new Error("legacy_chat_interaction_idempotency_key_conflict");
    }
    return {
      planKind: "existing_reply",
      root,
      reply: existingReply,
      communityId: root.communityId,
      threadId: args.thread._id,
      messageId: args.message._id,
      targetMessageId: args.message.replyToMessageId,
      nowMs,
      needsLegacyLink: true,
    };
  }

  const contentBlocks = legacyChatContentBlocks(args.message);
  const visibilityScope = resolveReplyVisibilityScope(root.visibilityScope, root.visibilityScope);
  const seq = Math.max(0, Math.floor(root.replyCount ?? 0)) + 1;
  const createdAt = Math.max(0, Math.floor(Number(args.message.createdAt) || nowMs));
  const updatedAt = Math.max(0, Math.floor(Number(args.message.updatedAt) || nowMs));
  return {
    planKind: "create_reply",
    root,
    communityId: root.communityId,
    threadId: args.thread._id,
    messageId: args.message._id,
    targetMessageId: args.message.replyToMessageId,
    ...(args.message.senderUserId ? { actorUserId: args.message.senderUserId } : {}),
    ...(targetReplyId ? { targetReplyId } : {}),
    idempotencyKey,
    contentBlocks,
    visibilityScope,
    summary: contentSummary(contentBlocks),
    seq,
    createdAt,
    updatedAt,
    nowMs,
  };
}

export async function materializeLegacyChatReplyInteractionPlan(ctx: any, plan: LegacyChatReplyInteractionPlan) {
  if (plan.planKind === "existing_reply") {
    if (plan.needsLegacyLink) {
      await insertLegacyChatLinkIfMissing({
        ctx,
        communityId: plan.communityId,
        threadId: plan.threadId,
        messageId: plan.messageId,
        targetMessageId: plan.targetMessageId,
        linkKind: "reply",
        rootId: plan.root._id,
        replyId: plan.reply._id,
        nowMs: plan.nowMs,
      });
    }
    return await mapReplyBundle(ctx, plan.reply, true);
  }

  const replyId = await ctx.db.insert("communityInteractionReplies" as any, {
    communityId: plan.communityId,
    rootId: plan.root._id,
    seq: plan.seq,
    actorType: "human",
    ...(plan.actorUserId ? { actorUserId: plan.actorUserId } : {}),
    ...(plan.targetReplyId ? { targetReplyId: plan.targetReplyId } : {}),
    status: "live",
    visibilityScope: plan.visibilityScope,
    contentSummary: plan.summary,
    reactionSummary: [],
    idempotencyKey: plan.idempotencyKey,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  });
  await insertContentBlocksForTarget({
    ctx,
    communityId: plan.communityId,
    replyId,
    visibilityScope: plan.visibilityScope,
    blocks: plan.contentBlocks,
    nowMs: plan.createdAt,
  });
  await ctx.db.patch(plan.root._id as any, {
    replyCount: plan.seq,
    lastReplyAt: plan.createdAt,
    updatedAt: plan.nowMs,
  });
  await insertLegacyChatLinkIfMissing({
    ctx,
    communityId: plan.communityId,
    threadId: plan.threadId,
    messageId: plan.messageId,
    targetMessageId: plan.targetMessageId,
    linkKind: "reply",
    rootId: plan.root._id,
    replyId,
    nowMs: plan.nowMs,
  });

  const reply = (await ctx.db.get(replyId as any)) as InteractionReplyRow | null;
  if (!reply) throw new Error("legacy_chat_interaction_reply_create_failed");
  return await mapReplyBundle(ctx, reply, false);
}

export async function createInteractionReplyFromLegacyChatMessageCore(args: {
  ctx: any;
  thread: CommunityChatThreadLike;
  message: CommunityChatMessageLike;
  nowMs?: number;
}) {
  const plan = await planInteractionReplyFromLegacyChatMessageCore(args);
  return await materializeLegacyChatReplyInteractionPlan(args.ctx, plan);
}

export async function recordLegacyChatMessageInteractionBestEffort(args: {
  ctx: any;
  thread: CommunityChatThreadLike;
  message: CommunityChatMessageLike;
  nowMs?: number;
}) {
  if (args.message.replyToMessageId) {
    let plan: LegacyChatReplyInteractionPlan;
    try {
      plan = await planInteractionReplyFromLegacyChatMessageCore(args);
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    await materializeLegacyChatReplyInteractionPlan(args.ctx, plan);
    return { ok: true as const, link_kind: "reply" as const };
  }
  let plan: LegacyChatRootInteractionPlan;
  try {
    plan = await planInteractionRootFromLegacyChatMessageCore(args);
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  await materializeLegacyChatRootInteractionPlan(args.ctx, plan);
  return { ok: true as const, link_kind: "root" as const };
}

export const createCommunityInteractionRoot = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    idempotencyKey: v.string(),
    kind: rootKindValidator,
    visibilityScope: v.optional(visibilityScopeValidator),
    title: v.optional(v.string()),
    contentBlocks: v.array(contentBlockInputValidator),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    await requireProfileSetupCompleteForUser(ctx, userId);
    if (args.kind === "agent_signal") {
      throw new Error("interaction_agent_signal_actor_required");
    }

    const idempotencyKey = normalizeIdempotencyKey(args.idempotencyKey);
    const existing = await getExistingRootByIdempotencyKey(ctx, args.communityId, idempotencyKey);
    if (existing) return await mapRootBundle(ctx, existing, true);

    const nowMs = Date.now();
    const contentBlocks = normalizeContentBlocks(args.contentBlocks);
    const visibilityScope = args.visibilityScope ?? "community";
    const rootId = await ctx.db.insert("communityInteractionRoots" as any, {
      communityId: args.communityId,
      actorType: "human",
      actorUserId: userId,
      kind: args.kind,
      status: "live",
      visibilityScope,
      ...(normalizeOptionalBoundedText(args.title, MAX_INTERACTION_TITLE_CHARS)
        ? { title: normalizeOptionalBoundedText(args.title, MAX_INTERACTION_TITLE_CHARS) }
        : {}),
      contentSummary: contentSummary(contentBlocks),
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await insertContentBlocksForTarget({
      ctx,
      communityId: args.communityId,
      rootId,
      visibilityScope,
      blocks: contentBlocks,
      nowMs,
    });
    const root = (await ctx.db.get(rootId as any)) as InteractionRootRow | null;
    if (!root) throw new Error("interaction_root_create_failed");
    return await mapRootBundle(ctx, root, false);
  },
});

export const createCommunityInteractionReply = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    rootId: v.id("communityInteractionRoots"),
    idempotencyKey: v.string(),
    targetReplyId: v.optional(v.union(v.id("communityInteractionReplies"), v.null())),
    visibilityScope: v.optional(visibilityScopeValidator),
    contentBlocks: v.array(contentBlockInputValidator),
  },
  handler: async (ctx, args) => {
    const root = (await ctx.db.get(args.rootId)) as InteractionRootRow | null;
    if (!root) throw new Error("interaction_root_not_found");
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: root.communityId, userId });
    await requireProfileSetupCompleteForUser(ctx, userId);
    if (root.status !== "live" || root.lockedAt) {
      throw new Error("interaction_root_closed");
    }

    const idempotencyKey = normalizeIdempotencyKey(args.idempotencyKey);
    const existing = await getExistingReplyByIdempotencyKey(ctx, root.communityId, idempotencyKey);
    if (existing) {
      if (normalizeIdValue(existing.rootId) !== normalizeIdValue(root._id)) {
        throw new Error("interaction_idempotency_key_conflict");
      }
      return await mapReplyBundle(ctx, existing, true);
    }

    let targetReplyId: any | undefined;
    if (args.targetReplyId) {
      const targetReply = (await ctx.db.get(args.targetReplyId)) as InteractionReplyRow | null;
      if (!targetReply || normalizeIdValue(targetReply.rootId) !== normalizeIdValue(root._id)) {
        throw new Error("interaction_target_reply_invalid");
      }
      targetReplyId = targetReply._id;
    }

    const nowMs = Date.now();
    const contentBlocks = normalizeContentBlocks(args.contentBlocks);
    const visibilityScope = resolveReplyVisibilityScope(args.visibilityScope, root.visibilityScope);
    const seq = Math.max(0, Math.floor(root.replyCount ?? 0)) + 1;
    const replyId = await ctx.db.insert("communityInteractionReplies" as any, {
      communityId: root.communityId,
      rootId: root._id,
      seq,
      actorType: "human",
      actorUserId: userId,
      ...(targetReplyId ? { targetReplyId } : {}),
      status: "live",
      visibilityScope,
      contentSummary: contentSummary(contentBlocks),
      reactionSummary: [],
      idempotencyKey,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await insertContentBlocksForTarget({
      ctx,
      communityId: root.communityId,
      replyId,
      visibilityScope,
      blocks: contentBlocks,
      nowMs,
    });
    await ctx.db.patch(root._id as any, {
      replyCount: seq,
      lastReplyAt: nowMs,
      updatedAt: nowMs,
    });
    const reply = (await ctx.db.get(replyId as any)) as InteractionReplyRow | null;
    if (!reply) throw new Error("interaction_reply_create_failed");
    return await mapReplyBundle(ctx, reply, false);
  },
});

export const listCommunityInteractionRoots = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    beforeCreatedAt: v.optional(v.union(v.number(), v.null())),
    limit: v.optional(v.number()),
    kind: v.optional(v.union(rootKindValidator, v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });

    const limit = normalizeReadLimit(args.limit, MAX_INTERACTION_ROOT_READ_LIMIT, 30);
    const beforeCreatedAt = normalizeBeforeNumber(args.beforeCreatedAt);
    const kind = args.kind ?? null;
    const rows = (await (kind
      ? ctx.db
          .query("communityInteractionRoots" as any)
          .withIndex("by_community_kind_status_createdAt", (q: any) => {
            const base = q.eq("communityId", args.communityId).eq("kind", kind).eq("status", "live");
            return beforeCreatedAt === null ? base : base.lt("createdAt", beforeCreatedAt);
          })
          .order("desc")
          .take(limit)
      : ctx.db
          .query("communityInteractionRoots" as any)
          .withIndex("by_community_status_createdAt", (q: any) => {
            const base = q.eq("communityId", args.communityId).eq("status", "live");
            return beforeCreatedAt === null ? base : base.lt("createdAt", beforeCreatedAt);
          })
          .order("desc")
          .take(limit))) as InteractionRootRow[];

    const bundles = await Promise.all(rows.map((row) => mapRootBundle(ctx, row, false)));
    return {
      roots: bundles,
      next_before_created_at: rows.length === limit && rows.length > 0 ? rows[rows.length - 1]!.createdAt : null,
    };
  },
});

export const listCommunityInteractionReplies = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    rootId: v.id("communityInteractionRoots"),
    beforeSeq: v.optional(v.union(v.number(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const root = (await ctx.db.get(args.rootId)) as InteractionRootRow | null;
    if (!root) throw new Error("interaction_root_not_found");
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: root.communityId, userId });

    const limit = normalizeReadLimit(args.limit, MAX_INTERACTION_REPLY_READ_LIMIT, 50);
    const beforeSeq = normalizeBeforeNumber(args.beforeSeq);
    const rows = (await ctx.db
      .query("communityInteractionReplies" as any)
      .withIndex("by_root_seq", (q: any) => {
        const base = q.eq("rootId", root._id);
        return beforeSeq === null ? base : base.lt("seq", beforeSeq);
      })
      .order("desc")
      .take(MAX_INTERACTION_REPLY_READ_LIMIT)) as InteractionReplyRow[];
    const filtered = rows
      .filter((row) => row.status === "live")
      .sort((left, right) => left.seq - right.seq)
      .slice(-limit);
    const bundles = await Promise.all(filtered.map((row) => mapReplyBundle(ctx, row, false)));
    return {
      root_id: normalizeIdValue(root._id),
      replies: bundles,
      next_before_seq:
        filtered.length === limit && filtered.length > 0
          ? Math.max(0, Math.floor(filtered[0]!.seq ?? 0))
          : null,
    };
  },
});
