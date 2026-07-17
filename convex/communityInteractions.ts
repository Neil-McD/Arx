import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
  normalizeIdValue,
  requireCommunityChatAccess,
  requireCommunityManager,
  requireCommunityModerator,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { requireProfileSetupCompleteForUser } from "./accountSetupCore";
import {
  getLegacyChatLinkByMessage,
  getLegacyChatLinkByReply,
  getLegacyChatLinkByRoot,
  insertLegacyChatLinkIfMissing,
  legacyChatIdempotencyKey,
} from "./communityInteractionLegacyBridge";
import {
  insertCanonicalInteractionAttachmentsForTarget,
  insertCanonicalInteractionAttachmentsFromLegacyMessage,
  listCanonicalInteractionAttachmentsForTarget,
  normalizeInteractionAttachmentInputs,
  type NormalizedInteractionAttachmentInput,
} from "./communityInteractionAttachmentBridge";
import { resolveLegacyMessageAttachments } from "./communityInteractionLegacyAttachments";
import {
  normalizeCommunitySourcePolicyString,
  requireSafeCommunitySourceFetcherEndpoint,
  requireSafeCommunitySourceUrl,
} from "./communitySourceUrlPolicy";
import { settleMentionRowInternal } from "./communityMentionLifecycle";
import { intakeCommunityAgentMention } from "./communityAgentConciergeCore";
import {
  recordCommunityOnboardingMilestone,
} from "./communityOnboardingCore";
import { CANONICAL_COMMUNITY_AGENT_KEY } from "../shared/communityAgentToolProtocol";
import {
  buildCommunityAgentServeRunId,
  communityAgentDockReplyIsVisibleToOwner,
  normalizeCommunityAgentServeAttempt,
  projectCommunityAgentDockPublicIssue,
} from "../shared/communityAgentDockContract";
import {
  EVERYBODY_MENTION_ROLE_KEY,
  cancelEverybodyMentionBroadcastsForInteractionSource,
  scheduleEverybodyMentionBroadcast,
  textContainsEverybodyMentionToken,
} from "./communityMentionBroadcasts";
import { scheduleCommunityInteractionEvidenceSync } from "./communityInteractionEvidence";

type InteractionActorType = "human" | "personal_agent" | "community_agent" | "system";
type InteractionRootKind = "discussion" | "announcement" | "question" | "resource_share" | "agent_signal";
type InteractionStatus = "live" | "hidden" | "deleted";
type InteractionVisibilityScope = "private" | "admin" | "community" | "public";
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
const MAX_INTERACTION_IDEMPOTENCY_KEY_CHARS = 160;
const MAX_INTERACTION_URL_CHARS = 2048;
const MAX_INTERACTION_ROOT_READ_LIMIT = 50;
const MAX_INTERACTION_REPLY_READ_LIMIT = 100;
const MAX_INTERACTION_EMBEDS_PER_BUNDLE = 24;
const MAX_INTERACTION_MENTIONS_PER_BUNDLE = 24;
const MAX_VIEWER_REACTIONS_PER_TARGET = 24;
const MAX_INTERACTION_MENTIONS_PER_WRITE = 24;
const MAX_INTERACTION_MENTION_LIFECYCLE_ROWS = MAX_INTERACTION_MENTIONS_PER_WRITE + 8;
const COMMUNITY_AGENT_DOCK_REPLY_LIMIT = 100;

const rootKindValidator = v.union(
  v.literal("discussion"),
  v.literal("announcement"),
  v.literal("question"),
  v.literal("resource_share"),
  v.literal("agent_signal"),
);

const interactionAttachmentInputValidator = v.object({
  id: v.optional(v.string()),
  name: v.string(),
  type: v.string(),
  mime: v.optional(v.union(v.string(), v.null())),
  size: v.number(),
  storageId: v.optional(v.id("_storage")),
  data_url: v.optional(v.string()),
  text: v.optional(v.string()),
  truncated: v.optional(v.boolean()),
});

