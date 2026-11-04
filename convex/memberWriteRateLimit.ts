// A budget of writes per person per minute, for what they do through their own
// AI (the MCP) or their community's site. Reads, presence, typing and read
// positions don't count; the community agent is bounded by AI quota instead.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const MEMBER_WRITES_PER_WINDOW = 60;
export const MEMBER_WRITE_WINDOW_MS = 60_000;

export const takeMemberWriteInternal = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const counter = await ctx.db.query("memberWriteRateCounters")
      .withIndex("by_user", (q) => q.eq("userId", args.userId)).first();
    if (!counter || nowMs - counter.windowStartMs >= MEMBER_WRITE_WINDOW_MS) {
      if (counter) await ctx.db.patch(counter._id, { windowStartMs: nowMs, count: 1, updatedAt: nowMs });
      else await ctx.db.insert("memberWriteRateCounters", { userId: args.userId, windowStartMs: nowMs, count: 1, updatedAt: nowMs });
      return { ok: true as const };
    }
    if (counter.count >= MEMBER_WRITES_PER_WINDOW) {
      return { ok: false as const, retryAfterMs: counter.windowStartMs + MEMBER_WRITE_WINDOW_MS - nowMs };
    }
    await ctx.db.patch(counter._id, { count: counter.count + 1, updatedAt: nowMs });
    return { ok: true as const };
  },
});
