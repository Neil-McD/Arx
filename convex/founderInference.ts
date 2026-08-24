import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  COMMUNITY_OWNER_FUNDED_MODEL_ID,
  COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE,
  COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE,
  type CommunityInferenceFundingAdmission,
} from "../shared/founderInference";
import {
  finalizeKnownNoSpendFounderInferenceReceipt,
  founderInferenceReceiptIdentityMatches,
  getUniqueFounderInferenceReceiptByKey,
  requireBoundedFounderInferenceIdentifier,
  resolveCommunityInferenceFundingAdmission,
  settleAuthorizedFounderInferenceReceipt,
  type FounderInferenceReceiptRow,
} from "./founderInferenceCore";
import { reserveFounderUsage } from "./founderPlanCore";
import { requireFounderInferencePricingFromEnv } from "./founderPlanPricing";

const RECEIPT_LEASE_MS = 10 * 60_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const communityInferenceSurfaceValidator = v.union(
  v.literal("member_agent_dock"),
  v.literal("community_funnel_builder"),
  v.literal("community_agent_mention"),
  v.literal("community_autonomous_cognition"),
  v.literal("community_workflow_milestone_evaluation"),
  v.literal("community_setup_generation"),
);

function normalizedId(value: unknown): string {
  return String(value ?? "").trim();
}

function boundedCode(value: unknown, fallback: string): string {
  return String(value ?? "").trim().slice(0, 120) || fallback;
}

