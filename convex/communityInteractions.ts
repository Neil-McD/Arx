import { testMemberAutoplayPreviewsAgent } from "./communityTestMemberCore";
import { RETIRED_PERSONAL_AGENT_ACTOR_TYPE, presentInteractionActorType, type StoredInteractionActorType } from "../shared/communityAgentIdentity";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveNotificationRecipientSource } from "./communityNotificationAccess";
import { fingerprintCommunityComposerPayload } from "./communityComposerReplay";
import { v } from "convex/values";
import { requireCommunityChannelCapability, resolveCommunityChannelActor } from "./communityChannelAccess";
import { readCommunityAgentProfile } from "./communityAgentContext";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import {
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
  claimInteractionAttachmentsForTarget,
  resolveInteractionAttachmentClaims,
  listCanonicalInteractionAttachmentsForTarget,
  type NormalizedInteractionAttachmentInput,
} from "./communityInteractionAttachmentBridge";
import {
  requireSafeCommunitySourceUrl,
} from "./communitySourceUrlPolicy";
import { extractCommunityInteractionLinkSources } from "../shared/communityInteractionLinkExtraction";
import { settleMentionRowInternal } from "./communityMentionLifecycle";
import {
  type ConciergeMentionRow,
  intakeCommunityAgentTurn,
} from "./communityAgentConciergeCore";
import {
  CANONICAL_COMMUNITY_AGENT_KEY,
} from "../shared/communityAgentToolProtocol";
import {
  buildCommunityFounderWelcomeText,
  communityFounderWelcomeIdempotencyKey,
} from "../shared/communityFounderWelcome";
import {
  EVERYBODY_MENTION_ROLE_KEY,
  cancelEverybodyMentionBroadcastsForInteractionSource,
  scheduleEverybodyMentionBroadcast,
  textContainsEverybodyMentionToken,
} from "./communityMentionBroadcasts";
import { scheduleCommunityInteractionEvidenceSync } from "./communityInteractionEvidence";
import { newPostCardReadCache, postCardPerson, readPostCardForRoot, type PostCardReadCache } from "./communityPostCardRead";
import { readCanonicalUserIdentityProjection } from "./profileCore";
import {
  clearPinnedRootIfMatches,
  ensureReplyChannelMatchesRoot,
  interactionBelongsToChannel,
  interactionIsChannelAddressable,
  listChannelReadableRows,
  requireChannelForAddressableRoot,
  resolveAuthorizedCommunityChannel,
  type CommunityChannelLike,
} from "./communityChannelCore";

type InteractionActorType = StoredInteractionActorType;
type InteractionRootKind = "discussion" | "announcement" | "question" | "resource_share" | "agent_signal";
type InteractionStatus = "live" | "hidden" | "deleted";
type InteractionVisibilityScope = "private" | "admin" | "community" | "public";
type WorkspaceRefKind = "thread" | "project" | "file" | "artifact" | "run" | "resource";
type MentionKind = "user" | "community_agent" | "role";

