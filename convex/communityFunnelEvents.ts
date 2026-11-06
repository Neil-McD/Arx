// The doorstep's middle step, for the founder's analytics: someone acting on
// it (starting a checkout, joining or asking to join), between a visit and a
// new member. One per person per community per half hour, like visits: a
// signed-in person by account, a signed-out buyer by the keyed hash of their
// address (never the address). Analytics only: it never decides access.
export const JOIN_STARTED_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

export async function recordCommunityJoinStarted(ctx: any, args: {
  communityId: any;
  userId?: any;
  visitorHash?: string | null;
  nowMs: number;
}): Promise<boolean> {
  const visitorKey = args.userId ? `user:${String(args.userId)}` : null;
  const visitorKeyHash = !visitorKey && /^[0-9a-f]{64}$/.test(String(args.visitorHash ?? "")) ? String(args.visitorHash) : null;
  if (!visitorKey && !visitorKeyHash) return false;
  const latest = visitorKey
    ? await ctx.db.query("communityAnalyticsEvents")
      .withIndex("by_community_visitor_event", (q: any) => q.eq("communityId", args.communityId).eq("visitorKey", visitorKey).eq("eventType", "funnel_join_started"))
      .order("desc").first()
    : await ctx.db.query("communityAnalyticsEvents")
      .withIndex("by_community_visitor_hash_event", (q: any) => q.eq("communityId", args.communityId).eq("visitorKeyHash", visitorKeyHash).eq("eventType", "funnel_join_started"))
      .order("desc").first();
  if (latest && latest.createdAt >= args.nowMs - JOIN_STARTED_DEDUPE_WINDOW_MS) return false;
  await ctx.db.insert("communityAnalyticsEvents", {
    communityId: args.communityId,
    eventType: "funnel_join_started",
    ...(visitorKey ? { visitorKey, userId: args.userId } : { visitorKeyHash }),
    createdAt: args.nowMs,
  });
  return true;
}
