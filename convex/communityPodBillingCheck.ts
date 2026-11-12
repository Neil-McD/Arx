// Paid pods (docs/specs/pods-v0.md): the code that may end someone's access
// (leaving, removal or ban, a lapse or payment hold, a host taking someone off
// a pod, archiving) calls this. When anyone in scope is paying for a pod, the
// pod billing check runs now (communityPodPayments.sweepUnreachablePodPaymentsInternal);
// otherwise nothing is scheduled. Its own module so the room code can use it
// without importing the pod payments module.
import { internal } from "./_generated/api";

const PAYING = new Set(["active", "past_due", "cancel_at_period_end"]);

export async function schedulePodBillingCheck(ctx: any, scope: { communityId?: any; userId?: any; channelId?: any }) {
  let rows: any[] = [];
  if (scope.channelId && scope.userId) {
    rows = await ctx.db.query("communityPodPayments").withIndex("by_channel_user", (q: any) => q.eq("channelId", scope.channelId).eq("userId", scope.userId)).take(20);
  } else if (scope.userId) {
    rows = (await ctx.db.query("communityPodPayments").withIndex("by_user", (q: any) => q.eq("userId", scope.userId)).take(200))
      .filter((row: any) => !scope.communityId || String(row.communityId) === String(scope.communityId));
  } else if (scope.communityId) {
    rows = await ctx.db.query("communityPodPayments").withIndex("by_community", (q: any) => q.eq("communityId", scope.communityId)).take(500);
  }
  if (!rows.some((row) => PAYING.has(row.status))) return;
  await ctx.scheduler.runAfter(0, internal.communityPodPayments.sweepUnreachablePodPaymentsInternal, scope);
}
