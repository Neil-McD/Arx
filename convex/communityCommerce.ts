import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  buildCheckoutSuccessUrl,
  type CommunityLike,
  type CommunityMembershipLike,
  type CommunityPricePointLike,
  type PurchaseClaimLike,
  newOpaqueToken,
  normalizeBillingPeriod,
  normalizeClaimToken,
  normalizeSessionId,
  normalizeSlug,
  redeemClaimRow,
  resolveCheckoutPricePoint,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./billingCore";
import {
  communitySubscriptionStatusGrantsAccess,
  normalizeCommunitySubscriptionStatus,
  parseIsoMs,
  resolveCommunityEntryPolicy,
} from "./communityCore";

export const syncCommunitySubscriptionLifecycleInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    status: v.string(),
    pricePointId: v.optional(v.id("communityPricePoints")),
    providerPriceId: v.optional(v.union(v.string(), v.null())),
    providerSubscriptionId: v.optional(v.union(v.string(), v.null())),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    currentPeriodStartIso: v.optional(v.union(v.string(), v.null())),
    currentPeriodEndIso: v.optional(v.union(v.string(), v.null())),
    cancelAtPeriodEnd: v.optional(v.union(v.boolean(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const status = normalizeCommunitySubscriptionStatus(args.status);
    if (!status) throw new Error("community_subscription_status_invalid");
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    const membership = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
      .first()) as CommunityMembershipLike | null;
    if (!membership) throw new Error("community_membership_not_found");
    if (String(membership.accessSource ?? "").trim().toLowerCase() !== "paid_subscription") {
      throw new Error("community_membership_not_subscription");
    }

    const currentRows = (await ctx.db
      .query("communitySubscriptions" as any)
      .withIndex("by_membership", (q: any) => q.eq("membershipId", membership._id))
      .collect()) as Array<Record<string, any>>;
    const current =
      currentRows
        .slice()
        .sort((a, b) => {
          const aMatch =
            String(a.providerSubscriptionId ?? "").trim() &&
            String(a.providerSubscriptionId ?? "").trim() === String(args.providerSubscriptionId ?? "").trim();
          const bMatch =
            String(b.providerSubscriptionId ?? "").trim() &&
            String(b.providerSubscriptionId ?? "").trim() === String(args.providerSubscriptionId ?? "").trim();
          if (aMatch !== bMatch) return aMatch ? -1 : 1;
          return Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0);
        })[0] ?? null;

    let pricePointId = args.pricePointId ?? current?.pricePointId ?? membership.pricePointId ?? undefined;
    const providerPriceId = String(args.providerPriceId ?? "").trim();
    if (!pricePointId && providerPriceId) {
      const pricePoints = (await ctx.db
        .query("communityPricePoints" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect()) as CommunityPricePointLike[];
      const matched =
        pricePoints.find((row) => String(row.providerPriceId ?? "").trim() === providerPriceId) ?? null;
      pricePointId = matched?._id;
    }
    if (!pricePointId) throw new Error("community_subscription_price_point_required");

    const currentPeriodStartAt = parseIsoMs(args.currentPeriodStartIso);
    const currentPeriodEndAt = parseIsoMs(args.currentPeriodEndIso);
    const cancelAtPeriodEnd =
      args.cancelAtPeriodEnd === null
        ? false
        : Boolean(args.cancelAtPeriodEnd ?? current?.cancelAtPeriodEnd);
    const endedAt =
      status === "canceled" || status === "ended"
        ? nowMs
        : undefined;

    const patch = {
      pricePointId,
      status,
      providerSubscriptionId: String(args.providerSubscriptionId ?? "").trim() || undefined,
      providerCustomerId: String(args.providerCustomerId ?? "").trim() || undefined,
      currentPeriodStartAt: typeof currentPeriodStartAt === "number" ? currentPeriodStartAt : undefined,
      currentPeriodEndAt: typeof currentPeriodEndAt === "number" ? currentPeriodEndAt : undefined,
      cancelAtPeriodEnd,
      endedAt,
      updatedAt: nowMs,
    };

    if (current) {
      await ctx.db.patch(current._id, patch);
    } else {
      await ctx.db.insert("communitySubscriptions" as any, {
        communityId: args.communityId,
        userId: args.userId,
        membershipId: membership._id,
        createdAt: nowMs,
        ...patch,
      });
    }

    const grantsAccess = communitySubscriptionStatusGrantsAccess(status);
    await ctx.db.patch(membership._id, {
      pricePointId,
      active: grantsAccess,
      revokedAt: grantsAccess ? undefined : nowMs,
      revokedReason: grantsAccess ? undefined : `subscription_${status}`,
      updatedAt: nowMs,
    });

    return {
      ok: true,
      community_id: String(args.communityId),
      user_id: String(args.userId),
      price_point_id: String(pricePointId),
      subscription_status: status,
    };
  },
});

