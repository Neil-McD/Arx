import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
} from "./communityCore";
import {
  ensureCommunityPresenceBaseline,
  normalizeCommunityPresenceTimestamp,
  resolveCommunityPresenceAuthorization,
} from "./communityPresenceCore";

const phaseValidator = v.union(
  v.literal("owners"),
  v.literal("memberships"),
  v.literal("presence"),
);
type BackfillPhase = "owners" | "memberships" | "presence";
const MAX_BATCH_SIZE = 100;

function boundedPaginationOpts(args: { numItems: number; cursor: string | null }) {
  const requested = Number(args.numItems);
  return {
    cursor: args.cursor,
    numItems: Number.isFinite(requested) && requested > 0
      ? Math.min(MAX_BATCH_SIZE, Math.floor(requested))
      : 50,
  };
}

function emptyCounts() {
  return {
    scanned: 0,
    created: 0,
    would_create: 0,
    already_canonical: 0,
    duplicates: 0,
    deleted: 0,
    would_delete: 0,
    unauthorized: 0,
    invalid: 0,
  };
}

export async function backfillCommunityPresenceBatchCore(args: {
  ctx: any;
  phase: BackfillPhase;
  paginationOpts: { numItems: number; cursor: string | null };
  dryRun: boolean;
}) {
  const paginationOpts = boundedPaginationOpts(args.paginationOpts);
  const counts = emptyCounts();

  if (args.phase === "owners") {
    const batch = await args.ctx.db.query("communities").order("asc").paginate(paginationOpts);
    for (const community of batch.page as CommunityLike[]) {
      counts.scanned += 1;
      const existing = await args.ctx.db
        .query("communityPresence" as any)
        .withIndex("by_community_user", (q: any) =>
          q.eq("communityId", community._id).eq("userId", community.ownerId),
        )
        .first();
      if (existing) {
        counts.already_canonical += 1;
      } else if (args.dryRun) {
        counts.would_create += 1;
      } else {
        await ensureCommunityPresenceBaseline({
          ctx: args.ctx,
          communityId: community._id,
          userId: community.ownerId,
          baselineAt: community.createdAt,
        });
        counts.created += 1;
      }
    }
    return {
      ok: true,
      phase: args.phase,
      dry_run: args.dryRun,
      batch_limit: paginationOpts.numItems,
      ...counts,
      complete: batch.isDone,
      continue_cursor: batch.isDone ? null : batch.continueCursor,
    };
  }

  if (args.phase === "memberships") {
    const batch = await args.ctx.db.query("communityMemberships").order("asc").paginate(paginationOpts);
    for (const membership of batch.page as CommunityMembershipLike[]) {
      counts.scanned += 1;
      if (!communityMembershipRowIsActive(membership)) {
        counts.invalid += 1;
        continue;
      }
      const existing = await args.ctx.db
        .query("communityPresence" as any)
        .withIndex("by_community_user", (q: any) =>
          q.eq("communityId", membership.communityId).eq("userId", membership.userId),
        )
        .first();
      if (existing) {
        counts.already_canonical += 1;
      } else if (args.dryRun) {
        counts.would_create += 1;
      } else {
        await ensureCommunityPresenceBaseline({
          ctx: args.ctx,
          communityId: membership.communityId,
          userId: membership.userId,
          baselineAt: Number(membership.activatedAt ?? membership.createdAt),
        });
        counts.created += 1;
      }
    }
    return {
      ok: true,
      phase: args.phase,
      dry_run: args.dryRun,
      batch_limit: paginationOpts.numItems,
      ...counts,
      complete: batch.isDone,
      continue_cursor: batch.isDone ? null : batch.continueCursor,
    };
  }

  const batch = await args.ctx.db.query("communityPresence").order("asc").paginate(paginationOpts);
  const visitedGroups = new Set<string>();
  for (const row of batch.page as Array<{
    _id: any;
    communityId: any;
    userId: any;
    lastSeenAt: number;
  }>) {
    counts.scanned += 1;
    const groupKey = `${String(row.communityId)}:${String(row.userId)}`;
    if (visitedGroups.has(groupKey)) continue;
    visitedGroups.add(groupKey);
    const community = (await args.ctx.db.get(row.communityId)) as CommunityLike | null;
    const groupRows = await args.ctx.db
      .query("communityPresence" as any)
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", row.communityId).eq("userId", row.userId),
      )
      .collect();
    const newest = groupRows.reduce((winner: any | null, candidate: any) => {
      if (!winner) return candidate;
      return Number(candidate.lastSeenAt) > Number(winner.lastSeenAt) ? candidate : winner;
    }, null);
    const duplicateRows = groupRows.filter((candidate: any) => candidate._id !== newest?._id);
    counts.duplicates += duplicateRows.length;

    let authorized = false;
    if (community && normalizeCommunityPresenceTimestamp(newest?.lastSeenAt) !== null) {
      authorized = (await resolveCommunityPresenceAuthorization({
        ctx: args.ctx,
        community,
        userId: row.userId,
      })).authorized;
    }
    if (!community || !newest || normalizeCommunityPresenceTimestamp(newest.lastSeenAt) === null) {
      counts.invalid += groupRows.length;
    } else if (!authorized) {
      counts.unauthorized += groupRows.length;
    } else {
      counts.already_canonical += 1;
    }

    const deleteRows = authorized && newest
      ? duplicateRows
      : groupRows;
    if (args.dryRun) {
      counts.would_delete += deleteRows.length;
    } else {
      for (const deleteRow of deleteRows) await args.ctx.db.delete(deleteRow._id);
      counts.deleted += deleteRows.length;
    }
  }
  return {
    ok: true,
    phase: args.phase,
    dry_run: args.dryRun,
    batch_limit: paginationOpts.numItems,
    ...counts,
    complete: batch.isDone,
    continue_cursor: batch.isDone ? null : batch.continueCursor,
  };
}

export const backfillCommunityPresenceBatch = internalMutation({
  args: {
    phase: phaseValidator,
    paginationOpts: paginationOptsValidator,
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => backfillCommunityPresenceBatchCore({
    ctx,
    phase: args.phase,
    paginationOpts: args.paginationOpts,
    dryRun: args.dryRun,
  }),
});
