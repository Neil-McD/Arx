import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
  normalizeIdValue,
  requireCommunityChatAccess,
  requireCommunityModerator,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { requireProfileSetupCompleteForUser } from "./accountSetupCore";
import { upsertArchiveDocumentForChatMessage } from "./communityArchiveDocuments";

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
  editedAt?: number;
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
  editedAt?: number;
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
const MAX_VIEWER_REACTIONS_PER_TARGET = 24;

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

function composerIdempotencyKey(idempotencyKey: string, kind: "root" | "reply"): string {
  return `community_composer:${kind}:${idempotencyKey}`.slice(0, MAX_INTERACTION_IDEMPOTENCY_KEY_CHARS);
}

async function ensureLegacyCompatibilityChatThread(
  ctx: any,
  communityId: any,
  nowMs: number,
): Promise<CommunityChatThreadLike> {
  const existing = (await ctx.db
    .query("communityChatThreads" as any)
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
    .order("asc")
    .first()) as CommunityChatThreadLike | null;
  if (existing) return existing;
  const threadId = await ctx.db.insert("communityChatThreads" as any, {
    communityId,
    lastSeq: 0,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const thread = (await ctx.db.get(threadId as any)) as CommunityChatThreadLike | null;
  if (!thread) throw new Error("community_chat_thread_create_failed");
  return thread;
}

async function mapLegacyCompatibilityMessageRow(
  ctx: any,
  row: CommunityChatMessageLike,
  userIdCache?: Map<string, string | null>,
) {
  return {
    id: String(row._id),
    thread_id: String(row.threadId),
    seq: Math.max(0, Math.floor(row.seq)),
    role: row.role,
    content_json: row.contentJson,
    sender_id: (await resolvePublicUserId(ctx, row.senderUserId, userIdCache)) ?? normalizeIdValue(row.senderUserId),
    reply_to_id: row.replyToMessageId ? String(row.replyToMessageId) : null,
    created_at: toIsoString(row.createdAt),
  };
}

async function getLinkedLegacyCompatibilityMessage(
  ctx: any,
  link: LegacyChatLinkRow | null,
): Promise<CommunityChatMessageLike | null> {
  if (!link?.messageId) return null;
  return (await ctx.db.get(link.messageId as any)) as CommunityChatMessageLike | null;
}

async function createLegacyCompatibilityChatMessageForInteraction(args: {
  ctx: any;
  thread: CommunityChatThreadLike;
  actorUserId: any;
  text: string;
  replyToMessageId?: any;
  nowMs: number;
}): Promise<CommunityChatMessageLike> {
  let replyToMessageId: any | undefined;
  if (args.replyToMessageId) {
    const target = (await args.ctx.db.get(args.replyToMessageId as any)) as CommunityChatMessageLike | null;
    if (!target || normalizeIdValue(target.threadId) !== normalizeIdValue(args.thread._id)) {
      throw new Error("interaction_legacy_reply_target_invalid");
    }
    replyToMessageId = target._id;
  }
  const seq = Math.max(0, Math.floor(args.thread.lastSeq ?? 0)) + 1;
  const messageId = await args.ctx.db.insert("communityChatMessages" as any, {
    threadId: args.thread._id,
    seq,
    role: "user",
    contentJson: { text: args.text },
    senderUserId: args.actorUserId,
    ...(replyToMessageId ? { replyToMessageId } : {}),
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  await args.ctx.db.patch(args.thread._id as any, {
    lastSeq: seq,
    updatedAt: args.nowMs,
  });
  const row = (await args.ctx.db.get(messageId as any)) as CommunityChatMessageLike | null;
  if (!row) throw new Error("interaction_legacy_message_create_failed");
  await upsertArchiveDocumentForChatMessage(args.ctx, {
    thread: args.thread,
    message: row,
  });
  return row;
}

async function resolveLegacyReplyTargetForCanonicalReply(args: {
  ctx: any;
  thread: CommunityChatThreadLike;
  root: InteractionRootRow;
  replyToMessageId?: string | null;
}): Promise<{ targetMessageId: any; targetReplyId?: any }> {
  const requestedTargetMessageId = String(args.replyToMessageId ?? "").trim();
  let targetLink: LegacyChatLinkRow | null = null;
  if (requestedTargetMessageId) {
    const targetMessage = (await args.ctx.db.get(requestedTargetMessageId as any)) as CommunityChatMessageLike | null;
    if (!targetMessage || normalizeIdValue(targetMessage.threadId) !== normalizeIdValue(args.thread._id)) {
      throw new Error("interaction_legacy_reply_target_invalid");
    }
    targetLink = await getLegacyChatLinkByMessage(args.ctx, targetMessage._id);
  } else {
    targetLink = await getLegacyChatLinkByRoot(args.ctx, args.root._id);
  }
  if (!targetLink || !targetLink.messageId || normalizeIdValue(targetLink.rootId) !== normalizeIdValue(args.root._id)) {
    throw new Error("interaction_legacy_reply_target_missing");
  }
  if (normalizeIdValue(targetLink.threadId) !== normalizeIdValue(args.thread._id)) {
    throw new Error("interaction_legacy_reply_target_thread_invalid");
  }
  if (targetLink.replyId) {
    const targetReply = (await args.ctx.db.get(targetLink.replyId as any)) as InteractionReplyRow | null;
    if (!targetReply || normalizeIdValue(targetReply.rootId) !== normalizeIdValue(args.root._id)) {
      throw new Error("interaction_legacy_reply_target_reply_invalid");
    }
    return { targetMessageId: targetLink.messageId, targetReplyId: targetReply._id };
  }
  return { targetMessageId: targetLink.messageId };
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

const MAX_AUTO_LINK_BLOCKS = 2;

// Detect http(s) URLs in composer text and turn them into link blocks (which auto-create pending
// embeds). Deduped by normalized URL, capped, invalid URLs skipped.
function extractLinkBlocksFromText(text: string): NormalizedContentBlock[] {
  const matches = text.match(/\bhttps?:\/\/[^\s<>()]+/gi);
  if (!matches) return [];
  const out: NormalizedContentBlock[] = [];
  const seen = new Set<string>();
  for (const raw of matches) {
    if (out.length >= MAX_AUTO_LINK_BLOCKS) break;
    // Strip trailing punctuation that commonly clings to a URL in prose.
    const trimmed = raw.replace(/[.,;:!?)\]}'"]+$/, "");
    let normalized: { sourceUrl: string; normalizedSourceUrl: string };
    try {
      normalized = normalizeUrl(trimmed);
    } catch {
      continue;
    }
    if (seen.has(normalized.normalizedSourceUrl)) continue;
    seen.add(normalized.normalizedSourceUrl);
    out.push({ blockType: "link", url: normalized.sourceUrl, normalizedSourceUrl: normalized.normalizedSourceUrl });
  }
  return out;
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

// Resolve the attachments stored on the originating legacy chat message and shape them for the
// client (with storage URLs). The interaction content-block model has no attachment block type, so
// the projection flattens attachments to a "Shared attachment: …" text block — this carries the real
// media through on the bundle instead, retroactively, for every projected chat message.
async function resolveLegacyMessageAttachments(
  ctx: any,
  messageId: any,
): Promise<Array<Record<string, unknown>>> {
  if (!messageId) return [];
  const message = (await ctx.db.get(messageId as any)) as CommunityChatMessageLike | null;
  const contentJson = message?.contentJson;
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) return [];
  const rawAttachments = (contentJson as Record<string, unknown>).attachments;
  if (!Array.isArray(rawAttachments)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const raw of rawAttachments.slice(0, 8)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : `attachment-${out.length}`;
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "attachment";
    const type = record.type === "image" ? "image" : "file";
    const mime = typeof record.mime === "string" && record.mime.trim() ? record.mime.trim() : null;
    const sizeRaw = Number(record.size);
    const size = Number.isFinite(sizeRaw) ? Math.max(0, Math.floor(sizeRaw)) : 0;
    const storageIdRaw =
      typeof record.storageId === "string"
        ? record.storageId
        : typeof record.storage_id === "string"
          ? record.storage_id
          : "";
    const storageId = storageIdRaw.trim() ? storageIdRaw.trim() : null;
    const dataUrl =
      typeof record.data_url === "string" && record.data_url.trim().startsWith("data:image/")
        ? record.data_url.trim()
        : null;
    if (!storageId && !dataUrl) continue;
    const resolvedUrl = storageId ? await ctx.storage.getUrl(storageId as any) : null;
    out.push({
      id,
      name,
      type,
      mime,
      size,
      ...(storageId ? { storage_id: storageId } : null),
      ...(typeof resolvedUrl === "string" && resolvedUrl.trim() ? { url: resolvedUrl.trim() } : null),
      ...(dataUrl ? { data_url: dataUrl } : null),
    });
  }
  return out;
}

async function mapRootBundle(
  ctx: any,
  root: InteractionRootRow,
  deduped: boolean,
  userIdCache?: Map<string, string | null>,
  viewerEmojis?: string[],
) {
  const blocks = await listContentBlocksForRoot(ctx, root._id);
  const embeds = await listEmbedsForRoot(ctx, root._id);
  const mentions = await listMentionsForRoot(ctx, root._id);
  const legacyLink = await getLegacyChatLinkByRoot(ctx, root._id);
  const attachments = await resolveLegacyMessageAttachments(ctx, legacyLink?.messageId);
  const publicActorUserId = root.actorUserId
    ? await resolvePublicUserId(ctx, root.actorUserId, userIdCache)
    : null;
  const lastReply = Math.max(0, Math.floor(root.replyCount ?? 0)) > 0
    ? ((await ctx.db
        .query("communityInteractionReplies" as any)
        .withIndex("by_root_seq", (q: any) => q.eq("rootId", root._id))
        .order("desc")
        .first()) as InteractionReplyRow | null)
    : null;
  const lastReplyPublicId = lastReply?.actorUserId
    ? await resolvePublicUserId(ctx, lastReply.actorUserId, userIdCache)
    : null;
  return {
    deduped,
    root: {
      id: normalizeIdValue(root._id),
      community_id: normalizeIdValue(root.communityId),
      actor_type: root.actorType,
      actor_user_id: publicActorUserId ?? (root.actorUserId ? normalizeIdValue(root.actorUserId) : null),
      actor_agent_key: root.actorAgentKey ?? null,
      kind: root.kind,
      status: root.status,
      visibility_scope: root.visibilityScope,
      title: root.title ?? null,
      content_summary: root.contentSummary,
      reply_count: Math.max(0, Math.floor(root.replyCount ?? 0)),
      reaction_summary: mapReactionSummary(root.reactionSummary),
      viewer_emojis: viewerEmojis ?? [],
      idempotency_key: root.idempotencyKey,
      last_reply_at: typeof root.lastReplyAt === "number" ? toIsoString(root.lastReplyAt) : null,
      last_reply_actor_user_id:
        lastReplyPublicId ?? (lastReply?.actorUserId ? normalizeIdValue(lastReply.actorUserId) : null),
      pinned_at: typeof root.pinnedAt === "number" ? toIsoString(root.pinnedAt) : null,
      locked_at: typeof root.lockedAt === "number" ? toIsoString(root.lockedAt) : null,
      legacy_thread_id: legacyLink?.threadId ? normalizeIdValue(legacyLink.threadId) : null,
      legacy_message_id: legacyLink?.messageId ? normalizeIdValue(legacyLink.messageId) : null,
      created_at: toIsoString(root.createdAt),
      updated_at: toIsoString(root.updatedAt),
      edited_at: typeof root.editedAt === "number" ? toIsoString(root.editedAt) : null,
    },
    content_blocks: blocks.map(mapContentBlock),
    embeds: embeds.map(mapEmbed),
    mentions: mentions.map(mapMention),
    attachments,
  };
}

async function mapReplyBundle(
  ctx: any,
  reply: InteractionReplyRow,
  deduped: boolean,
  userIdCache?: Map<string, string | null>,
  viewerEmojis?: string[],
) {
  const blocks = await listContentBlocksForReply(ctx, reply._id);
  const embeds = await listEmbedsForReply(ctx, reply._id);
  const mentions = await listMentionsForReply(ctx, reply._id);
  const legacyLink = await getLegacyChatLinkByReply(ctx, reply._id);
  const attachments = await resolveLegacyMessageAttachments(ctx, legacyLink?.messageId);
  const publicActorUserId = reply.actorUserId
    ? await resolvePublicUserId(ctx, reply.actorUserId, userIdCache)
    : null;
  return {
    deduped,
    reply: {
      id: normalizeIdValue(reply._id),
      community_id: normalizeIdValue(reply.communityId),
      root_id: normalizeIdValue(reply.rootId),
      seq: Math.max(0, Math.floor(reply.seq ?? 0)),
      actor_type: reply.actorType,
      actor_user_id: publicActorUserId ?? (reply.actorUserId ? normalizeIdValue(reply.actorUserId) : null),
      actor_agent_key: reply.actorAgentKey ?? null,
      target_reply_id: reply.targetReplyId ? normalizeIdValue(reply.targetReplyId) : null,
      status: reply.status,
      visibility_scope: reply.visibilityScope,
      content_summary: reply.contentSummary,
      reaction_summary: mapReactionSummary(reply.reactionSummary),
      viewer_emojis: viewerEmojis ?? [],
      idempotency_key: reply.idempotencyKey,
      legacy_thread_id: legacyLink?.threadId ? normalizeIdValue(legacyLink.threadId) : null,
      legacy_message_id: legacyLink?.messageId ? normalizeIdValue(legacyLink.messageId) : null,
      legacy_target_message_id: legacyLink?.targetMessageId ? normalizeIdValue(legacyLink.targetMessageId) : null,
      created_at: toIsoString(reply.createdAt),
      updated_at: toIsoString(reply.updatedAt),
      edited_at: typeof reply.editedAt === "number" ? toIsoString(reply.editedAt) : null,
    },
    content_blocks: blocks.map(mapContentBlock),
    embeds: embeds.map(mapEmbed),
    mentions: mentions.map(mapMention),
    attachments,
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

async function nextReplySeq(ctx: any, rootId: any): Promise<number> {
  const last = (await ctx.db
    .query("communityInteractionReplies" as any)
    .withIndex("by_root_seq", (q: any) => q.eq("rootId", rootId))
    .order("desc")
    .first()) as InteractionReplyRow | null;
  return Math.max(0, Math.floor(last?.seq ?? 0)) + 1;
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
    const seq = await nextReplySeq(ctx, root._id);
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
      replyCount: Math.max(0, Math.floor(root.replyCount ?? 0)) + 1,
      lastReplyAt: nowMs,
      updatedAt: nowMs,
    });
    const reply = (await ctx.db.get(replyId as any)) as InteractionReplyRow | null;
    if (!reply) throw new Error("interaction_reply_create_failed");
    return await mapReplyBundle(ctx, reply, false);
  },
});

async function insertCommunityInteractionMentionRows(args: {
  ctx: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  mentionedUserIds: any[];
  nowMs: number;
}): Promise<void> {
  const seen = new Set<string>();
  for (const mentionedUserId of args.mentionedUserIds) {
    const normalized = normalizeIdValue(mentionedUserId);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    await args.ctx.db.insert("communityInteractionMentions" as any, {
      communityId: args.communityId,
      ...(args.rootId ? { rootId: args.rootId } : {}),
      ...(args.replyId ? { replyId: args.replyId } : {}),
      mentionKind: "user",
      mentionedUserId,
      notifyState: "pending",
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
  }
}

export const createCommunityInteractionComposerMessage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    idempotencyKey: v.string(),
    text: v.string(),
    rootId: v.optional(v.union(v.id("communityInteractionRoots"), v.null())),
    replyToMessageId: v.optional(v.union(v.string(), v.null())),
    mentions: v.optional(v.array(v.object({ userId: v.id("users") }))),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    await requireProfileSetupCompleteForUser(ctx, userId);

    const text = normalizeBoundedText(args.text, MAX_INTERACTION_TEXT_CHARS);
    if (!text) throw new Error("interaction_content_required");
    const contentBlocks: NormalizedContentBlock[] = [
      { blockType: "markdown_text", text },
      ...extractLinkBlocksFromText(text),
    ];
    const summary = contentSummary(contentBlocks);
    const mentionedUserIds = (args.mentions ?? []).map((mention) => mention.userId);
    const nowMs = Date.now();
    const thread = await ensureLegacyCompatibilityChatThread(ctx, args.communityId, nowMs);
    const userIdCache = new Map<string, string | null>();

    if (!args.rootId) {
      const idempotencyKey = composerIdempotencyKey(normalizeIdempotencyKey(args.idempotencyKey), "root");
      let root = await getExistingRootByIdempotencyKey(ctx, args.communityId, idempotencyKey);
      let deduped = true;
      if (!root) {
        const rootId = await ctx.db.insert("communityInteractionRoots" as any, {
          communityId: args.communityId,
          actorType: "human",
          actorUserId: userId,
          kind: "discussion",
          status: "live",
          visibilityScope: "community",
          contentSummary: summary,
          replyCount: 0,
          reactionSummary: [],
          idempotencyKey,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
        const inserted = await insertContentBlocksForTarget({
          ctx,
          communityId: args.communityId,
          rootId,
          visibilityScope: "community",
          blocks: contentBlocks,
          nowMs,
        });
        await scheduleEmbedEnrichment(ctx, inserted.embedIds);
        await insertCommunityInteractionMentionRows({
          ctx,
          communityId: args.communityId,
          rootId,
          mentionedUserIds,
          nowMs,
        });
        root = (await ctx.db.get(rootId as any)) as InteractionRootRow | null;
        if (!root) throw new Error("interaction_root_create_failed");
        deduped = false;
      }

      const existingLink = await getLegacyChatLinkByRoot(ctx, root._id);
      const existingMessage = await getLinkedLegacyCompatibilityMessage(ctx, existingLink);
      const message = existingMessage ?? await createLegacyCompatibilityChatMessageForInteraction({
        ctx,
        thread,
        actorUserId: userId,
        text,
        nowMs,
      });
      if (!existingMessage) {
        await insertLegacyChatLinkIfMissing({
          ctx,
          communityId: args.communityId,
          threadId: thread._id,
          messageId: message._id,
          linkKind: "root",
          rootId: root._id,
          nowMs,
        });
      }
      return {
        rows: [await mapLegacyCompatibilityMessageRow(ctx, message, userIdCache)],
        interaction: {
          kind: "root",
          root_id: normalizeIdValue(root._id),
          reply_id: null,
          deduped,
          idempotency_key: idempotencyKey,
        },
      };
    }

    const root = (await ctx.db.get(args.rootId)) as InteractionRootRow | null;
    if (!root) throw new Error("interaction_root_not_found");
    if (normalizeIdValue(root.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("interaction_root_community_mismatch");
    }
    if (root.status !== "live" || root.lockedAt) {
      throw new Error("interaction_root_closed");
    }

    const idempotencyKey = composerIdempotencyKey(normalizeIdempotencyKey(args.idempotencyKey), "reply");
    let reply = await getExistingReplyByIdempotencyKey(ctx, root.communityId, idempotencyKey);
    let deduped = true;
    if (reply && normalizeIdValue(reply.rootId) !== normalizeIdValue(root._id)) {
      throw new Error("interaction_idempotency_key_conflict");
    }

    const legacyTarget = await resolveLegacyReplyTargetForCanonicalReply({
      ctx,
      thread,
      root,
      replyToMessageId: args.replyToMessageId ?? null,
    });

    if (!reply) {
      const visibilityScope = resolveReplyVisibilityScope(root.visibilityScope, root.visibilityScope);
      const seq = await nextReplySeq(ctx, root._id);
      const replyId = await ctx.db.insert("communityInteractionReplies" as any, {
        communityId: root.communityId,
        rootId: root._id,
        seq,
        actorType: "human",
        actorUserId: userId,
        ...(legacyTarget.targetReplyId ? { targetReplyId: legacyTarget.targetReplyId } : {}),
        status: "live",
        visibilityScope,
        contentSummary: summary,
        reactionSummary: [],
        idempotencyKey,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const insertedReply = await insertContentBlocksForTarget({
        ctx,
        communityId: root.communityId,
        replyId,
        visibilityScope,
        blocks: contentBlocks,
        nowMs,
      });
      await scheduleEmbedEnrichment(ctx, insertedReply.embedIds);
      await insertCommunityInteractionMentionRows({
        ctx,
        communityId: root.communityId,
        replyId,
        mentionedUserIds,
        nowMs,
      });
      await ctx.db.patch(root._id as any, {
        replyCount: Math.max(0, Math.floor(root.replyCount ?? 0)) + 1,
        lastReplyAt: nowMs,
        updatedAt: nowMs,
      });
      reply = (await ctx.db.get(replyId as any)) as InteractionReplyRow | null;
      if (!reply) throw new Error("interaction_reply_create_failed");
      deduped = false;
    }

    const existingLink = await getLegacyChatLinkByReply(ctx, reply._id);
    const existingMessage = await getLinkedLegacyCompatibilityMessage(ctx, existingLink);
    const message = existingMessage ?? await createLegacyCompatibilityChatMessageForInteraction({
      ctx,
      thread,
      actorUserId: userId,
      text,
      replyToMessageId: legacyTarget.targetMessageId,
      nowMs,
    });
    if (!existingMessage) {
      await insertLegacyChatLinkIfMissing({
        ctx,
        communityId: root.communityId,
        threadId: thread._id,
        messageId: message._id,
        targetMessageId: legacyTarget.targetMessageId,
        linkKind: "reply",
        rootId: root._id,
        replyId: reply._id,
        nowMs,
      });
    }
    return {
      rows: [await mapLegacyCompatibilityMessageRow(ctx, message, userIdCache)],
      interaction: {
        kind: "reply",
        root_id: normalizeIdValue(root._id),
        reply_id: normalizeIdValue(reply._id),
        deduped,
        idempotency_key: idempotencyKey,
      },
    };
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

    const userIdCache = new Map<string, string | null>();
    const viewerMap = await loadViewerReactionMapForTargets(ctx, userId, "root", rows.map((row) => row._id));
    const bundles = await Promise.all(
      rows.map((row) => mapRootBundle(ctx, row, false, userIdCache, viewerMap.get(normalizeIdValue(row._id)) ?? [])),
    );
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
    const userIdCache = new Map<string, string | null>();
    const viewerMap = await loadViewerReactionMapForTargets(ctx, userId, "reply", filtered.map((row) => row._id));
    const bundles = await Promise.all(
      filtered.map((row) => mapReplyBundle(ctx, row, false, userIdCache, viewerMap.get(normalizeIdValue(row._id)) ?? [])),
    );
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

async function loadViewerReactionMapForTargets(
  ctx: any,
  userId: any,
  targetType: "root" | "reply",
  targetIds: any[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!userId) return map;
  const actorKey = normalizeIdValue(userId);
  const uniqueTargetIds = Array.from(new Map(targetIds.map((id) => [normalizeIdValue(id), id])).values());
  await Promise.all(
    uniqueTargetIds.map(async (targetId) => {
      const rows = await ctx.db
        .query("communityInteractionReactions" as any)
        .withIndex(
          targetType === "root" ? "by_root_actor_emoji" : "by_reply_actor_emoji",
          (q: any) =>
            q
              .eq(targetType === "root" ? "rootId" : "replyId", targetId)
              .eq("actorKey", actorKey),
        )
        .take(MAX_VIEWER_REACTIONS_PER_TARGET);
      const emojis = rows
        .map((row: any) => String(row.emoji ?? "").trim().slice(0, 32))
        .filter(Boolean);
      if (emojis.length > 0) map.set(normalizeIdValue(targetId), emojis);
    }),
  );
  return map;
}

function applyReactionSummaryDelta(
  current: Array<{ emoji: string; count: number }> | undefined,
  emoji: string,
  delta: 1 | -1,
): Array<{ emoji: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of mapReactionSummary(current)) {
    counts.set(row.emoji, row.count);
  }
  const next = Math.max(0, (counts.get(emoji) ?? 0) + delta);
  if (next > 0) {
    counts.set(emoji, next);
  } else {
    counts.delete(emoji);
  }
  return Array.from(counts.entries()).map(([emojiValue, count]) => ({ emoji: emojiValue, count }));
}

export const toggleCommunityInteractionReaction = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    targetType: v.union(v.literal("root"), v.literal("reply")),
    targetId: v.string(),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const emoji = String(args.emoji).trim().slice(0, 32);
    if (!emoji) throw new Error("reaction_emoji_required");
    const target = (await ctx.db.get(args.targetId as any)) as any;
    if (!target) throw new Error("reaction_target_not_found");
    const communityId = target.communityId;
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId, userId });

    const actorKey = normalizeIdValue(userId);
    const nowMs = Date.now();
    const existing = await ctx.db
      .query("communityInteractionReactions" as any)
      .withIndex(
        args.targetType === "root" ? "by_root_actor_emoji" : "by_reply_actor_emoji",
        (q: any) =>
          q
            .eq(args.targetType === "root" ? "rootId" : "replyId", target._id)
            .eq("actorKey", actorKey)
            .eq("emoji", emoji),
      )
      .first();
    let reacted: boolean;
    if (existing) {
      await ctx.db.delete(existing._id);
      reacted = false;
    } else {
      await ctx.db.insert("communityInteractionReactions" as any, {
        communityId,
        targetType: args.targetType,
        ...(args.targetType === "root" ? { rootId: target._id } : { replyId: target._id }),
        actorType: "human",
        actorKey,
        actorUserId: userId,
        emoji,
        createdAt: nowMs,
      });
      reacted = true;
    }
    const summary = applyReactionSummaryDelta(target.reactionSummary, emoji, reacted ? 1 : -1);
    await ctx.db.patch(target._id, { reactionSummary: summary, updatedAt: nowMs });
    return { reacted, reaction_summary: summary };
  },
});

export const editCommunityInteractionMessage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    targetType: v.union(v.literal("root"), v.literal("reply")),
    targetId: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const text = normalizeBoundedText(args.text, MAX_INTERACTION_TEXT_CHARS);
    if (!text) throw new Error("interaction_content_required");
    const target = (await ctx.db.get(args.targetId as any)) as any;
    if (!target) throw new Error("interaction_target_not_found");
    const communityId = target.communityId;
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId, userId });
    if (normalizeIdValue(target.actorUserId) !== normalizeIdValue(userId)) {
      throw new Error("interaction_edit_forbidden");
    }
    if (target.status !== "live") throw new Error("interaction_not_editable");

    const nowMs = Date.now();
    const blocks: NormalizedContentBlock[] = [{ blockType: "markdown_text", text }];
    const existingBlocks =
      args.targetType === "root"
        ? await listContentBlocksForRoot(ctx, target._id)
        : await listContentBlocksForReply(ctx, target._id);
    for (const block of existingBlocks) await ctx.db.delete(block._id);
    await insertContentBlocksForTarget({
      ctx,
      communityId,
      ...(args.targetType === "root" ? { rootId: target._id } : { replyId: target._id }),
      visibilityScope: target.visibilityScope,
      blocks,
      nowMs,
    });
    await ctx.db.patch(target._id, {
      contentSummary: contentSummary(blocks),
      editedAt: nowMs,
      updatedAt: nowMs,
    });
    const legacyLink =
      args.targetType === "root"
        ? await getLegacyChatLinkByRoot(ctx, target._id)
        : await getLegacyChatLinkByReply(ctx, target._id);
    if (legacyLink?.messageId) {
      const message = await ctx.db.get(legacyLink.messageId as any);
      if (message) await ctx.db.patch(legacyLink.messageId as any, { contentJson: { text }, updatedAt: nowMs });
    }
    await ctx.db.insert("communityInteractionModerationEvents" as any, {
      communityId,
      targetType: args.targetType,
      ...(args.targetType === "root" ? { rootId: target._id } : { replyId: target._id }),
      eventType: "edit",
      actorType: "human",
      actorUserId: userId,
      createdAt: nowMs,
    });
    return { ok: true };
  },
});