export const startPublicCommunityCheckout = mutation({
  args: {
    communitySlug: v.string(),
    billingPeriod: v.string(),
    successUrl: v.string(),
    cancelUrl: v.string(),
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    brandosAid: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const slug = normalizeSlug(args.communitySlug);
    const billingPeriod = normalizeBillingPeriod(args.billingPeriod);
    const cancelUrl = String(args.cancelUrl ?? "").trim();
    if (!cancelUrl) throw new Error("checkout_cancel_url_required");
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    const entryPolicy = resolveCommunityEntryPolicy(community as any);
    if (entryPolicy !== "paid_subscription") {
      throw new Error("paid_plan_required");
    }
    const pricePoint = await resolveCheckoutPricePoint({
      ctx,
      community,
      billingPeriod,
      nowMs,
    });
    if (!pricePoint) throw new Error("paid_plan_required");

    void args.brandosAid;
    const sessionId = newOpaqueToken("chk");
    const claimToken = newOpaqueToken("claim");
    const expiresAt = nowMs + 14 * 24 * 60 * 60 * 1000;
    const ownerUserId = args.authSubject
      ? await resolveUserIdForAuthenticatedRequest({
          ctx,
          userId: args.userId,
          authSubject: args.authSubject,
        })
      : undefined;
    if (!args.authSubject && args.userId) {
      throw new Error("auth_subject_required");
    }
    await ctx.db.insert("checkoutSessions", {
      sessionId,
      mode: "community_join",
      communityId: community._id,
      billingPeriod,
      pricePointId: pricePoint._id,
      amountBaseUnits: pricePoint.amountBaseUnits,
      currency: pricePoint.currency,
      currencyDecimals: pricePoint.currencyDecimals,
      ownerUserId: ownerUserId ?? undefined,
      claimToken,
      status: "complete",
      expiresAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("purchaseClaims", {
      claimToken,
      communityId: community._id,
      billingPeriod,
      pricePointId: pricePoint._id,
      amountBaseUnits: pricePoint.amountBaseUnits,
      currency: pricePoint.currency,
      currencyDecimals: pricePoint.currencyDecimals,
      ownerUserId: ownerUserId ?? undefined,
      status: "pending",
      sourceSessionId: sessionId,
      expiresAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    return {
      ok: true,
      session_id: sessionId,
      checkout_url: buildCheckoutSuccessUrl(args.successUrl, sessionId),
    };
  },
});

export const finalizeCheckoutSession = query({
  args: {
    sessionId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const sessionId = normalizeSessionId(args.sessionId);
    const session = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q: any) => q.eq("sessionId", sessionId))
      .first();
    if (!session) {
      return {
        ok: true,
        status: "pending",
      };
    }
    if (session.expiresAt <= nowMs || session.status === "expired") {
      return {
        ok: false,
        status: "expired",
        message: "checkout_session_expired",
      };
    }
    if (session.status !== "complete" || !session.claimToken) {
      return {
        ok: true,
        status: "pending",
      };
    }
    return {
      ok: true,
      status: "succeeded",
      claim: {
        token: session.claimToken,
      },
    };
  },
});

export const redeemPurchaseClaim = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    token: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const token = normalizeClaimToken(args.token);
    const claim = (await ctx.db
      .query("purchaseClaims")
      .withIndex("by_claimToken", (q: any) => q.eq("claimToken", token))
      .first()) as PurchaseClaimLike | null;
    if (!claim) throw new Error("claim_not_found");
    if (claim.expiresAt <= nowMs || claim.status === "expired") {
      await ctx.db.patch(claim._id, {
        status: "expired",
        updatedAt: nowMs,
      });
      throw new Error("claim_expired");
    }
    if (claim.status === "redeemed" && claim.redeemedByUserId !== userId) {
      throw new Error("claim_already_redeemed");
    }

    const communityId = await redeemClaimRow({
      ctx,
      claim,
      userId,
      nowMs,
    });
    if (!communityId) throw new Error("claim_not_redeemable");
    const community = (await ctx.db.get(communityId as any)) as CommunityLike | null;
    return [{ community_id: communityId, community_slug: String(community?.slug ?? "") || null }];
  },
});

export const listPendingPurchaseClaims = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const rows = (await ctx.db
      .query("purchaseClaims")
      .withIndex("by_owner_status", (q: any) => q.eq("ownerUserId", userId).eq("status", "pending"))
      .collect()) as PurchaseClaimLike[];
    const out: Array<{
      community_id: string;
      community_slug: string;
      community_name: string;
      expires_at: string;
    }> = [];
    for (const claim of rows) {
      if (claim.expiresAt <= nowMs) continue;
      const community = (await ctx.db.get(claim.communityId)) as CommunityLike | null;
      const communityId = String(claim.communityId);
      out.push({
        community_id: communityId,
        community_slug: String(community?.slug ?? communityId),
        community_name: String(community?.name ?? community?.slug ?? communityId),
        expires_at: toIsoString(claim.expiresAt),
      });
    }
    out.sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));
    return out;
  },
});

export const redeemPendingPurchaseClaims = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const rows = (await ctx.db
      .query("purchaseClaims")
      .withIndex("by_owner_status", (q: any) => q.eq("ownerUserId", userId).eq("status", "pending"))
      .collect()) as PurchaseClaimLike[];
    const out: Array<{ community_id: string; community_slug: string | null }> = [];
    const seen = new Set<string>();
    for (const claim of rows) {
      const communityId = await redeemClaimRow({
        ctx,
        claim,
        userId,
        nowMs,
      });
      if (!communityId) continue;
      if (seen.has(communityId)) continue;
      seen.add(communityId);
      const community = (await ctx.db.get(communityId as any)) as CommunityLike | null;
      out.push({
        community_id: communityId,
        community_slug: String(community?.slug ?? "") || null,
      });
    }
    return out;
  },
});
