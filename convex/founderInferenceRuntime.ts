import { internal } from "./_generated/api";
import {
  COMMUNITY_OWNER_FUNDED_MODEL_ID,
  type CommunityInferenceFundingAdmission,
  type CommunityInferenceSurface,
} from "../shared/founderInference";

const internalRefs = internal as any;

export type CommunityInferenceFundingSession = {
  receiptKey: string;
  claimToken: string;
  fundingMode: "platform_subscription" | "platform_operator_grant";
  modelId: typeof COMMUNITY_OWNER_FUNDED_MODEL_ID;
};

function boundedCode(value: unknown, fallback: string): string {
  return String(value ?? "").trim().slice(0, 120) || fallback;
}

export function providerFailureIsKnownPreSpend(code: unknown): boolean {
  return new Set([
    "invalid_openai_request",
    "provider_inference_misconfigured",
    "provider_inference_quota_exceeded",
    "rate_limited",
  ]).has(String(code ?? "").trim());
}

export async function resolveCommunityInferenceFundingForAction(
  ctx: any,
  communityId: unknown,
): Promise<CommunityInferenceFundingAdmission> {
  return await ctx.runQuery(
    internalRefs.founderInference.resolveCommunityInferenceFundingAdmissionInternal,
    { communityId },
  ) as CommunityInferenceFundingAdmission;
}

export async function claimCommunityInferenceFundingSession(args: {
  ctx: any;
  communityId: unknown;
  actorUserId: unknown;
  surface: CommunityInferenceSurface;
  receiptKey: string;
  sourceRunId: string;
  admission: CommunityInferenceFundingAdmission;
}): Promise<CommunityInferenceFundingSession> {
  if (args.admission.ok === false) throw new Error(args.admission.code);
  const receiptKey = String(args.receiptKey ?? "").trim();
  const sourceRunId = String(args.sourceRunId ?? "").trim();
  if (!receiptKey || !sourceRunId) throw new Error("founder_inference_receipt_identity_required");
  const claimToken = crypto.randomUUID();
  const claim = await args.ctx.runMutation(
    internalRefs.founderInference.claimCommunityInferenceReceiptInternal,
    {
      receiptKey,
      sourceRunId,
      communityId: args.communityId,
      actorUserId: args.actorUserId,
      expectedPayerUserId: args.admission.payerUserId,
      expectedFundingMode: args.admission.mode,
      expectedFounderSubscriptionId:
        args.admission.mode === "platform_subscription" ? args.admission.subscriptionId : undefined,
      surface: args.surface,
      claimToken,
      nowMs: Date.now(),
    },
  );
  if (!claim?.ok) {
    throw new Error(boundedCode(claim?.errorCode, "founder_inference_receipt_unavailable"));
  }

  return {
    receiptKey,
    claimToken,
    fundingMode: args.admission.mode,
    modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
  };
}

export async function markCommunityInferenceFundingSessionProviderStarted(args: {
  ctx: any;
  session: CommunityInferenceFundingSession;
}): Promise<void> {
  const providerStart = await args.ctx.runMutation(
    internalRefs.founderInference.markCommunityInferenceProviderStartedInternal,
    {
      receiptKey: args.session.receiptKey,
      claimToken: args.session.claimToken,
      nowMs: Date.now(),
    },
  );
  if (!providerStart?.ok) {
    throw new Error(boundedCode(providerStart?.errorCode, "funding_authority_changed"));
  }
}

export async function settleCommunityInferenceFundingSession(args: {
  ctx: any;
  session: CommunityInferenceFundingSession;
  promptTokens: number;
  completionTokens: number;
  usageComplete: boolean;
  outcomeCode: string;
}): Promise<void> {
  const result = await args.ctx.runMutation(
    internalRefs.founderInference.settleCommunityInferenceReceiptInternal,
    {
      receiptKey: args.session.receiptKey,
      claimToken: args.session.claimToken,
      promptTokens: Math.max(0, Math.floor(args.promptTokens)),
      completionTokens: Math.max(0, Math.floor(args.completionTokens)),
      usageComplete: args.usageComplete,
      outcomeCode: boundedCode(args.outcomeCode, "provider_completed"),
      nowMs: Date.now(),
    },
  );
  if (!result || result.status !== "settled") {
    throw new Error("community_inference_receipt_not_settled");
  }
}

export async function failCommunityInferenceFundingSession(args: {
  ctx: any;
  session: CommunityInferenceFundingSession;
  promptTokens: number;
  completionTokens: number;
  usageComplete: boolean;
  failureCode: string;
  disposition: "failed" | "indeterminate";
}): Promise<void> {
  const result = await args.ctx.runMutation(
    internalRefs.founderInference.finalizeCommunityInferenceFailureInternal,
    {
      receiptKey: args.session.receiptKey,
      claimToken: args.session.claimToken,
      promptTokens: Math.max(0, Math.floor(args.promptTokens)),
      completionTokens: Math.max(0, Math.floor(args.completionTokens)),
      usageComplete: args.usageComplete,
      failureCode: boundedCode(args.failureCode, "provider_error"),
      disposition: args.disposition,
      nowMs: Date.now(),
    },
  );
  if (!result?.ok) {
    throw new Error(boundedCode(result?.errorCode, "community_inference_receipt_not_finalized"));
  }
}
