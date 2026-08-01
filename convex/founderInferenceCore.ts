import {
  COMMUNITY_FUNDING_POLICY_LEGACY_BYOK,
  COMMUNITY_FUNDING_POLICY_MANAGED,
  COMMUNITY_OWNER_FUNDED_MODEL_ID,
  EXISTING_FOUNDER_INFERENCE_COHORT_KEY,
  type CommunityInferenceFundingAdmission,
  type CommunityInferenceFundingPolicy,
  type CommunityInferenceSurface,
} from "../shared/founderInference";
import {
  POLYNET_FOUNDER_PLAN_PRICING_VERSION,
  founderSubscriptionStatusGrantsAccess,
} from "../shared/founderPlan";
import {
  getFounderSubscriptionByCommunity,
  settleFounderUsageReservation,
  type FounderUsageCycleRow,
} from "./founderPlanCore";
import {
  calculateFounderInferenceCostMicros,
} from "./founderPlanPricing";

export type FounderInferenceGrantRow = {
  _id: any;
  userId: any;
  cohortKey: string;
  status: "approved" | "active" | "suspended";
  activationAcceptanceId?: any;
  approvedAt: number;
  activatedAt?: number;
  suspendedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type FounderInferenceReceiptRow = {
  _id: any;
  receiptKey: string;
  sourceRunId: string;
  communityId: any;
  actorUserId: any;
  payerUserId: any;
  fundingMode: "owner_api_key" | "platform_subscription";
  founderGrantId?: any;
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
  pricingVersion?: string;
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

export async function getExistingFounderInferenceGrant(
  ctx: any,
  userId: any,
): Promise<FounderInferenceGrantRow | null> {
  return (await ctx.db
    .query("founderInferenceGrants" as any)
    .withIndex("by_user_cohort", (q: any) =>
      q.eq("userId", userId).eq("cohortKey", EXISTING_FOUNDER_INFERENCE_COHORT_KEY),
    )
    .first()) as FounderInferenceGrantRow | null;
}

export async function existingFounderInferenceCohortIsInitialized(ctx: any): Promise<boolean> {
  const row = await ctx.db
    .query("founderInferenceGrants" as any)
    .withIndex("by_cohort", (q: any) => q.eq("cohortKey", EXISTING_FOUNDER_INFERENCE_COHORT_KEY))
    .first();
  return Boolean(row);
}

export async function requireExistingFounderCommunityCreationEligibility(
  ctx: any,
  userId: any,
): Promise<void> {
  if (!(await existingFounderInferenceCohortIsInitialized(ctx))) return;
  if (await getExistingFounderInferenceGrant(ctx, userId)) return;
  throw new Error("founder_plan_required");
}

export function normalizeCommunityInferenceFundingPolicy(
  value: unknown,
): CommunityInferenceFundingPolicy | null {
  const normalized = String(value ?? "").trim();
  if (normalized === COMMUNITY_FUNDING_POLICY_LEGACY_BYOK) {
    return COMMUNITY_FUNDING_POLICY_LEGACY_BYOK;
  }
  if (normalized === COMMUNITY_FUNDING_POLICY_MANAGED) {
    return COMMUNITY_FUNDING_POLICY_MANAGED;
  }
  return null;
}

export async function resolveCommunityInferenceFundingPolicy(args: {
  ctx: any;
  community: { ownerId?: any; inferenceFundingPolicy?: unknown };
}): Promise<CommunityInferenceFundingPolicy> {
  const explicit = normalizeCommunityInferenceFundingPolicy(
    args.community.inferenceFundingPolicy,
  );
  if (explicit) return explicit;
  if (
    args.community.ownerId &&
    (await getExistingFounderInferenceGrant(args.ctx, args.community.ownerId))
  ) {
    return COMMUNITY_FUNDING_POLICY_LEGACY_BYOK;
  }
  return COMMUNITY_FUNDING_POLICY_MANAGED;
}

export async function suspendActiveFounderInferenceGrantForCredentialChange(args: {
  ctx: any;
  userId: any;
  nowMs: number;
}): Promise<boolean> {
  const grant = await getExistingFounderInferenceGrant(args.ctx, args.userId);
  if (!grant || grant.status !== "active") return false;
  await args.ctx.db.patch(grant._id as any, {
    status: "suspended",
    suspendedAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return true;
}

async function ownerHasUsableOpenAiKey(ctx: any, ownerUserId: any): Promise<boolean> {
  const row = (await ctx.db
    .query("userProviderConnections" as any)
    .withIndex("by_user_provider", (q: any) =>
      q.eq("userId", ownerUserId).eq("provider", "openai"),
    )
    .first()) as Record<string, unknown> | null;
  return Boolean(String(row?.encryptedSecretHex ?? "").trim());
}

export async function resolveCommunityInferenceFundingAdmission(
  ctx: any,
  communityId: any,
): Promise<CommunityInferenceFundingAdmission> {
  const community = (await ctx.db.get(communityId as any)) as {
    ownerId?: any;
    inferenceFundingPolicy?: unknown;
  } | null;
  if (!community?.ownerId) return { ok: false, code: "community_not_found" };

  if (!(await existingFounderInferenceCohortIsInitialized(ctx))) {
    return {
      ok: true,
      mode: "legacy_requester_chatgpt",
      transitional: true,
      payerUserId: null,
      grantId: null,
      modelId: null,
    };
  }

  let attachedSubscription;
  try {
    attachedSubscription = await getFounderSubscriptionByCommunity(
      ctx,
      communityId,
      Date.now(),
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
      nowMs: Date.now(),
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

  const fundingPolicy = await resolveCommunityInferenceFundingPolicy({
    ctx,
    community,
  });
  if (fundingPolicy === COMMUNITY_FUNDING_POLICY_MANAGED) {
    return { ok: false, code: "founder_plan_required" };
  }

  const grant = await getExistingFounderInferenceGrant(ctx, community.ownerId);
  if (!grant) return { ok: false, code: "founder_plan_required" };
  if (grant.status === "approved") {
    return {
      ok: true,
      mode: "legacy_requester_chatgpt",
      transitional: true,
      payerUserId: null,
      grantId: null,
      modelId: null,
    };
  }
  if (grant.status === "suspended") {
    return { ok: false, code: "owner_funding_suspended" };
  }
  if (!(await ownerHasUsableOpenAiKey(ctx, community.ownerId))) {
    return { ok: false, code: "owner_credential_missing" };
  }
  return {
    ok: true,
    mode: "owner_api_key",
    transitional: false,
    payerUserId: community.ownerId,
    grantId: grant._id,
    modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
  };
}

export async function settleAuthorizedFounderInferenceReceipt(args: {
  ctx: any;
  receiptKey: string;
  claimToken: string;
  promptTokens: number;
  completionTokens: number;
  usageComplete?: boolean;
  outcomeCode: string;
  nowMs: number;
}): Promise<FounderInferenceReceiptRow> {
  const receipt = (await args.ctx.db
    .query("communityInferenceReceipts" as any)
    .withIndex("by_receipt_key", (q: any) => q.eq("receiptKey", args.receiptKey))
    .first()) as FounderInferenceReceiptRow | null;
  if (!receipt) throw new Error("founder_inference_receipt_missing");
  if (receipt.status !== "authorized" || receipt.claimToken !== args.claimToken) {
    throw new Error("founder_inference_receipt_claim_invalid");
  }
  if (args.usageComplete === false) {
    await args.ctx.db.patch(receipt._id as any, {
      status: "indeterminate",
      failureCode: "provider_token_usage_missing",
      failedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return {
      ...receipt,
      status: "indeterminate",
      failureCode: "provider_token_usage_missing",
      failedAt: args.nowMs,
      updatedAt: args.nowMs,
    };
  }
  const promptTokens = Math.max(0, Math.floor(args.promptTokens));
  const completionTokens = Math.max(0, Math.floor(args.completionTokens));
  let settledCostMicros: number | undefined;
  if (receipt.fundingMode === "platform_subscription") {
    if (!receipt.usageCycleId || !receipt.founderSubscriptionId) {
      throw new Error("founder_usage_receipt_authority_missing");
    }
    const cycle = (await args.ctx.db.get(
      receipt.usageCycleId as any,
    )) as FounderUsageCycleRow | null;
    if (!cycle || String(cycle.founderSubscriptionId) !== String(receipt.founderSubscriptionId)) {
      throw new Error("founder_usage_cycle_authority_mismatch");
    }
    if (
      receipt.pricingVersion !== cycle.pricingVersion ||
      cycle.pricingVersion !== POLYNET_FOUNDER_PLAN_PRICING_VERSION
    ) {
      throw new Error("founder_inference_pricing_version_mismatch");
    }
    settledCostMicros = calculateFounderInferenceCostMicros({
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
  }
  await args.ctx.db.patch(receipt._id as any, {
    status: "settled",
    promptTokens,
    completionTokens,
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
    settledCostMicros,
    outcomeCode: args.outcomeCode,
    settledAt: args.nowMs,
    updatedAt: args.nowMs,
  };
}