function normalizeBoundedText(raw: unknown, maxLength: number): string {
  return String(raw ?? "").trim().slice(0, maxLength);
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

function composerIdempotencyKey(idempotencyKey: string, kind: "root" | "reply"): string {
  return `community_composer:${kind}:${idempotencyKey}`.slice(0, MAX_INTERACTION_IDEMPOTENCY_KEY_CHARS);
}

function communityAgentDockRootIdempotencyKey(userId: any): string {
  return `community_agent_dock:root:${normalizeIdValue(userId)}`.slice(
    0,
    MAX_INTERACTION_IDEMPOTENCY_KEY_CHARS,
  );
}

function communityAgentDockReplyIdempotencyKey(raw: unknown): string {
  return `community_agent_dock:reply:${normalizeIdempotencyKey(raw)}`.slice(
    0,
    MAX_INTERACTION_IDEMPOTENCY_KEY_CHARS,
  );
}

function assertOwnedCommunityAgentDockRoot(root: InteractionRootRow, userId: any): void {
  if (
    root.actorType !== "system" ||
    normalizeIdValue(root.actorUserId) !== normalizeIdValue(userId) ||
    root.kind !== "agent_signal" ||
    root.visibilityScope !== "private" ||
    root.status !== "live"
  ) {
    throw new Error("community_agent_dock_root_invalid");
  }
}

async function findCanonicalAgentMentionForReply(ctx: any, replyId: any): Promise<MentionRow | null> {
  const mentions = (await ctx.db
    .query("communityInteractionMentions" as any)
    .withIndex("by_reply", (q: any) => q.eq("replyId", replyId))
    .take(MAX_INTERACTION_MENTIONS_PER_BUNDLE)) as MentionRow[];
  return mentions.find(
    (mention) =>
      mention.mentionKind === "community_agent" &&
      mention.mentionedAgentKey === CANONICAL_COMMUNITY_AGENT_KEY,
  ) ?? null;
}

async function mapCommunityAgentDockMessage(ctx: any, reply: InteractionReplyRow) {
  const blocks = await listContentBlocksForReply(ctx, reply._id);
  const text = blocks
    .filter((block) => block.blockType === "markdown_text" && block.text)
    .map((block) => String(block.text ?? ""))
    .join("\n\n")
    .trim() || reply.contentSummary;
  return {
    id: normalizeIdValue(reply._id),
    actor_type: reply.actorType,
    actor_agent_key: reply.actorAgentKey ?? null,
    text,
    created_at: toIsoString(reply.createdAt),
  };
}

async function resolveOptionalReplyTargetForCanonicalComposer(args: {
  ctx: any;
  root: InteractionRootRow;
  replyToMessageId?: string | null;
}): Promise<{ targetReplyId?: any }> {
  const requestedTargetId = String(args.replyToMessageId ?? "").trim();
  if (!requestedTargetId) return {};

  const directReply = (await args.ctx.db.get(requestedTargetId as any)) as InteractionReplyRow | null;
  if (directReply?.rootId) {
    if (normalizeIdValue(directReply.rootId) !== normalizeIdValue(args.root._id)) {
      throw new Error("interaction_target_reply_invalid");
    }
    return { targetReplyId: directReply._id };
  }

  const targetLink = await getLegacyChatLinkByMessage(args.ctx, requestedTargetId as any);
  if (!targetLink?.replyId) return {};
  if (normalizeIdValue(targetLink.rootId) !== normalizeIdValue(args.root._id)) {
    throw new Error("interaction_target_reply_invalid");
  }
  const targetReply = (await args.ctx.db.get(targetLink.replyId as any)) as InteractionReplyRow | null;
  if (!targetReply || normalizeIdValue(targetReply.rootId) !== normalizeIdValue(args.root._id)) {
    throw new Error("interaction_target_reply_invalid");
  }
  return { targetReplyId: targetReply._id };
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
  const url = requireSafeCommunitySourceUrl(raw, MAX_INTERACTION_URL_CHARS);
  return {
    sourceUrl: url,
    normalizedSourceUrl: url.slice(0, MAX_INTERACTION_URL_CHARS),
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

function attachmentSummary(attachments: NormalizedInteractionAttachmentInput[]): string {
  const names = attachments
    .map((attachment) => normalizeBoundedText(attachment.name, 80))
    .filter(Boolean)
    .slice(0, 8);
  const summary = names.length === 1
    ? `Shared attachment: ${names[0]}`
    : names.length > 1
      ? `Shared attachments: ${names.join(", ")}`
      : "";
  const normalized = normalizeBoundedText(summary, MAX_INTERACTION_SUMMARY_CHARS);
  if (!normalized) throw new Error("interaction_content_required");
  return normalized;
}

function composerContentSummary(
  blocks: NormalizedContentBlock[],
  attachments: NormalizedInteractionAttachmentInput[],
): string {
  if (blocks.length > 0) return contentSummary(blocks);
  return attachmentSummary(attachments);
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

function interactionVisibilityIsCommunityReadable(scope: InteractionVisibilityScope): boolean {
  return scope === "community" || scope === "public";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isInteractionRootRow(value: unknown): value is InteractionRootRow {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    typeof value.status === "string" &&
    typeof value.visibilityScope === "string" &&
    typeof value.replyCount === "number" &&
    !("rootId" in value)
  );
}

function isInteractionReplyRow(value: unknown): value is InteractionReplyRow {
  return (
    isRecord(value) &&
    Boolean(value.rootId) &&
    typeof value.seq === "number" &&
    typeof value.status === "string" &&
    typeof value.visibilityScope === "string"
  );
}

function assertCommunityReadableRoot(root: InteractionRootRow): void {
  if (root.status !== "live" || !interactionVisibilityIsCommunityReadable(root.visibilityScope)) {
    throw new Error("interaction_root_not_readable");
  }
}

function assertCommunityReadableReply(reply: InteractionReplyRow): void {
  if (reply.status !== "live" || !interactionVisibilityIsCommunityReadable(reply.visibilityScope)) {
    throw new Error("interaction_reply_not_readable");
  }
}

async function loadCommunityInteractionTarget(args: {
  ctx: any;
  targetType: "root" | "reply";
  targetId: string;
}): Promise<{ target: InteractionRootRow | InteractionReplyRow; communityId: any }> {
  const target = await args.ctx.db.get(args.targetId as any);
  if (!target) throw new Error("interaction_target_not_found");
  if (args.targetType === "root") {
    if (!isInteractionRootRow(target)) throw new Error("interaction_target_type_mismatch");
    return { target, communityId: target.communityId };
  }
  if (!isInteractionReplyRow(target)) throw new Error("interaction_target_type_mismatch");
  return { target, communityId: target.communityId };
}

function assertLiveInteractionTarget(target: InteractionRootRow | InteractionReplyRow): void {
  if (target.status !== "live") throw new Error("interaction_target_not_live");
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

async function listMentionRowsForInteractionLifecycle(args: {
  ctx: any;
  targetType: "root" | "reply";
  targetId: any;
}): Promise<MentionRow[]> {
  // Source/direct mention rows are bounded at write time. Broadcast recipient
  // rows are unbounded fanout projections and are cleaned by sourceBroadcastId.
  return (await args.ctx.db
    .query("communityInteractionMentions" as any)
    .withIndex(args.targetType === "reply" ? "by_reply" : "by_root", (q: any) =>
      q.eq(args.targetType === "reply" ? "replyId" : "rootId", args.targetId),
    )
    .take(MAX_INTERACTION_MENTION_LIFECYCLE_ROWS)) as MentionRow[];
}

async function suppressPendingMentionRows(ctx: any, rows: Array<{ _id: any }>, nowMs: number): Promise<void> {
  for (const row of rows) {
    await settleMentionRowInternal({
      ctx,
      mentionId: row._id,
      toState: "suppressed",
      nowMs,
    });
  }
}

async function suppressPendingMentionsForInteractionSource(args: {
  ctx: any;
  targetType: "root" | "reply";
  targetId: any;
  nowMs: number;
}): Promise<void> {
  await suppressPendingMentionRows(
    args.ctx,
    await listMentionRowsForInteractionLifecycle(args),
    args.nowMs,
  );
}

async function suppressPendingMentionsMissingFromInteractionText(args: {
  ctx: any;
  targetType: "root" | "reply";
  targetId: any;
  text: string;
  nowMs: number;
}): Promise<void> {
  if (!textContainsEverybodyMentionToken(args.text)) {
    await cancelEverybodyMentionBroadcastsForInteractionSource({
      ctx: args.ctx,
      targetType: args.targetType,
      targetId: args.targetId,
      nowMs: args.nowMs,
      includeReplySources: false,
      errorCode: "source_mention_removed",
    });
  }
  const rows = await listMentionRowsForInteractionLifecycle(args);
  for (const row of rows) {
    if (row.notifyState !== "pending") continue;
    if (
      row.mentionedRoleKey === EVERYBODY_MENTION_ROLE_KEY &&
      interactionTextContainsRoleMention(args.text, EVERYBODY_MENTION_ROLE_KEY)
    ) {
      continue;
    }
    if (row.mentionKind === "user" && row.mentionedUserId) {
      const user = (await args.ctx.db.get(row.mentionedUserId)) as { handle?: string; normalizedHandle?: string } | null;
      if (user && interactionTextContainsHandleMention(args.text, user.handle ?? user.normalizedHandle)) {
        continue;
      }
    }
    if (
      row.mentionKind === "community_agent" &&
      row.mentionedAgentKey === "community_agent" &&
      (await interactionTextContainsCommunityAgentMention({
        ctx: args.ctx,
        communityId: row.communityId,
        text: args.text,
      }))
    ) {
      continue;
    }
    await suppressPendingMentionRows(args.ctx, [row], args.nowMs);
  }
}

async function suppressPendingMentionsForDeletedInteractionTarget(args: {
  ctx: any;
  targetType: "root" | "reply";
  targetId: any;
  nowMs: number;
}): Promise<void> {
  await cancelEverybodyMentionBroadcastsForInteractionSource({
    ctx: args.ctx,
    targetType: args.targetType,
    targetId: args.targetId,
    nowMs: args.nowMs,
    includeReplySources: args.targetType === "root",
    errorCode: "source_deleted",
  });
  if (args.targetType === "reply") {
    await suppressPendingMentionsForInteractionSource(args);
    return;
  }
  await suppressPendingMentionsForInteractionSource(args);
  const replies = (await args.ctx.db
    .query("communityInteractionReplies" as any)
    .withIndex("by_root_createdAt", (q: any) => q.eq("rootId", args.targetId))
    .take(500)) as InteractionReplyRow[];
  for (const reply of replies) {
    await suppressPendingMentionRows(
      args.ctx,
      await listMentionRowsForInteractionLifecycle({
        ctx: args.ctx,
        targetType: "reply",
        targetId: reply._id,
      }),
      args.nowMs,
    );
  }
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

async function mapMention(ctx: any, row: MentionRow, userIdCache?: Map<string, string | null>) {
  return {
    id: normalizeIdValue(row._id),
    mention_kind: row.mentionKind,
    // Same identity conversion as actors: the frontend knows users by their
    // public (auth-subject) id, so a raw canonical id here can never resolve
    // to a profile — the chip would silently degrade to plain text.
    mentioned_user_id: row.mentionedUserId
      ? await resolvePublicUserId(ctx, row.mentionedUserId, userIdCache)
      : null,
    mentioned_agent_key: row.mentionedAgentKey ?? null,
    mentioned_role_key: row.mentionedRoleKey ?? null,
    notify_state: row.notifyState,
  };
}

export async function mapMentions(ctx: any, rows: MentionRow[], userIdCache?: Map<string, string | null>) {
  const mapped = [];
  for (const row of rows) mapped.push(await mapMention(ctx, row, userIdCache));
  return mapped;
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
  const canonicalAttachments = await listCanonicalInteractionAttachmentsForTarget({ ctx, rootId: root._id });
  const attachments = canonicalAttachments.length > 0
    ? canonicalAttachments
    : await resolveLegacyMessageAttachments(ctx, legacyLink?.messageId);
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
    mentions: await mapMentions(ctx, mentions, userIdCache),
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
  const canonicalAttachments = await listCanonicalInteractionAttachmentsForTarget({ ctx, replyId: reply._id });
  const attachments = canonicalAttachments.length > 0
    ? canonicalAttachments
    : await resolveLegacyMessageAttachments(ctx, legacyLink?.messageId);
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
    mentions: await mapMentions(ctx, mentions, userIdCache),
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
      message: CommunityChatMessageLike;
      nowMs: number;
      needsLegacyLink: boolean;
    }
  | {
      planKind: "create_root";
      communityId: any;
      threadId: any;
      messageId: any;
      message: CommunityChatMessageLike;
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
      message: CommunityChatMessageLike;
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
      message: CommunityChatMessageLike;
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
      message: args.message,
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
      message: args.message,
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
    message: args.message,
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
    await insertCanonicalInteractionAttachmentsFromLegacyMessage({
      ctx,
      communityId: plan.communityId,
      rootId: plan.root._id,
      message: plan.message,
      nowMs: plan.nowMs,
    });
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
    await scheduleCommunityInteractionEvidenceSync({
      ctx,
      communityId: plan.communityId,
      objectType: "root",
      objectId: plan.root._id,
    });
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
  await insertCanonicalInteractionAttachmentsFromLegacyMessage({
    ctx,
    communityId: plan.communityId,
    rootId,
    message: plan.message,
    nowMs: plan.nowMs,
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
  await scheduleCommunityInteractionEvidenceSync({
    ctx,
    communityId: plan.communityId,
    objectType: "root",
    objectId: rootId,
  });
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
      message: args.message,
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
      message: args.message,
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
    message: args.message,
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
    await insertCanonicalInteractionAttachmentsFromLegacyMessage({
      ctx,
      communityId: plan.communityId,
      replyId: plan.reply._id,
      message: plan.message,
      nowMs: plan.nowMs,
    });
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
    await scheduleCommunityInteractionEvidenceSync({
      ctx,
      communityId: plan.communityId,
      objectType: "reply",
      objectId: plan.reply._id,
    });
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
  await insertCanonicalInteractionAttachmentsFromLegacyMessage({
    ctx,
    communityId: plan.communityId,
    replyId,
    message: plan.message,
    nowMs: plan.nowMs,
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
  await scheduleCommunityInteractionEvidenceSync({
    ctx,
    communityId: plan.communityId,
    objectType: "reply",
    objectId: replyId,
  });
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

type UserInteractionMentionSpec = { kind: "user"; userId: any; sourceRoleKey?: string };

type InteractionMentionSpec =
  | UserInteractionMentionSpec
  | { kind: "community_agent"; agentKey: string }
  | { kind: "role"; roleKey: string };

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function interactionTextContainsAtToken(text: string, tokenLabel: unknown): boolean {
  const normalizedLabel = String(tokenLabel ?? "").trim().replace(/^@+/, "").toLowerCase();
  if (!normalizedLabel) return false;
  const pattern = new RegExp(`(^|\\s)@${escapeRegExp(normalizedLabel)}(?![A-Za-z0-9_-])`, "i");
  return pattern.test(text);
}

function interactionTextContainsHandleMention(text: string, handle: unknown): boolean {
  return interactionTextContainsAtToken(text, handle);
}

function interactionTextContainsRoleMention(text: string, roleKey: unknown): boolean {
  if (String(roleKey ?? "").trim().replace(/^@+/, "").toLowerCase() === EVERYBODY_MENTION_ROLE_KEY) {
    return textContainsEverybodyMentionToken(text);
  }
  return interactionTextContainsAtToken(text, roleKey);
}

async function interactionTextContainsCommunityAgentMention(args: {
  ctx: any;
  communityId: any;
  text: string;
}): Promise<boolean> {
  const community = (await args.ctx.db.get(args.communityId as any)) as { name?: string } | null;
  return interactionTextContainsAtToken(args.text, community?.name);
}

async function validateEverybodyMentionForWrite(args: {
  ctx: any;
  communityId: any;
  actorUserId: any;
  targetKind: "root" | "reply";
}): Promise<void> {
  if (args.targetKind !== "root") {
    throw new Error("interaction_mention_everybody_reply_not_allowed");
  }
  await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.actorUserId,
  });
}

export async function resolveMentionedUserIdsForInteractionWrite(args: {
  ctx: any;
  communityId: any;
  actorUserId: any;
  targetKind: "root" | "reply";
  text: string;
  mentions: Array<{ userId?: any; agentKey?: any; roleKey?: any }>;
}): Promise<InteractionMentionSpec[]> {
  const seenAgents = new Set<string>();
  const seenRoles = new Set<string>();
  const userSpecsById = new Map<string, UserInteractionMentionSpec>();
  const out: InteractionMentionSpec[] = [];
  let directMentionCount = 0;
  for (const mention of args.mentions) {
    if (mention.roleKey) {
      if (mention.userId || mention.agentKey) throw new Error("interaction_mention_payload_ambiguous");
      const roleKey = String(mention.roleKey ?? "").trim().replace(/^@+/, "").toLowerCase();
      if (roleKey !== EVERYBODY_MENTION_ROLE_KEY) throw new Error("interaction_mention_role_unknown");
      if (seenRoles.has(roleKey)) continue;
      if (!interactionTextContainsRoleMention(args.text, roleKey)) {
        throw new Error("interaction_mention_token_missing");
      }
      seenRoles.add(roleKey);
      await validateEverybodyMentionForWrite({
        ctx: args.ctx,
        communityId: args.communityId,
        actorUserId: args.actorUserId,
        targetKind: args.targetKind,
      });
      out.push({ kind: "role", roleKey });
      continue;
    }
    // Community-agent mentions carry an agent key, never a user id. Only the
    // canonical community agent is taggable.
    if (!mention.userId && mention.agentKey) {
      const agentKey = String(mention.agentKey ?? "").trim();
      if (agentKey !== "community_agent") throw new Error("interaction_mention_agent_unknown");
      if (seenAgents.has(agentKey)) continue;
      seenAgents.add(agentKey);
      if (directMentionCount >= MAX_INTERACTION_MENTIONS_PER_WRITE) {
        throw new Error("interaction_mentions_limit_exceeded");
      }
      if (
        !(await interactionTextContainsCommunityAgentMention({
          ctx: args.ctx,
          communityId: args.communityId,
          text: args.text,
        }))
      ) {
        throw new Error("interaction_mention_token_missing");
      }
      directMentionCount += 1;
      out.push({ kind: "community_agent", agentKey });
      continue;
    }
    // Clients know members by canonical users id or by auth subject (the
    // profiles projection exposes the latter as user_id) — resolve either
    // form here; the mention row always stores the canonical users id.
    const rawUserId = String(mention.userId ?? "").trim();
    if (!rawUserId) continue;
    const canonicalId = args.ctx.db.normalizeId("users" as any, rawUserId);
    const user = canonicalId
      ? await args.ctx.db.get(canonicalId)
      : await args.ctx.db
          .query("users" as any)
          .withIndex("by_authSubject", (q: any) => q.eq("authSubject", rawUserId))
          .first();
    if (!user) throw new Error("interaction_mention_user_not_found");
    const normalized = normalizeIdValue(user._id);
    if (!normalized || userSpecsById.has(normalized)) continue;
    if (!interactionTextContainsHandleMention(args.text, user.handle ?? user.normalizedHandle)) {
      throw new Error("interaction_mention_token_missing");
    }
    if (directMentionCount >= MAX_INTERACTION_MENTIONS_PER_WRITE) {
      throw new Error("interaction_mentions_limit_exceeded");
    }
    directMentionCount += 1;
    try {
      await requireCommunityChatAccess({
        ctx: args.ctx,
        communityId: args.communityId,
        userId: user._id,
      });
    } catch {
      throw new Error("interaction_mention_user_not_allowed");
    }
    const spec: UserInteractionMentionSpec = { kind: "user", userId: user._id };
    userSpecsById.set(normalized, spec);
    out.push(spec);
  }
  return out;
}

async function insertCommunityInteractionMentionRows(args: {
  ctx: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  mentionedUserIds: InteractionMentionSpec[];
  actorUserId: any;
  nowMs: number;
}): Promise<void> {
  const orderedMentionSpecs = args.mentionedUserIds
    .slice()
    .sort((left, right) => (left.kind === "role" ? -1 : 0) - (right.kind === "role" ? -1 : 0));
  const hasEverybodyRoleMention = orderedMentionSpecs.some(
    (spec) => spec.kind === "role" && spec.roleKey === EVERYBODY_MENTION_ROLE_KEY,
  );
  if (hasEverybodyRoleMention && args.replyId) {
    throw new Error("interaction_mention_everybody_reply_not_allowed");
  }
  if (hasEverybodyRoleMention && !args.rootId) {
    throw new Error("interaction_mention_broadcast_source_required");
  }
  for (const spec of orderedMentionSpecs) {
    const mentionId = await args.ctx.db.insert("communityInteractionMentions" as any, {
      communityId: args.communityId,
      ...(args.rootId ? { rootId: args.rootId } : {}),
      ...(args.replyId ? { replyId: args.replyId } : {}),
      mentionKind: spec.kind,
      ...(spec.kind === "user" ? { mentionedUserId: spec.userId } : {}),
      ...(spec.kind === "community_agent" ? { mentionedAgentKey: spec.agentKey } : {}),
      ...(spec.kind === "user" && spec.sourceRoleKey ? { mentionedRoleKey: spec.sourceRoleKey } : {}),
      ...(spec.kind === "role" ? { mentionedRoleKey: spec.roleKey } : {}),
      notifyState: "pending",
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    if (spec.kind === "role" && spec.roleKey === EVERYBODY_MENTION_ROLE_KEY) {
      await scheduleEverybodyMentionBroadcast({
        ctx: args.ctx,
        communityId: args.communityId,
        rootId: args.rootId,
        actorUserId: args.actorUserId,
        sourceMentionId: mentionId,
        nowMs: args.nowMs,
      });
    }
    if (spec.kind === "community_agent") {
      try {
        await intakeCommunityAgentMention({
          ctx: args.ctx,
          mention: {
            _id: mentionId,
            communityId: args.communityId,
            ...(args.rootId ? { rootId: args.rootId } : {}),
            ...(args.replyId ? { replyId: args.replyId } : {}),
            mentionKind: spec.kind,
            mentionedAgentKey: spec.agentKey,
            notifyState: "pending",
          },
          nowMs: args.nowMs,
        });
      } catch {
        // Chat writes should never fail because Concierge intake had a transient
        // problem; the repair cron will retry the still-pending mention.
      }
    }
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
    // userId accepts a canonical users id OR an auth subject — the profiles
    // projection (the composer's member source) only knows the latter.
    mentions: v.optional(
      v.array(
        v.object({
          userId: v.optional(v.string()),
          agentKey: v.optional(v.string()),
          roleKey: v.optional(v.string()),
        }),
      ),
    ),
    attachments: v.optional(v.array(interactionAttachmentInputValidator)),
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
    const attachments = normalizeInteractionAttachmentInputs(args.attachments ?? []);
    if (!text && attachments.length === 0) throw new Error("interaction_content_required");
    if (args.rootId && textContainsEverybodyMentionToken(text)) {
      throw new Error("interaction_mention_everybody_reply_not_allowed");
    }
    const contentBlocks: NormalizedContentBlock[] = text
      ? [
          { blockType: "markdown_text", text },
          ...extractLinkBlocksFromText(text),
        ]
      : [];
    const summary = composerContentSummary(contentBlocks, attachments);
    const mentionedUserIds = await resolveMentionedUserIdsForInteractionWrite({
      ctx,
      communityId: args.communityId,
      actorUserId: userId,
      targetKind: args.rootId ? "reply" : "root",
      text,
      mentions: args.mentions ?? [],
    });
    const nowMs = Date.now();

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
          actorUserId: userId,
          nowMs,
        });
        root = (await ctx.db.get(rootId as any)) as InteractionRootRow | null;
        if (!root) throw new Error("interaction_root_create_failed");
        await insertCanonicalInteractionAttachmentsForTarget({
          ctx,
          communityId: args.communityId,
          rootId: root._id,
          attachments,
          actorUserId: userId,
          nowMs,
          contentHashPrefix: `community-composer:${idempotencyKey}`,
        });
        deduped = false;
      }

      await scheduleCommunityInteractionEvidenceSync({
        ctx,
        communityId: args.communityId,
        objectType: "root",
        objectId: root._id,
      });
      try {
        await recordCommunityOnboardingMilestone({
          ctx,
          communityId: args.communityId,
          userId,
          milestone: "first_community_post",
          nowMs,
        });
      } catch {
        // A progress marker must never make a canonical community post fail.
      }

      return {
        rows: [],
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
    if (root.idempotencyKey.startsWith("community_agent_dock:root:")) {
      assertOwnedCommunityAgentDockRoot(root, userId);
      throw new Error("community_agent_dock_dedicated_endpoint_required");
    }

    const idempotencyKey = composerIdempotencyKey(normalizeIdempotencyKey(args.idempotencyKey), "reply");
    let reply = await getExistingReplyByIdempotencyKey(ctx, root.communityId, idempotencyKey);
    let deduped = true;
    if (reply && normalizeIdValue(reply.rootId) !== normalizeIdValue(root._id)) {
      throw new Error("interaction_idempotency_key_conflict");
    }

    const replyTarget = await resolveOptionalReplyTargetForCanonicalComposer({
      ctx,
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
        ...(replyTarget.targetReplyId ? { targetReplyId: replyTarget.targetReplyId } : {}),
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
        actorUserId: userId,
        nowMs,
      });
      await ctx.db.patch(root._id as any, {
        replyCount: Math.max(0, Math.floor(root.replyCount ?? 0)) + 1,
        lastReplyAt: nowMs,
        updatedAt: nowMs,
      });
      reply = (await ctx.db.get(replyId as any)) as InteractionReplyRow | null;
      if (!reply) throw new Error("interaction_reply_create_failed");
      await insertCanonicalInteractionAttachmentsForTarget({
        ctx,
        communityId: root.communityId,
        replyId: reply._id,
        attachments,
        actorUserId: userId,
        nowMs,
        contentHashPrefix: `community-composer:${idempotencyKey}`,
      });
      deduped = false;
    }

    await scheduleCommunityInteractionEvidenceSync({
      ctx,
      communityId: root.communityId,
      objectType: "reply",
      objectId: reply._id,
    });
    try {
      await recordCommunityOnboardingMilestone({
        ctx,
        communityId: args.communityId,
        userId,
        milestone: "first_community_post",
        nowMs,
      });
    } catch {
      // A progress marker must never make a canonical community reply fail.
    }

    return {
      rows: [],
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

export const sendCommunityAgentDockMessage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    idempotencyKey: v.string(),
    text: v.string(),
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
    const nowMs = Date.now();
    const rootIdempotencyKey = communityAgentDockRootIdempotencyKey(userId);
    let root = await getExistingRootByIdempotencyKey(ctx, args.communityId, rootIdempotencyKey);
    if (!root) {
      const rootId = await ctx.db.insert("communityInteractionRoots" as any, {
        communityId: args.communityId,
        actorType: "system",
        actorUserId: userId,
        actorAgentKey: CANONICAL_COMMUNITY_AGENT_KEY,
        kind: "agent_signal",
        status: "live",
        visibilityScope: "private",
        contentSummary: "Private community agent conversation",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: rootIdempotencyKey,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      root = (await ctx.db.get(rootId)) as InteractionRootRow | null;
      if (!root) throw new Error("community_agent_dock_root_create_failed");
    }
    assertOwnedCommunityAgentDockRoot(root, userId);

    const replyIdempotencyKey = communityAgentDockReplyIdempotencyKey(args.idempotencyKey);
    let reply = await getExistingReplyByIdempotencyKey(ctx, args.communityId, replyIdempotencyKey);
    let deduped = true;
    if (reply) {
      if (
        normalizeIdValue(reply.rootId) !== normalizeIdValue(root._id) ||
        normalizeIdValue(reply.actorUserId) !== normalizeIdValue(userId) ||
        reply.actorType !== "human" ||
        reply.visibilityScope !== "private"
      ) {
        throw new Error("interaction_idempotency_key_conflict");
      }
    } else {
      const activeRequest = (await ctx.db
        .query("communityAgentServeRequests" as any)
        .withIndex("by_sourceRoot_createdAt", (q: any) => q.eq("sourceRootId", root._id))
        .order("desc")
        .first()) as any;
      if (
        activeRequest &&
        normalizeIdValue(activeRequest.requesterUserId) === normalizeIdValue(userId) &&
        (activeRequest.status === "queued" || activeRequest.status === "running")
      ) {
        throw new Error("community_agent_dock_turn_in_progress");
      }
      const seq = await nextReplySeq(ctx, root._id);
      const replyId = await ctx.db.insert("communityInteractionReplies" as any, {
        communityId: args.communityId,
        rootId: root._id,
        seq,
        actorType: "human",
        actorUserId: userId,
        status: "live",
        visibilityScope: "private",
        contentSummary: text.slice(0, MAX_INTERACTION_SUMMARY_CHARS),
        reactionSummary: [],
        idempotencyKey: replyIdempotencyKey,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const inserted = await insertContentBlocksForTarget({
        ctx,
        communityId: args.communityId,
        replyId,
        visibilityScope: "private",
        blocks: [{ blockType: "markdown_text", text }, ...extractLinkBlocksFromText(text)],
        nowMs,
      });
      await scheduleEmbedEnrichment(ctx, inserted.embedIds);
      await ctx.db.patch(root._id, {
        replyCount: Math.max(0, Math.floor(root.replyCount ?? 0)) + 1,
        lastReplyAt: nowMs,
        updatedAt: nowMs,
      });
      reply = (await ctx.db.get(replyId)) as InteractionReplyRow | null;
      if (!reply) throw new Error("community_agent_dock_reply_create_failed");
      deduped = false;
    }

    let mention = await findCanonicalAgentMentionForReply(ctx, reply._id);
    if (!mention) {
      const mentionId = await ctx.db.insert("communityInteractionMentions" as any, {
        communityId: args.communityId,
        replyId: reply._id,
        mentionKind: "community_agent",
        mentionedAgentKey: CANONICAL_COMMUNITY_AGENT_KEY,
        notifyState: "pending",
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      mention = (await ctx.db.get(mentionId)) as MentionRow | null;
      if (!mention) throw new Error("community_agent_dock_mention_create_failed");
    }
    const intake = await intakeCommunityAgentMention({
      ctx,
      mention,
      nowMs,
    });

    return {
      root_id: normalizeIdValue(root._id),
      reply_id: normalizeIdValue(reply._id),
      serve_request_id: intake.request_id,
      serve_status: intake.status,
      intake_reason: intake.intake_reason,
      deduped,
    };
  },
});

export const getMyCommunityAgentDockTranscript = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });

    const root = await getExistingRootByIdempotencyKey(
      ctx,
      args.communityId,
      communityAgentDockRootIdempotencyKey(userId),
    );
    if (!root) {
      return { root_id: null, messages: [] };
    }
    assertOwnedCommunityAgentDockRoot(root, userId);

    const replies = ((await ctx.db
      .query("communityInteractionReplies" as any)
      .withIndex("by_root_seq", (q: any) => q.eq("rootId", root._id))
      .order("desc")
      .take(COMMUNITY_AGENT_DOCK_REPLY_LIMIT)) as InteractionReplyRow[]).reverse().filter((reply) => {
        if (reply.status !== "live" || reply.visibilityScope !== "private") return false;
        return communityAgentDockReplyIsVisibleToOwner({
          actorType: reply.actorType,
          actorUserId: reply.actorUserId,
          actorAgentKey: reply.actorAgentKey,
          ownerUserId: userId,
          canonicalAgentKey: CANONICAL_COMMUNITY_AGENT_KEY,
        });
      });
    const messages = await Promise.all(replies.map((reply) => mapCommunityAgentDockMessage(ctx, reply)));

    return { root_id: normalizeIdValue(root._id), messages };
  },
});

export const getMyCommunityAgentDockTurn = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });

    const root = await getExistingRootByIdempotencyKey(
      ctx,
      args.communityId,
      communityAgentDockRootIdempotencyKey(userId),
    );
    if (!root) return { request: null, events: [] };
    assertOwnedCommunityAgentDockRoot(root, userId);

    const requestRows = (await ctx.db
      .query("communityAgentServeRequests" as any)
      .withIndex("by_sourceRoot_createdAt", (q: any) => q.eq("sourceRootId", root._id))
      .order("desc")
      .take(1)) as any[];
    const request = requestRows.find(
      (candidate) =>
        normalizeIdValue(candidate.requesterUserId) === normalizeIdValue(userId) &&
        normalizeIdValue(candidate.communityId) === normalizeIdValue(args.communityId),
    ) ?? null;
    const attempt = normalizeCommunityAgentServeAttempt(request?.attempt);
    const serveRunId = request
      ? buildCommunityAgentServeRunId(normalizeIdValue(request._id), attempt)
      : null;
    const eventRows = serveRunId
      ? await ctx.db
          .query("communityAgentRunEvents" as any)
          .withIndex("by_run_seq", (q: any) => q.eq("runId", serveRunId))
          .order("asc")
          .take(240)
      : [];
    const events = eventRows
      .filter((event: any) => normalizeIdValue(event.communityId) === normalizeIdValue(args.communityId))
      .filter((event: any) =>
        ["reasoning", "assistant", "tool_call", "tool_result", "final", "error"].includes(event.kind),
      )
      .map((event: any) => ({
        id: normalizeIdValue(event._id),
        seq: event.seq,
        kind: event.kind,
        tool_name: event.toolName ?? null,
        status: event.status ?? null,
        error_code: event.errorCode ?? null,
        content: event.kind === "tool_result" ? "" : event.content,
        created_at: toIsoString(event.createdAt),
      }));

    return {
      request: request
        ? {
            id: normalizeIdValue(request._id),
            status: request.status,
            intake_reason: request.intakeReason,
            attempt,
            response_reply_id: request.responseReplyId ? normalizeIdValue(request.responseReplyId) : null,
            public_issue: projectCommunityAgentDockPublicIssue({
              status: request.status,
              intakeReason: request.intakeReason,
              errorCode: request.errorCode,
            }),
            created_at: toIsoString(request.createdAt),
            updated_at: toIsoString(request.updatedAt),
          }
        : null,
      events,
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

    const visibleRows = rows.filter((row) => interactionVisibilityIsCommunityReadable(row.visibilityScope));
    const userIdCache = new Map<string, string | null>();
    const viewerMap = await loadViewerReactionMapForTargets(ctx, userId, "root", visibleRows.map((row) => row._id));
    const bundles = await Promise.all(
      visibleRows.map((row) => mapRootBundle(ctx, row, false, userIdCache, viewerMap.get(normalizeIdValue(row._id)) ?? [])),
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
    assertCommunityReadableRoot(root);
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
      .filter((row) => {
        try {
          assertCommunityReadableReply(row);
          return true;
        } catch {
          return false;
        }
      })
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
    const { target, communityId } = await loadCommunityInteractionTarget({
      ctx,
      targetType: args.targetType,
      targetId: args.targetId,
    });
    assertLiveInteractionTarget(target);
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

async function editCommunityInteractionTargetCore(args: {
  ctx: any;
  targetType: "root" | "reply";
  target: InteractionRootRow | InteractionReplyRow;
  communityId: any;
  text: string;
  actorUserId: any;
  nowMs: number;
  syncLegacyMessage: boolean;
  legacyMessageId?: any;
  legacyAttachments?: unknown[];
}): Promise<void> {
  if (args.target.status !== "live") throw new Error("interaction_not_editable");
  const blocks: NormalizedContentBlock[] = args.text
    ? [{ blockType: "markdown_text", text: args.text }]
    : [];
  const existingBlocks =
    args.targetType === "root"
      ? await listContentBlocksForRoot(args.ctx, args.target._id)
      : await listContentBlocksForReply(args.ctx, args.target._id);
  if (textContainsEverybodyMentionToken(args.text)) {
    if (args.targetType === "reply") {
      throw new Error("interaction_mention_everybody_reply_not_allowed");
    }
    const previousText = existingBlocks
      .filter((block) => block.blockType === "markdown_text")
      .map((block) => block.text)
      .join("\n\n");
    if (!textContainsEverybodyMentionToken(previousText)) {
      throw new Error("interaction_mention_everybody_edit_create_not_allowed");
    }
  }
  for (const block of existingBlocks) await args.ctx.db.delete(block._id);
  await insertContentBlocksForTarget({
    ctx: args.ctx,
    communityId: args.communityId,
    ...(args.targetType === "root" ? { rootId: args.target._id } : { replyId: args.target._id }),
    visibilityScope: args.target.visibilityScope,
    blocks,
    nowMs: args.nowMs,
  });
  await args.ctx.db.patch(args.target._id, {
    contentSummary: contentSummary(blocks),
    editedAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  if (Array.isArray(args.legacyAttachments)) {
    const parentField = args.targetType === "root" ? "rootId" : "replyId";
    const parentIndex = args.targetType === "root" ? "by_root" : "by_reply";
    const existingAttachments = await args.ctx.db
      .query("communityInteractionAttachments" as any)
      .withIndex(parentIndex, (q: any) => q.eq(parentField, args.target._id))
      .take(33);
    if (existingAttachments.length > 32) {
      throw new Error("interaction_attachment_replace_limit_exceeded");
    }
    for (const attachment of existingAttachments) {
      await args.ctx.db.delete(attachment._id as any);
    }
    const normalizedAttachments = normalizeInteractionAttachmentInputs(args.legacyAttachments);
    await insertCanonicalInteractionAttachmentsForTarget({
      ctx: args.ctx,
      communityId: args.communityId,
      ...(args.targetType === "root" ? { rootId: args.target._id } : { replyId: args.target._id }),
      attachments: normalizedAttachments,
      actorUserId: args.actorUserId,
      nowMs: args.nowMs,
      contentHashPrefix: `legacy-chat-edit:${normalizeIdValue(args.legacyMessageId) || normalizeIdValue(args.target._id)}`,
    });
  }
  await suppressPendingMentionsMissingFromInteractionText({
    ctx: args.ctx,
    targetType: args.targetType,
    targetId: args.target._id,
    text: args.text,
    nowMs: args.nowMs,
  });
  if (args.syncLegacyMessage) {
    const legacyLink =
      args.targetType === "root"
        ? await getLegacyChatLinkByRoot(args.ctx, args.target._id)
        : await getLegacyChatLinkByReply(args.ctx, args.target._id);
    if (legacyLink?.messageId) {
      const message = await args.ctx.db.get(legacyLink.messageId as any);
      if (message) {
        await args.ctx.db.patch(legacyLink.messageId as any, {
          contentJson: { text: args.text },
          updatedAt: args.nowMs,
        });
      }
    }
  }
  await args.ctx.db.insert("communityInteractionModerationEvents" as any, {
    communityId: args.communityId,
    targetType: args.targetType,
    ...(args.targetType === "root" ? { rootId: args.target._id } : { replyId: args.target._id }),
    eventType: "edit",
    actorType: "human",
    actorUserId: args.actorUserId,
    createdAt: args.nowMs,
  });
  await scheduleCommunityInteractionEvidenceSync({
    ctx: args.ctx,
    communityId: args.communityId,
    objectType: args.targetType,
    objectId: args.target._id,
  });
}

export async function syncLegacyChatMessageEditToInteractionCore(args: {
  ctx: any;
  communityId: any;
  messageId: any;
  text: string;
  attachments: unknown[];
  actorUserId: any;
  nowMs: number;
}): Promise<{ synced: boolean }> {
  const link = await getLegacyChatLinkByMessage(args.ctx, args.messageId);
  if (!link) return { synced: false };
  if (normalizeIdValue(link.communityId) !== normalizeIdValue(args.communityId)) {
    throw new Error("legacy_chat_interaction_link_conflict");
  }
  const targetType = link.linkKind === "root" ? "root" : "reply";
  const targetId = targetType === "root" ? link.rootId : link.replyId;
  if (!targetId) throw new Error("legacy_chat_interaction_link_target_missing");
  const { target, communityId } = await loadCommunityInteractionTarget({
    ctx: args.ctx,
    targetType,
    targetId: normalizeIdValue(targetId),
  });
  if (normalizeIdValue(communityId) !== normalizeIdValue(args.communityId)) {
    throw new Error("legacy_chat_interaction_link_target_invalid");
  }
  await editCommunityInteractionTargetCore({
    ctx: args.ctx,
    targetType,
    target,
    communityId,
    text: args.text,
    actorUserId: args.actorUserId,
    nowMs: args.nowMs,
    syncLegacyMessage: false,
    legacyMessageId: args.messageId,
    legacyAttachments: args.attachments,
  });
  return { synced: true };
}

async function tombstoneCommunityInteractionTargetCore(args: {
  ctx: any;
  targetType: "root" | "reply";
  target: InteractionRootRow | InteractionReplyRow;
  communityId: any;
  actorUserId: any;
  nowMs: number;
}): Promise<void> {
  if (args.target.status === "deleted") return;
  const previousStatus = args.target.status;
  await args.ctx.db.patch(args.target._id, {
    status: "deleted",
    deletedAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  await suppressPendingMentionsForDeletedInteractionTarget({
    ctx: args.ctx,
    targetType: args.targetType,
    targetId: args.target._id,
    nowMs: args.nowMs,
  });
  if (args.targetType === "reply") {
    const replyTarget = args.target as InteractionReplyRow;
    const root = (await args.ctx.db.get(replyTarget.rootId as any)) as InteractionRootRow | null;
    if (root) {
      const lastLive = (await args.ctx.db
        .query("communityInteractionReplies" as any)
        .withIndex("by_root_status_createdAt", (q: any) =>
          q.eq("rootId", root._id).eq("status", "live"),
        )
        .order("desc")
        .first()) as InteractionReplyRow | null;
      const rootPatch: any = {
        replyCount: Math.max(0, Math.floor(root.replyCount ?? 0) - 1),
        updatedAt: args.nowMs,
      };
      if (lastLive) rootPatch.lastReplyAt = lastLive.createdAt;
      await args.ctx.db.patch(root._id, rootPatch);
    }
  }
  await args.ctx.db.insert("communityInteractionModerationEvents" as any, {
    communityId: args.communityId,
    targetType: args.targetType,
    ...(args.targetType === "root" ? { rootId: args.target._id } : { replyId: args.target._id }),
    eventType: "tombstone",
    actorType: "human",
    actorUserId: args.actorUserId,
    previousStatus,
    nextStatus: "deleted",
    createdAt: args.nowMs,
  });
  await scheduleCommunityInteractionEvidenceSync({
    ctx: args.ctx,
    communityId: args.communityId,
    objectType: args.targetType,
    objectId: args.target._id,
  });
}

export async function syncLegacyChatMessageDeleteToInteractionCore(args: {
  ctx: any;
  communityId: any;
  messageId: any;
  actorUserId: any;
  nowMs: number;
}): Promise<{ synced: boolean }> {
  const link = await getLegacyChatLinkByMessage(args.ctx, args.messageId);
  if (!link) return { synced: false };
  if (normalizeIdValue(link.communityId) !== normalizeIdValue(args.communityId)) {
    throw new Error("legacy_chat_interaction_link_conflict");
  }
  const targetType = link.linkKind === "root" ? "root" : "reply";
  const targetId = targetType === "root" ? link.rootId : link.replyId;
  if (!targetId) throw new Error("legacy_chat_interaction_link_target_missing");
  const { target, communityId } = await loadCommunityInteractionTarget({
    ctx: args.ctx,
    targetType,
    targetId: normalizeIdValue(targetId),
  });
  if (normalizeIdValue(communityId) !== normalizeIdValue(args.communityId)) {
    throw new Error("legacy_chat_interaction_link_target_invalid");
  }
  await tombstoneCommunityInteractionTargetCore({
    ctx: args.ctx,
    targetType,
    target,
    communityId,
    actorUserId: args.actorUserId,
    nowMs: args.nowMs,
  });
  return { synced: true };
}

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
    const { target, communityId } = await loadCommunityInteractionTarget({
      ctx,
      targetType: args.targetType,
      targetId: args.targetId,
    });
    assertLiveInteractionTarget(target);
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

    await editCommunityInteractionTargetCore({
      ctx,
      targetType: args.targetType,
      target,
      communityId,
      text,
      actorUserId: userId,
      nowMs: Date.now(),
      syncLegacyMessage: true,
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
    const { target, communityId } = await loadCommunityInteractionTarget({
      ctx,
      targetType: args.targetType,
      targetId: args.targetId,
    });
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
    await tombstoneCommunityInteractionTargetCore({
      ctx,
      targetType: args.targetType,
      target,
      communityId,
      actorUserId: userId,
      nowMs: Date.now(),
    });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Link embed enrichment: fetch OG metadata for pending link embeds and flip them to ready.
// ---------------------------------------------------------------------------

const MAX_EMBED_TITLE_CHARS = 300;
const MAX_EMBED_DESCRIPTION_CHARS = 600;
const MAX_EMBED_IMAGE_URL_CHARS = 2048;
const MAX_EMBED_FETCHER_RESPONSE_BYTES = 64_000;
const INTERACTION_EMBED_SOURCE_FETCHER_ENDPOINT_ENV = "ARX_SOURCE_URL_FETCHER_ENDPOINT";
const INTERACTION_EMBED_SOURCE_FETCHER_SECRET_ENV = "ARX_SOURCE_URL_FETCHER_SECRET";
const INTERACTION_EMBED_SOURCE_FETCHER_USER_AGENT = "Polynet Community Interaction Embeds/1.0";
const INTERACTION_EMBED_SOURCE_FETCHER_MAX_BYTES = 1_500_000;
const INTERACTION_EMBED_SOURCE_FETCHER_MAX_CHARS = 4000;
const INTERACTION_EMBED_SOURCE_FETCHER_TIMEOUT_MS = 8000;
const INTERACTION_EMBED_SOURCE_FETCHER_MAX_REDIRECTS = 3;

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

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function resolveInteractionEmbedSourceFetcherEndpoint(): string {
  return requireSafeCommunitySourceFetcherEndpoint(readEnv(INTERACTION_EMBED_SOURCE_FETCHER_ENDPOINT_ENV));
}

function interactionEmbedSourceFetcherHeaders(): Record<string, string> {
  const secret = normalizeCommunitySourcePolicyString(readEnv(INTERACTION_EMBED_SOURCE_FETCHER_SECRET_ENV), 4_000);
  if (!secret) throw new Error("community_source_url_fetcher_secret_not_configured");
  return {
    "user-agent": INTERACTION_EMBED_SOURCE_FETCHER_USER_AGENT,
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${secret}`,
  };
}

async function fetchInteractionEmbedWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = INTERACTION_EMBED_SOURCE_FETCHER_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readEmbedFetcherJsonBounded(response: Response): Promise<Record<string, unknown>> {
  const contentLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > MAX_EMBED_FETCHER_RESPONSE_BYTES) {
    throw new Error("source_url_fetcher_response_too_large");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (text.length > MAX_EMBED_FETCHER_RESPONSE_BYTES) throw new Error("source_url_fetcher_response_too_large");
    return JSON.parse(text || "{}") as Record<string, unknown>;
  }
  const decoder = new TextDecoder();
  let text = "";
  let totalBytes = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    totalBytes += next.value.byteLength;
    if (totalBytes > MAX_EMBED_FETCHER_RESPONSE_BYTES) throw new Error("source_url_fetcher_response_too_large");
    text += decoder.decode(next.value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text || "{}") as Record<string, unknown>;
}

function sanitizeEmbedImageUrl(raw: unknown): string | null {
  const value = boundedEmbedString(raw, MAX_EMBED_IMAGE_URL_CHARS);
  if (!value) return null;
  try {
    return requireSafeCommunitySourceUrl(value, MAX_EMBED_IMAGE_URL_CHARS);
  } catch {
    return null;
  }
}

function boundedEmbedError(raw: unknown): string {
  return normalizeBoundedText(raw, 200) || "source_url_fetch_failed";
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
  const requestedUrl = requireSafeCommunitySourceUrl(sourceUrl, MAX_INTERACTION_URL_CHARS);
  const response = await fetchInteractionEmbedWithTimeout(resolveInteractionEmbedSourceFetcherEndpoint(), {
    method: "POST",
    headers: interactionEmbedSourceFetcherHeaders(),
    body: JSON.stringify({
      url: requestedUrl,
      max_bytes: INTERACTION_EMBED_SOURCE_FETCHER_MAX_BYTES,
      max_chars: INTERACTION_EMBED_SOURCE_FETCHER_MAX_CHARS,
      timeout_ms: INTERACTION_EMBED_SOURCE_FETCHER_TIMEOUT_MS,
      max_redirects: INTERACTION_EMBED_SOURCE_FETCHER_MAX_REDIRECTS,
      accept: "text/html,text/plain,text/markdown,application/json,application/xml,text/xml,*/*;q=0.5",
    }),
  });
  if (!response.ok) throw new Error(`source_url_fetcher_failed_${response.status}`);
  const payload = await readEmbedFetcherJsonBounded(response);
  if (payload.ok === false) throw new Error(String(payload.error_code ?? "source_url_fetch_failed"));
  return {
    title: boundedEmbedString(payload.og_title ?? payload.title, MAX_EMBED_TITLE_CHARS),
    description: boundedEmbedString(payload.og_description, MAX_EMBED_DESCRIPTION_CHARS),
    imageUrl: sanitizeEmbedImageUrl(payload.og_image),
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
      const sourceUrl = requireSafeCommunitySourceUrl(embed.sourceUrl, MAX_INTERACTION_URL_CHARS);
      const og = await fetchEmbedOpenGraph(sourceUrl);
      await ctx.runMutation(internal.communityInteractions.applyInteractionEmbedEnrichment, {
        embedId: args.embedId,
        status: "ready",
        title: og.title,
        description: og.description,
        imageUrl: og.imageUrl,
        provider: hostnameOfUrl(sourceUrl),
      });
    } catch (error) {
      await ctx.runMutation(internal.communityInteractions.applyInteractionEmbedEnrichment, {
        embedId: args.embedId,
        status: "failed",
        provider: hostnameOfUrl(embed.sourceUrl),
        error: boundedEmbedError(error instanceof Error ? error.message : error),
      });
    }
  },
});
