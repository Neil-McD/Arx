import { type StoredInteractionActorType } from "../shared/communityAgentIdentity";
import {
  normalizeIdValue,
  resolvePublicUserId,
  toIsoString,
} from "./communityCore";
import {
  listCanonicalInteractionAttachmentsForTarget,
  type NormalizedInteractionAttachmentInput,
} from "./communityInteractionAttachmentBridge";
import { requireSafeCommunitySourceUrl } from "./communitySourceUrlPolicy";
import { extractCommunityInteractionLinkSources } from "../shared/communityInteractionLinkExtraction";
import {
  interactionBelongsToChannel,
  interactionIsChannelAddressable,
  type CommunityChannelLike,
} from "./communityChannelCore";
import {
  type MentionKind,
  listMentionsForReply,
  listMentionsForRoot,
  mapMentions,
} from "./communityInteractionMentionsCore";

export type InteractionActorType = StoredInteractionActorType;
export type InteractionRootKind = "discussion" | "announcement" | "question" | "resource_share" | "agent_signal";
export type InteractionStatus = "live" | "hidden" | "deleted";
export type InteractionVisibilityScope = "private" | "admin" | "community" | "public";
export type WorkspaceRefKind = "thread" | "project" | "file" | "artifact" | "run" | "resource";

export type InteractionRootRow = {
  viaAi?: boolean;
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

export type InteractionReplyRow = {
  viaAi?: boolean;
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

export type ContentBlockRow = {
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

export type NormalizedContentBlock =
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

export const MAX_INTERACTION_BLOCKS_PER_WRITE = 24;
export const MAX_INTERACTION_TEXT_CHARS = 8000;
export const MAX_INTERACTION_SUMMARY_CHARS = 500;
const MAX_INTERACTION_IDEMPOTENCY_KEY_CHARS = 160;
const MAX_INTERACTION_URL_CHARS = 2048;
const MAX_AUTO_LINK_BLOCKS = 2;

export function normalizeBoundedText(raw: unknown, maxLength: number): string {
  return String(raw ?? "").trim().slice(0, maxLength);
}

export function normalizeIdempotencyKey(raw: unknown): string {
  const key = normalizeBoundedText(raw, MAX_INTERACTION_IDEMPOTENCY_KEY_CHARS);
  if (!key) throw new Error("interaction_idempotency_key_required");
  return key;
}

export function normalizeReadLimit(raw: unknown, maxLimit: number, defaultLimit: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return defaultLimit;
  return Math.max(1, Math.min(maxLimit, Math.floor(parsed)));
}

export function normalizeBeforeNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

function presentedAgentKey(row: { actorType: InteractionActorType; actorAgentKey?: string }): string | null {
  return row.actorAgentKey ?? null;
}

function authorFields(actorType: string, userId: string | null) {
  return actorType === "community_agent"
    ? { actor_user_id: null, on_behalf_of_user_id: userId }
    : { actor_user_id: userId, on_behalf_of_user_id: null };
}

export function composerIdempotencyKey(
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

export async function resolveOptionalReplyTargetForCanonicalComposer(args: {
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

// Detect http(s) URLs in composer text and turn them into link blocks (which auto-create pending
// embeds). Deduped by normalized URL, capped, invalid URLs skipped.
export function extractLinkBlocksFromText(text: string): NormalizedContentBlock[] {
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

export function contentSummary(blocks: NormalizedContentBlock[]): string {
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

export function composerContentSummary(
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

export function resolveReplyVisibilityScope(
  requested: InteractionVisibilityScope | undefined,
  rootScope: InteractionVisibilityScope,
): InteractionVisibilityScope {
  const next = requested ?? rootScope;
  if (visibilityRank(next) > visibilityRank(rootScope)) {
    throw new Error("interaction_reply_visibility_exceeds_root");
  }
  return next;
}

export function interactionVisibilityIsCommunityReadable(scope: InteractionVisibilityScope): boolean {
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

export function assertCommunityReadableRoot(root: InteractionRootRow): void {
  if (root.status !== "live" || !interactionVisibilityIsCommunityReadable(root.visibilityScope)) {
    throw new Error("interaction_root_not_readable");
  }
}

export function isReadableRootInCommunityChannel(args: {
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

export function assertCommunityReadableReply(reply: InteractionReplyRow): void {
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

export async function getExistingRootByIdempotencyKey(ctx: any, communityId: any, idempotencyKey: string) {
  return (await ctx.db
    .query("communityInteractionRoots" as any)
    .withIndex("by_community_idempotencyKey", (q: any) =>
      q.eq("communityId", communityId).eq("idempotencyKey", idempotencyKey),
    )
    .first()) as InteractionRootRow | null;
}

export async function getExistingReplyByIdempotencyKey(ctx: any, communityId: any, idempotencyKey: string) {
  return (await ctx.db
    .query("communityInteractionReplies" as any)
    .withIndex("by_community_idempotencyKey", (q: any) =>
      q.eq("communityId", communityId).eq("idempotencyKey", idempotencyKey),
    )
    .first()) as InteractionReplyRow | null;
}

export async function listContentBlocksForRoot(ctx: any, rootId: any): Promise<ContentBlockRow[]> {
  return (await ctx.db
    .query("communityInteractionContentBlocks" as any)
    .withIndex("by_root_order", (q: any) => q.eq("rootId", rootId))
    .take(MAX_INTERACTION_BLOCKS_PER_WRITE)) as ContentBlockRow[];
}

export async function listContentBlocksForReply(ctx: any, replyId: any): Promise<ContentBlockRow[]> {
  return (await ctx.db
    .query("communityInteractionContentBlocks" as any)
    .withIndex("by_reply_order", (q: any) => q.eq("replyId", replyId))
    .take(MAX_INTERACTION_BLOCKS_PER_WRITE)) as ContentBlockRow[];
}

export function mapReactionSummary(rows: Array<{ emoji: string; count: number }> | undefined) {
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

export async function mapRootBundle(
  ctx: any,
  root: InteractionRootRow,
  deduped: boolean,
  userIdCache?: Map<string, string | null>,
  viewerEmojis?: string[],
) {
  const blocks = await listContentBlocksForRoot(ctx, root._id);
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
      actor_type: root.actorType,
      // The community agent's post made for a member: the agent is the author,
      // the member is who it acted for.
      ...authorFields(root.actorType, publicActorUserId ?? (root.actorUserId ? normalizeIdValue(root.actorUserId) : null)),
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
      via_ai: root.viaAi === true,
    },
    content_blocks: blocks.map(mapContentBlock),
    embeds: [],
    mentions: await mapMentions(ctx, mentions, userIdCache),
    attachments,
  };
}

export async function mapReplyBundle(
  ctx: any,
  reply: InteractionReplyRow,
  deduped: boolean,
  userIdCache?: Map<string, string | null>,
  viewerEmojis?: string[],
) {
  const blocks = await listContentBlocksForReply(ctx, reply._id);
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
      actor_type: reply.actorType,
      ...authorFields(reply.actorType, publicActorUserId ?? (reply.actorUserId ? normalizeIdValue(reply.actorUserId) : null)),
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
      via_ai: reply.viaAi === true,
    },
    content_blocks: blocks.map(mapContentBlock),
    embeds: [],
    mentions: await mapMentions(ctx, mentions, userIdCache),
    attachments,
  };
}

export async function insertContentBlocksForTarget(args: {
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
    const contentBlockId = await args.ctx.db.insert("communityInteractionContentBlocks" as any, {
      communityId: args.communityId,
      ...(args.rootId ? { rootId: args.rootId } : {}),
      ...(args.replyId ? { replyId: args.replyId } : {}),
      blockOrder: index,
      blockType: block.blockType,
      ...("text" in block && block.text ? { text: block.text } : {}),
      ...(block.blockType === "link" ? { url: block.url } : {}),
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

export async function nextReplySeq(ctx: any, rootId: any): Promise<number> {
  const last = (await ctx.db
    .query("communityInteractionReplies" as any)
    .withIndex("by_root_seq", (q: any) => q.eq("rootId", rootId))
    .order("desc")
    .first()) as InteractionReplyRow | null;
  return Math.max(0, Math.floor(last?.seq ?? 0)) + 1;
}
