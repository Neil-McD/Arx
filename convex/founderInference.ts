import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  COMMUNITY_OWNER_FUNDED_MODEL_ID,
  COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE,
  COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE,
  type CommunityInferenceFundingAdmission,
} from "../shared/founderInference";
import {
  resolveCommunityInferenceFundingAdmission,
  settleAuthorizedFounderInferenceReceipt,
  type FounderInferenceReceiptRow,
} from "./founderInferenceCore";
import { releaseFounderUsageReservation, reserveFounderUsage } from "./founderPlanCore";
import { requireFounderInferencePricingFromEnv } from "./founderPlanPricing";

const RECEIPT_LEASE_MS = 10 * 60_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const communityInferenceSurfaceValidator = v.union(
  v.literal("member_agent_dock"),
  v.literal("community_agent_mention"),
  v.literal("community_autonomous_cognition"),
  v.literal("community_setup_generation"),
);

function normalizedId(value: unknown): string {
  return String(value ?? "").trim();
}

function boundedCode(value: unknown, fallback: string): string {
  return String(value ?? "").trim().slice(0, 120) || fallback;
}

const FOUNDER_INFERENCE_BYOK_RETIRED = "founder_inference_byok_retired";

// Cached-client compatibility only. These public names preserve the previous
// web bundle's wire contract during the rolling Builder cutover. They expose
// no credential, grant, billing, or community authority.
export const getCurrentFounderInferenceStatus = query({
  args: { authSubject: v.optional(v.string()) },
  handler: async () => ({
    eligible: false,
    cohort_key: null,
    status: null,
    key_connected: false,
    key_last_four: null,
    activated_at: null,
    suspended_at: null,
    communities: [],
  }),
});

export const activateFounderInference = action({
  args: {
    authSubject: v.optional(v.string()),
    acceptedTerms: v.boolean(),
    acceptedTermsVersion: v.string(),
  },
  handler: async () => {
    throw new Error(FOUNDER_INFERENCE_BYOK_RETIRED);
  },
});

export const suspendFounderInference = mutation({
  args: { authSubject: v.optional(v.string()) },
  handler: async () => ({
    ok: true,
    status: "retired" as const,
    reason: FOUNDER_INFERENCE_BYOK_RETIRED,
  }),
});

function fundingAuthorityMatches(args: {
  admission: CommunityInferenceFundingAdmission;
  expectedFundingMode: FounderInferenceReceiptRow["fundingMode"];
  expectedPayerUserId: unknown;
  expectedFounderGrantId?: unknown;
  expectedFounderSubscriptionId?: unknown;
}): boolean {
  const { admission } = args;
  // Kept in the validator for one compatibility release so stale clients fail
  // closed instead of crashing on an unknown argument. Owner credentials can
  // no longer authorize new or resumed community inference.
  if (args.expectedFundingMode === "owner_api_key") return false;
  if (
    admission.ok === false ||
    admission.mode !== args.expectedFundingMode ||
    normalizedId(admission.payerUserId) !== normalizedId(args.expectedPayerUserId)
  ) {
    return false;
  }
  if (admission.mode === "platform_subscription") {
    return normalizedId(admission.subscriptionId) ===
      normalizedId(args.expectedFounderSubscriptionId);
  }
  return !args.expectedFounderGrantId && !args.expectedFounderSubscriptionId;
}

export const resolveCommunityInferenceFundingAdmissionInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) =>
    await resolveCommunityInferenceFundingAdmission(ctx, args.communityId),
});

