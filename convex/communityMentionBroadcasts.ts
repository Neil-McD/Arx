import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  communityMembershipRowIsActive,
  normalizeIdValue,
  requireCommunityChatAccess,
  type CommunityLike,
  type CommunityMembershipLike,
} from "./communityCore";
import { settleMentionRowInternal } from "./communityMentionLifecycle";
import { readCommunityChatReadState } from "./communityReadCursorCore";

export const EVERYBODY_MENTION_ROLE_KEY = "everybody";
const EVERYBODY_MENTION_TOKEN_ALIASES = ["everybody", "everyone"] as const;
const EVERYBODY_EMAIL_COOLDOWN_MS = 72 * 60 * 60 * 1000;
const BROADCAST_FANOUT_DEFAULT_LIMIT = 3;
const BROADCAST_FANOUT_MAX_LIMIT = 5;
const BROADCAST_FANOUT_DEFAULT_BATCH_SIZE = 50;
const BROADCAST_FANOUT_MAX_BATCH_SIZE = 100;
const BROADCAST_CLEANUP_DEFAULT_LIMIT = 3;
const BROADCAST_CLEANUP_MAX_LIMIT = 5;
const BROADCAST_CLEANUP_DEFAULT_BATCH_SIZE = 100;
const BROADCAST_CLEANUP_MAX_BATCH_SIZE = 200;

type BroadcastStatus = "queued" | "draining" | "complete" | "canceled" | "error";
type BroadcastEmailMode = "in_app_only" | "in_app_and_email";
type BroadcastCleanupState = "queued" | "complete";

type BroadcastRow = {
  _id: any;
  communityId: any;
  roleKey: string;
  actorUserId: any;
  sourceRootId?: any;
  sourceReplyId?: any;
  sourceMentionId: any;
  sourceCreatedAt: number;
  emailMode: BroadcastEmailMode;
  status: BroadcastStatus;
  ownerProcessed?: boolean;
  membershipCursor?: string;
  cleanupState?: BroadcastCleanupState;
  cleanupCursor?: string;
  cleanupCount?: number;
  cleanupCompletedAt?: number;
  processedCount: number;
  recipientCount: number;
  skippedCount: number;
  createdAt: number;
  updatedAt: number;
};

type InteractionRootRow = {
  _id: any;
  communityId: any;
  actorUserId?: any;
  status: "live" | "hidden" | "deleted";
};

type InteractionReplyRow = {
  _id: any;
  communityId: any;
  rootId: any;
  actorUserId?: any;
  status: "live" | "hidden" | "deleted";
};

const internalRefs = internal as any;

function boundedText(raw: unknown, maxLength: number): string {
  return String(raw ?? "").trim().slice(0, maxLength);
}

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textContainsAtToken(text: string, tokenLabel: unknown): boolean {
  const normalizedLabel = String(tokenLabel ?? "").trim().replace(/^@+/, "").toLowerCase();
  if (!normalizedLabel) return false;
  const pattern = new RegExp(`(^|\\s)@${escapeRegExp(normalizedLabel)}(?![A-Za-z0-9_-])`, "i");
  return pattern.test(text);
}

export function textContainsEverybodyMentionToken(text: string): boolean {
  return EVERYBODY_MENTION_TOKEN_ALIASES.some((alias) => textContainsAtToken(text, alias));
}

function normalizeLimit(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? BROADCAST_FANOUT_DEFAULT_LIMIT));
  if (!Number.isFinite(parsed) || parsed <= 0) return BROADCAST_FANOUT_DEFAULT_LIMIT;
  return Math.max(1, Math.min(BROADCAST_FANOUT_MAX_LIMIT, parsed));
}

function normalizeBatchSize(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? BROADCAST_FANOUT_DEFAULT_BATCH_SIZE));
  if (!Number.isFinite(parsed) || parsed <= 0) return BROADCAST_FANOUT_DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(BROADCAST_FANOUT_MAX_BATCH_SIZE, parsed));
}

function normalizeCleanupLimit(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? BROADCAST_CLEANUP_DEFAULT_LIMIT));
  if (!Number.isFinite(parsed) || parsed <= 0) return BROADCAST_CLEANUP_DEFAULT_LIMIT;
  return Math.max(1, Math.min(BROADCAST_CLEANUP_MAX_LIMIT, parsed));
}