export const deleteCommunityInteractionMessage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    targetType: v.union(v.literal("root"), v.literal("reply")),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const target = (await ctx.db.get(args.targetId as any)) as any;
    if (!target) throw new Error("interaction_target_not_found");
    const communityId = target.communityId;
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId, userId });
    const isOwner = normalizeIdValue(target.actorUserId) === normalizeIdValue(userId);
    if (!isOwner) {
      let isModerator = false;
      try {
        await requireCommunityModerator({ ctx, communityId, userId });
        isModerator = true;
      } catch {
        isModerator = false;
      }
      if (!isModerator) throw new Error("interaction_delete_forbidden");
    }
    if (target.status === "deleted") return { ok: true };

    const nowMs = Date.now();
    const previousStatus = target.status;
    await ctx.db.patch(target._id, { status: "deleted", deletedAt: nowMs, updatedAt: nowMs });
    if (args.targetType === "reply") {
      const root = (await ctx.db.get(target.rootId as any)) as InteractionRootRow | null;
      if (root) {
        const lastLive = (await ctx.db
          .query("communityInteractionReplies" as any)
          .withIndex("by_root_status_createdAt", (q: any) =>
            q.eq("rootId", root._id).eq("status", "live"),
          )
          .order("desc")
          .first()) as InteractionReplyRow | null;
        const rootPatch: any = {
          replyCount: Math.max(0, Math.floor(root.replyCount ?? 0) - 1),
          updatedAt: nowMs,
        };
        if (lastLive) rootPatch.lastReplyAt = lastLive.createdAt;
        await ctx.db.patch(root._id, rootPatch);
      }
    }
    await ctx.db.insert("communityInteractionModerationEvents" as any, {
      communityId,
      targetType: args.targetType,
      ...(args.targetType === "root" ? { rootId: target._id } : { replyId: target._id }),
      eventType: "tombstone",
      actorType: "human",
      actorUserId: userId,
      previousStatus,
      nextStatus: "deleted",
      createdAt: nowMs,
    });
    return { ok: true };
  },
});

