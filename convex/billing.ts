import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";

type CommunityLike = {
  _id: any;
  slug: string;
  name: string;
  joinMode: "join_free" | "request_access" | "checkout";
};

type CommunityPlanLike = {
  _id: any;
  communityId: any;
  billingPeriod: string;
  active: boolean;
};

type PurchaseClaimLike = {
  _id: any;
  claimToken: string;
  communityId: any;
  ownerUserId?: any;
  status: "pending" | "redeemed" | "expired";
  sourceSessionId?: string;
  redeemedByUserId?: any;
  redeemedAt?: number;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
};

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

async function resolveUserIdForAuthenticatedRequest(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
}): Promise<any> {
  const userIdInput = normalizeIdValue(args.userId);
  const authSubject = await resolveAuthenticatedSubject({
    ctx: args.ctx,
    authSubject: args.authSubject ?? null,
  });
  const user = await args.ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject))
    .first();
  if (!user) throw new Error("user_not_found");
  const resolvedUserId = normalizeIdValue(user._id);
  if (userIdInput && userIdInput !== resolvedUserId) {
    throw new Error("user_id_mismatch");
  }
  return user._id;
}

function normalizeBillingPeriod(raw: unknown): "monthly" | "yearly" {
  const period = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (period === "yearly" || period === "annual") return "yearly";
  return "monthly";
}

function normalizeBuilderTier(raw: unknown): "builder" | "architect" {
  const tier = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (tier === "architect" || tier === "pro") return "architect";
  if (tier === "builder") return "builder";
  throw new Error("builder_tier_invalid");
}

function normalizeSlug(raw: unknown): string {
  const slug = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!slug) throw new Error("community_slug_required");
  if (!/^[a-z0-9-]{3,64}$/.test(slug)) throw new Error("community_slug_invalid");
  return slug;
}

function normalizeSessionId(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("checkout_session_id_required");
  return value.slice(0, 200);
}

function normalizeClaimToken(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("claim_token_required");
  return value.slice(0, 300);
}

function toIsoString(value: number): string {
  return new Date(Math.floor(value)).toISOString();
}

function newOpaqueToken(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildCheckoutSuccessUrl(successUrlRaw: unknown, sessionId: string): string {
  const successUrl = String(successUrlRaw ?? "").trim();
  if (!successUrl) throw new Error("checkout_success_url_required");
  if (successUrl.includes("{CHECKOUT_SESSION_ID}")) {
    return successUrl.replaceAll("{CHECKOUT_SESSION_ID}", sessionId);
  }
  try {
    const parsed = new URL(successUrl);
    parsed.searchParams.set("session_id", sessionId);
    return parsed.toString();
  } catch {
    const separator = successUrl.includes("?") ? "&" : "?";
    return `${successUrl}${separator}session_id=${encodeURIComponent(sessionId)}`;
  }
}

async function ensureCommunityMembership(args: {
  ctx: any;
  communityId: any;
  userId: any;
  nowMs: number;
}): Promise<void> {
  const existing = await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
    .first();
  if (existing) return;
  await args.ctx.db.insert("communityMemberships", {
    communityId: args.communityId,
    userId: args.userId,
    role: "member",
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

async function redeemClaimRow(args: {
  ctx: any;
  claim: PurchaseClaimLike;
  userId: any;
  nowMs: number;
}): Promise<string | null> {
  if (args.claim.status !== "pending") {
    if (args.claim.status === "redeemed" && args.claim.redeemedByUserId === args.userId) {
      return String(args.claim.communityId);
    }
    return null;
  }
  if (args.claim.expiresAt <= args.nowMs) {
    await args.ctx.db.patch(args.claim._id, {
      status: "expired",
      updatedAt: args.nowMs,
    });
    return null;
  }
  await ensureCommunityMembership({
    ctx: args.ctx,
    communityId: args.claim.communityId,
    userId: args.userId,
    nowMs: args.nowMs,
  });
  await args.ctx.db.patch(args.claim._id, {
    status: "redeemed",
    redeemedByUserId: args.userId,
    redeemedAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return String(args.claim.communityId);
}

export const startBuilderCheckout = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    tier: v.string(),
    successUrl: v.string(),
    cancelUrl: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const targetTier = normalizeBuilderTier(args.tier);
    const successUrl = String(args.successUrl ?? "").trim();
    const cancelUrl = String(args.cancelUrl ?? "").trim();
    if (!successUrl) throw new Error("checkout_success_url_required");
    if (!cancelUrl) throw new Error("checkout_cancel_url_required");

    await ctx.db.insert("userEntitlements", {
      userId,
      tier: targetTier,
      source: "manual_grant",
      startsAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const sessionId = newOpaqueToken("builder");
    await ctx.db.insert("checkoutSessions", {
      sessionId,
      mode: "builder_upgrade",
      targetTier,
      ownerUserId: userId,
      status: "complete",
      expiresAt: nowMs + 14 * 24 * 60 * 60 * 1000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    return {
      checkout_url: successUrl,
    };
  },
});

export const openBuilderBillingPortal = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    returnUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const url = String(args.returnUrl ?? "").trim();
    if (!url) throw new Error("portal_return_url_required");
    return { url };
  },
});

export const startConnectOnboarding = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    returnUrl: v.string(),
    refreshUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    void args.refreshUrl;
    const url = String(args.returnUrl ?? "").trim();
    if (!url) throw new Error("connect_return_url_required");
    return { url };
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
    if (community.joinMode !== "checkout") throw new Error("paid_plan_required");

    const planRows = (await ctx.db
      .query("communityPlans")
      .withIndex("by_community_billingPeriod", (q: any) =>
        q.eq("communityId", community._id).eq("billingPeriod", billingPeriod),
      )
      .collect()) as CommunityPlanLike[];
    const hasActivePlan = planRows.some((plan) => Boolean(plan.active));
    if (!hasActivePlan) throw new Error("paid_plan_required");

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
    return [{ community_id: communityId }];
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
    const out: Array<{ community_id: string }> = [];
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
      out.push({ community_id: communityId });
    }
    return out;
  },
});