function normalizeCleanupBatchSize(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? BROADCAST_CLEANUP_DEFAULT_BATCH_SIZE));
  if (!Number.isFinite(parsed) || parsed <= 0) return BROADCAST_CLEANUP_DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(BROADCAST_CLEANUP_MAX_BATCH_SIZE, parsed));
}

async function readSourceText(ctx: any, broadcast: BroadcastRow): Promise<string> {
  const rows = broadcast.sourceReplyId
    ? await ctx.db
        .query("communityInteractionContentBlocks" as any)
        .withIndex("by_reply_order", (q: any) => q.eq("replyId", broadcast.sourceReplyId))
        .take(24)
    : broadcast.sourceRootId
      ? await ctx.db
          .query("communityInteractionContentBlocks" as any)
          .withIndex("by_root_order", (q: any) => q.eq("rootId", broadcast.sourceRootId))
          .take(24)
      : [];
  return (rows as Array<Record<string, any>>)
    .filter((row) => row.blockType === "markdown_text")
    .map((row) => boundedText(row.text, 8_000))
    .filter(Boolean)
    .join("\n\n");
}

async function sourceIsStillBroadcastable(ctx: any, broadcast: BroadcastRow): Promise<boolean> {
  const sourceMention = (await ctx.db.get(broadcast.sourceMentionId)) as Record<string, any> | null;
  if (!sourceMention || sourceMention.notifyState !== "pending") return false;
  if (sourceMention.mentionedRoleKey !== EVERYBODY_MENTION_ROLE_KEY) return false;
  if (sourceMention.mentionKind !== "role") return false;

  if (broadcast.sourceReplyId) {
    const reply = (await ctx.db.get(broadcast.sourceReplyId)) as InteractionReplyRow | null;
    if (!reply || reply.status !== "live") return false;
    if (normalizeIdValue(reply.communityId) !== normalizeIdValue(broadcast.communityId)) return false;
    const root = (await ctx.db.get(reply.rootId)) as InteractionRootRow | null;
    if (!root || root.status !== "live") return false;
  } else if (broadcast.sourceRootId) {
    const root = (await ctx.db.get(broadcast.sourceRootId)) as InteractionRootRow | null;
    if (!root || root.status !== "live") return false;
    if (normalizeIdValue(root.communityId) !== normalizeIdValue(broadcast.communityId)) return false;
  } else {
    return false;
  }

  return textContainsEverybodyMentionToken(await readSourceText(ctx, broadcast));
}

async function forceSuppressMentionRow(ctx: any, mentionId: any, nowMs: number): Promise<boolean> {
  const row = (await ctx.db.get(mentionId)) as Record<string, any> | null;
  if (!row || row.notifyState === "suppressed") return false;
  await ctx.db.patch(mentionId, {
    notifyState: "suppressed",
    updatedAt: nowMs,
  });
  return true;
}

function cancellationCleanupPatch(errorCode: string, nowMs: number): Record<string, any> {
  if (errorCode === "no_recipients") {
    return {
      cleanupState: "complete",
      cleanupCompletedAt: nowMs,
    };
  }
  return {
    cleanupState: "queued",
  };
}

async function scheduleBroadcastCleanup(ctx: any, broadcastId: any): Promise<boolean> {
  try {
    await ctx.scheduler.runAfter(
      0,
      internalRefs.communityMentionBroadcasts.processCanceledCommunityMentionBroadcastCleanupsInternal,
      {
        broadcastId,
        limit: 1,
      },
    );
    return true;
  } catch {
    return false;
  }
}

export async function mentionBroadcastAllowsEmail(args: {
  ctx: any;
  broadcastId: any;
}): Promise<boolean> {
  const broadcast = (await args.ctx.db.get(args.broadcastId)) as BroadcastRow | null;
  if (!broadcast) return false;
  return broadcast.status !== "canceled" && broadcast.status !== "error";
}

