// "Going" (design v1 Events): a member says they'll be at one date of an
// event; everyone in the community sees how many are going, a few faces, and
// who is hosting. Members only (the same gate as reading events).
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityChatAccess, resolvePublicUserId } from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";

const ITEMS_MAX = 60;
const COUNT_CAP = 1_000;
const FACES = 4;

const itemValidator = v.object({ eventId: v.id("communityEvents"), occurrenceStartsAt: v.number() });

async function reader(ctx: any, args: { userId?: any; authSubject?: string; communityId: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
  await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
  return userId;
}

export const setCommunityEventGoing = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    eventId: v.id("communityEvents"),
    occurrenceStartsAt: v.number(),
    going: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await reader(ctx, args);
    const event = await ctx.db.get(args.eventId);
    if (!event || String(event.communityId) !== String(args.communityId)) throw new Error("community_event_not_found");
    if (event.status !== "live") throw new Error("community_event_cancelled");
    if (!Number.isFinite(args.occurrenceStartsAt) || args.occurrenceStartsAt < event.startsAt) throw new Error("community_event_occurrence_invalid");
    const existing = await ctx.db.query("communityEventGoing")
      .withIndex("by_event_occurrence_user", (q) => q.eq("eventId", args.eventId).eq("occurrenceStartsAt", args.occurrenceStartsAt).eq("userId", userId))
      .collect();
    if (args.going) {
      if (!existing.length) {
        await ctx.db.insert("communityEventGoing", { communityId: args.communityId, eventId: args.eventId, occurrenceStartsAt: args.occurrenceStartsAt, userId, createdAt: Date.now() });
      }
    } else {
      for (const row of existing) await ctx.db.delete(row._id);
    }
    return { going: args.going };
  },
});

export type EventGoing = {
  event_id: string;
  occurrence_starts_at: number;
  count: number;
  count_capped: boolean;
  mine: boolean;
  host_name: string | null;
  faces: Array<{ user_id: string; name: string; avatar_url: string | null }>;
};

// For the dates on screen: how many are going, a few faces, whether you are,
// and who is hosting (the person who made the event).
export const listCommunityEventGoing = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    items: v.array(itemValidator),
  },
  handler: async (ctx, args): Promise<EventGoing[]> => {
    const userId = await reader(ctx, args);
    const names = new Map<string, { user_id: string; name: string; avatar_url: string | null }>();
    const person = async (id: any) => {
      const key = String(id);
      if (!names.has(key)) {
        const profile = await resolveUserProfileDisplayProjection(ctx, id);
        const user = await ctx.db.get(id) as { displayName?: string; handle?: string } | null;
        names.set(key, { user_id: (await resolvePublicUserId(ctx, id)) ?? key, name: profile.display_name ?? user?.displayName ?? user?.handle ?? "Member", avatar_url: profile.avatar_url ?? null });
      }
      return names.get(key)!;
    };
    const out: EventGoing[] = [];
    for (const item of args.items.slice(0, ITEMS_MAX)) {
      const event = await ctx.db.get(item.eventId);
      if (!event || String(event.communityId) !== String(args.communityId)) continue;
      const rows = await ctx.db.query("communityEventGoing")
        .withIndex("by_event_occurrence", (q) => q.eq("eventId", item.eventId).eq("occurrenceStartsAt", item.occurrenceStartsAt))
        .take(COUNT_CAP + 1);
      const faces = [];
      for (const row of rows.slice(0, FACES)) faces.push(await person(row.userId));
      out.push({
        event_id: String(item.eventId),
        occurrence_starts_at: item.occurrenceStartsAt,
        count: Math.min(rows.length, COUNT_CAP),
        count_capped: rows.length > COUNT_CAP,
        // Your own answer is read directly, so it is right however many are going.
        mine: Boolean(await ctx.db.query("communityEventGoing")
          .withIndex("by_event_occurrence_user", (q) => q.eq("eventId", item.eventId).eq("occurrenceStartsAt", item.occurrenceStartsAt).eq("userId", userId))
          .first()),
        host_name: (await person(event.createdByUserId)).name,
        faces,
      });
    }
    return out;
  },
});
