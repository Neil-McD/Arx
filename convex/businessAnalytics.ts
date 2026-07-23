import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { hashBusinessVisitorKey } from "./businessAnalyticsCore";
import { findAuthenticatedActorState } from "./authActor";

const BUSINESS_VISIT_BUCKET_MS = 24 * 60 * 60 * 1000;
const BUSINESS_VISITOR_IDENTIFY_LOOKBACK_MS = 180 * BUSINESS_VISIT_BUCKET_MS;

type BusinessVisitSource = "direct" | "search" | "social" | "referral" | "unknown";

function normalizeSource(value: unknown): BusinessVisitSource {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    normalized === "direct" ||
    normalized === "search" ||
    normalized === "social" ||
    normalized === "referral" ||
    normalized === "unknown"
  ) {
    return normalized;
  }
  return "unknown";
}

export const recordBusinessPageVisit = mutation({
  args: {
    pathKind: v.union(v.literal("home"), v.literal("community_funnel")),
    communitySlug: v.optional(v.string()),
    visitorKey: v.optional(v.string()),
    source: v.optional(v.union(
      v.literal("direct"),
      v.literal("search"),
      v.literal("social"),
      v.literal("referral"),
      v.literal("unknown"),
    )),
  },
  handler: async (ctx, args) => {
    const rawVisitorKey = String(args.visitorKey ?? "").trim();
    if (!rawVisitorKey) {
      return { ok: false, reason: "missing_visitor_key" };
    }

    const nowMs = Date.now();
    const visitorKeyHash = await hashBusinessVisitorKey(rawVisitorKey);
    const visitBucketStartAt = Math.floor(nowMs / BUSINESS_VISIT_BUCKET_MS) * BUSINESS_VISIT_BUCKET_MS;
    let communityId: any = undefined;
    let scopeKey = "home";

    if (args.pathKind === "community_funnel") {
      const slug = String(args.communitySlug ?? "").trim().toLowerCase();
      if (!slug) {
        return { ok: false, reason: "missing_community_slug" };
      }
      const community = await ctx.db
        .query("communities")
        .withIndex("by_slug", (q: any) => q.eq("slug", slug))
        .first();
      if (!community) {
        return { ok: false, reason: "community_not_found" };
      }
      communityId = community._id;
      scopeKey = `community:${String(community._id)}`;
    }

    const existing = await ctx.db
      .query("platformBusinessVisits" as any)
      .withIndex("by_visitor_scope_bucket", (q: any) =>
        q
          .eq("visitorKeyHash", visitorKeyHash)
          .eq("pathKind", args.pathKind)
          .eq("scopeKey", scopeKey)
          .eq("visitBucketStartAt", visitBucketStartAt),
      )
      .first();

    if (existing) {
      return { ok: true, deduped: true };
    }

    await ctx.db.insert("platformBusinessVisits" as any, {
      pathKind: args.pathKind,
      scopeKey,
      communityId,
      visitorKeyHash,
      source: normalizeSource(args.source),
      visitBucketStartAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true };
  },
});

export const identifyBusinessVisitor = mutation({
  args: {
    visitorKey: v.optional(v.string()),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rawVisitorKey = String(args.visitorKey ?? "").trim();
    if (!rawVisitorKey) {
      return { ok: false, reason: "missing_visitor_key" };
    }

    const { actor } = await findAuthenticatedActorState({
      ctx,
      authSubject: args.authSubject,
    });
    if (!actor) {
      return { ok: false, reason: "user_not_found" };
    }
    const userId = actor.dbUserId;

    const nowMs = Date.now();
    const visitorKeyHash = await hashBusinessVisitorKey(rawVisitorKey);
    const recentAfterMs = nowMs - BUSINESS_VISITOR_IDENTIFY_LOOKBACK_MS;
    const recentRows = (await ctx.db
      .query("platformBusinessVisits" as any)
      .withIndex("by_visitor_hash_createdAt", (q: any) =>
        q.eq("visitorKeyHash", visitorKeyHash).gte("createdAt", recentAfterMs),
      )
      .collect()) as Array<{ _id: any; userId?: any }>;

    let patched = 0;
    for (const row of recentRows) {
      if (row.userId) continue;
      await ctx.db.patch(row._id, { userId, updatedAt: nowMs });
      patched += 1;
    }

    return { ok: true, patched };
  },
});