const SEED_AUTH_PREFIX = "seed:polynet:";

const SEED_PEOPLE = [
  { key: "agent", name: "Polynet Agent", handle: "polynet-agent" },
  { key: "maya", name: "Maya Chen", handle: "mayac" },
  { key: "dev", name: "Dev Patel", handle: "devp" },
  { key: "aimen", name: "Aimen Babaci", handle: "aimenb" },
  { key: "sofia", name: "Sofia Rossi", handle: "sofiar" },
  { key: "justin", name: "Justin Park", handle: "justinp" },
] as const;

export const seedPolynetChatDemo = internalMutation({
  args: { communityId: v.optional(v.id("communities")) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const HOUR = 3_600_000;
    const DAY = 86_400_000;

    let communityId: any = args.communityId ?? null;
    if (!communityId) {
      const latestRoot = (await ctx.db
        .query("communityInteractionRoots" as any)
        .order("desc")
        .first()) as InteractionRootRow | null;
      communityId = latestRoot?.communityId ?? null;
    }
    if (!communityId) throw new Error("seed_no_community");
    const community = (await ctx.db.get(communityId)) as any;
    if (!community) throw new Error("seed_community_not_found");

    const userIdByKey: Record<string, any> = { neil: community.ownerId };
    for (const person of SEED_PEOPLE) {
      const authSubject = `${SEED_AUTH_PREFIX}${person.key}`;
      let user = (await ctx.db
        .query("users" as any)
        .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject))
        .first()) as any;
      if (!user) {
        const userId = await ctx.db.insert("users" as any, {
          authSubject,
          displayName: person.name,
          handle: person.handle,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
        user = await ctx.db.get(userId as any);
      }
      userIdByKey[person.key] = user._id;
      const membership = await ctx.db
        .query("communityMemberships" as any)
        .withIndex("by_community_user", (q: any) =>
          q.eq("communityId", communityId).eq("userId", user._id),
        )
        .first();
      if (!membership) {
        await ctx.db.insert("communityMemberships" as any, {
          communityId,
          userId: user._id,
          role: "member",
          accessSource: "free_grant",
          active: true,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
    }

    const thread = await ensureLegacyCompatibilityChatThread(ctx, communityId, nowMs);

    const makeRoot = async (opts: {
      key: string;
      authorKey: string;
      kind: string;
      text: string;
      atMs: number;
      reactions?: Array<{ emoji: string; count: number }>;
    }) => {
      const idempotencyKey = `seed:root:${opts.key}`;
      const existing = await getExistingRootByIdempotencyKey(ctx, communityId, idempotencyKey);
      if (existing) return existing;
      const isAgent = opts.authorKey === "agent";
      const blocks: NormalizedContentBlock[] = [{ blockType: "markdown_text", text: opts.text }];
      const rootId = await ctx.db.insert("communityInteractionRoots" as any, {
        communityId,
        actorType: isAgent ? "community_agent" : "human",
        actorUserId: userIdByKey[opts.authorKey],
        kind: opts.kind,
        status: "live",
        visibilityScope: "community",
        contentSummary: contentSummary(blocks),
        replyCount: 0,
        reactionSummary: opts.reactions ?? [],
        idempotencyKey,
        createdAt: opts.atMs,
        updatedAt: opts.atMs,
      });
      await insertContentBlocksForTarget({
        ctx,
        communityId,
        rootId,
        visibilityScope: "community",
        blocks,
        nowMs: opts.atMs,
      });
      if (!isAgent) {
        const message = await createLegacyCompatibilityChatMessageForInteraction({
          ctx,
          thread,
          actorUserId: userIdByKey[opts.authorKey],
          text: opts.text,
          nowMs: opts.atMs,
        });
        await insertLegacyChatLinkIfMissing({
          ctx,
          communityId,
          threadId: thread._id,
          messageId: message._id,
          linkKind: "root",
          rootId,
          nowMs: opts.atMs,
        });
      }
      return (await ctx.db.get(rootId as any)) as InteractionRootRow;
    };

    const makeReply = async (opts: {
      key: string;
      rootId: any;
      authorKey: string;
      text: string;
      atMs: number;
      reactions?: Array<{ emoji: string; count: number }>;
    }) => {
      const idempotencyKey = `seed:reply:${opts.key}`;
      const existing = await getExistingReplyByIdempotencyKey(ctx, communityId, idempotencyKey);
      if (existing) return existing;
      const root = (await ctx.db.get(opts.rootId as any)) as InteractionRootRow;
      const blocks: NormalizedContentBlock[] = [{ blockType: "markdown_text", text: opts.text }];
      const seq = await nextReplySeq(ctx, root._id);
      const replyId = await ctx.db.insert("communityInteractionReplies" as any, {
        communityId,
        rootId: opts.rootId,
        seq,
        actorType: "human",
        actorUserId: userIdByKey[opts.authorKey],
        status: "live",
        visibilityScope: "community",
        contentSummary: contentSummary(blocks),
        reactionSummary: opts.reactions ?? [],
        idempotencyKey,
        createdAt: opts.atMs,
        updatedAt: opts.atMs,
      });
      await insertContentBlocksForTarget({
        ctx,
        communityId,
        replyId,
        visibilityScope: "community",
        blocks,
        nowMs: opts.atMs,
      });
      await ctx.db.patch(opts.rootId as any, {
        replyCount: Math.max(0, Math.floor(root.replyCount ?? 0)) + 1,
        lastReplyAt: opts.atMs,
        updatedAt: opts.atMs,
      });
      const message = await createLegacyCompatibilityChatMessageForInteraction({
        ctx,
        thread,
        actorUserId: userIdByKey[opts.authorKey],
        text: opts.text,
        nowMs: opts.atMs,
      });
      await insertLegacyChatLinkIfMissing({
        ctx,
        communityId,
        threadId: thread._id,
        messageId: message._id,
        linkKind: "reply",
        rootId: opts.rootId,
        replyId,
        nowMs: opts.atMs,
      });
      return replyId;
    };

    await makeRoot({
      key: "welcome",
      authorKey: "neil",
      kind: "announcement",
      text: "Welcome to Polynet 👋 This is the founding room. Drop a quick intro: what are you building, and what should your community's AI agent actually do?",
      atMs: nowMs - (DAY + 6 * HOUR),
      reactions: [{ emoji: "👋", count: 4 }, { emoji: "🔥", count: 2 }],
    });
    await makeRoot({
      key: "maya-intro",
      authorKey: "maya",
      kind: "discussion",
      text: "Hey all! Maya here — I run an online strength-training community (~400 members). I want the agent answering form-check and programming questions so I'm not repeating myself 50x a week.",
      atMs: nowMs - (DAY + 5 * HOUR),
      reactions: [{ emoji: "💪", count: 3 }],
    });
    await makeRoot({
      key: "dev-intro",
      authorKey: "dev",
      kind: "discussion",
      text: "Dev, indie hacker doing AI automation for small agencies. Hoping the agent can triage incoming client questions and route the gnarly ones to me.",
      atMs: nowMs - (DAY + 4.5 * HOUR),
    });
    const sofiaQ = await makeRoot({
      key: "sofia-billing",
      authorKey: "sofia",
      kind: "question",
      text: "Quick one before I migrate my Discord over — how does billing work for the AI? Do I pay for my members' tokens?? 😅",
      atMs: nowMs - (DAY + 4 * HOUR),
    });
    await makeReply({
      key: "sofia-billing-1",
      rootId: sofiaQ._id,
      authorKey: "neil",
      text: "Nope — it's BYOK. Members connect their own OpenAI key or ChatGPT login. You never pay for their tokens.",
      atMs: nowMs - (DAY + 3.8 * HOUR),
      reactions: [{ emoji: "👍", count: 2 }],
    });
    await makeReply({
      key: "sofia-billing-2",
      rootId: sofiaQ._id,
      authorKey: "dev",
      text: "this is the part that sold me honestly. ran the numbers, no way I could eat inference for a free community",
      atMs: nowMs - (DAY + 3.6 * HOUR),
    });
    await makeReply({
      key: "sofia-billing-3",
      rootId: sofiaQ._id,
      authorKey: "sofia",
      text: "ok that's a huge relief, thank you 🙏",
      atMs: nowMs - (DAY + 3.4 * HOUR),
    });
    const aimen = await makeRoot({
      key: "aimen-intro",
      authorKey: "aimen",
      kind: "discussion",
      text: "Aimen — surfactant R&D / manufacturing. Niche, but there's a real community of process chemists who'd kill for a shared knowledge base. Curious how the memory stuff works.",
      atMs: nowMs - 6 * HOUR,
    });
    await makeReply({
      key: "aimen-1",
      rootId: aimen._id,
      authorKey: "neil",
      text: "That's the dream use case honestly. High-signal threads get promoted into the community's memory, so the knowledge compounds instead of scrolling away.",
      atMs: nowMs - 5.7 * HOUR,
    });
    await makeReply({
      key: "aimen-2",
      rootId: aimen._id,
      authorKey: "aimen",
      text: "wait so the agent actually learns from the conversations over time?",
      atMs: nowMs - 5.5 * HOUR,
    });
    await makeReply({
      key: "aimen-3",
      rootId: aimen._id,
      authorKey: "neil",
      text: "yeah — but gated. Nothing enters long-term memory without passing a review step. No hallucinated 'facts' polluting it.",
      atMs: nowMs - 5.3 * HOUR,
    });
    await makeRoot({
      key: "justin-codex",
      authorKey: "justin",
      kind: "discussion",
      text: "just wired Codex into my Polynet workspace and had it scaffold a landing page in ~3 minutes. this is unreal 🤯",
      atMs: nowMs - 3 * HOUR,
      reactions: [{ emoji: "🔥", count: 4 }, { emoji: "🚀", count: 2 }],
    });
    await makeRoot({
      key: "agent-digest",
      authorKey: "agent",
      kind: "agent_signal",
      text: "Daily digest — 3 high-signal threads promoted to community memory: 'How BYOK billing works', 'Memory & the review gate', and 'Codex in your workspace'.",
      atMs: nowMs - 2 * HOUR,
    });
    await makeRoot({
      key: "neil-call",
      authorKey: "neil",
      kind: "announcement",
      text: "First community call this Friday 11am PT — bring what you're building.",
      atMs: nowMs - 1 * HOUR,
    });

    return { ok: true, communityId: normalizeIdValue(communityId) };
  },
});

export const unseedPolynetChatDemo = internalMutation({
  args: { communityId: v.optional(v.id("communities")) },
  handler: async (ctx, args) => {
    let communityId: any = args.communityId ?? null;
    if (!communityId) {
      const latestRoot = (await ctx.db
        .query("communityInteractionRoots" as any)
        .order("desc")
        .first()) as InteractionRootRow | null;
      communityId = latestRoot?.communityId ?? null;
    }
    if (!communityId) return { ok: true, deletedRoots: 0 };

    const deleteByIndex = async (table: string, index: string, field: string, value: any) => {
      const rows = await ctx.db
        .query(table as any)
        .withIndex(index, (q: any) => q.eq(field, value))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    };

    const roots = (await ctx.db
      .query("communityInteractionRoots" as any)
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
      .collect()) as InteractionRootRow[];
    let deletedRoots = 0;
    for (const root of roots) {
      if (!String(root.idempotencyKey ?? "").startsWith("seed:")) continue;
      const replies = (await ctx.db
        .query("communityInteractionReplies" as any)
        .withIndex("by_root_seq", (q: any) => q.eq("rootId", root._id))
        .collect()) as InteractionReplyRow[];
      for (const reply of replies) {
        await deleteByIndex("communityInteractionContentBlocks", "by_reply_order", "replyId", reply._id);
        const replyLinks = await ctx.db
          .query("communityInteractionLegacyChatLinks" as any)
          .withIndex("by_reply", (q: any) => q.eq("replyId", reply._id))
          .collect();
        for (const link of replyLinks) {
          if (link.messageId) await ctx.db.delete(link.messageId).catch(() => undefined);
          await ctx.db.delete(link._id);
        }
        await ctx.db.delete(reply._id);
      }
      await deleteByIndex("communityInteractionContentBlocks", "by_root_order", "rootId", root._id);
      await deleteByIndex("communityInteractionEmbeds", "by_root", "rootId", root._id);
      await deleteByIndex("communityInteractionMentions", "by_root", "rootId", root._id);
      const rootLinks = await ctx.db
        .query("communityInteractionLegacyChatLinks" as any)
        .withIndex("by_root", (q: any) => q.eq("rootId", root._id))
        .collect();
      for (const link of rootLinks) {
        if (link.messageId) await ctx.db.delete(link.messageId).catch(() => undefined);
        await ctx.db.delete(link._id);
      }
      await ctx.db.delete(root._id);
      deletedRoots += 1;
    }

    for (const person of SEED_PEOPLE) {
      const authSubject = `${SEED_AUTH_PREFIX}${person.key}`;
      const user = (await ctx.db
        .query("users" as any)
        .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject))
        .first()) as any;
      if (!user) continue;
      const memberships = await ctx.db
        .query("communityMemberships" as any)
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect();
      for (const m of memberships) await ctx.db.delete(m._id);
      await ctx.db.delete(user._id);
    }

    return { ok: true, deletedRoots };
  },
});

// ---------------------------------------------------------------------------
// Link embed enrichment: fetch OG metadata for pending link embeds and flip them to ready.
// ---------------------------------------------------------------------------

const MAX_EMBED_TITLE_CHARS = 300;
const MAX_EMBED_DESCRIPTION_CHARS = 600;
const MAX_EMBED_IMAGE_URL_CHARS = 2048;

function boundedEmbedString(raw: unknown, maxChars: number): string | null {
  const value = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!value) return null;
  return value.slice(0, maxChars);
}

