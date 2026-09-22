import {
  COMMUNITY_OWNER_FUNDED_MODEL_ID,
  type CommunityInferenceFundingAdmission,
  type CommunityInferenceSurface,
} from "../shared/founderInference";
import {
  POLYNET_FOUNDER_PLAN_PRICING_VERSION,
  founderSubscriptionStatusGrantsAccess,
} from "../shared/founderPlan";
import {
  getFounderSubscriptionByCommunity,
  settleFounderUsageReservation,
  type FounderSubscriptionRow,
  type FounderUsageCycleRow,
} from "./founderPlanCore";
import {
  calculateFounderInferenceCostMicros,
  calculateFounderRunCostMicros,
  validateFounderRunPricing,
  type FounderRunPricing,
  requireFounderInferencePricingFromEnv,
} from "./founderPlanPricing";
import { hasPlatformOwnerComplimentaryAccess } from "./operatorEntitlementsCore";
import { communityIsActive } from "../shared/communityLifecycle";

export type FounderInferenceReceiptRow = {
  _id: any;
  receiptKey: string;
  sourceRunId: string;
  communityId: any;
  actorUserId: any;
  payerUserId: any;
  fundingMode: "platform_subscription" | "platform_operator_grant";
  founderSubscriptionId?: any;
  usageCycleId?: any;
  surface: CommunityInferenceSurface;
  provider: "openai";
  modelId: string;
  status: "authorized" | "settled" | "failed" | "indeterminate";
  claimToken: string;
  leaseExpiresAt: number;
  providerStartedAt?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  pricingVersion?: string;
  pricingSnapshot?: FounderRunPricing;
  reservedCostMicros?: number;
  settledCostMicros?: number;
  outcomeCode?: string;
  failureCode?: string;
  authorizedAt: number;
  settledAt?: number;
  failedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type FounderInferenceReceiptIdentity = Pick<
  FounderInferenceReceiptRow,
  | "sourceRunId"
  | "communityId"
  | "actorUserId"
  | "payerUserId"
  | "fundingMode"
  | "founderSubscriptionId"
  | "surface"
>;

function normalizedId(value: unknown): string {
  return String(value ?? "").trim();
}

function boundedCode(value: unknown, fallback: string): string {
  return String(value ?? "").trim().slice(0, 120) || fallback;
}

export function requireBoundedFounderInferenceIdentifier(
  value: unknown,
  errorCode: string,
  maxLength: number,
): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > maxLength) throw new Error(errorCode);
  return normalized;
}

export async function getUniqueFounderInferenceReceiptByKey(
  ctx: any,
  receiptKey: string,
): Promise<FounderInferenceReceiptRow | null> {
  const normalizedReceiptKey = requireBoundedFounderInferenceIdentifier(
    receiptKey,
    "founder_inference_receipt_key_invalid",
    240,
  );
  const rows = (await ctx.db
    .query("communityInferenceReceipts" as any)
    .withIndex("by_receipt_key", (q: any) => q.eq("receiptKey", normalizedReceiptKey))
    .take(2)) as FounderInferenceReceiptRow[];
  if (rows.length > 1) throw new Error("founder_inference_receipt_ambiguous");
  return rows[0] ?? null;
}

export function founderInferenceReceiptIdentityMatches(
  receipt: FounderInferenceReceiptRow,
  expected: FounderInferenceReceiptIdentity,
): boolean {
  return (
    receipt.sourceRunId === expected.sourceRunId &&
    normalizedId(receipt.communityId) === normalizedId(expected.communityId) &&
    normalizedId(receipt.actorUserId) === normalizedId(expected.actorUserId) &&
    normalizedId(receipt.payerUserId) === normalizedId(expected.payerUserId) &&
    receipt.fundingMode === expected.fundingMode &&
    normalizedId(receipt.founderSubscriptionId) ===
      normalizedId(expected.founderSubscriptionId) &&
    receipt.surface === expected.surface
  );
}

async function requireFounderInferenceSettlementCycle(args: {
  ctx: any;
  receipt: FounderInferenceReceiptRow;
}): Promise<FounderUsageCycleRow> {
  const { receipt } = args;
  if (!receipt.usageCycleId || !receipt.founderSubscriptionId) {
    throw new Error("founder_usage_receipt_authority_missing");
  }
  const [cycle, subscription] = (await Promise.all([
    args.ctx.db.get(receipt.usageCycleId as any),
    args.ctx.db.get(receipt.founderSubscriptionId as any),
  ])) as [FounderUsageCycleRow | null, FounderSubscriptionRow | null];
  if (
    !cycle ||
    !subscription ||
    normalizedId(cycle.founderSubscriptionId) !== normalizedId(subscription._id) ||
    normalizedId(subscription._id) !== normalizedId(receipt.founderSubscriptionId)
  ) {
    throw new Error("founder_usage_cycle_authority_mismatch");
  }
  if (
    normalizedId(cycle.communityId) !== normalizedId(receipt.communityId) ||
    normalizedId(subscription.communityId) !== normalizedId(receipt.communityId) ||
    normalizedId(subscription.ownerUserId) !== normalizedId(receipt.payerUserId)
  ) {
    throw new Error("founder_usage_cycle_community_mismatch");
  }
  if (receipt.pricingSnapshot) {
    validateFounderRunPricing(receipt.pricingSnapshot, receipt.modelId, receipt.pricingVersion);
  } else if (
    receipt.modelId !== "gpt-5.6-luna" ||
    receipt.pricingVersion !== cycle.pricingVersion ||
    cycle.pricingVersion !== "founder_plan_luna_v1"
  ) {
    throw new Error("founder_inference_pricing_version_mismatch");
  }
  return cycle;
}