export async function readEverybodyMentionEmailAvailability(args: {
  ctx: any;
  communityId: any;
  nowMs?: number;
}): Promise<{
  emailMode: BroadcastEmailMode;
  cooldownUntil: number | null;
  lastEmailBroadcastAt: number | null;
}> {
  const nowMs = args.nowMs ?? Date.now();
  const rows = (await args.ctx.db
    .query("communityMentionBroadcasts" as any)
    .withIndex("by_community_role_emailMode_createdAt", (q: any) =>
      q
        .eq("communityId", args.communityId)
        .eq("roleKey", EVERYBODY_MENTION_ROLE_KEY)
        .eq("emailMode", "in_app_and_email"),
    )
    .order("desc")
    .take(10)) as Array<Record<string, any>>;
  const latest = rows.find((row) => row.status !== "error" && row.errorCode !== "no_recipients");
  const lastEmailBroadcastAt =
    typeof latest?.createdAt === "number" && Number.isFinite(latest.createdAt)
      ? Math.floor(latest.createdAt)
      : null;
  if (lastEmailBroadcastAt === null) {
    return { emailMode: "in_app_and_email", cooldownUntil: null, lastEmailBroadcastAt: null };
  }
  const cooldownUntil = lastEmailBroadcastAt + EVERYBODY_EMAIL_COOLDOWN_MS;
  return {
    emailMode: cooldownUntil > nowMs ? "in_app_only" : "in_app_and_email",
    cooldownUntil: cooldownUntil > nowMs ? cooldownUntil : null,
    lastEmailBroadcastAt,
  };
}

