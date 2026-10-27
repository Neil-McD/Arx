// Staging only: fills one community with a realistic run club's last few days
// (simulated members, posts, replies, an unanswered question, a join request,
// an event tomorrow) so the founder brief has something real to read. Refuses
// unless the deployment sets POLYNET_ALLOW_SEED=1. Running it again replaces
// the previous seed, re-dated to now.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const HOUR_MS = 60 * 60 * 1000;
const PREFIX = "seed:brief-lab:";

const MEMBERS = [
  { key: "sam", name: "Sam Okafor", joinedHoursAgo: 900 },
  { key: "tess", name: "Tess Moreno", joinedHoursAgo: 700 },
  { key: "diego", name: "Diego Alvarez", joinedHoursAgo: 500 },
  { key: "hannah", name: "Hannah Kim", joinedHoursAgo: 300 },
  { key: "jonah", name: "Jonah Reyes", joinedHoursAgo: 160 },
  { key: "elena", name: "Elena Park", joinedHoursAgo: 100 },
  { key: "priya", name: "Priya Shah", joinedHoursAgo: 9 },
  { key: "marcus", name: "Marcus Lee", joinedHoursAgo: 3 },
] as const;

type Key = (typeof MEMBERS)[number]["key"];
const POSTS: Array<{ key: string; by: Key; hoursAgo: number; text: string; replies: Array<{ by: Key; hoursAgo: number; text: string }> }> = [
  { key: "route", by: "diego", hoursAgo: 46, text: "Saturday route: the river loop, 14k, coffee stop at the boathouse around 9k.",
    replies: [{ by: "sam", hoursAgo: 44, text: "Perfect. I'll pace the 5:30 group." }, { by: "tess", hoursAgo: 40, text: "In. Bringing gels for anyone who forgets." }] },
  { key: "track", by: "sam", hoursAgo: 20, text: "Track session Thursday 6pm: 6x800 at 4:45/km. Anyone want to pace with me? I'll bring the cones.",
    replies: [{ by: "diego", hoursAgo: 18, text: "Count me in for the first four." }, { by: "hannah", hoursAgo: 15, text: "Can I join at a slower pace? More like 5:15." }] },
  { key: "pr", by: "tess", hoursAgo: 11, text: "Ran my first sub-50 10k this morning!! Thank you all for the Saturday long runs.",
    replies: [{ by: "hannah", hoursAgo: 10, text: "Huge! Coffee's on me Saturday." }, { by: "sam", hoursAgo: 8, text: "Told you the track work would pay off." }] },
  { key: "calves", by: "hannah", hoursAgo: 19, text: "Does anyone have a stretching routine for tight calves? Mine are wrecked after the hills.", replies: [] },
  { key: "newbie", by: "priya", hoursAgo: 6, text: "Hi all, just moved to the area. Is the Saturday run OK for a 6:30/km pace, or is that too slow?", replies: [] },
];

