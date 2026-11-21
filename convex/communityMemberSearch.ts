// Denormalized per-community member search projection for instant `@` mention
// autocomplete and author resolution at 10k+ member scale.
// Maintained transactionally on membership activation/revocation, role edits,
// and user profile displayName/handle updates; backfilled automatically in
// bounded batches for pre-existing communities.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  communityMembershipRowIsActive,
  normalizeCommunityRoleForOutput,
} from "./communityCore";
import { getUniqueUserProfileDetailByUserId } from "./profileCore";

const BACKFILL_BATCH_SIZE = 100;
const USER_SYNC_CAP = 100;

export function buildMemberSearchText(fields: {
  displayName?: string | null;
  handle?: string | null;
}): string {
  const parts = [
    String(fields.displayName ?? "").trim(),
    String(fields.handle ?? "").trim().replace(/^@/, ""),
  ].filter(Boolean);
  return parts.join(" ").toLowerCase().slice(0, 200);
}

export async function syncCommunityMemberSearchEntry(
  ctx: any,
  args: {
    communityId: any;
    userId: any;
    role: string;
    active: boolean;
    nowMs: number;
  },
): Promise<void> {
  const [user, detail, existing] = await Promise.all([
    ctx.db.get(args.userId) as Promise<any>,
    getUniqueUserProfileDetailByUserId<any>(ctx, args.userId).catch(() => null),
    ctx.db
      .query("communityMemberSearch")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", args.userId),
      )
      .first(),
  ]);
  const displayName =
    String(detail?.displayName ?? user?.displayName ?? "").trim() ||
    (user?.handle ? `@${String(user.handle).trim()}` : "Member");
  const handle = String(user?.normalizedHandle ?? user?.handle ?? "").trim().replace(/^@/, "") || undefined;
  const searchText = buildMemberSearchText({ displayName, handle });
  const role = normalizeCommunityRoleForOutput(args.role) || (args.role === "owner" ? "owner" : "member");

  if (existing) {
    await ctx.db.patch(existing._id, {
      role,
      displayName,
      handle,
      searchText,
      active: args.active,
      updatedAt: args.nowMs,
    });
  } else if (args.active) {
    await ctx.db.insert("communityMemberSearch", {
      communityId: args.communityId,
      userId: args.userId,
      role,
      displayName,
      handle,
      searchText,
      active: true,
      updatedAt: args.nowMs,
    });
  }
}

export async function syncUserMemberSearchEntries(
  ctx: any,
  args: { userId: any; nowMs: number },
): Promise<void> {
  const [user, detail, entries] = await Promise.all([
    ctx.db.get(args.userId) as Promise<any>,
    getUniqueUserProfileDetailByUserId<any>(ctx, args.userId).catch(() => null),
    ctx.db
      .query("communityMemberSearch")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .take(USER_SYNC_CAP),
  ]);
  if (!entries.length) return;
  const displayName =
    String(detail?.displayName ?? user?.displayName ?? "").trim() ||
    (user?.handle ? `@${String(user.handle).trim()}` : "Member");
  const handle = String(user?.normalizedHandle ?? user?.handle ?? "").trim().replace(/^@/, "") || undefined;
  const searchText = buildMemberSearchText({ displayName, handle });
  for (const entry of entries) {
    if (
      entry.displayName === displayName &&
      entry.handle === handle &&
      entry.searchText === searchText
    ) {
      continue;
    }
    await ctx.db.patch(entry._id, {
      displayName,
      handle,
      searchText,
      updatedAt: args.nowMs,
    });
  }
}

export async function maybeScheduleMemberSearchBackfill(
  ctx: any,
  community: { _id: any; memberSearchIndexedAt?: number; memberSearchBackfillStartedAt?: number },
  nowMs: number,
): Promise<void> {
  if (typeof community.memberSearchIndexedAt === "number") return;
  if (
    typeof community.memberSearchBackfillStartedAt === "number" &&
    nowMs - community.memberSearchBackfillStartedAt < 10 * 60_000
  ) {
    return;
  }
  await ctx.db.patch(community._id, { memberSearchBackfillStartedAt: nowMs });
  await ctx.scheduler.runAfter(0, (internal as any).communityMemberSearch.backfillCommunityMemberSearchBatchInternal, {
    communityId: community._id,
    cursor: null,
  });
}

export const backfillCommunityMemberSearchBatchInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) return { done: true, indexed: 0 };
    const nowMs = Date.now();
    let indexed = 0;

    if (args.cursor === null) {
      await syncCommunityMemberSearchEntry(ctx, {
        communityId: args.communityId,
        userId: community.ownerId,
        role: "owner",
        active: true,
        nowMs,
      });
      indexed += 1;
    }

    const page = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_createdAt", (q) => q.eq("communityId", args.communityId))
      .order("asc")
      .paginate({ cursor: args.cursor, numItems: BACKFILL_BATCH_SIZE });

    for (const row of page.page) {
      if (String(row.userId) === String(community.ownerId)) continue;
      const active = communityMembershipRowIsActive(row as any);
      if (!active) continue;
      await syncCommunityMemberSearchEntry(ctx, {
        communityId: args.communityId,
        userId: row.userId,
        role: normalizeCommunityRoleForOutput(row.role) || "member",
        active: true,
        nowMs,
      });
      indexed += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, (internal as any).communityMemberSearch.backfillCommunityMemberSearchBatchInternal, {
        communityId: args.communityId,
        cursor: page.continueCursor,
      });
      return { done: false, indexed };
    }

    await ctx.db.patch(args.communityId, {
      memberSearchIndexedAt: nowMs,
      memberSearchBackfillStartedAt: undefined,
    });
    return { done: true, indexed };
  },
});
