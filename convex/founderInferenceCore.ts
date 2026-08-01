import {
  COMMUNITY_OWNER_FUNDED_MODEL_ID,
  EXISTING_FOUNDER_INFERENCE_COHORT_KEY,
  type CommunityInferenceFundingAdmission,
} from "../shared/founderInference";

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
  founderGrantId: any;
  surface: "community_agent_mention";
  provider: "openai";
  modelId: string;
  status: "authorized" | "settled" | "failed" | "indeterminate";
  claimToken: string;
  leaseExpiresAt: number;
  providerStartedAt?: number;
  promptTokens?: number;
  completionTokens?: number;
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
  const community = (await ctx.db.get(communityId as any)) as { ownerId?: any } | null;
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
  await args.ctx.db.patch(receipt._id as any, {
    status: "settled",
    promptTokens,
    completionTokens,
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
    outcomeCode: args.outcomeCode,
    settledAt: args.nowMs,
    updatedAt: args.nowMs,
  };
}
