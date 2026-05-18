import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  requireCommunityChatAccess,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";

type CommunityActivityEventType =
  | "member_joined"
  | "resource_added"
  | "event_soon"
  | "event_starting"
  | "ai_feed_post_added";

type CommunityActivityTargetType =
  | "membership"
  | "resource"
  | "event"
  | "ai_feed_post";

type CommunityActivityEventRow = {
  _id: any;
  communityId: any;
  type: CommunityActivityEventType;
  actorUserId?: any;
  targetType?: CommunityActivityTargetType;
  targetId?: string;
  targetTitle?: string;
  dedupeKey: string;
  createdAt: number;
};

const MAX_ACTIVITY_TITLE_CHARS = 180;
const MAX_ACTIVITY_DEDUPE_KEY_CHARS = 256;
const MAX_ACTIVITY_EVENTS_PER_READ = 100;

function normalizeActivityTitle(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return undefined;
  return value.slice(0, MAX_ACTIVITY_TITLE_CHARS);
}

function normalizeActivityDedupeKey(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("community_activity_dedupe_key_required");
  return value.slice(0, MAX_ACTIVITY_DEDUPE_KEY_CHARS);
}

function normalizeActivityTargetId(raw: unknown): string | undefined {
  const value = normalizeIdValue(raw);
  return value || undefined;
}

async function mapCommunityActivityEventRow(
  ctx: any,
  row: CommunityActivityEventRow,
  userIdCache?: Map<string, string | null>,
) {
  const actorUserId = row.actorUserId
    ? await resolvePublicUserId(ctx, row.actorUserId, userIdCache)
    : null;
  return {
    id: String(row._id),
    community_id: String(row.communityId),
    type: row.type,
    actor_user_id: actorUserId,
    target_type: row.targetType ?? null,
    target_id: row.targetId ?? null,
    target_title: row.targetTitle ?? null,
    created_at: toIsoString(row.createdAt),
  };
}

export async function recordCommunityActivityEventBestEffort(args: {
  ctx: any;
  communityId: any;
  type: CommunityActivityEventType;
  actorUserId?: any | null;
  targetType?: CommunityActivityTargetType | null;
  targetId?: unknown;
  targetTitle?: unknown;
  dedupeKey: string;
  nowMs?: number;
}): Promise<void> {
  try {
    const dedupeKey = normalizeActivityDedupeKey(args.dedupeKey);
    const existing = (await args.ctx.db
      .query("communityActivityEvents" as any)
      .withIndex("by_community_dedupeKey", (q: any) =>
        q.eq("communityId", args.communityId).eq("dedupeKey", dedupeKey),
      )
      .first()) as CommunityActivityEventRow | null;
    if (existing) return;

    const actorUserId = args.actorUserId ? args.actorUserId : undefined;
    const targetType = args.targetType ?? undefined;
    const targetId = normalizeActivityTargetId(args.targetId);
    const targetTitle = normalizeActivityTitle(args.targetTitle);
    await args.ctx.db.insert("communityActivityEvents" as any, {
      communityId: args.communityId,
      type: args.type,
      ...(actorUserId ? { actorUserId } : null),
      ...(targetType ? { targetType } : null),
      ...(targetId ? { targetId } : null),
      ...(targetTitle ? { targetTitle } : null),
      dedupeKey,
      createdAt: Math.max(0, Math.floor(args.nowMs ?? Date.now())),
    });
  } catch {
    // Activity markers are ambient UI; product writes should not fail because
    // an optional marker could not be recorded.
  }
}

export const listCommunityActivityEvents = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    beforeCreatedAt: v.optional(v.union(v.number(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });

    const safeLimit = Math.max(1, Math.min(MAX_ACTIVITY_EVENTS_PER_READ, Math.floor(args.limit ?? 50)));
    const beforeCreatedAt =
      typeof args.beforeCreatedAt === "number" && Number.isFinite(args.beforeCreatedAt)
        ? Math.max(0, Math.floor(args.beforeCreatedAt))
        : null;
    const rows = (await ctx.db
      .query("communityActivityEvents" as any)
      .withIndex("by_community_createdAt", (q: any) =>
        beforeCreatedAt === null
          ? q.eq("communityId", args.communityId)
          : q.eq("communityId", args.communityId).lt("createdAt", beforeCreatedAt),
      )
      .order("desc")
      .take(safeLimit)) as CommunityActivityEventRow[];
    const userIdCache = new Map<string, string | null>();
    const mapped = await Promise.all(rows.map((row) => mapCommunityActivityEventRow(ctx, row, userIdCache)));
    return mapped.reverse();
  },
});
