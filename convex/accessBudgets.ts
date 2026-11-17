// Budgets for what a person does through their own AI (the MCP) or a
// community's site: so many a minute and so many a day, per person. The
// app's own screens are not counted, and the guide is bounded by AI quota
// instead. Which call spends which budget is worked out by
// shared/operationCatalog.ts; this file only counts.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { BUDGET_LIMITS, type BudgetLimit, type BudgetName } from "../shared/operationCatalog";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

type Counter = { _id: any; minuteStartMs: number; minuteCount: number; dayStartMs: number; dayCount: number; lastKey?: string };

// A builder's changes get the larger budget where the community has the plan.
async function builderLimit(ctx: any, communitySlug: string): Promise<BudgetLimit> {
  const community = communitySlug
    ? await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", communitySlug)).first()
    : null;
  const paid = community ? (await resolveCommunityInferenceFundingAdmission(ctx, community._id)).ok : false;
  return paid ? BUDGET_LIMITS.builder_change_paid : BUDGET_LIMITS.builder_change_free;
}

// Takes one from each named budget, or none of them: a call that is over any
// one budget spends nothing.
export const takeInternal = internalMutation({
  args: {
    userId: v.id("users"),
    takes: v.array(v.object({ budget: v.string(), scope: v.string() })),
    // What names this exact request (its idempotency key and everything it
    // asks for), when it has a key: the request last counted, sent again,
    // spends nothing and is never refused for having been sent twice.
    key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const planned: Array<{ budget: string; scope: string; row: Counter | null; minuteStartMs: number; minuteCount: number; dayStartMs: number; dayCount: number }> = [];
    for (const take of args.takes.slice(0, 4)) {
      const limit: BudgetLimit | undefined = take.budget === "builder_change"
        ? await builderLimit(ctx, take.scope)
        : (BUDGET_LIMITS as Record<string, BudgetLimit>)[take.budget as BudgetName];
      // A budget nobody declared is refused, not waved through.
      if (!limit) return { ok: false as const, budget: take.budget, window: "minute" as const, retryAfterMs: MINUTE_MS };
      const row = await ctx.db.query("accessBudgetCounters")
        .withIndex("by_user_budget_scope", (q) => q.eq("userId", args.userId).eq("budget", take.budget).eq("scope", take.scope))
        .first() as Counter | null;
      if (args.key && row?.lastKey === args.key) continue;
      const minuteFresh = !row || nowMs - row.minuteStartMs >= MINUTE_MS;
      const dayFresh = !row || nowMs - row.dayStartMs >= DAY_MS;
      const minuteStartMs = minuteFresh ? nowMs : row!.minuteStartMs;
      const minuteCount = minuteFresh ? 0 : row!.minuteCount;
      const dayStartMs = dayFresh ? nowMs : row!.dayStartMs;
      const dayCount = dayFresh ? 0 : row!.dayCount;
      if (limit.perDay !== null && dayCount >= limit.perDay) {
        return { ok: false as const, budget: take.budget, window: "day" as const, retryAfterMs: Math.max(1, dayStartMs + DAY_MS - nowMs) };
      }
      if (minuteCount >= limit.perMinute) {
        return { ok: false as const, budget: take.budget, window: "minute" as const, retryAfterMs: Math.max(1, minuteStartMs + MINUTE_MS - nowMs) };
      }
      planned.push({ budget: take.budget, scope: take.scope, row, minuteStartMs, minuteCount: minuteCount + 1, dayStartMs, dayCount: dayCount + 1 });
    }
    for (const plan of planned) {
      const fields = { minuteStartMs: plan.minuteStartMs, minuteCount: plan.minuteCount, dayStartMs: plan.dayStartMs, dayCount: plan.dayCount,
        ...(args.key ? { lastKey: args.key } : {}), updatedAt: nowMs };
      if (plan.row) await ctx.db.patch(plan.row._id, fields);
      else await ctx.db.insert("accessBudgetCounters", { userId: args.userId, budget: plan.budget, scope: plan.scope, ...fields });
    }
    return { ok: true as const };
  },
});
