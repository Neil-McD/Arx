import { mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
  normalizeIdValue,
  requireCommunityModerator,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  materializeLegacyChatReplyInteractionPlan,
  materializeLegacyChatRootInteractionPlan,
  planInteractionReplyFromLegacyChatMessageCore,
  planInteractionRootFromLegacyChatMessageCore,
} from "./communityInteractions";

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

type PredictedLegacyChatLink = {
  rootAvailable: boolean;
  replyAvailable: boolean;
};

const DEFAULT_LEGACY_CHAT_BACKFILL_LIMIT = 50;
const MAX_LEGACY_CHAT_BACKFILL_LIMIT = 100;
const MAX_LEGACY_CHAT_BACKFILL_ERRORS = 12;

function normalizeBatchLimit(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_LEGACY_CHAT_BACKFILL_LIMIT;
  return Math.max(1, Math.min(MAX_LEGACY_CHAT_BACKFILL_LIMIT, Math.floor(parsed)));
}

function normalizeAfterSeq(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

async function resolveBackfillThread(args: {
  ctx: any;
  communityId: any;
  threadId?: any;
}): Promise<CommunityChatThreadLike | null> {
  if (args.threadId) {
    const thread = (await args.ctx.db.get(args.threadId)) as CommunityChatThreadLike | null;
    if (!thread) throw new Error("legacy_chat_backfill_thread_not_found");
    if (normalizeIdValue(thread.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("legacy_chat_backfill_thread_community_mismatch");
    }
    return thread;
  }
  return (await args.ctx.db
    .query("communityChatThreads" as any)
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
    .order("asc")
    .first()) as CommunityChatThreadLike | null;
}

async function getLegacyChatLinkByMessage(ctx: any, messageId: any): Promise<LegacyChatLinkRow | null> {
  return (await ctx.db
    .query("communityInteractionLegacyChatLinks" as any)
    .withIndex("by_message", (q: any) => q.eq("messageId", messageId))
    .first()) as LegacyChatLinkRow | null;
}

function pushBackfillError(
  errors: Array<{ message_id: string; seq: number; error: string }>,
  message: CommunityChatMessageLike,
  error: unknown,
) {
  if (errors.length >= MAX_LEGACY_CHAT_BACKFILL_ERRORS) return;
  errors.push({
    message_id: normalizeIdValue(message._id),
    seq: Math.max(0, Math.floor(message.seq ?? 0)),
    error: error instanceof Error ? error.message : String(error),
  });
}

function legacyMessageKey(messageId: any): string {
  return normalizeIdValue(messageId);
}

function predictedLinkFromExistingLink(link: LegacyChatLinkRow): PredictedLegacyChatLink {
  return {
    rootAvailable: Boolean(link.rootId),
    replyAvailable: Boolean(link.replyId),
  };
}

export const backfillCommunityInteractionsFromLegacyChatBatch = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    threadId: v.optional(v.id("communityChatThreads")),
    afterSeq: v.optional(v.number()),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityModerator({
      ctx,
      communityId: args.communityId,
      userId,
    });

    const dryRun = args.dryRun !== false;
    const limit = normalizeBatchLimit(args.limit);
    const afterSeq = normalizeAfterSeq(args.afterSeq);
    const thread = await resolveBackfillThread({
      ctx,
      communityId: args.communityId,
      threadId: args.threadId,
    });
    if (!thread) {
      return {
        ok: true,
        dry_run: dryRun,
        community_id: normalizeIdValue(args.communityId),
        thread_id: null,
        after_seq: afterSeq,
        limit,
        scanned: 0,
        roots_created: 0,
        replies_created: 0,
        roots_would_create: 0,
        replies_would_create: 0,
        already_linked: 0,
        unresolved_replies: 0,
        failed: 0,
        errors: [],
        next_cursor: null,
      };
    }

    const rows = (await ctx.db
      .query("communityChatMessages" as any)
      .withIndex("by_thread_seq", (q: any) => q.eq("threadId", thread._id).gt("seq", afterSeq))
      .order("asc")
      .take(limit)) as CommunityChatMessageLike[];

    const nowMs = Date.now();
    const counts = {
      scanned: 0,
      roots_created: 0,
      replies_created: 0,
      roots_would_create: 0,
      replies_would_create: 0,
      already_linked: 0,
      unresolved_replies: 0,
      failed: 0,
    };
    const errors: Array<{ message_id: string; seq: number; error: string }> = [];
    const predictedLinkByMessageId = new Map<string, PredictedLegacyChatLink>();

    for (const message of rows) {
      counts.scanned += 1;
      const messageKey = legacyMessageKey(message._id);
      const existingLink = await getLegacyChatLinkByMessage(ctx, message._id);
      if (existingLink) {
        predictedLinkByMessageId.set(messageKey, predictedLinkFromExistingLink(existingLink));
        counts.already_linked += 1;
        continue;
      }

      if (message.replyToMessageId) {
        const targetKey = legacyMessageKey(message.replyToMessageId);
        const targetLink = await getLegacyChatLinkByMessage(ctx, message.replyToMessageId);
        const predictedTargetLink = predictedLinkByMessageId.get(targetKey) ?? null;
        if (!(targetLink?.rootId || predictedTargetLink?.rootAvailable)) {
          counts.unresolved_replies += 1;
          continue;
        }
        if (dryRun) {
          predictedLinkByMessageId.set(messageKey, {
            rootAvailable: true,
            replyAvailable: true,
          });
          counts.replies_would_create += 1;
          continue;
        }

        let plan;
        try {
          plan = await planInteractionReplyFromLegacyChatMessageCore({
            ctx,
            thread,
            message,
            nowMs,
          });
        } catch (error) {
          if (error instanceof Error && error.message === "legacy_chat_interaction_target_missing") {
            counts.unresolved_replies += 1;
          } else {
            counts.failed += 1;
            pushBackfillError(errors, message, error);
          }
          continue;
        }
        const result = await materializeLegacyChatReplyInteractionPlan(ctx, plan);
        predictedLinkByMessageId.set(messageKey, {
          rootAvailable: true,
          replyAvailable: true,
        });
        if (result?.deduped) {
          counts.already_linked += 1;
        } else {
          counts.replies_created += 1;
        }
        continue;
      }

      if (dryRun) {
        predictedLinkByMessageId.set(messageKey, {
          rootAvailable: true,
          replyAvailable: false,
        });
        counts.roots_would_create += 1;
        continue;
      }
      let plan;
      try {
        plan = await planInteractionRootFromLegacyChatMessageCore({
          ctx,
          thread,
          message,
          nowMs,
        });
      } catch (error) {
        counts.failed += 1;
        pushBackfillError(errors, message, error);
        continue;
      }
      const result = await materializeLegacyChatRootInteractionPlan(ctx, plan);
      predictedLinkByMessageId.set(messageKey, {
        rootAvailable: true,
        replyAvailable: false,
      });
      if (result?.deduped) {
        counts.already_linked += 1;
      } else {
        counts.roots_created += 1;
      }
    }

    const last = rows[rows.length - 1] ?? null;
    return {
      ok: true,
      dry_run: dryRun,
      community_id: normalizeIdValue(args.communityId),
      thread_id: normalizeIdValue(thread._id),
      after_seq: afterSeq,
      limit,
      ...counts,
      errors,
      next_cursor:
        rows.length === limit && last
          ? {
              thread_id: normalizeIdValue(thread._id),
              after_seq: Math.max(0, Math.floor(last.seq ?? 0)),
            }
          : null,
    };
  },
});