export async function resolveCommunityInferenceFundingAdmission(
  ctx: any,
  communityId: any,
  nowMs: number = Date.now(),
): Promise<CommunityInferenceFundingAdmission> {
  const community = (await ctx.db.get(communityId as any)) as {
    ownerId?: any;
    inferenceFundingPolicy: "managed_required";
    lifecycleStatus?: "active" | "archived";
    lifecycleGeneration?: number;
  } | null;
  if (!community?.ownerId) return { ok: false, code: "community_not_found" };
  if (!communityIsActive(community)) {
    return { ok: false, code: "community_not_found" };
  }

  if (await hasPlatformOwnerComplimentaryAccess(ctx, community.ownerId)) {
    return {
      ok: true,
      mode: "platform_operator_grant",
      transitional: false,
      payerUserId: community.ownerId,
      modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
    };
  }

  let attachedSubscription;
  try {
    attachedSubscription = await getFounderSubscriptionByCommunity(
      ctx,
      communityId,
      nowMs,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "founder_subscription_ambiguous") {
      return { ok: false, code: "founder_subscription_ambiguous" };
    }
    throw error;
  }
  if (attachedSubscription) {
    if (!founderSubscriptionStatusGrantsAccess({
      status: attachedSubscription.status,
      currentPeriodEndAt: attachedSubscription.currentPeriodEndAt,
      nowMs,
    })) {
      return { ok: false, code: "founder_subscription_inactive" };
    }
    if (String(attachedSubscription.ownerUserId) !== String(community.ownerId)) {
      return { ok: false, code: "founder_subscription_owner_mismatch" };
    }
    return {
      ok: true,
      mode: "platform_subscription",
      transitional: false,
      payerUserId: community.ownerId,
      subscriptionId: attachedSubscription._id,
      modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
    };
  }

  return { ok: false, code: "founder_plan_required" };
}

export type AdditionalManagedCommunityAdmission =
  | {
      ok: true;
      fundedCommunityCount: number;
    }
  | {
      ok: false;
      blockingCommunityId: any;
      code: Exclude<CommunityInferenceFundingAdmission, { ok: true }>["code"];
    };

/**
 * Community ownership has no account-level cap. A founder may create the next
 * managed community only after every existing community has current funding.
 * This permits unlimited paid communities while preventing stacked unpaid
 * drafts. Operator and hosted Builder communities pass through the same
 * canonical funding admission used by inference.
 */
export async function resolveAdditionalManagedCommunityAdmission(
  ctx: any,
  ownerUserId: any,
): Promise<AdditionalManagedCommunityAdmission> {
  const communities = ((await ctx.db
    .query("communities" as any)
    .withIndex("by_owner", (q: any) => q.eq("ownerId", ownerUserId))
    .collect()) as Array<{
      _id: any;
      createdAt?: unknown;
      lifecycleStatus?: "active" | "archived";
      lifecycleGeneration?: number;
    }>).filter((community) => communityIsActive(community));
  communities.sort((left, right) =>
    Number(left.createdAt ?? 0) - Number(right.createdAt ?? 0));
  for (const community of communities) {
    const funding = await resolveCommunityInferenceFundingAdmission(ctx, community._id);
    if (!funding.ok) {
      return {
        ok: false,
        blockingCommunityId: community._id,
        code: funding.code,
      };
    }
  }
  return { ok: true, fundedCommunityCount: communities.length };
}