export const claimCommunityInferenceReceiptInternal = internalMutation({
  args: {
    receiptKey: v.string(),
    sourceRunId: v.string(),
    communityId: v.id("communities"),
    actorUserId: v.id("users"),
    expectedPayerUserId: v.id("users"),
    expectedFundingMode: v.union(
      v.literal("owner_api_key"),
      v.literal("platform_subscription"),
      v.literal("platform_operator_grant"),
    ),
    expectedFounderGrantId: v.optional(v.id("founderInferenceGrants")),
    expectedFounderSubscriptionId: v.optional(v.id("founderSubscriptions")),
    surface: communityInferenceSurfaceValidator,
    claimToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const receiptKey = String(args.receiptKey ?? "").trim();
    const claimToken = String(args.claimToken ?? "").trim();
    if (!receiptKey || !claimToken) throw new Error("founder_inference_receipt_claim_required");

    const admission = await resolveCommunityInferenceFundingAdmission(
      ctx,
      args.communityId,
      args.nowMs,
    );
    const authorityMatches = fundingAuthorityMatches({
      admission,
      expectedFundingMode: args.expectedFundingMode,
      expectedPayerUserId: args.expectedPayerUserId,
      expectedFounderGrantId: args.expectedFounderGrantId,
      expectedFounderSubscriptionId: args.expectedFounderSubscriptionId,
    });
    if (!authorityMatches) {
      return { ok: false, errorCode: admission.ok === false ? admission.code : "funding_authority_changed" };
    }

    const existing = (await ctx.db
      .query("communityInferenceReceipts" as any)
      .withIndex("by_receipt_key", (q: any) => q.eq("receiptKey", receiptKey))
      .first()) as FounderInferenceReceiptRow | null;
    if (existing) {
      if (existing.status === "settled") {
        return { ok: false, errorCode: "inference_receipt_already_settled" };
      }
      if (existing.status === "failed" || existing.status === "indeterminate") {
        return { ok: false, errorCode: `inference_receipt_${existing.status}` };
      }
      if (existing.providerStartedAt) {
        await ctx.db.patch(existing._id as any, {
          status: "indeterminate",
          failureCode: "ambiguous_provider_retry_blocked",
          failedAt: args.nowMs,
          updatedAt: args.nowMs,
        });
        return { ok: false, errorCode: "inference_receipt_indeterminate" };
      }
      if (existing.leaseExpiresAt > args.nowMs) {
        return { ok: false, errorCode: "inference_receipt_in_progress" };
      }
      await ctx.db.patch(existing._id as any, {
        claimToken,
        leaseExpiresAt: args.nowMs + RECEIPT_LEASE_MS,
        updatedAt: args.nowMs,
      });
      return { ok: true, receiptId: existing._id, reclaimed: true };
    }

    const sinceMs = args.nowMs - RATE_LIMIT_WINDOW_MS;
    const [actorRows, communityRows] = await Promise.all([
      ctx.db
        .query("communityInferenceReceipts" as any)
        .withIndex("by_actor_community_createdAt", (q: any) =>
          q
            .eq("actorUserId", args.actorUserId)
            .eq("communityId", args.communityId)
            .gte("createdAt", sinceMs),
        )
        .take(20),
      ctx.db
        .query("communityInferenceReceipts" as any)
        .withIndex("by_community_createdAt", (q: any) =>
          q.eq("communityId", args.communityId).gte("createdAt", sinceMs),
        )
        .take(100),
    ]);
    const actorSpendAttempts = actorRows.length;
    const communitySpendAttempts = communityRows.length;
    if (actorSpendAttempts >= COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE) {
      return { ok: false, errorCode: "founder_inference_actor_rate_limited" };
    }
    if (communitySpendAttempts >= COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE) {
      return { ok: false, errorCode: "founder_inference_community_rate_limited" };
    }

    let usageCycleId: any | undefined;
    let reservedCostMicros: number | undefined;
    let pricingVersion: string | undefined;
    if (args.expectedFundingMode === "platform_subscription") {
      if (!args.expectedFounderSubscriptionId) {
        return { ok: false, errorCode: "funding_authority_changed" };
      }
      const reservation = await reserveFounderUsage({
        ctx,
        founderSubscriptionId: args.expectedFounderSubscriptionId,
        communityId: args.communityId,
        nowMs: args.nowMs,
      });
      if (!reservation.ok) return { ok: false, errorCode: reservation.code };
      usageCycleId = reservation.cycle._id;
      reservedCostMicros = reservation.reservationCostMicros;
      pricingVersion = reservation.cycle.pricingVersion;
    } else if (args.expectedFundingMode === "platform_operator_grant") {
      pricingVersion = requireFounderInferencePricingFromEnv().pricingVersion;
    }

    const receiptId = await ctx.db.insert("communityInferenceReceipts" as any, {
      receiptKey,
      sourceRunId: String(args.sourceRunId ?? "").trim(),
      communityId: args.communityId,
      actorUserId: args.actorUserId,
      payerUserId: args.expectedPayerUserId,
      fundingMode: args.expectedFundingMode,
      founderGrantId: args.expectedFounderGrantId,
      founderSubscriptionId: args.expectedFounderSubscriptionId,
      usageCycleId,
      surface: args.surface,
      provider: "openai",
      modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
      status: "authorized",
      claimToken,
      leaseExpiresAt: args.nowMs + RECEIPT_LEASE_MS,
      pricingVersion,
      reservedCostMicros,
      authorizedAt: args.nowMs,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { ok: true, receiptId, reclaimed: false };
  },
});

export const settleCommunityInferenceReceiptInternal = internalMutation({
  args: {
    receiptKey: v.string(),
    claimToken: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    usageComplete: v.boolean(),
    outcomeCode: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) =>
    await settleAuthorizedFounderInferenceReceipt({
      ctx,
      receiptKey: args.receiptKey,
      claimToken: args.claimToken,
      promptTokens: args.promptTokens,
      completionTokens: args.completionTokens,
      usageComplete: args.usageComplete,
      outcomeCode: args.outcomeCode,
      nowMs: args.nowMs,
    }),
});

export const markCommunityInferenceProviderStartedInternal = internalMutation({
  args: {
    receiptKey: v.string(),
    claimToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const receipt = (await ctx.db
      .query("communityInferenceReceipts" as any)
      .withIndex("by_receipt_key", (q: any) => q.eq("receiptKey", args.receiptKey))
      .first()) as FounderInferenceReceiptRow | null;
    if (!receipt || receipt.status !== "authorized" || receipt.claimToken !== args.claimToken) {
      return { ok: false, errorCode: "founder_inference_receipt_claim_invalid" };
    }
    const admission = await resolveCommunityInferenceFundingAdmission(
      ctx,
      receipt.communityId,
      args.nowMs,
    );
    const authorityMatches = fundingAuthorityMatches({
      admission,
      expectedFundingMode: receipt.fundingMode,
      expectedPayerUserId: receipt.payerUserId,
      expectedFounderGrantId: receipt.founderGrantId,
      expectedFounderSubscriptionId: receipt.founderSubscriptionId,
    });
    if (!authorityMatches) {
      if (
        receipt.fundingMode === "platform_subscription" &&
        receipt.usageCycleId &&
        Number(receipt.reservedCostMicros ?? 0) > 0
      ) {
        await releaseFounderUsageReservation({
          ctx,
          usageCycleId: receipt.usageCycleId,
          reservedCostMicros: Number(receipt.reservedCostMicros),
          nowMs: args.nowMs,
        });
      }
      await ctx.db.patch(receipt._id as any, {
        status: "failed",
        failureCode: "funding_authority_changed",
        failedAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      return { ok: false, errorCode: "funding_authority_changed" };
    }
    await ctx.db.patch(receipt._id as any, {
      providerStartedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { ok: true };
  },
});

export const finalizeCommunityInferenceFailureInternal = internalMutation({
  args: {
    receiptKey: v.string(),
    claimToken: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    failureCode: v.string(),
    usageComplete: v.optional(v.boolean()),
    disposition: v.union(v.literal("failed"), v.literal("indeterminate")),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const receipt = (await ctx.db
      .query("communityInferenceReceipts" as any)
      .withIndex("by_receipt_key", (q: any) => q.eq("receiptKey", args.receiptKey))
      .first()) as FounderInferenceReceiptRow | null;
    if (!receipt || receipt.status !== "authorized" || receipt.claimToken !== args.claimToken) {
      return { ok: false, errorCode: "founder_inference_receipt_claim_invalid" };
    }
    const promptTokens = Math.max(0, Math.floor(args.promptTokens));
    const completionTokens = Math.max(0, Math.floor(args.completionTokens));
    const failureCode = boundedCode(args.failureCode, "provider_error");
    if (args.usageComplete === false) {
      await ctx.db.patch(receipt._id as any, {
        status: "indeterminate",
        failureCode: "provider_token_usage_missing",
        failedAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      return { ok: true, status: "indeterminate" };
    }
    if (promptTokens > 0 || completionTokens > 0) {
      await settleAuthorizedFounderInferenceReceipt({
        ctx,
        receiptKey: args.receiptKey,
        claimToken: args.claimToken,
        promptTokens,
        completionTokens,
        usageComplete: true,
        outcomeCode: failureCode,
        nowMs: args.nowMs,
      });
      return { ok: true, status: "settled" };
    }
    if (
      receipt.fundingMode === "platform_subscription" &&
      args.disposition === "failed" &&
      receipt.usageCycleId &&
      Number(receipt.reservedCostMicros ?? 0) > 0
    ) {
      await releaseFounderUsageReservation({
        ctx,
        usageCycleId: receipt.usageCycleId,
        reservedCostMicros: Number(receipt.reservedCostMicros),
        nowMs: args.nowMs,
      });
    }
    await ctx.db.patch(receipt._id as any, {
      status: args.disposition,
      failureCode,
      failedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { ok: true, status: args.disposition };
  },
});