async function scheduleFounderInferenceReceiptExpiration(args: {
  ctx: any;
  receiptKey: string;
  claimToken: string;
  delayMs?: number;
}): Promise<void> {
  await args.ctx.scheduler.runAfter(
    Math.max(0, Math.floor(args.delayMs ?? RECEIPT_LEASE_MS)),
    (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
    {
      receiptKey: args.receiptKey,
      expectedClaimToken: args.claimToken,
    },
  );
}

async function finalizeExpiredAuthorizedFounderInferenceReceipt(args: {
  ctx: any;
  receipt: FounderInferenceReceiptRow;
  claimToken: string;
  nowMs: number;
}): Promise<
  | {
      status: "failed";
      errorCode: "authorization_expired_before_provider";
    }
  | {
      status: "indeterminate";
      errorCode: "provider_execution_deadline_exceeded";
    }
> {
  if (
    args.receipt.status !== "authorized" ||
    args.receipt.claimToken !== args.claimToken
  ) {
    throw new Error("founder_inference_receipt_claim_invalid");
  }
  if (args.receipt.providerStartedAt !== undefined) {
    await settleAuthorizedFounderInferenceReceipt({
      ctx: args.ctx,
      receiptKey: args.receipt.receiptKey,
      claimToken: args.claimToken,
      promptTokens: 0,
      completionTokens: 0,
      usageComplete: false,
      outcomeCode: "provider_execution_deadline_exceeded",
      failureCode: "provider_execution_deadline_exceeded",
      nowMs: args.nowMs,
    });
    return {
      status: "indeterminate",
      errorCode: "provider_execution_deadline_exceeded",
    };
  }

  await finalizeKnownNoSpendFounderInferenceReceipt({
    ctx: args.ctx,
    receipt: args.receipt,
    claimToken: args.claimToken,
    failureCode: "authorization_expired_before_provider",
    nowMs: args.nowMs,
  });
  return {
    status: "failed",
    errorCode: "authorization_expired_before_provider",
  };
}

function fundingAuthorityMatches(args: {
  admission: CommunityInferenceFundingAdmission;
  expectedFundingMode: FounderInferenceReceiptRow["fundingMode"];
  expectedPayerUserId: unknown;
  expectedFounderSubscriptionId?: unknown;
}): boolean {
  const { admission } = args;
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
  return !args.expectedFounderSubscriptionId;
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
      v.literal("platform_subscription"),
      v.literal("platform_operator_grant"),
    ),
    expectedFounderSubscriptionId: v.optional(v.id("founderSubscriptions")),
    surface: communityInferenceSurfaceValidator,
    claimToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const receiptKey = requireBoundedFounderInferenceIdentifier(
      args.receiptKey,
      "founder_inference_receipt_key_invalid",
      240,
    );
    const sourceRunId = requireBoundedFounderInferenceIdentifier(
      args.sourceRunId,
      "founder_inference_source_run_invalid",
      240,
    );
    const claimToken = requireBoundedFounderInferenceIdentifier(
      args.claimToken,
      "founder_inference_claim_token_invalid",
      128,
    );

    const admission = await resolveCommunityInferenceFundingAdmission(
      ctx,
      args.communityId,
      args.nowMs,
    );
    const authorityMatches = fundingAuthorityMatches({
      admission,
      expectedFundingMode: args.expectedFundingMode,
      expectedPayerUserId: args.expectedPayerUserId,
      expectedFounderSubscriptionId: args.expectedFounderSubscriptionId,
    });
    if (!authorityMatches) {
      return { ok: false, errorCode: admission.ok === false ? admission.code : "funding_authority_changed" };
    }

    const existing = await getUniqueFounderInferenceReceiptByKey(ctx, receiptKey);
    if (existing) {
      if (!founderInferenceReceiptIdentityMatches(existing, {
        sourceRunId,
        communityId: args.communityId,
        actorUserId: args.actorUserId,
        payerUserId: args.expectedPayerUserId,
        fundingMode: args.expectedFundingMode,
        founderSubscriptionId: args.expectedFounderSubscriptionId,
        surface: args.surface,
      })) {
        return { ok: false, errorCode: "founder_inference_receipt_conflict" };
      }
      if (existing.status === "settled") {
        return { ok: false, errorCode: "inference_receipt_already_settled" };
      }
      if (existing.status === "failed" || existing.status === "indeterminate") {
        return { ok: false, errorCode: `inference_receipt_${existing.status}` };
      }
      if (existing.providerStartedAt !== undefined) {
        await settleAuthorizedFounderInferenceReceipt({
          ctx,
          receiptKey,
          claimToken: existing.claimToken,
          promptTokens: 0,
          completionTokens: 0,
          usageComplete: false,
          outcomeCode: "provider_usage_unknown",
          failureCode: "ambiguous_provider_retry_blocked",
          nowMs: args.nowMs,
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
      await scheduleFounderInferenceReceiptExpiration({
        ctx,
        receiptKey,
        claimToken,
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
      sourceRunId,
      communityId: args.communityId,
      actorUserId: args.actorUserId,
      payerUserId: args.expectedPayerUserId,
      fundingMode: args.expectedFundingMode,
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
    await scheduleFounderInferenceReceiptExpiration({
      ctx,
      receiptKey,
      claimToken,
    });
    return { ok: true, receiptId, reclaimed: false };
  },
});

export const expireCommunityInferenceReceiptInternal = internalMutation({
  args: {
    receiptKey: v.string(),
    expectedClaimToken: v.string(),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const receiptKey = requireBoundedFounderInferenceIdentifier(
      args.receiptKey,
      "founder_inference_receipt_key_invalid",
      240,
    );
    const expectedClaimToken = requireBoundedFounderInferenceIdentifier(
      args.expectedClaimToken,
      "founder_inference_claim_token_invalid",
      128,
    );
    const receipt = await getUniqueFounderInferenceReceiptByKey(ctx, receiptKey);
    if (!receipt) {
      return { ok: true, status: "missing" as const, alreadyFinalized: true };
    }
    if (receipt.status !== "authorized") {
      return { ok: true, status: receipt.status, alreadyFinalized: true };
    }
    if (receipt.claimToken !== expectedClaimToken) {
      return { ok: true, status: "stale_claim" as const, alreadyFinalized: false };
    }
    if (!Number.isFinite(receipt.leaseExpiresAt) || receipt.leaseExpiresAt <= 0) {
      throw new Error("founder_inference_receipt_lease_invalid");
    }
    if (receipt.leaseExpiresAt > nowMs) {
      await scheduleFounderInferenceReceiptExpiration({
        ctx,
        receiptKey,
        claimToken: expectedClaimToken,
        delayMs: receipt.leaseExpiresAt - nowMs,
      });
      return { ok: true, status: "pending" as const, alreadyFinalized: false };
    }
    const finalized = await finalizeExpiredAuthorizedFounderInferenceReceipt({
      ctx,
      receipt,
      claimToken: expectedClaimToken,
      nowMs,
    });
    return { ok: true, status: finalized.status, alreadyFinalized: false };
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
    const receipt = await getUniqueFounderInferenceReceiptByKey(ctx, args.receiptKey);
    if (!receipt || receipt.status !== "authorized" || receipt.claimToken !== args.claimToken) {
      return { ok: false, errorCode: "founder_inference_receipt_claim_invalid" };
    }
    if (!Number.isFinite(receipt.leaseExpiresAt) || receipt.leaseExpiresAt <= 0) {
      throw new Error("founder_inference_receipt_lease_invalid");
    }
    if (receipt.leaseExpiresAt <= args.nowMs) {
      const finalized = await finalizeExpiredAuthorizedFounderInferenceReceipt({
        ctx,
        receipt,
        claimToken: args.claimToken,
        nowMs: args.nowMs,
      });
      return { ok: false, errorCode: finalized.errorCode };
    }
    if (receipt.providerStartedAt !== undefined) {
      return { ok: true };
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
      expectedFounderSubscriptionId: receipt.founderSubscriptionId,
    });
    if (!authorityMatches) {
      await finalizeKnownNoSpendFounderInferenceReceipt({
        ctx,
        receipt,
        claimToken: args.claimToken,
        failureCode: "funding_authority_changed",
        nowMs: args.nowMs,
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
    const receipt = await getUniqueFounderInferenceReceiptByKey(ctx, args.receiptKey);
    if (!receipt || receipt.status !== "authorized" || receipt.claimToken !== args.claimToken) {
      return { ok: false, errorCode: "founder_inference_receipt_claim_invalid" };
    }
    const promptTokens = Math.max(0, Math.floor(args.promptTokens));
    const completionTokens = Math.max(0, Math.floor(args.completionTokens));
    const failureCode = boundedCode(args.failureCode, "provider_error");
    if (
      args.usageComplete === false ||
      (args.disposition === "indeterminate" && promptTokens === 0 && completionTokens === 0)
    ) {
      await settleAuthorizedFounderInferenceReceipt({
        ctx,
        receiptKey: args.receiptKey,
        claimToken: args.claimToken,
        promptTokens,
        completionTokens,
        usageComplete: false,
        outcomeCode: failureCode,
        failureCode: "provider_token_usage_missing",
        nowMs: args.nowMs,
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
    await finalizeKnownNoSpendFounderInferenceReceipt({
      ctx,
      receipt,
      claimToken: args.claimToken,
      failureCode,
      nowMs: args.nowMs,
    });
    return { ok: true, status: "failed" as const };
  },
});