export async function settleAuthorizedFounderInferenceReceipt(args: {
  ctx: any;
  receiptKey: string;
  claimToken: string;
  promptTokens: number;
  completionTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  usageComplete?: boolean;
  outcomeCode: string;
  failureCode?: string;
  nowMs: number;
}): Promise<FounderInferenceReceiptRow> {
  const receipt = await getUniqueFounderInferenceReceiptByKey(
    args.ctx,
    args.receiptKey,
  );
  if (!receipt) throw new Error("founder_inference_receipt_missing");
  if (receipt.status !== "authorized" || receipt.claimToken !== args.claimToken) {
    throw new Error("founder_inference_receipt_claim_invalid");
  }
  const promptTokens = Math.max(0, Math.floor(args.promptTokens));
  const completionTokens = Math.max(0, Math.floor(args.completionTokens));
  let settledCostMicros: number | undefined;
  const cycle = receipt.fundingMode === "platform_subscription"
    ? await requireFounderInferenceSettlementCycle({ ctx: args.ctx, receipt })
    : undefined;
  if (args.usageComplete === false) {
    if (cycle) {
      settledCostMicros = Number(receipt.reservedCostMicros);
      await settleFounderUsageReservation({
        ctx: args.ctx,
        usageCycleId: receipt.usageCycleId,
        reservedCostMicros: settledCostMicros,
        settledCostMicros,
        nowMs: args.nowMs,
      });
    }
    const failureCode = boundedCode(
      args.failureCode,
      "provider_token_usage_missing",
    );
    await args.ctx.db.patch(receipt._id as any, {
      status: "indeterminate",
      promptTokens,
      completionTokens,
      settledCostMicros,
      failureCode,
      failedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return {
      ...receipt,
      status: "indeterminate",
      promptTokens,
      completionTokens,
      settledCostMicros,
      failureCode,
      failedAt: args.nowMs,
      updatedAt: args.nowMs,
    };
  }
  if (receipt.fundingMode === "platform_subscription") {
    if (!cycle) throw new Error("founder_usage_cycle_missing");
    settledCostMicros = receipt.pricingSnapshot
      ? calculateFounderRunCostMicros({ promptTokens, completionTokens, cachedInputTokens: args.cachedInputTokens, cacheWriteTokens: args.cacheWriteTokens, pricing: receipt.pricingSnapshot })
      : calculateFounderInferenceCostMicros({
      promptTokens,
      completionTokens,
      pricing: {
        pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
        includedCostMicros: cycle.includedCostMicros,
        inputCostMicrosPerMillionTokens: cycle.inputCostMicrosPerMillionTokens,
        outputCostMicrosPerMillionTokens: cycle.outputCostMicrosPerMillionTokens,
        maxRunReservationCostMicros: cycle.maxRunReservationCostMicros,
      },
    });
    await settleFounderUsageReservation({
      ctx: args.ctx,
      usageCycleId: receipt.usageCycleId,
      reservedCostMicros: Number(receipt.reservedCostMicros ?? 0),
      settledCostMicros,
      nowMs: args.nowMs,
    });
  } else if (receipt.fundingMode === "platform_operator_grant") {
    if (receipt.pricingSnapshot) {
      validateFounderRunPricing(receipt.pricingSnapshot, receipt.modelId, receipt.pricingVersion);
      settledCostMicros = calculateFounderRunCostMicros({ promptTokens, completionTokens, cachedInputTokens: args.cachedInputTokens, cacheWriteTokens: args.cacheWriteTokens, pricing: receipt.pricingSnapshot });
    } else {
    const pricing = requireFounderInferencePricingFromEnv();
    if (receipt.modelId !== "gpt-5.6-luna" || receipt.pricingVersion !== "founder_plan_luna_v1" || receipt.pricingVersion !== pricing.pricingVersion) {
      throw new Error("founder_inference_pricing_version_mismatch");
    }
    settledCostMicros = calculateFounderInferenceCostMicros({
      promptTokens,
      completionTokens,
      pricing,
    });
    }
  }
  await args.ctx.db.patch(receipt._id as any, {
    status: "settled",
    promptTokens,
    completionTokens,
    cachedInputTokens: args.cachedInputTokens,
    cacheWriteTokens: args.cacheWriteTokens,
    settledCostMicros,
    outcomeCode: String(args.outcomeCode ?? "completed").trim().slice(0, 120) || "completed",
    failureCode: undefined,
    settledAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return {
    ...receipt,
    status: "settled",
    promptTokens,
    completionTokens,
    cachedInputTokens: args.cachedInputTokens,
    cacheWriteTokens: args.cacheWriteTokens,
    settledCostMicros,
    outcomeCode: args.outcomeCode,
    settledAt: args.nowMs,
    updatedAt: args.nowMs,
  };
}

export async function finalizeKnownNoSpendFounderInferenceReceipt(args: {
  ctx: any;
  receipt: FounderInferenceReceiptRow;
  claimToken: string;
  failureCode: string;
  nowMs: number;
}): Promise<FounderInferenceReceiptRow> {
  const { receipt } = args;
  if (receipt.status !== "authorized" || receipt.claimToken !== args.claimToken) {
    throw new Error("founder_inference_receipt_claim_invalid");
  }
  if (receipt.fundingMode === "platform_subscription") {
    await requireFounderInferenceSettlementCycle({ ctx: args.ctx, receipt });
    const reservedCostMicros = Number(receipt.reservedCostMicros);
    if (!Number.isSafeInteger(reservedCostMicros) || reservedCostMicros <= 0) {
      throw new Error("founder_usage_receipt_authority_missing");
    }
    await settleFounderUsageReservation({
      ctx: args.ctx,
      usageCycleId: receipt.usageCycleId,
      reservedCostMicros,
      settledCostMicros: 0,
      nowMs: args.nowMs,
    });
  }
  const failureCode = boundedCode(args.failureCode, "provider_rejected_before_spend");
  await args.ctx.db.patch(receipt._id as any, {
    status: "failed",
    failureCode,
    failedAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return {
    ...receipt,
    status: "failed",
    failureCode,
    failedAt: args.nowMs,
    updatedAt: args.nowMs,
  };
}