export async function scheduleEverybodyMentionBroadcast(args: {
  ctx: any;
  communityId: any;
  rootId: any;
  actorUserId: any;
  sourceMentionId: any;
  nowMs: number;
}): Promise<{ broadcastId: any; emailMode: BroadcastEmailMode }> {
  if (!args.rootId) {
    throw new Error("interaction_mention_broadcast_source_required");
  }
  const availability = await readEverybodyMentionEmailAvailability({
    ctx: args.ctx,
    communityId: args.communityId,
    nowMs: args.nowMs,
  });
  const broadcastId = await args.ctx.db.insert("communityMentionBroadcasts" as any, {
    communityId: args.communityId,
    roleKey: EVERYBODY_MENTION_ROLE_KEY,
    actorUserId: args.actorUserId,
    sourceRootId: args.rootId,
    sourceMentionId: args.sourceMentionId,
    sourceCreatedAt: args.nowMs,
    emailMode: availability.emailMode,
    status: "queued",
    ownerProcessed: false,
    processedCount: 0,
    recipientCount: 0,
    skippedCount: 0,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  await args.ctx.db.patch(args.sourceMentionId, {
    sourceBroadcastId: broadcastId,
    updatedAt: args.nowMs,
  });
  try {
    await args.ctx.scheduler.runAfter(
      0,
      internalRefs.communityMentionBroadcasts.processQueuedCommunityMentionBroadcastsInternal,
      {
        broadcastId,
        limit: 1,
      },
    );
  } catch {
    // The cron drain owns reliability; scheduling failure must not fail the chat write.
  }
  return { broadcastId, emailMode: availability.emailMode };
}

async function getExistingMentionRowForBroadcastRecipient(args: {
  ctx: any;
  broadcast: BroadcastRow;
  userId: any;
}): Promise<Record<string, any> | null> {
  const alreadyBroadcast = (await args.ctx.db
    .query("communityInteractionMentions" as any)
    .withIndex("by_sourceBroadcast_user", (q: any) =>
      q.eq("sourceBroadcastId", args.broadcast._id).eq("mentionedUserId", args.userId),
    )
    .first()) as Record<string, any> | null;
  if (alreadyBroadcast) return alreadyBroadcast;

  if (args.broadcast.sourceReplyId) {
    return (await args.ctx.db
      .query("communityInteractionMentions" as any)
      .withIndex("by_reply_mentionedUser", (q: any) =>
        q.eq("replyId", args.broadcast.sourceReplyId).eq("mentionedUserId", args.userId),
      )
      .filter((q: any) => q.eq(q.field("mentionKind"), "user"))
      .first()) as Record<string, any> | null;
  }

  if (args.broadcast.sourceRootId) {
    return (await args.ctx.db
      .query("communityInteractionMentions" as any)
      .withIndex("by_root_mentionedUser", (q: any) =>
        q.eq("rootId", args.broadcast.sourceRootId).eq("mentionedUserId", args.userId),
      )
      .filter((q: any) => q.eq(q.field("mentionKind"), "user"))
      .first()) as Record<string, any> | null;
  }

  return null;
}

async function readRecipientInitialNotifyState(args: {
  ctx: any;
  communityId: any;
  userId: any;
  sourceCreatedAt: number;
  emailMode: BroadcastEmailMode;
}): Promise<"pending" | "sent" | "read"> {
  if (args.emailMode === "in_app_only") return "sent";
  const readState = await readCommunityChatReadState(
    args.ctx,
    args.communityId,
    args.userId,
  );
  return readState.mentionSeenThroughAt >= Math.floor(args.sourceCreatedAt)
    ? "read"
    : "pending";
}

async function attachBroadcastToExistingMention(args: {
  ctx: any;
  mention: Record<string, any>;
  broadcast: BroadcastRow;
  nowMs: number;
}): Promise<boolean> {
  if (args.mention.sourceBroadcastId) return false;
  await args.ctx.db.patch(args.mention._id, {
    sourceBroadcastId: args.broadcast._id,
    mentionedRoleKey: EVERYBODY_MENTION_ROLE_KEY,
    updatedAt: args.nowMs,
  });
  return true;
}

async function processBroadcastRecipient(args: {
  ctx: any;
  broadcast: BroadcastRow;
  userId: any;
  nowMs: number;
}): Promise<"recipient" | "skipped"> {
  const userKey = normalizeIdValue(args.userId);
  if (!userKey || userKey === normalizeIdValue(args.broadcast.actorUserId)) return "skipped";

  const existing = await getExistingMentionRowForBroadcastRecipient(args);
  if (existing) {
    return (await attachBroadcastToExistingMention({
      ctx: args.ctx,
      mention: existing,
      broadcast: args.broadcast,
      nowMs: args.nowMs,
    }))
      ? "recipient"
      : "skipped";
  }

  try {
    await requireCommunityChatAccess({
      ctx: args.ctx,
      communityId: args.broadcast.communityId,
      userId: args.userId,
    });
  } catch {
    return "skipped";
  }

  const notifyState = await readRecipientInitialNotifyState({
    ctx: args.ctx,
    communityId: args.broadcast.communityId,
    userId: args.userId,
    sourceCreatedAt: args.broadcast.sourceCreatedAt,
    emailMode: args.broadcast.emailMode,
  });
  await args.ctx.db.insert("communityInteractionMentions" as any, {
    communityId: args.broadcast.communityId,
    ...(args.broadcast.sourceReplyId
      ? { replyId: args.broadcast.sourceReplyId }
      : { rootId: args.broadcast.sourceRootId }),
    sourceBroadcastId: args.broadcast._id,
    mentionKind: "user",
    mentionedUserId: args.userId,
    mentionedRoleKey: EVERYBODY_MENTION_ROLE_KEY,
    emailEligible: args.broadcast.emailMode === "in_app_and_email",
    notifyState,
    createdAt: args.broadcast.sourceCreatedAt,
    updatedAt: args.nowMs,
  });
  return "recipient";
}

async function cancelBroadcast(ctx: any, broadcast: BroadcastRow, nowMs: number, errorCode: string): Promise<void> {
  const cleanupPatch = cancellationCleanupPatch(errorCode, nowMs);
  await ctx.db.patch(broadcast._id, {
    status: "canceled",
    errorCode: boundedText(errorCode, 120),
    canceledAt: nowMs,
    ...cleanupPatch,
    updatedAt: nowMs,
  });
  await forceSuppressMentionRow(ctx, broadcast.sourceMentionId, nowMs);
  if (cleanupPatch.cleanupState === "queued") {
    await scheduleBroadcastCleanup(ctx, broadcast._id);
  }
}

async function cancelBroadcastWithPatch(
  ctx: any,
  broadcast: BroadcastRow,
  nowMs: number,
  errorCode: string,
  patch: Record<string, any>,
): Promise<void> {
  const cleanupPatch = cancellationCleanupPatch(errorCode, nowMs);
  await ctx.db.patch(broadcast._id, {
    ...patch,
    status: "canceled",
    errorCode: boundedText(errorCode, 120),
    canceledAt: nowMs,
    ...cleanupPatch,
    updatedAt: nowMs,
  });
  await forceSuppressMentionRow(ctx, broadcast.sourceMentionId, nowMs);
  if (cleanupPatch.cleanupState === "queued") {
    await scheduleBroadcastCleanup(ctx, broadcast._id);
  }
}

async function completeBroadcast(ctx: any, broadcast: BroadcastRow, nowMs: number, patch: Record<string, any>): Promise<void> {
  await ctx.db.patch(broadcast._id, {
    ...patch,
    status: "complete",
    completedAt: nowMs,
    updatedAt: nowMs,
  });
  await settleMentionRowInternal({
    ctx,
    mentionId: broadcast.sourceMentionId,
    toState: "sent",
    nowMs,
  });
}

async function cancelBroadcastForSourceInvalidation(
  ctx: any,
  broadcast: BroadcastRow,
  nowMs: number,
  errorCode: string,
): Promise<boolean> {
  if (broadcast.status === "error") return false;
  if (broadcast.status === "canceled") {
    if (broadcast.cleanupState !== "complete") {
      await scheduleBroadcastCleanup(ctx, broadcast._id);
    }
    return false;
  }
  await cancelBroadcast(ctx, broadcast, nowMs, errorCode);
  return true;
}

export async function cancelEverybodyMentionBroadcastsForInteractionSource(args: {
  ctx: any;
  targetType: "root" | "reply";
  targetId: any;
  nowMs: number;
  includeReplySources?: boolean;
  errorCode: string;
}): Promise<{ canceled: number; scheduledCleanup: number }> {
  const broadcasts = args.targetType === "reply"
    ? ((await args.ctx.db
        .query("communityMentionBroadcasts" as any)
        .withIndex("by_sourceReply", (q: any) => q.eq("sourceReplyId", args.targetId))
        .take(100)) as BroadcastRow[])
    : ((await args.ctx.db
        .query("communityMentionBroadcasts" as any)
        .withIndex("by_sourceRoot", (q: any) => q.eq("sourceRootId", args.targetId))
        .take(100)) as BroadcastRow[]);
  let canceled = 0;
  let scheduledCleanup = 0;
  for (const broadcast of broadcasts) {
    if (broadcast.roleKey !== EVERYBODY_MENTION_ROLE_KEY) continue;
    if (args.targetType === "root" && !args.includeReplySources && broadcast.sourceReplyId) continue;
    if (
      await cancelBroadcastForSourceInvalidation(
        args.ctx,
        broadcast,
        args.nowMs,
        args.errorCode,
      )
    ) {
      canceled += 1;
      if (broadcast.cleanupState !== "complete") scheduledCleanup += 1;
    }
  }
  return { canceled, scheduledCleanup };
}

async function loadNextCleanupBroadcast(ctx: any, broadcastId?: any): Promise<BroadcastRow | null> {
  if (broadcastId) {
    const broadcast = (await ctx.db.get(broadcastId)) as BroadcastRow | null;
    if (!broadcast || broadcast.cleanupState !== "queued") return null;
    return broadcast;
  }
  return (await ctx.db
    .query("communityMentionBroadcasts" as any)
    .withIndex("by_cleanupState_updatedAt", (q: any) => q.eq("cleanupState", "queued"))
    .order("asc")
    .first()) as BroadcastRow | null;
}

async function processOneBroadcastCleanupBatch(args: {
  ctx: any;
  broadcast: BroadcastRow;
  batchSize: number;
  nowMs: number;
}): Promise<{ processed: boolean; complete: boolean; suppressed: number }> {
  if (args.broadcast.status !== "canceled" && args.broadcast.status !== "error") {
    await args.ctx.db.patch(args.broadcast._id, {
      cleanupState: "complete",
      cleanupCompletedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { processed: false, complete: true, suppressed: 0 };
  }

  const page = await args.ctx.db
    .query("communityInteractionMentions" as any)
    .withIndex("by_sourceBroadcast", (q: any) => q.eq("sourceBroadcastId", args.broadcast._id))
    .order("asc")
    .paginate({
      cursor: args.broadcast.cleanupCursor ?? null,
      numItems: args.batchSize,
      maximumRowsRead: args.batchSize,
    });

  let suppressed = 0;
  for (const mention of page.page as Array<Record<string, any>>) {
    const isBroadcastCreatedRecipient =
      mention.mentionKind === "user" &&
      mention.mentionedRoleKey === EVERYBODY_MENTION_ROLE_KEY &&
      typeof mention.emailEligible === "boolean";
    const isBroadcastSourceMention =
      mention.mentionKind === "role" &&
      mention.mentionedRoleKey === EVERYBODY_MENTION_ROLE_KEY;
    if (!isBroadcastCreatedRecipient && !isBroadcastSourceMention) continue;
    if (mention.notifyState === "suppressed") continue;
    await args.ctx.db.patch(mention._id, {
      notifyState: "suppressed",
      updatedAt: args.nowMs,
    });
    suppressed += 1;
  }

  const cleanupCount = Math.floor(Number(args.broadcast.cleanupCount ?? 0)) + suppressed;
  if (page.isDone) {
    await args.ctx.db.patch(args.broadcast._id, {
      cleanupState: "complete",
      cleanupCount,
      cleanupCompletedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { processed: true, complete: true, suppressed };
  }

  await args.ctx.db.patch(args.broadcast._id, {
    ...(page.continueCursor ? { cleanupCursor: page.continueCursor } : {}),
    cleanupCount,
    updatedAt: args.nowMs,
  });
  return { processed: true, complete: false, suppressed };
}

async function processOneBroadcastBatch(args: {
  ctx: any;
  broadcast: BroadcastRow;
  batchSize: number;
  nowMs: number;
}): Promise<{ processed: boolean; complete: boolean }> {
  if (!(await sourceIsStillBroadcastable(args.ctx, args.broadcast))) {
    await cancelBroadcast(args.ctx, args.broadcast, args.nowMs, "source_not_broadcastable");
    return { processed: true, complete: true };
  }

  const community = (await args.ctx.db.get(args.broadcast.communityId)) as CommunityLike | null;
  if (!community) {
    await cancelBroadcast(args.ctx, args.broadcast, args.nowMs, "community_missing");
    return { processed: true, complete: true };
  }

  let ownerProcessed = Boolean(args.broadcast.ownerProcessed);
  let processedCount = Math.floor(Number(args.broadcast.processedCount ?? 0));
  let recipientCount = Math.floor(Number(args.broadcast.recipientCount ?? 0));
  let skippedCount = Math.floor(Number(args.broadcast.skippedCount ?? 0));
  let remaining = args.batchSize;

  if (!ownerProcessed && remaining > 0) {
    const result = await processBroadcastRecipient({
      ctx: args.ctx,
      broadcast: args.broadcast,
      userId: community.ownerId,
      nowMs: args.nowMs,
    });
    processedCount += 1;
    if (result === "recipient") recipientCount += 1;
    else skippedCount += 1;
    ownerProcessed = true;
    remaining -= 1;
  }

  let membershipCursor = args.broadcast.membershipCursor;
  let membershipDone = false;
  if (remaining > 0) {
    const page = await args.ctx.db
      .query("communityMemberships" as any)
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.broadcast.communityId))
      .order("asc")
      .paginate({
        cursor: membershipCursor ?? null,
        numItems: remaining,
        maximumRowsRead: remaining,
      });
    for (const row of page.page as CommunityMembershipLike[]) {
      processedCount += 1;
      if (
        !communityMembershipRowIsActive(row) ||
        normalizeIdValue(row.userId) === normalizeIdValue(community.ownerId) ||
        Math.floor(Number(row.createdAt ?? 0)) > Math.floor(args.broadcast.sourceCreatedAt)
      ) {
        skippedCount += 1;
        continue;
      }
      const result = await processBroadcastRecipient({
        ctx: args.ctx,
        broadcast: args.broadcast,
        userId: row.userId,
        nowMs: args.nowMs,
      });
      if (result === "recipient") recipientCount += 1;
      else skippedCount += 1;
    }
    membershipCursor = page.continueCursor ?? undefined;
    membershipDone = Boolean(page.isDone);
  }

  const patch = {
    status: "draining" as const,
    ownerProcessed,
    ...(membershipCursor ? { membershipCursor } : {}),
    processedCount,
    recipientCount,
    skippedCount,
    updatedAt: args.nowMs,
  };

  if (ownerProcessed && (remaining === 0 ? false : membershipDone)) {
    if (recipientCount === 0) {
      await cancelBroadcastWithPatch(args.ctx, args.broadcast, args.nowMs, "no_recipients", patch);
      return { processed: true, complete: true };
    }
    await completeBroadcast(args.ctx, args.broadcast, args.nowMs, patch);
    return { processed: true, complete: true };
  }

  await args.ctx.db.patch(args.broadcast._id, patch);
  return { processed: true, complete: false };
}

async function loadNextBroadcast(ctx: any, nowMs: number, broadcastId?: any): Promise<BroadcastRow | null> {
  if (broadcastId) {
    const broadcast = (await ctx.db.get(broadcastId)) as BroadcastRow | null;
    if (!broadcast || broadcast.status === "complete" || broadcast.status === "canceled" || broadcast.status === "error") {
      return null;
    }
    return broadcast;
  }

  const queued = (await ctx.db
    .query("communityMentionBroadcasts" as any)
    .withIndex("by_status_updatedAt", (q: any) => q.eq("status", "queued"))
    .order("asc")
    .first()) as BroadcastRow | null;
  if (queued) return queued;

  return (await ctx.db
    .query("communityMentionBroadcasts" as any)
    .withIndex("by_status_updatedAt", (q: any) => q.eq("status", "draining").lt("updatedAt", nowMs))
    .order("asc")
    .first()) as BroadcastRow | null;
}

export const processQueuedCommunityMentionBroadcastsInternal = internalMutation({
  args: {
    broadcastId: v.optional(v.id("communityMentionBroadcasts")),
    limit: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = normalizeLimit(args.limit);
    const batchSize = normalizeBatchSize(args.batchSize);
    let processed = 0;
    let completed = 0;
    let scheduledContinuation = false;

    for (let index = 0; index < limit; index += 1) {
      const broadcast = await loadNextBroadcast(ctx, nowMs, index === 0 ? args.broadcastId : undefined);
      if (!broadcast) break;
      const result = await processOneBroadcastBatch({ ctx, broadcast, batchSize, nowMs });
      if (result.processed) processed += 1;
      if (result.complete) completed += 1;
      if (!result.complete) {
        try {
          await ctx.scheduler.runAfter(
            0,
            internalRefs.communityMentionBroadcasts.processQueuedCommunityMentionBroadcastsInternal,
            {
              broadcastId: broadcast._id,
              limit: 1,
              batchSize,
            },
          );
          scheduledContinuation = true;
        } catch {
          // The cron repair drain will continue the still-draining broadcast.
        }
      }
    }

    return { ok: true, processed, completed, scheduledContinuation };
  },
});

export const processCanceledCommunityMentionBroadcastCleanupsInternal = internalMutation({
  args: {
    broadcastId: v.optional(v.id("communityMentionBroadcasts")),
    limit: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = normalizeCleanupLimit(args.limit);
    const batchSize = normalizeCleanupBatchSize(args.batchSize);
    let processed = 0;
    let completed = 0;
    let suppressed = 0;
    let scheduledContinuation = false;

    for (let index = 0; index < limit; index += 1) {
      const broadcast = await loadNextCleanupBroadcast(ctx, index === 0 ? args.broadcastId : undefined);
      if (!broadcast) break;
      const result = await processOneBroadcastCleanupBatch({ ctx, broadcast, batchSize, nowMs });
      if (result.processed) processed += 1;
      if (result.complete) completed += 1;
      suppressed += result.suppressed;
      if (!result.complete) {
        try {
          await ctx.scheduler.runAfter(
            0,
            internalRefs.communityMentionBroadcasts.processCanceledCommunityMentionBroadcastCleanupsInternal,
            {
              broadcastId: broadcast._id,
              limit: 1,
              batchSize,
            },
          );
          scheduledContinuation = true;
        } catch {
          // The cron repair drain will continue the queued cleanup.
        }
      }
    }

    return { ok: true, processed, completed, suppressed, scheduledContinuation };
  },
});