type InteractionRootRow = {
  _id: any;
  communityId: any;
  channelId?: any;
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
  composerPayloadHash?: string;
  lastReplyAt?: number;
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
  channelId?: any;
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
  composerPayloadHash?: string;
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
  status: "pending" | "ready" | "failed" | "unavailable" | "redacted";
  visibilityScope: InteractionVisibilityScope;
  sourceUrl?: string;
  normalizedSourceUrl?: string;
  workspaceRefKind?: WorkspaceRefKind;
  workspaceRefId?: string;
  previewKind?: "video" | "social_post" | "link";
  authorName?: string;
  authorHandle?: string;
  authorAvatarUrl?: string;
  authorVerified?: boolean;
  provider?: string;
  providerPostId?: string;
  publishedAt?: number;
  postContext?: "post" | "reply" | "quote";
  title?: string;
  description?: string;
  imageUrl?: string;
  imageAlt?: string;
  videoUrl?: string;
  resolverVersion?: number;
  fetchedAt?: number;
  nextRefreshAt?: number;
  refreshFailureCount?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

type MentionRow = {
  _id: any;
  communityId: any;
  channelId?: any;
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

const rootKindValidator = v.union(
  v.literal("discussion"),
  v.literal("announcement"),
  v.literal("question"),
  v.literal("resource_share"),
  v.literal("agent_signal"),
);

const interactionAttachmentInputValidator = v.object({
  attachmentId: v.id("communityInteractionAttachments"),
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

function presentedAgentKey(row: { actorType: InteractionActorType; actorAgentKey?: string }): string | null {
  return row.actorType === RETIRED_PERSONAL_AGENT_ACTOR_TYPE ? CANONICAL_COMMUNITY_AGENT_KEY : row.actorAgentKey ?? null;
}

function authorFields(actorType: string, userId: string | null) {
  return actorType === "community_agent"
    ? { actor_user_id: null, on_behalf_of_user_id: userId }
    : { actor_user_id: userId, on_behalf_of_user_id: null };
}

function composerIdempotencyKey(
  idempotencyKey: string,
  kind: "root" | "reply",
  actorType: "human" | "community_agent" = "human",
): string {
  const namespace =
    actorType === "community_agent"
        ? "community_canonical_agent"
        : "community_composer";
  return `${namespace}:${kind}:${idempotencyKey}`.slice(
    0,
    MAX_INTERACTION_IDEMPOTENCY_KEY_CHARS,
  );
}

async function resolveOptionalReplyTargetForCanonicalComposer(args: {
  ctx: any;
  root: InteractionRootRow;
  rootChannel: CommunityChannelLike;
  replyToMessageId?: string | null;
}): Promise<{ targetReplyId?: any }> {
  const requestedTargetId = String(args.replyToMessageId ?? "").trim();
  if (!requestedTargetId) return {};

  const requireValidTargetReply = (
    candidate: InteractionReplyRow | null,
  ): InteractionReplyRow => {
    if (
      !candidate ||
      candidate.status !== "live" ||
      !interactionIsChannelAddressable(candidate) ||
      normalizeIdValue(candidate.communityId) !==
        normalizeIdValue(args.root.communityId) ||
      normalizeIdValue(candidate.rootId) !== normalizeIdValue(args.root._id) ||
      !interactionBelongsToChannel(candidate, args.rootChannel)
    ) {
      throw new Error("interaction_target_reply_invalid");
    }
    return candidate;
  };

  const directReplyId = args.ctx.db.normalizeId(
    "communityInteractionReplies",
    requestedTargetId,
  );
  if (directReplyId) {
    const directReply = (await args.ctx.db.get(
      directReplyId,
    )) as InteractionReplyRow | null;
    return { targetReplyId: requireValidTargetReply(directReply)._id };
  }

  throw new Error("interaction_target_reply_invalid");
}

const MAX_AUTO_LINK_BLOCKS = 2;

// Detect http(s) URLs in composer text and turn them into link blocks (which auto-create pending
// embeds). Deduped by normalized URL, capped, invalid URLs skipped.
function extractLinkBlocksFromText(text: string): NormalizedContentBlock[] {
  return extractCommunityInteractionLinkSources(
    text,
    (rawUrl) => {
      try {
        return requireSafeCommunitySourceUrl(rawUrl, MAX_INTERACTION_URL_CHARS);
      } catch {
        return null;
      }
    },
    MAX_AUTO_LINK_BLOCKS,
  ).map((url) => ({
    blockType: "link" as const,
    url,
    normalizedSourceUrl: url.slice(0, MAX_INTERACTION_URL_CHARS),
  }));
}

function contentSummary(blocks: NormalizedContentBlock[]): string {
  const parts = blocks.map((block) => {
    if (block.blockType === "markdown_text") return block.text;
    if (block.blockType === "link") return block.text ?? block.normalizedSourceUrl;
    if (block.blockType === "workspace_ref") return block.text ?? `${block.workspaceRefKind}:${block.workspaceRefId}`;
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

function isReadableRootInCommunityChannel(args: {
  root: InteractionRootRow;
  communityId: any;
  channel: CommunityChannelLike;
}): boolean {
  return (
    args.root.status === "live" &&
    interactionVisibilityIsCommunityReadable(args.root.visibilityScope) &&
    normalizeIdValue(args.root.communityId) === normalizeIdValue(args.communityId) &&
    interactionBelongsToChannel(args.root, args.channel)
  );
}

function assertCommunityReadableReply(reply: InteractionReplyRow): void {
  if (reply.status !== "live" || !interactionVisibilityIsCommunityReadable(reply.visibilityScope)) {
    throw new Error("interaction_reply_not_readable");
  }
}

export async function loadCommunityInteractionTarget(args: {
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

export function assertLiveInteractionTarget(target: InteractionRootRow | InteractionReplyRow): void {
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
    .filter((q: any) => q.eq(q.field("embedKind"), "workspace_ref"))
    .take(MAX_INTERACTION_EMBEDS_PER_BUNDLE)) as EmbedRow[];
}

async function listEmbedsForReply(ctx: any, replyId: any): Promise<EmbedRow[]> {
  return (await ctx.db
    .query("communityInteractionEmbeds" as any)
    .withIndex("by_reply", (q: any) => q.eq("replyId", replyId))
    .filter((q: any) => q.eq(q.field("embedKind"), "workspace_ref"))
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
    preview_kind: row.previewKind ?? null,
    author_name: row.authorName ?? null,
    author_handle: row.authorHandle ?? null,
    author_avatar_url: row.authorAvatarUrl ?? null,
    provider: row.provider ?? null,
    provider_post_id: row.providerPostId ?? null,
    published_at: typeof row.publishedAt === "number" ? toIsoString(row.publishedAt) : null,
    post_context: row.postContext ?? null,
    title: row.title ?? null,
    description: row.description ?? null,
    image_url: row.previewKind === "video" ? row.imageUrl ?? null : null,
    image_alt: row.previewKind === "video" ? row.imageAlt ?? null : null,
    video_url: row.previewKind === "video" ? row.videoUrl ?? null : null,
    resolver_version: typeof row.resolverVersion === "number" ? row.resolverVersion : null,
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
  viewer?: { userId: any; cards: PostCardReadCache },
) {
  const blocks = await listContentBlocksForRoot(ctx, root._id);
  const embeds = await listEmbedsForRoot(ctx, root._id);
  const mentions = await listMentionsForRoot(ctx, root._id);
  const attachments = await listCanonicalInteractionAttachmentsForTarget({ ctx, rootId: root._id });
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
      channel_id: root.channelId ? normalizeIdValue(root.channelId) : null,
      actor_type: presentInteractionActorType(root.actorType),
      // The community agent's post made for a member: the agent is the author,
      // the member is who it acted for.
      ...authorFields(presentInteractionActorType(root.actorType), publicActorUserId ?? (root.actorUserId ? normalizeIdValue(root.actorUserId) : null)),
      actor_agent_key: presentedAgentKey(root),
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
      // Cached clients still accept this shape. Current pin authority lives on
      // the channel and is read through getCommunityChannelPinnedRoot.
      pinned_at: null,
      locked_at: typeof root.lockedAt === "number" ? toIsoString(root.lockedAt) : null,
      created_at: toIsoString(root.createdAt),
      updated_at: toIsoString(root.updatedAt),
      edited_at: typeof root.editedAt === "number" ? toIsoString(root.editedAt) : null,
    },
    content_blocks: blocks.map(mapContentBlock),
    embeds: embeds.map(mapEmbed),
    mentions: await mapMentions(ctx, mentions, userIdCache),
    attachments,
    // A poll or shared Form drawn on the post, read for this viewer.
    post_card: await readPostCardForRoot(ctx, root, viewer?.userId ?? null, viewer?.cards ?? newPostCardReadCache()),
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
  const attachments = await listCanonicalInteractionAttachmentsForTarget({ ctx, replyId: reply._id });
  const publicActorUserId = reply.actorUserId
    ? await resolvePublicUserId(ctx, reply.actorUserId, userIdCache)
    : null;
  return {
    deduped,
    reply: {
      id: normalizeIdValue(reply._id),
      community_id: normalizeIdValue(reply.communityId),
      channel_id: reply.channelId ? normalizeIdValue(reply.channelId) : null,
      root_id: normalizeIdValue(reply.rootId),
      seq: Math.max(0, Math.floor(reply.seq ?? 0)),
      actor_type: presentInteractionActorType(reply.actorType),
      ...authorFields(presentInteractionActorType(reply.actorType), publicActorUserId ?? (reply.actorUserId ? normalizeIdValue(reply.actorUserId) : null)),
      actor_agent_key: presentedAgentKey(reply),
      target_reply_id: reply.targetReplyId ? normalizeIdValue(reply.targetReplyId) : null,
      status: reply.status,
      visibility_scope: reply.visibilityScope,
      content_summary: reply.contentSummary,
      reaction_summary: mapReactionSummary(reply.reactionSummary),
      viewer_emojis: viewerEmojis ?? [],
      idempotency_key: reply.idempotencyKey,
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
  channelId?: any;
  rootId?: any;
  replyId?: any;
  visibilityScope: InteractionVisibilityScope;
  blocks: NormalizedContentBlock[];
  nowMs: number;
}) {
  const contentBlockIds: string[] = [];
  if (Boolean(args.rootId) === Boolean(args.replyId)) {
    throw new Error("interaction_content_target_required");
  }
  for (let index = 0; index < args.blocks.length; index += 1) {
    const block = args.blocks[index]!;
    let embedId: any | undefined;
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
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    contentBlockIds.push(normalizeIdValue(contentBlockId));
  }
  return { contentBlockIds };
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
  // The agent answers to its profile name (Settings > Agent) and, so older
  // posts and habits keep working, to the community's name.
  const profile = await readCommunityAgentProfile(args.ctx, args.communityId);
  if (!profile) return false;
  const community = (await args.ctx.db.get(args.communityId as any)) as { name?: string } | null;
  return interactionTextContainsAtToken(args.text, profile.name)
    || interactionTextContainsAtToken(args.text, community?.name);
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
    // Recipient authority is checked against the persisted source and channel
    // by insertCommunityInteractionMentionRows in the same transaction.
    const spec: UserInteractionMentionSpec = { kind: "user", userId: user._id };
    userSpecsById.set(normalized, spec);
    out.push(spec);
  }
  return out;
}

async function insertCommunityInteractionMentionRows(args: {
  ctx: any;
  communityId: any;
  channelId: any;
  rootId?: any;
  replyId?: any;
  mentionedUserIds: InteractionMentionSpec[];
  actorUserId: any;
  nowMs: number;
}): Promise<{ communityAgentMention: ConciergeMentionRow | null }> {
  let communityAgentMention: ConciergeMentionRow | null = null;
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
    if (spec.kind === "user" && !(await resolveNotificationRecipientSource({
      ...args, userId: spec.userId,
    }))) throw new Error("interaction_mention_user_not_allowed");
    const mentionId = await args.ctx.db.insert("communityInteractionMentions" as any, {
      communityId: args.communityId,
      channelId: args.channelId,
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
        channelId: args.channelId,
        rootId: args.rootId,
        actorUserId: args.actorUserId,
        sourceMentionId: mentionId,
        nowMs: args.nowMs,
      });
    }
    if (spec.kind === "community_agent") {
      communityAgentMention = {
        _id: mentionId,
        communityId: args.communityId,
        ...(args.rootId ? { rootId: args.rootId } : {}),
        ...(args.replyId ? { replyId: args.replyId } : {}),
        mentionKind: spec.kind,
        mentionedAgentKey: spec.agentKey,
        notifyState: "pending",
      };
    }
  }
  return { communityAgentMention };
}

const communityInteractionComposerArgs = {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
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
    // The community's agent writing for this member (Agent page tool use).
    asCommunityAgent: v.optional(v.boolean()),
  };

// One composer path. The public mutation verifies the signed-in caller; the
// internal variant serves trusted server adapters (community apps) that have
// already authenticated the member, and must never take a client-chosen user.
export async function createCommunityInteractionComposerMessageCore(
  ctx: any,
  args: any,
  trustedUserId?: any,
) {
    const userId = trustedUserId ?? await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    // The agent acts within this member's access, so the channel checks are the member's.
    const forMember = args.asCommunityAgent === true;
    const channelActor = await resolveCommunityChannelActor({
      ctx, communityId: args.communityId, userId,
      kind: forMember ? "community_agent_for_member" : "human",
    });
    await requireProfileSetupCompleteForUser(ctx, userId);

    const text = normalizeBoundedText(args.text, MAX_INTERACTION_TEXT_CHARS);
    const attachments = await resolveInteractionAttachmentClaims({ ctx, communityId: args.communityId,
      actorUserId: userId, messageKey: args.idempotencyKey, rootId: args.rootId,
      attachments: args.attachments ?? [] });
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
    // One agent per community: what it writes for a member is the community
    // agent's post, attributed to the member it acted for (actorUserId).
    const actorType = forMember ? "community_agent" : "human";
    const actorAgentKey = forMember ? CANONICAL_COMMUNITY_AGENT_KEY : null;
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
      const requestedChannel = await resolveAuthorizedCommunityChannel({
        ctx,
        actor: channelActor,
        capability: "canPost",
        communityId: args.communityId,
        channelId: args.channelId,
        ensureGeneralForWrite: true,
        nowMs,
      });
      const idempotencyKey = composerIdempotencyKey(
        normalizeIdempotencyKey(args.idempotencyKey),
        "root",
        actorType,
      );
      const composerPayloadHash = await fingerprintCommunityComposerPayload({
        channelId: String(requestedChannel._id), text,
        attachmentIds: attachments.map(attachment => attachment.attachmentId!), mentions: mentionedUserIds,
      });
      let root = await getExistingRootByIdempotencyKey(ctx, args.communityId, idempotencyKey);
      let communityAgentMention: ConciergeMentionRow | null = null;
      let deduped = true;
      if (
        root &&
        (root.actorType !== actorType ||
          normalizeIdValue(root.actorUserId) !== normalizeIdValue(userId) ||
          normalizeIdValue(root.actorAgentKey) !==
            normalizeIdValue(actorAgentKey) ||
          root.composerPayloadHash !== composerPayloadHash)
      ) {
        throw new Error("interaction_idempotency_key_conflict");
      }
      if (root) {
        const existingChannel = await requireChannelForAddressableRoot({
          ctx,
          root,
          nowMs,
          actor: channelActor,
        });
        if (
          normalizeIdValue(existingChannel._id) !==
          normalizeIdValue(requestedChannel._id)
        ) {
          throw new Error("interaction_idempotency_key_conflict");
        }
      }
      if (!root) {
        const rootId = await ctx.db.insert("communityInteractionRoots" as any, {
          communityId: args.communityId,
          channelId: requestedChannel._id,
          actorType,
          actorUserId: userId,
          ...(actorAgentKey ? { actorAgentKey } : {}),
          kind: "discussion",
          status: "live",
          visibilityScope: "community",
          contentSummary: summary,
          replyCount: 0,
          reactionSummary: [],
          idempotencyKey,
          composerPayloadHash,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
        await insertContentBlocksForTarget({
          ctx,
          communityId: args.communityId,
          channelId: requestedChannel._id,
          rootId,
          visibilityScope: "community",
          blocks: contentBlocks,
          nowMs,
        });
        const mentionRows = await insertCommunityInteractionMentionRows({
          ctx,
          communityId: args.communityId,
          channelId: requestedChannel._id,
          rootId,
          mentionedUserIds,
          actorUserId: userId,
          nowMs,
        });
        communityAgentMention = mentionRows.communityAgentMention;
        root = (await ctx.db.get(rootId as any)) as InteractionRootRow | null;
        if (!root) throw new Error("interaction_root_create_failed");
        await claimInteractionAttachmentsForTarget({
          ctx,
          messageKey: args.idempotencyKey,
          communityId: args.communityId,
          rootId: root._id,
          attachments,
          actorUserId: userId,
          nowMs,
        });
        deduped = false;
      }

      const rootChannel = await requireChannelForAddressableRoot({ ctx, root, actor: channelActor });
      if (
        normalizeIdValue(rootChannel._id) !==
        normalizeIdValue(requestedChannel._id)
      ) {
        throw new Error("interaction_channel_mismatch");
      }

      if (actorType === "human" && !deduped) {
        await ctx.scheduler.runAfter(
          0,
          internal.communityMemberWorkflows
            .handleChannelContributionRootInternal,
          { rootId: root._id },
        );
      }

      // Autoplay's test posts (a server caller only) don't wake the agent, unless it runs free.
      if (actorType === "human" && args.skipAgentIntake !== true && !await testMemberAutoplayPreviewsAgent(ctx, userId, nowMs)) {
        await intakeCommunityAgentTurn({
          ctx,
          communityId: args.communityId,
          rootId: root._id,
          ...(communityAgentMention ? { mention: communityAgentMention } : {}),
          nowMs,
        });
      }

      await scheduleCommunityInteractionEvidenceSync({
        ctx,
        communityId: args.communityId,
        objectType: "root",
        objectId: root._id,
      });
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
    const rootChannel = await requireChannelForAddressableRoot({ ctx, root, actor: channelActor });
    await requireCommunityChannelCapability({ ctx, channel: rootChannel, actor: channelActor, capability: "canReply" });
    if (
      args.channelId &&
      normalizeIdValue(rootChannel._id) !== normalizeIdValue(args.channelId)
    ) {
      throw new Error("interaction_channel_mismatch");
    }

    const idempotencyKey = composerIdempotencyKey(
      normalizeIdempotencyKey(args.idempotencyKey),
      "reply",
      actorType,
    );
    const replyTarget = await resolveOptionalReplyTargetForCanonicalComposer({
      ctx,
      root,
      rootChannel,
      replyToMessageId: args.replyToMessageId ?? null,
    });
    const composerPayloadHash = await fingerprintCommunityComposerPayload({
      channelId: String(rootChannel._id), rootId: String(root._id),
      targetReplyId: replyTarget.targetReplyId ? String(replyTarget.targetReplyId) : undefined,
      text, attachmentIds: attachments.map(attachment => attachment.attachmentId!), mentions: mentionedUserIds,
    });
    let reply = await getExistingReplyByIdempotencyKey(ctx, root.communityId, idempotencyKey);
    let communityAgentMention: ConciergeMentionRow | null = null;
    let deduped = true;
    if (
      reply &&
      (normalizeIdValue(reply.rootId) !== normalizeIdValue(root._id) ||
        reply.actorType !== actorType ||
        normalizeIdValue(reply.actorUserId) !== normalizeIdValue(userId) ||
        normalizeIdValue(reply.actorAgentKey) !==
          normalizeIdValue(actorAgentKey) ||
        normalizeIdValue(reply.targetReplyId) !==
          normalizeIdValue(replyTarget.targetReplyId) ||
        reply.composerPayloadHash !== composerPayloadHash)
    ) {
      throw new Error("interaction_idempotency_key_conflict");
    }

    if (!reply) {
      const visibilityScope = resolveReplyVisibilityScope(root.visibilityScope, root.visibilityScope);
      const seq = await nextReplySeq(ctx, root._id);
      const replyId = await ctx.db.insert("communityInteractionReplies" as any, {
        communityId: root.communityId,
        channelId: rootChannel._id,
        rootId: root._id,
        seq,
        actorType,
        actorUserId: userId,
        ...(actorAgentKey ? { actorAgentKey } : {}),
        ...(replyTarget.targetReplyId ? { targetReplyId: replyTarget.targetReplyId } : {}),
        status: "live",
        visibilityScope,
        contentSummary: summary,
        reactionSummary: [],
        idempotencyKey,
        composerPayloadHash,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await insertContentBlocksForTarget({
        ctx,
        communityId: root.communityId,
        channelId: rootChannel._id,
        replyId,
        visibilityScope,
        blocks: contentBlocks,
        nowMs,
      });
      const mentionRows = await insertCommunityInteractionMentionRows({
        ctx,
        communityId: root.communityId,
        channelId: rootChannel._id,
        replyId,
        mentionedUserIds,
        actorUserId: userId,
        nowMs,
      });
      communityAgentMention = mentionRows.communityAgentMention;
      await ctx.db.patch(root._id as any, {
        replyCount: Math.max(0, Math.floor(root.replyCount ?? 0)) + 1,
        lastReplyAt: nowMs,
        updatedAt: nowMs,
      });
      reply = (await ctx.db.get(replyId as any)) as InteractionReplyRow | null;
      if (!reply) throw new Error("interaction_reply_create_failed");
      await claimInteractionAttachmentsForTarget({
        ctx,
        messageKey: args.idempotencyKey,
        communityId: root.communityId,
        replyId: reply._id,
        attachments,
        actorUserId: userId,
        nowMs,
      });
      deduped = false;
    }

    await ensureReplyChannelMatchesRoot({ ctx, root, reply, actor: channelActor });

    if (actorType === "human" && !deduped) {
      await ctx.scheduler.runAfter(
        0,
        internal.communityMemberWorkflows
          .handleChannelContributionReplyInternal,
        { replyId: reply._id },
      );
    }

    if (actorType === "human") {
      await intakeCommunityAgentTurn({
        ctx,
        communityId: root.communityId,
        rootId: root._id,
        replyId: reply._id,
        ...(communityAgentMention ? { mention: communityAgentMention } : {}),
        nowMs,
      });
    }

    await scheduleCommunityInteractionEvidenceSync({
      ctx,
      communityId: root.communityId,
      objectType: "reply",
      objectId: reply._id,
    });
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
}

export const createCommunityInteractionComposerMessage = mutation({
  args: communityInteractionComposerArgs,
  handler: (ctx, args) => createCommunityInteractionComposerMessageCore(ctx, args),
});

export const createCommunityInteractionComposerMessageForTrustedUserInternal = internalMutation({
  args: { ...communityInteractionComposerArgs, trustedUserId: v.id("users") },
  handler: (ctx, { trustedUserId, ...args }) =>
    createCommunityInteractionComposerMessageCore(ctx, args, trustedUserId),
});

export const createCommunityAgentCanonicalInteractionInternal = internalMutation({
  args: {
    userId: v.id("users"),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
    idempotencyKey: v.string(),
    text: v.optional(v.string()),
    founderBootstrap: v.optional(v.boolean()),
    rootId: v.optional(v.union(v.id("communityInteractionRoots"), v.null())),
    replyToMessageId: v.optional(v.union(v.string(), v.null())),
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
    const founderBootstrap = args.founderBootstrap === true;
    let sponsorUserId: any;
    let canonicalText = args.text ?? "";
    if (founderBootstrap) {
      if (
        args.rootId ||
        args.replyToMessageId ||
        (args.mentions?.length ?? 0) > 0 ||
        (args.attachments?.length ?? 0) > 0 ||
        args.idempotencyKey !== communityFounderWelcomeIdempotencyKey(args.communityId)
      ) {
        throw new Error("community_founder_welcome_contract_invalid");
      }
      const [community, founderIdentity] = await Promise.all([
        ctx.db.get(args.communityId),
        readCanonicalUserIdentityProjection(ctx, args.userId),
      ]);
      if (!community || String(community.ownerId) !== String(args.userId) || !founderIdentity) {
        throw new Error("community_founder_welcome_owner_required");
      }
      sponsorUserId = args.userId;
      canonicalText = buildCommunityFounderWelcomeText({
        founderDisplayName: founderIdentity.displayName,
        communityName: community.name,
      });
    } else {
      sponsorUserId = await resolveUserIdForAuthenticatedRequest({
        ctx,
        userId: args.userId,
        authSubject: args.authSubject ?? null,
      });
    }
    const channelActor = await resolveCommunityChannelActor({
      ctx,
      communityId: args.communityId,
      userId: sponsorUserId,
      kind: "community_agent",
    });

    const text = normalizeBoundedText(canonicalText, MAX_INTERACTION_TEXT_CHARS);
    const attachments = await resolveInteractionAttachmentClaims({ ctx, communityId: args.communityId,
      actorUserId: sponsorUserId, messageKey: args.idempotencyKey, rootId: args.rootId,
      attachments: args.attachments ?? [] });
    if (!text && attachments.length === 0) {
      throw new Error("interaction_content_required");
    }
    if (args.rootId && textContainsEverybodyMentionToken(text)) {
      throw new Error("interaction_mention_everybody_reply_not_allowed");
    }
    if (args.mentions?.some((mention) => Boolean(String(mention.agentKey ?? "").trim()))) {
      throw new Error("interaction_mention_agent_self_reference");
    }
    const contentBlocks: NormalizedContentBlock[] = text
      ? [
          { blockType: "markdown_text", text },
          ...extractLinkBlocksFromText(text),
        ]
      : [];
    const summary = composerContentSummary(contentBlocks, attachments);
    const mentionedUserIds =
      await resolveMentionedUserIdsForInteractionWrite({
        ctx,
        communityId: args.communityId,
        actorUserId: sponsorUserId,
        targetKind: args.rootId ? "reply" : "root",
        text,
        mentions: args.mentions ?? [],
      });
    const nowMs = Date.now();
    const requestedChannel = await resolveAuthorizedCommunityChannel({
      ctx,
      actor: channelActor,
      capability: args.rootId ? "canReply" : "canPost",
      communityId: args.communityId,
      channelId: args.channelId,
      ensureGeneralForWrite: true,
      nowMs,
    });
    const idempotencyKey = composerIdempotencyKey(
      normalizeIdempotencyKey(args.idempotencyKey),
      args.rootId ? "reply" : "root",
      "community_agent",
    );

    if (!args.rootId) {
      const composerPayloadHash = await fingerprintCommunityComposerPayload({
        channelId: String(requestedChannel._id), text,
        attachmentIds: attachments.map(attachment => attachment.attachmentId!), mentions: mentionedUserIds,
      });
      let root = await getExistingRootByIdempotencyKey(
        ctx,
        args.communityId,
        idempotencyKey,
      );
      let deduped = true;
      if (
        root &&
        (root.actorType !== "community_agent" ||
          Boolean(root.actorUserId) ||
          root.actorAgentKey !== CANONICAL_COMMUNITY_AGENT_KEY ||
          (!founderBootstrap && root.composerPayloadHash !== composerPayloadHash))
      ) {
        throw new Error("interaction_idempotency_key_conflict");
      }
      if (root) {
        const existingChannel = await requireChannelForAddressableRoot({
          ctx,
          root,
          nowMs,
          actor: channelActor,
        });
        if (
          normalizeIdValue(existingChannel._id) !==
          normalizeIdValue(requestedChannel._id)
        ) {
          throw new Error("interaction_idempotency_key_conflict");
        }
      }
      if (!root) {
        const rootId = await ctx.db.insert("communityInteractionRoots" as any, {
          communityId: args.communityId,
          channelId: requestedChannel._id,
          actorType: "community_agent",
          actorAgentKey: CANONICAL_COMMUNITY_AGENT_KEY,
          kind: "discussion",
          status: "live",
          visibilityScope: "community",
          contentSummary: summary,
          replyCount: 0,
          reactionSummary: [],
          idempotencyKey,
          composerPayloadHash,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
        await insertContentBlocksForTarget({
          ctx,
          communityId: args.communityId,
          channelId: requestedChannel._id,
          rootId,
          visibilityScope: "community",
          blocks: contentBlocks,
          nowMs,
        });
        await insertCommunityInteractionMentionRows({
          ctx,
          communityId: args.communityId,
          channelId: requestedChannel._id,
          rootId,
          mentionedUserIds,
          actorUserId: sponsorUserId,
          nowMs,
        });
        root = (await ctx.db.get(rootId)) as InteractionRootRow | null;
        if (!root) throw new Error("interaction_root_create_failed");
        await claimInteractionAttachmentsForTarget({
          ctx,
          messageKey: args.idempotencyKey,
          communityId: args.communityId,
          rootId: root._id,
          attachments,
          actorUserId: sponsorUserId,
          nowMs,
        });
        deduped = false;
      }
      await requireChannelForAddressableRoot({ ctx, root, nowMs, actor: channelActor });
      await scheduleCommunityInteractionEvidenceSync({
        ctx,
        communityId: args.communityId,
        objectType: "root",
        objectId: root._id,
      });
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
    if (
      !root ||
      normalizeIdValue(root.communityId) !==
        normalizeIdValue(args.communityId)
    ) {
      throw new Error("interaction_root_not_found");
    }
    if (root.status !== "live" || root.lockedAt) {
      throw new Error("interaction_root_closed");
    }
    const rootChannel = await requireChannelForAddressableRoot({
      ctx,
      root,
      nowMs,
      actor: channelActor,
    });
    if (
      normalizeIdValue(rootChannel._id) !==
      normalizeIdValue(requestedChannel._id)
    ) {
      throw new Error("interaction_channel_mismatch");
    }
    const replyTarget = await resolveOptionalReplyTargetForCanonicalComposer({
      ctx,
      root,
      rootChannel,
      replyToMessageId: args.replyToMessageId ?? null,
    });
    const composerPayloadHash = await fingerprintCommunityComposerPayload({
      channelId: String(rootChannel._id), rootId: String(root._id),
      targetReplyId: replyTarget.targetReplyId ? String(replyTarget.targetReplyId) : undefined,
      text, attachmentIds: attachments.map(attachment => attachment.attachmentId!), mentions: mentionedUserIds,
    });
    let reply = await getExistingReplyByIdempotencyKey(
      ctx,
      args.communityId,
      idempotencyKey,
    );
    let deduped = true;
    if (
      reply &&
      (normalizeIdValue(reply.rootId) !== normalizeIdValue(root._id) ||
        reply.actorType !== "community_agent" ||
        Boolean(reply.actorUserId) ||
        reply.actorAgentKey !== CANONICAL_COMMUNITY_AGENT_KEY ||
        normalizeIdValue(reply.targetReplyId) !==
          normalizeIdValue(replyTarget.targetReplyId) ||
        reply.composerPayloadHash !== composerPayloadHash)
    ) {
      throw new Error("interaction_idempotency_key_conflict");
    }
    if (!reply) {
      const visibilityScope = resolveReplyVisibilityScope(
        root.visibilityScope,
        root.visibilityScope,
      );
      const seq = await nextReplySeq(ctx, root._id);
      const replyId = await ctx.db.insert(
        "communityInteractionReplies" as any,
        {
          communityId: args.communityId,
          channelId: rootChannel._id,
          rootId: root._id,
          seq,
          actorType: "community_agent",
          actorAgentKey: CANONICAL_COMMUNITY_AGENT_KEY,
          ...(replyTarget.targetReplyId
            ? { targetReplyId: replyTarget.targetReplyId }
            : {}),
          status: "live",
          visibilityScope,
          contentSummary: summary,
          reactionSummary: [],
          idempotencyKey,
          composerPayloadHash,
          createdAt: nowMs,
          updatedAt: nowMs,
        },
      );
      await insertContentBlocksForTarget({
        ctx,
        communityId: args.communityId,
        channelId: rootChannel._id,
        replyId,
        visibilityScope,
        blocks: contentBlocks,
        nowMs,
      });
      await insertCommunityInteractionMentionRows({
        ctx,
        communityId: args.communityId,
        channelId: rootChannel._id,
        replyId,
        mentionedUserIds,
        actorUserId: sponsorUserId,
        nowMs,
      });
      await ctx.db.patch(root._id, {
        replyCount: Math.max(0, Math.floor(root.replyCount ?? 0)) + 1,
        lastReplyAt: nowMs,
        updatedAt: nowMs,
      });
      reply = (await ctx.db.get(replyId)) as InteractionReplyRow | null;
      if (!reply) throw new Error("interaction_reply_create_failed");
      await claimInteractionAttachmentsForTarget({
        ctx,
        messageKey: args.idempotencyKey,
        communityId: args.communityId,
        replyId: reply._id,
        attachments,
        actorUserId: sponsorUserId,
        nowMs,
      });
      deduped = false;
    }
    await ensureReplyChannelMatchesRoot({ ctx, root, reply, nowMs, actor: channelActor });
    await scheduleCommunityInteractionEvidenceSync({
      ctx,
      communityId: args.communityId,
      objectType: "reply",
      objectId: reply._id,
    });
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

export const listCommunityInteractionRoots = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
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
    const channelActor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const channel = await resolveAuthorizedCommunityChannel({
      ctx,
      actor: channelActor,
      capability: "canRead",
      communityId: args.communityId,
      channelId: args.channelId,
    });

    const limit = normalizeReadLimit(args.limit, MAX_INTERACTION_ROOT_READ_LIMIT, 30);
    const beforeCreatedAt = normalizeBeforeNumber(args.beforeCreatedAt);
    const kind = args.kind ?? null;
    const visibleRows = await listChannelReadableRows<InteractionRootRow>({
      ctx,
      actor: channelActor,
      tableName: "communityInteractionRoots",
      communityId: args.communityId,
      channel,
      limit,
      beforeCreatedAt,
      kind,
    });
    const userIdCache = new Map<string, string | null>();
    const viewer = { userId, cards: newPostCardReadCache() };
    const viewerMap = await loadViewerReactionMapForTargets(ctx, userId, "root", visibleRows.map((row) => row._id));
    const bundles = await Promise.all(
      visibleRows.map((row) => mapRootBundle(ctx, row, false, userIdCache, viewerMap.get(normalizeIdValue(row._id)) ?? [], viewer)),
    );
    return {
      roots: bundles,
      next_before_created_at:
        visibleRows.length === limit && visibleRows.length > 0
          ? visibleRows[visibleRows.length - 1]!.createdAt
          : null,
    };
  },
});

export const getCommunityChannelPinnedRoot = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const channelActor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const channel = await resolveAuthorizedCommunityChannel({
      ctx,
      actor: channelActor,
      capability: "canRead",
      communityId: args.communityId,
      channelId: args.channelId,
    });
    if (!channel.pinnedRootId) return { pinned_root: null };
    const root = (await ctx.db.get(channel.pinnedRootId)) as InteractionRootRow | null;
    if (!root || !isReadableRootInCommunityChannel({ root, communityId: args.communityId, channel })) {
      throw new Error("community_channel_pin_invalid");
    }
    const viewerMap = await loadViewerReactionMapForTargets(ctx, userId, "root", [root._id]);
    return {
      pinned_root: await mapRootBundle(
        ctx,
        root,
        false,
        new Map<string, string | null>(),
        viewerMap.get(normalizeIdValue(root._id)) ?? [],
        { userId, cards: newPostCardReadCache() },
      ),
    };
  },
});

export const getCommunityChannelInteractionRoot = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
    rootId: v.id("communityInteractionRoots"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const channelActor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const channel = await resolveAuthorizedCommunityChannel({
      ctx,
      actor: channelActor,
      capability: "canRead",
      communityId: args.communityId,
      channelId: args.channelId,
    });
    const root = (await ctx.db.get(args.rootId)) as InteractionRootRow | null;
    if (!root || !isReadableRootInCommunityChannel({ root, communityId: args.communityId, channel })) {
      return { root: null };
    }
    const viewerMap = await loadViewerReactionMapForTargets(ctx, userId, "root", [root._id]);
    return {
      root: await mapRootBundle(
        ctx,
        root,
        false,
        new Map<string, string | null>(),
        viewerMap.get(normalizeIdValue(root._id)) ?? [],
        { userId, cards: newPostCardReadCache() },
      ),
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
    const channelActor = await resolveCommunityChannelActor({ ctx, communityId: root.communityId, userId });
    const rootChannel = await resolveAuthorizedCommunityChannel({
      ctx,
      actor: channelActor,
      capability: "canRead",
      communityId: root.communityId,
      channelId: root.channelId,
    });

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
          if (!interactionBelongsToChannel(row, rootChannel)) {
            throw new Error("interaction_reply_channel_mismatch");
          }
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

export async function requireTargetChannelAccess(args: {
  ctx: any; target: InteractionRootRow | InteractionReplyRow; userId: any;
}) {
  // Non-channel dock interactions retain their existing separate authority.
  if (!interactionIsChannelAddressable(args.target)) return;
  const root = "rootId" in args.target
    ? await args.ctx.db.get(args.target.rootId)
    : args.target;
  if (!root || normalizeIdValue(root.communityId) !== normalizeIdValue(args.target.communityId)) {
    throw new Error("community_channel_unavailable");
  }
  const actor = await resolveCommunityChannelActor({ ctx: args.ctx, communityId: root.communityId, userId: args.userId });
  const channel = await resolveAuthorizedCommunityChannel({
    ctx: args.ctx, communityId: root.communityId, channelId: root.channelId,
    actor, capability: "canRead",
  });
  if (!interactionBelongsToChannel(args.target, channel)) throw new Error("community_channel_unavailable");
}

// Sets one member's reaction on a post or reply. `on` undefined toggles (the
// web composer); true or false sets it, so retries are safe (the door).
async function setCommunityInteractionReactionCore(ctx: any, args: {
  targetType: "root" | "reply"; targetId: string; emoji: string; on?: boolean;
}, userId: any) {
  const emoji = String(args.emoji).trim().slice(0, 32);
  if (!emoji) throw new Error("reaction_emoji_required");
  const { target, communityId } = await loadCommunityInteractionTarget({
    ctx,
    targetType: args.targetType,
    targetId: args.targetId,
  });
  assertLiveInteractionTarget(target);
  await requireCommunityChatAccess({ ctx, communityId, userId });
  await requireTargetChannelAccess({ ctx, target, userId });
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
  const reacted = args.on ?? !existing;
  if (reacted === Boolean(existing)) {
    return { reacted, reaction_summary: mapReactionSummary(target.reactionSummary) };
  }
  if (existing) {
    await ctx.db.delete(existing._id);
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
  }
  const summary = applyReactionSummaryDelta(target.reactionSummary, emoji, reacted ? 1 : -1);
  await ctx.db.patch(target._id, { reactionSummary: summary, updatedAt: nowMs });
  return { reacted, reaction_summary: summary };
}

const reactionTargetArgs = {
  targetType: v.union(v.literal("root"), v.literal("reply")),
  targetId: v.string(),
  emoji: v.string(),
};

export const toggleCommunityInteractionReaction = mutation({
  args: { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), ...reactionTargetArgs },
  handler: async (ctx, { userId, authSubject, ...args }) =>
    setCommunityInteractionReactionCore(ctx, args, await resolveUserIdForAuthenticatedRequest({
      ctx, userId, authSubject: authSubject ?? null,
    })),
});

// For the door: the member was already authenticated by the canonical executor.
export const setCommunityInteractionReactionForTrustedUserInternal = internalMutation({
  args: { ...reactionTargetArgs, on: v.boolean(), trustedUserId: v.id("users") },
  handler: (ctx, { trustedUserId, ...args }) => setCommunityInteractionReactionCore(ctx, args, trustedUserId),
});

// Who reacted to a post or reply, grouped by emoji in the order the reactions
// are shown. Anyone who can read the post can see who reacted, as in chat apps.
const MAX_REACTORS_PER_TARGET = 300;
export const listCommunityInteractionReactors = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    targetType: v.union(v.literal("root"), v.literal("reply")),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    const { target, communityId } = await loadCommunityInteractionTarget({ ctx, targetType: args.targetType, targetId: args.targetId });
    assertLiveInteractionTarget(target);
    await requireCommunityChatAccess({ ctx, communityId, userId });
    await requireTargetChannelAccess({ ctx, target, userId });
    const rows = await ctx.db
      .query("communityInteractionReactions" as any)
      .withIndex(args.targetType === "root" ? "by_root" : "by_reply", (q: any) =>
        q.eq(args.targetType === "root" ? "rootId" : "replyId", target._id))
      .take(MAX_REACTORS_PER_TARGET);
    const cards = newPostCardReadCache();
    const groups = new Map<string, Array<{ user_id: string | null; name: string; avatar_url: string | null; is_agent: boolean }>>();
    for (const row of [...rows].sort((a: any, b: any) => a.createdAt - b.createdAt) as any[]) {
      const emoji = String(row.emoji ?? "").trim().slice(0, 32);
      if (!emoji) continue;
      const person = row.actorUserId && row.actorType === "human"
        ? { ...(await postCardPerson(ctx, row.actorUserId, cards)), is_agent: false }
        : { user_id: null, name: "Community agent", avatar_url: null, is_agent: true };
      groups.set(emoji, [...(groups.get(emoji) ?? []), person]);
    }
    const order = mapReactionSummary((target as any).reactionSummary).map((row) => row.emoji);
    return {
      reactions: [...groups.entries()]
        .sort(([a], [b]) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999))
        .map(([emoji, people]) => ({ emoji, people })),
      truncated: rows.length === MAX_REACTORS_PER_TARGET,
    };
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
}): Promise<void> {
  if (args.target.status !== "live") throw new Error("interaction_not_editable");
  const blocks: NormalizedContentBlock[] = args.text
    ? [
        { blockType: "markdown_text", text: args.text },
        ...extractLinkBlocksFromText(args.text),
      ]
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
    channelId: args.target.channelId,
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
  await suppressPendingMentionsMissingFromInteractionText({
    ctx: args.ctx,
    targetType: args.targetType,
    targetId: args.target._id,
    text: args.text,
    nowMs: args.nowMs,
  });
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
  if (args.targetType === "root") {
    await clearPinnedRootIfMatches({
      ctx: args.ctx,
      root: args.target as InteractionRootRow,
      actorUserId: args.actorUserId,
      reason: "root_tombstoned",
      nowMs: args.nowMs,
    });
  }
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

async function editCommunityInteractionMessageCore(ctx: any, args: {
  targetType: "root" | "reply"; targetId: string; text: string;
}, userId: any) {
  const text = normalizeBoundedText(args.text, MAX_INTERACTION_TEXT_CHARS);
  if (!text) throw new Error("interaction_content_required");
  const { target, communityId } = await loadCommunityInteractionTarget({
    ctx,
    targetType: args.targetType,
    targetId: args.targetId,
  });
  assertLiveInteractionTarget(target);
  await requireCommunityChatAccess({ ctx, communityId, userId });
  await requireTargetChannelAccess({ ctx, target, userId });
  // The community agent's words stay its own, even in a post made for you.
  if (normalizeIdValue(target.actorUserId) !== normalizeIdValue(userId) || target.actorType !== "human") {
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
  });
  return { ok: true };
}

const editTargetArgs = {
  targetType: v.union(v.literal("root"), v.literal("reply")),
  targetId: v.string(),
  text: v.string(),
};

export const editCommunityInteractionMessage = mutation({
  args: { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), ...editTargetArgs },
  handler: async (ctx, { userId, authSubject, ...args }) =>
    editCommunityInteractionMessageCore(ctx, args, await resolveUserIdForAuthenticatedRequest({
      ctx, userId, authSubject: authSubject ?? null,
    })),
});

export const editCommunityInteractionMessageForTrustedUserInternal = internalMutation({
  args: { ...editTargetArgs, trustedUserId: v.id("users") },
  handler: (ctx, { trustedUserId, ...args }) => editCommunityInteractionMessageCore(ctx, args, trustedUserId),
});

// Authors delete their own posts; moderators may delete others' only when
// `allowModerator` (Studio). The door deletes own posts only.
async function deleteCommunityInteractionMessageCore(ctx: any, args: {
  targetType: "root" | "reply"; targetId: string; communityId?: any;
}, userId: any, allowModerator: boolean) {
  const { target, communityId } = await loadCommunityInteractionTarget({
    ctx,
    targetType: args.targetType,
    targetId: args.targetId,
  });
  // An owner's agent is mounted on one community and removes posts only there.
  if (args.communityId && normalizeIdValue(communityId) !== normalizeIdValue(args.communityId)) {
    throw new Error("interaction_delete_forbidden");
  }
  await requireCommunityChatAccess({ ctx, communityId, userId });
  await requireTargetChannelAccess({ ctx, target, userId });
  const isOwner = normalizeIdValue(target.actorUserId) === normalizeIdValue(userId);
  if (!isOwner) {
    let isModerator = false;
    if (allowModerator) {
      try {
        await requireCommunityModerator({ ctx, communityId, userId });
        isModerator = true;
      } catch {
        isModerator = false;
      }
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
}

const deleteTargetArgs = {
  targetType: v.union(v.literal("root"), v.literal("reply")),
  targetId: v.string(),
};

export const deleteCommunityInteractionMessage = mutation({
  args: { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.optional(v.id("communities")), ...deleteTargetArgs },
  handler: async (ctx, { userId, authSubject, ...args }) =>
    deleteCommunityInteractionMessageCore(ctx, args, await resolveUserIdForAuthenticatedRequest({
      ctx, userId, authSubject: authSubject ?? null,
    }), true),
});

// Moderation from a site's private twin (httpCommunityApps, private sessions
// only, so a site's own code never reaches it): a post of the session's own
// community, by ref, that its member may remove as a moderator.
async function loadModerationTarget(ctx: any, args: { communityId: any; ref: string }) {
  const match = /^interaction:(root|reply):([A-Za-z0-9_-]{1,64})$/.exec(String(args.ref ?? ""));
  if (!match) return null;
  const targetType = match[1] as "root" | "reply";
  const id = ctx.db.normalizeId(targetType === "root" ? "communityInteractionRoots" : "communityInteractionReplies", match[2]);
  if (!id) return null;
  const target = (await ctx.db.get(id)) as InteractionRootRow | InteractionReplyRow | null;
  if (!target || normalizeIdValue(target.communityId) !== normalizeIdValue(args.communityId)) return null;
  return { targetType, target };
}

export const readInteractionForTrustedModeratorInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities"), ref: v.string() },
  handler: async (ctx, args) => {
    await requireCommunityModerator({ ctx, communityId: args.communityId, userId: args.userId });
    const found = await loadModerationTarget(ctx, args);
    if (!found || found.target.status !== "live") return null;
    await requireTargetChannelAccess({ ctx, target: found.target, userId: args.userId });
    const author = found.target.actorType === "human" && found.target.actorUserId
      ? await resolveUserProfileDisplayProjection(ctx, found.target.actorUserId)
      : null;
    return {
      ref: args.ref,
      author: author?.display_name ?? (found.target.actorType === "human" ? "A member" : "The community agent"),
      text: String(found.target.contentSummary ?? "").slice(0, 600),
      mine: normalizeIdValue(found.target.actorUserId) === normalizeIdValue(args.userId),
      created_at: new Date(found.target.createdAt).toISOString(),
    };
  },
});

export const removeInteractionForTrustedModeratorInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), ref: v.string() },
  handler: async (ctx, args) => {
    const found = await loadModerationTarget(ctx, args);
    if (!found) throw new Error("interaction_target_not_found");
    return await deleteCommunityInteractionMessageCore(ctx, {
      targetType: found.targetType, targetId: String(found.target._id),
    }, args.userId, true);
  },
});

export const deleteOwnCommunityInteractionMessageForTrustedUserInternal = internalMutation({
  args: { ...deleteTargetArgs, trustedUserId: v.id("users") },
  handler: (ctx, { trustedUserId, ...args }) => deleteCommunityInteractionMessageCore(ctx, args, trustedUserId, false),
});
