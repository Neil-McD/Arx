import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const CLAIM_LEASE_MS = 5 * 60_000;
const FEE_LOCK_LEASE_MS = 2 * 60_000;

function normalizedString(value: unknown): string {
  return String(value ?? "").trim();
}

export const claimCommunityApplicationFeeRefundInternal = internalMutation({
  args: {
    providerAccountId: v.string(),
    providerChargeId: v.string(),
    providerApplicationFeeId: v.string(),
    providerRefundId: v.string(),
    amountBaseUnits: v.number(),
    requestedProviderRefundAmountBaseUnits: v.number(),
    currency: v.string(),
    claimToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const providerAccountId = normalizedString(args.providerAccountId);
    const providerChargeId = normalizedString(args.providerChargeId);
    const providerApplicationFeeId = normalizedString(args.providerApplicationFeeId);
    const providerRefundId = normalizedString(args.providerRefundId);
    const currency = normalizedString(args.currency).toLowerCase();
    const claimToken = normalizedString(args.claimToken);
    const amountBaseUnits = Math.max(0, Math.floor(args.amountBaseUnits));
    const requestedProviderRefundAmountBaseUnits = Math.max(
      0,
      Math.floor(args.requestedProviderRefundAmountBaseUnits),
    );
    if (requestedProviderRefundAmountBaseUnits > amountBaseUnits) {
      throw new Error("community_application_fee_refund_amount_invalid");
    }
    if (
      !providerAccountId ||
      !providerChargeId ||
      !providerApplicationFeeId ||
      !providerRefundId ||
      !currency ||
      !claimToken
    ) {
      throw new Error("community_application_fee_refund_identity_required");
    }
    const existing = await ctx.db
      .query("communityApplicationFeeRefunds")
      .withIndex("by_providerAccount_refund", (q) =>
        q.eq("providerAccountId", providerAccountId).eq("providerRefundId", providerRefundId),
      )
      .unique();
    if (existing) {
      if (
        existing.providerChargeId !== providerChargeId ||
        existing.providerApplicationFeeId !== providerApplicationFeeId ||
        existing.amountBaseUnits !== amountBaseUnits ||
        existing.requestedProviderRefundAmountBaseUnits !== requestedProviderRefundAmountBaseUnits ||
        existing.currency !== currency
      ) {
        throw new Error("community_application_fee_refund_identity_conflict");
      }
      if (existing.status === "succeeded") {
        return { ok: true, duplicate: true, completed: true, rowId: existing._id };
      }
      if (existing.status === "processing" && existing.leaseExpiresAt > args.nowMs) {
        return { ok: false, errorCode: "community_application_fee_refund_in_progress" };
      }
      await ctx.db.patch(existing._id, {
        status: "processing",
        claimToken,
        leaseExpiresAt: args.nowMs + CLAIM_LEASE_MS,
        failureCode: undefined,
        failedAt: undefined,
        updatedAt: args.nowMs,
      });
      return { ok: true, duplicate: true, completed: false, rowId: existing._id };
    }
    const rowId = await ctx.db.insert("communityApplicationFeeRefunds", {
      providerAccountId,
      providerChargeId,
      providerApplicationFeeId,
      providerRefundId,
      amountBaseUnits,
      requestedProviderRefundAmountBaseUnits,
      currency,
      status: "processing",
      claimToken,
      leaseExpiresAt: args.nowMs + CLAIM_LEASE_MS,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { ok: true, duplicate: false, completed: false, rowId };
  },
});

export const completeCommunityApplicationFeeRefundInternal = internalMutation({
  args: {
    providerAccountId: v.string(),
    providerRefundId: v.string(),
    claimToken: v.string(),
    providerApplicationFeeRefundId: v.optional(v.string()),
    providerRefundedAmountBaseUnits: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("communityApplicationFeeRefunds")
      .withIndex("by_providerAccount_refund", (q) =>
        q.eq("providerAccountId", args.providerAccountId).eq("providerRefundId", args.providerRefundId),
      )
      .unique();
    if (!row) throw new Error("community_application_fee_refund_missing");
    if (row.status === "succeeded") return { ok: true, duplicate: true };
    if (row.status !== "processing" || row.claimToken !== args.claimToken) {
      throw new Error("community_application_fee_refund_claim_invalid");
    }
    await ctx.db.patch(row._id, {
      status: "succeeded",
      providerApplicationFeeRefundId:
        normalizedString(args.providerApplicationFeeRefundId) || undefined,
      providerRefundedAmountBaseUnits: Math.max(
        0,
        Math.floor(args.providerRefundedAmountBaseUnits),
      ),
      failureCode: undefined,
      completedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { ok: true, duplicate: false };
  },
});

export const listCommunityApplicationFeeRefundsInternal = internalQuery({
  args: {
    providerApplicationFeeId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.db
      .query("communityApplicationFeeRefunds")
      .withIndex("by_providerApplicationFee", (q) =>
        q.eq("providerApplicationFeeId", args.providerApplicationFeeId),
      )
      .collect(),
});

export const claimCommunityApplicationFeeRefundLockInternal = internalMutation({
  args: {
    providerAccountId: v.string(),
    providerApplicationFeeId: v.string(),
    claimToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("communityApplicationFeeRefundLocks")
      .withIndex("by_providerApplicationFee", (q) =>
        q.eq("providerApplicationFeeId", args.providerApplicationFeeId),
      )
      .unique();
    if (existing && existing.leaseExpiresAt > args.nowMs) {
      return { ok: false, errorCode: "community_application_fee_refund_lock_busy" };
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        providerAccountId: args.providerAccountId,
        claimToken: args.claimToken,
        leaseExpiresAt: args.nowMs + FEE_LOCK_LEASE_MS,
        updatedAt: args.nowMs,
      });
      return { ok: true, reclaimed: true };
    }
    await ctx.db.insert("communityApplicationFeeRefundLocks", {
      providerAccountId: args.providerAccountId,
      providerApplicationFeeId: args.providerApplicationFeeId,
      claimToken: args.claimToken,
      leaseExpiresAt: args.nowMs + FEE_LOCK_LEASE_MS,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { ok: true, reclaimed: false };
  },
});

export const releaseCommunityApplicationFeeRefundLockInternal = internalMutation({
  args: {
    providerApplicationFeeId: v.string(),
    claimToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("communityApplicationFeeRefundLocks")
      .withIndex("by_providerApplicationFee", (q) =>
        q.eq("providerApplicationFeeId", args.providerApplicationFeeId),
      )
      .unique();
    if (!existing || existing.claimToken !== args.claimToken) {
      return { ok: false, errorCode: "community_application_fee_refund_lock_claim_invalid" };
    }
    await ctx.db.patch(existing._id, {
      leaseExpiresAt: 0,
      updatedAt: args.nowMs,
    });
    return { ok: true };
  },
});

export const failCommunityApplicationFeeRefundInternal = internalMutation({
  args: {
    providerAccountId: v.string(),
    providerRefundId: v.string(),
    claimToken: v.string(),
    failureCode: v.string(),
    disposition: v.union(v.literal("failed"), v.literal("indeterminate")),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("communityApplicationFeeRefunds")
      .withIndex("by_providerAccount_refund", (q) =>
        q.eq("providerAccountId", args.providerAccountId).eq("providerRefundId", args.providerRefundId),
      )
      .unique();
    if (!row) throw new Error("community_application_fee_refund_missing");
    if (row.status === "succeeded") return { ok: true, duplicate: true };
    if (row.status !== "processing" || row.claimToken !== args.claimToken) {
      throw new Error("community_application_fee_refund_claim_invalid");
    }
    await ctx.db.patch(row._id, {
      status: args.disposition,
      failureCode: normalizedString(args.failureCode).slice(0, 120) || "stripe_application_fee_refund_failed",
      failedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { ok: true, duplicate: false };
  },
});