export const seedBriefLabInternal = internalMutation({
  args: { communityId: v.id("communities"), communityName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (process.env.POLYNET_ALLOW_SEED !== "1") throw new Error("seed_not_allowed_on_this_deployment");
    const community = await ctx.db.get(args.communityId);
    if (!community) throw new Error("community_not_found");
    const nowMs = Date.now();
    const ago = (hours: number) => nowMs - hours * HOUR_MS;
    if (args.communityName) await ctx.db.patch(args.communityId, { name: args.communityName, updatedAt: nowMs });

    const channel = await ctx.db.query("communityChannels")
      .withIndex("by_community_systemRole", (q: any) => q.eq("communityId", args.communityId).eq("systemRole", "general")).first();
    if (!channel) throw new Error("general_channel_missing");

    // Remove the previous seed's activity (users and memberships are reused).
    for (const table of ["communityInteractionRoots", "communityInteractionReplies"] as const) {
      const rows = await ctx.db.query(table).withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId)).collect();
      for (const row of rows.filter((r: any) => String(r.idempotencyKey ?? "").startsWith(PREFIX))) {
        const blocks = await ctx.db.query("communityInteractionContentBlocks")
          .filter((q: any) => q.eq(q.field(table === "communityInteractionRoots" ? "rootId" : "replyId"), row._id)).collect();
        for (const block of blocks) await ctx.db.delete(block._id);
        await ctx.db.delete(row._id);
      }
    }
    for (const event of await ctx.db.query("communityEvents").withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).collect()) {
      if (String(event.descriptionMd ?? "").startsWith(PREFIX)) await ctx.db.delete(event._id);
    }

    const user = async (key: string, name: string) => {
      const authSubject = `${PREFIX}${key}`;
      const existing = await ctx.db.query("users").withIndex("by_authSubject" as any, (q: any) => q.eq("authSubject", authSubject)).unique();
      if (existing) return existing._id;
      return await ctx.db.insert("users", { authSubject, displayName: name, createdAt: nowMs, updatedAt: nowMs } as any);
    };
    const ids = {} as Record<Key, any>;
    for (const member of MEMBERS) {
      const userId = await user(member.key, member.name);
      ids[member.key] = userId;
      const membership = await ctx.db.query("communityMemberships")
        .withIndex("by_community_user" as any, (q: any) => q.eq("communityId", args.communityId).eq("userId", userId)).unique();
      const joinedAt = ago(member.joinedHoursAgo);
      if (membership) await ctx.db.patch(membership._id, { createdAt: joinedAt, updatedAt: nowMs, active: true } as any);
      else await ctx.db.insert("communityMemberships", {
        communityId: args.communityId, userId, role: "member", accessSource: "free_grant", active: true, createdAt: joinedAt, updatedAt: nowMs,
      } as any);
    }

    const block = (target: Record<string, unknown>, text: string, at: number) => ctx.db.insert("communityInteractionContentBlocks", {
      communityId: args.communityId, ...target, blockOrder: 0, blockType: "markdown_text", text, createdAt: at, updatedAt: at,
    } as any);
    for (const post of POSTS) {
      const at = ago(post.hoursAgo);
      const lastReply = post.replies[post.replies.length - 1];
      const rootId = await ctx.db.insert("communityInteractionRoots", {
        communityId: args.communityId, channelId: channel._id, actorType: "human", actorUserId: ids[post.by],
        kind: post.text.includes("?") ? "question" : "discussion", status: "live", visibilityScope: "community",
        contentSummary: post.text, replyCount: post.replies.length, reactionSummary: [],
        idempotencyKey: `${PREFIX}${post.key}`, ...(lastReply ? { lastReplyAt: ago(lastReply.hoursAgo) } : {}),
        createdAt: at, updatedAt: lastReply ? ago(lastReply.hoursAgo) : at,
      } as any);
      await block({ rootId }, post.text, at);
      for (const [index, reply] of post.replies.entries()) {
        const replyAt = ago(reply.hoursAgo);
        const replyId = await ctx.db.insert("communityInteractionReplies", {
          communityId: args.communityId, channelId: channel._id, rootId, seq: index + 1, actorType: "human",
          actorUserId: ids[reply.by], status: "live", visibilityScope: "community", contentSummary: reply.text,
          reactionSummary: [], idempotencyKey: `${PREFIX}${post.key}:${index}`, createdAt: replyAt, updatedAt: replyAt,
        } as any);
        await block({ replyId }, reply.text, replyAt);
      }
    }

    const requesterId = await user("felix", "Felix Grant");
    const request = await ctx.db.query("communityJoinRequests")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", requesterId)).unique();
    if (request) await ctx.db.patch(request._id, { status: "pending", createdAt: ago(5), updatedAt: ago(5) });
    else await ctx.db.insert("communityJoinRequests", { communityId: args.communityId, userId: requesterId, status: "pending", message: "Training for my first half marathon!", createdAt: ago(5), updatedAt: ago(5) });

    await ctx.db.insert("communityEvents", {
      communityId: args.communityId, createdByUserId: community.ownerId, title: "Saturday Long Run: River Loop",
      descriptionMd: `${PREFIX}14k at conversational pace, coffee after.`, startsAt: nowMs + 26 * HOUR_MS,
      endsAt: nowMs + 28 * HOUR_MS, timezone: "America/New_York", locationType: "physical", locationLabel: "Riverside boathouse",
      visibility: "members", status: "live", recurrenceFrequency: "none", createdAt: nowMs, updatedAt: nowMs,
    } as any);
    return { members: MEMBERS.length, posts: POSTS.length };
  },
});
