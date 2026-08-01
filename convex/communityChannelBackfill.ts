import { paginationOptsValidator } from "convex/server";
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  ensureGeneralChannel,
  GENERAL_CHANNEL_SLUG,
  getGeneralChannel,
  interactionIsChannelAddressable,
  listGeneralChannelProjectionRows,
  requireActiveCommunityChannel,
} from "./communityChannelCore";
import {
  normalizeIdValue,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { scheduleCommunityInteractionEvidenceSync } from "./communityInteractionEvidence";

const backfillPhaseValidator = v.union(
  v.literal("roots"),
  v.literal("replies"),
  v.literal("mentions"),
  v.literal("mention_broadcasts"),
  v.literal("read_cursors"),
  v.literal("typing_presence"),
);

type BackfillPhase =
  | "roots"
  | "replies"
  | "mentions"
  | "mention_broadcasts"
  | "read_cursors"
  | "typing_presence";

const MAX_GENERAL_CHANNEL_BACKFILL_BATCH_SIZE = 100;

type BackfillCounts = {
  scanned: number;
  updated: number;
  wouldUpdate: number;
  alreadyCanonical: number;
  intentionallyUnchanneled: number;
  invalid: number;
};

function emptyCounts(): BackfillCounts {
  return {
    scanned: 0,
    updated: 0,
    wouldUpdate: 0,
    alreadyCanonical: 0,
    intentionallyUnchanneled: 0,
    invalid: 0,
  };
}

function idsMatch(left: unknown, right: unknown): boolean {
  return Boolean(
    normalizeIdValue(left) &&
      normalizeIdValue(left) === normalizeIdValue(right),
  );
}

type SourceChannelResolution =
  | { state: "channel"; channelId: any }
  | { state: "intentionally_unchanneled" }
  | { state: "phase_order_blocked" }
  | { state: "invalid" };

async function resolveSourceChannel(args: {
  ctx: any;
  communityId: any;
  row: { rootId?: any; replyId?: any };
}): Promise<SourceChannelResolution> {
  if (Boolean(args.row.rootId) === Boolean(args.row.replyId)) {
    return { state: "invalid" };
  }
  let root: any;
  if (args.row.replyId) {
    const reply = await args.ctx.db.get(args.row.replyId);
    if (
      !reply ||
      normalizeIdValue(reply.communityId) !== normalizeIdValue(args.communityId)
    ) {
      return { state: "invalid" };
    }
    root = await args.ctx.db.get(reply.rootId);
    if (
      !root ||
      normalizeIdValue(root.communityId) !== normalizeIdValue(args.communityId) ||
      (reply.channelId &&
        root.channelId &&
        !idsMatch(reply.channelId, root.channelId))
    ) {
      return { state: "invalid" };
    }
  } else {
    root = await args.ctx.db.get(args.row.rootId);
  }
  if (
    !root ||
    normalizeIdValue(root.communityId) !== normalizeIdValue(args.communityId)
  ) {
    return { state: "invalid" };
  }
  if (!interactionIsChannelAddressable(root)) {
    return { state: "intentionally_unchanneled" };
  }
  if (!root.channelId) return { state: "phase_order_blocked" };
  try {
    const channel = await requireActiveCommunityChannel({
      ctx: args.ctx,
      communityId: args.communityId,
      channelId: root.channelId,
    });
    return { state: "channel", channelId: channel._id };
  } catch {
    return { state: "invalid" };
  }
}

function boundedPaginationOpts(args: {
  numItems: number;
  cursor: string | null;
}): { numItems: number; cursor: string | null } {
  const requested = Number(args.numItems);
  return {
    cursor: args.cursor,
    numItems:
      Number.isFinite(requested) && requested > 0
        ? Math.min(
            MAX_GENERAL_CHANNEL_BACKFILL_BATCH_SIZE,
            Math.floor(requested),
          )
        : 50,
  };
}

export async function backfillGeneralChannelBatchCore(args: {
  ctx: any;
  communityId: any;
  phase: BackfillPhase;
  paginationOpts: { numItems: number; cursor: string | null };
  dryRun: boolean;
}): Promise<Record<string, unknown>> {
  const existingGeneral = await getGeneralChannel(args.ctx, args.communityId);
  if (args.dryRun && !existingGeneral) {
    const slugCollision = await args.ctx.db
      .query("communityChannels" as any)
      .withIndex("by_community_slug", (q: any) =>
        q
          .eq("communityId", args.communityId)
          .eq("slug", GENERAL_CHANNEL_SLUG),
      )
      .first();
    if (slugCollision) {
      throw new Error("community_general_channel_slug_conflict");
    }
  }
  const general = args.dryRun
    ? existingGeneral
    : await ensureGeneralChannel({ ctx: args.ctx, communityId: args.communityId });
  const channelId = general?._id ?? null;
  const counts = emptyCounts();
  const paginationOpts = boundedPaginationOpts(args.paginationOpts);

  if (args.phase === "roots") {
    const batch = await args.ctx.db
      .query("communityInteractionRoots" as any)
      .withIndex("by_community_createdAt", (q: any) =>
        q.eq("communityId", args.communityId),
      )
      .order("asc")
      .paginate(paginationOpts);
    for (const root of batch.page) {
      counts.scanned += 1;
      if (!interactionIsChannelAddressable(root)) {
        if (root.channelId) counts.invalid += 1;
        else counts.intentionallyUnchanneled += 1;
        continue;
      }
      if (root.channelId) {
        try {
          await requireActiveCommunityChannel({
            ctx: args.ctx,
            communityId: args.communityId,
            channelId: root.channelId,
          });
          counts.alreadyCanonical += 1;
        } catch {
          counts.invalid += 1;
        }
        continue;
      }
      if (args.dryRun) {
        counts.wouldUpdate += 1;
        continue;
      }
      await args.ctx.db.patch(root._id, { channelId });
      await scheduleCommunityInteractionEvidenceSync({
        ctx: args.ctx,
        communityId: args.communityId,
        objectType: "root",
        objectId: root._id,
      });
      counts.updated += 1;
    }
    return {
      ok: true,
      phase: args.phase,
      dry_run: args.dryRun,
      community_id: normalizeIdValue(args.communityId),
      general_channel_id: channelId ? normalizeIdValue(channelId) : null,
      general_channel_would_create: args.dryRun && !existingGeneral,
      batch_limit: paginationOpts.numItems,
      ...counts,
      complete: batch.isDone,
      continue_cursor: batch.continueCursor,
    };
  }

  const batch = await (args.phase === "replies" || args.phase === "mentions"
    ? args.ctx.db
        .query(
          args.phase === "replies"
            ? ("communityInteractionReplies" as any)
            : ("communityInteractionMentions" as any),
        )
        .withIndex("by_community_createdAt", (q: any) =>
          q.eq("communityId", args.communityId),
        )
        .order("asc")
    : args.phase === "mention_broadcasts"
      ? args.ctx.db
          .query("communityMentionBroadcasts" as any)
          .withIndex("by_community_createdAt", (q: any) =>
            q.eq("communityId", args.communityId),
          )
          .order("asc")
    : args.ctx.db
        .query(
          args.phase === "read_cursors"
            ? ("communityReadCursors" as any)
            : ("communityTypingPresence" as any),
        )
        .withIndex("by_community", (q: any) =>
          q.eq("communityId", args.communityId),
        )).paginate(paginationOpts);

  for (const row of batch.page) {
    counts.scanned += 1;
    if (args.phase === "replies") {
      const root = await args.ctx.db.get(row.rootId);
      if (
        !root ||
        normalizeIdValue(root.communityId) !== normalizeIdValue(args.communityId)
      ) {
        counts.invalid += 1;
        continue;
      }
      if (!interactionIsChannelAddressable(root)) {
        if (row.channelId) counts.invalid += 1;
        else counts.intentionallyUnchanneled += 1;
        continue;
      }
      let expectedChannelId = root.channelId;
      if (expectedChannelId) {
        try {
          await requireActiveCommunityChannel({
            ctx: args.ctx,
            communityId: args.communityId,
            channelId: expectedChannelId,
          });
        } catch {
          counts.invalid += 1;
          continue;
        }
      } else if (!args.dryRun) {
        // Reply evidence derives its channel from the root. Enforce the
        // documented phase order rather than creating a transient mismatch.
        counts.invalid += 1;
        continue;
      } else {
        expectedChannelId = channelId;
        if (!expectedChannelId) {
          counts.wouldUpdate += 1;
          continue;
        }
      }
      if (row.channelId) {
        if (idsMatch(row.channelId, expectedChannelId)) {
          counts.alreadyCanonical += 1;
        } else {
          counts.invalid += 1;
        }
        continue;
      }
      if (args.dryRun) {
        counts.wouldUpdate += 1;
        continue;
      }
      await args.ctx.db.patch(row._id, { channelId: expectedChannelId });
      await scheduleCommunityInteractionEvidenceSync({
        ctx: args.ctx,
        communityId: args.communityId,
        objectType: "reply",
        objectId: row._id,
      });
      counts.updated += 1;
      continue;
    }

    if (args.phase === "mentions" || args.phase === "mention_broadcasts") {
      const source = await resolveSourceChannel({
        ctx: args.ctx,
        communityId: args.communityId,
        row: {
          rootId:
            args.phase === "mention_broadcasts" ? row.sourceRootId : row.rootId,
          replyId:
            args.phase === "mention_broadcasts" ? row.sourceReplyId : row.replyId,
        },
      });
      if (source.state === "invalid") {
        counts.invalid += 1;
        continue;
      }
      if (source.state === "intentionally_unchanneled") {
        if (row.channelId) counts.invalid += 1;
        else counts.intentionallyUnchanneled += 1;
        continue;
      }
      if (source.state === "phase_order_blocked") {
        // Roots and replies are the authority for notification projection.
        // Never guess a channel while their migration phase is incomplete.
        counts.invalid += 1;
        continue;
      }
      if (row.channelId) {
        if (idsMatch(row.channelId, source.channelId)) {
          counts.alreadyCanonical += 1;
        } else {
          counts.invalid += 1;
        }
        continue;
      }
      if (args.phase === "mention_broadcasts") {
        const sourceMention = await args.ctx.db.get(row.sourceMentionId);
        if (
          !sourceMention ||
          normalizeIdValue(sourceMention.communityId) !==
            normalizeIdValue(args.communityId) ||
          !idsMatch(sourceMention.channelId, source.channelId)
        ) {
          counts.invalid += 1;
          continue;
        }
      }
      if (args.dryRun) {
        counts.wouldUpdate += 1;
        continue;
      }
      await args.ctx.db.patch(row._id, { channelId: source.channelId });
      counts.updated += 1;
      continue;
    }

    if (row.channelId && (!channelId || !idsMatch(row.channelId, channelId))) {
      try {
        await requireActiveCommunityChannel({
          ctx: args.ctx,
          communityId: args.communityId,
          channelId: row.channelId,
        });
        counts.alreadyCanonical += 1;
      } catch {
        counts.invalid += 1;
      }
      continue;
    }
    const projectionRows = await listGeneralChannelProjectionRows({
      ctx: args.ctx,
      tableName:
        args.phase === "read_cursors"
          ? "communityReadCursors"
          : "communityTypingPresence",
      communityId: args.communityId,
      generalChannelId: channelId,
      userId: row.userId,
      ...(args.phase === "read_cursors"
        ? { streamKind: row.streamKind }
        : {}),
    });
    if (projectionRows.length > 1) {
      // This includes legacy/legacy, legacy/General, and duplicate-General
      // collisions. Never patch any row in a collided semantic projection.
      const canonicalProjectionRows = channelId
        ? projectionRows.filter((candidate) =>
            idsMatch(candidate.channelId, channelId),
          )
        : [];
      if (
        row.channelId &&
        channelId &&
        idsMatch(row.channelId, channelId) &&
        canonicalProjectionRows.length === 1
      ) {
        counts.alreadyCanonical += 1;
      } else {
        counts.invalid += 1;
      }
      continue;
    }
    if (row.channelId) {
      if (
        channelId &&
        idsMatch(row.channelId, channelId) &&
        projectionRows.length === 1
      ) {
        counts.alreadyCanonical += 1;
      } else {
        counts.invalid += 1;
      }
      continue;
    }
    if (args.dryRun) {
      counts.wouldUpdate += 1;
      continue;
    }
    await args.ctx.db.patch(row._id, { channelId });
    counts.updated += 1;
  }

  return {
    ok: true,
    phase: args.phase,
    dry_run: args.dryRun,
    community_id: normalizeIdValue(args.communityId),
    general_channel_id: channelId ? normalizeIdValue(channelId) : null,
    general_channel_would_create: args.dryRun && !existingGeneral,
    batch_limit: paginationOpts.numItems,
    ...counts,
    complete: batch.isDone,
    continue_cursor: batch.continueCursor,
  };
}

// Manager-authorized, dry-run-first migration. Re-running a completed phase is
// an audit: wouldUpdate=0 and invalid=0 is the zero-drift gate.
export const backfillGeneralChannelBatch = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    phase: backfillPhaseValidator,
    paginationOpts: paginationOptsValidator,
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return await backfillGeneralChannelBatchCore({
      ctx,
      communityId: args.communityId,
      phase: args.phase,
      paginationOpts: args.paginationOpts,
      dryRun: args.dryRun !== false,
    });
  },
});