function hostnameOfUrl(raw: string): string | null {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Fire-and-forget enrichment for each freshly-created embed (link embeds resolve; others no-op).
async function scheduleEmbedEnrichment(ctx: any, embedIds: string[]): Promise<void> {
  for (const embedId of embedIds) {
    await ctx.scheduler.runAfter(0, internal.communityInteractions.enrichInteractionEmbed, { embedId });
  }
}

export const getInteractionEmbedForEnrichment = internalQuery({
  args: { embedId: v.string() },
  handler: async (ctx, args) => {
    const embed = (await ctx.db.get(args.embedId as any)) as EmbedRow | null;
    if (!embed) return null;
    return {
      embedKind: embed.embedKind,
      status: embed.status,
      sourceUrl: embed.sourceUrl ?? embed.normalizedSourceUrl ?? null,
    };
  },
});

export const applyInteractionEmbedEnrichment = internalMutation({
  args: {
    embedId: v.string(),
    status: v.union(v.literal("ready"), v.literal("failed")),
    title: v.optional(v.union(v.string(), v.null())),
    description: v.optional(v.union(v.string(), v.null())),
    imageUrl: v.optional(v.union(v.string(), v.null())),
    provider: v.optional(v.union(v.string(), v.null())),
    error: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const embed = (await ctx.db.get(args.embedId as any)) as EmbedRow | null;
    // Only advance embeds still pending — never clobber a redacted/edited embed.
    if (!embed || embed.status !== "pending") return;
    await ctx.db.patch(args.embedId as any, {
      status: args.status,
      ...(args.title ? { title: args.title } : {}),
      ...(args.description ? { description: args.description } : {}),
      ...(args.imageUrl ? { imageUrl: args.imageUrl } : {}),
      ...(args.provider ? { provider: args.provider } : {}),
      ...(args.error ? { error: args.error } : {}),
      fetchedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

async function fetchEmbedOpenGraph(
  sourceUrl: string,
): Promise<{ title: string | null; description: string | null; imageUrl: string | null }> {
  const endpoint = String(process.env.ARX_SOURCE_URL_FETCHER_ENDPOINT ?? "").trim();
  const secret = String(process.env.ARX_SOURCE_URL_FETCHER_SECRET ?? "").trim();
  if (!endpoint || !secret) throw new Error("source_url_fetcher_not_configured");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      url: sourceUrl,
      max_bytes: 1_500_000,
      max_chars: 4000,
      timeout_ms: 8000,
      max_redirects: 4,
    }),
  });
  if (!response.ok) throw new Error(`source_url_fetcher_failed_${response.status}`);
  const payload = (await response.json()) as Record<string, unknown>;
  if (payload.ok === false) throw new Error(String(payload.error_code ?? "source_url_fetch_failed"));
  return {
    title: boundedEmbedString(payload.og_title ?? payload.title, MAX_EMBED_TITLE_CHARS),
    description: boundedEmbedString(payload.og_description, MAX_EMBED_DESCRIPTION_CHARS),
    imageUrl: boundedEmbedString(payload.og_image, MAX_EMBED_IMAGE_URL_CHARS),
  };
}

export const enrichInteractionEmbed = internalAction({
  args: { embedId: v.string() },
  handler: async (ctx, args) => {
    const embed = await ctx.runQuery(internal.communityInteractions.getInteractionEmbedForEnrichment, {
      embedId: args.embedId,
    });
    if (!embed || embed.embedKind !== "link" || embed.status !== "pending" || !embed.sourceUrl) return;
    try {
      const og = await fetchEmbedOpenGraph(embed.sourceUrl);
      await ctx.runMutation(internal.communityInteractions.applyInteractionEmbedEnrichment, {
        embedId: args.embedId,
        status: "ready",
        title: og.title,
        description: og.description,
        imageUrl: og.imageUrl,
        provider: hostnameOfUrl(embed.sourceUrl),
      });
    } catch (error) {
      await ctx.runMutation(internal.communityInteractions.applyInteractionEmbedEnrichment, {
        embedId: args.embedId,
        status: "failed",
        provider: hostnameOfUrl(embed.sourceUrl),
        error: String(error instanceof Error ? error.message : error).slice(0, 200),
      });
    }
  },
});
