// Leaf helper (zero circular imports) to instantly wake a community's heartbeat
// out of "paused" ($0 AI) as soon as real member activity occurs (post, reply,
// lesson completion, or private Guide message). Already-active communities pay
// a single indexed read and zero writes.
import type { Id } from "./_generated/dataModel";

export async function wakePausedCommunityHeartbeatIfNeeded(
  ctx: any,
  communityId: Id<"communities">,
  nowMs: number,
): Promise<boolean> {
  const row = await ctx.db
    .query("communityMemberCoachSettings")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .first();
  if (!row || !row.enabled || row.communityHeartbeatTier !== "paused") {
    return false;
  }
  await ctx.db.patch(row._id, {
    communityHeartbeatTier: "active",
    lastCommunityActivityAt: nowMs,
    nextScanAt: nowMs,
    updatedAt: nowMs,
  });
  return true;
}
