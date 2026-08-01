import { internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  COMMUNITY_OWNER_FUNDED_MODEL_ID,
  COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE,
  COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE,
  COMMUNITY_OWNER_INFERENCE_TERMS_KEY,
  COMMUNITY_OWNER_INFERENCE_TERMS_VERSION,
  EXISTING_FOUNDER_INFERENCE_COHORT_KEY,
} from "../shared/founderInference";
import { resolveUserIdForAuthenticatedRequest } from "./communityCore";
import {
  getExistingFounderInferenceGrant,
  resolveCommunityInferenceFundingAdmission,
  settleAuthorizedFounderInferenceReceipt,
  type FounderInferenceReceiptRow,
} from "./founderInferenceCore";
import {
  releaseFounderUsageReservation,
  reserveFounderUsage,
} from "./founderPlanCore";
import { decryptStoredSecret } from "./providerConnections";
import { runOpenAiNativeToolCompletion } from "./openAiNativeToolCompletion";

const internalRefs = internal as any;
const RECEIPT_LEASE_MS = 10 * 60_000;
const RATE_LIMIT_WINDOW_MS = 60_000;

type OpenAiConnectionRow = {
  _id: any;
  userId: any;
  provider: string;
  encryptedSecretHex: string;
  secretIvHex: string;
  secretVersion: number;
  keyLastFour?: string;
  keyFingerprint?: string;
  validatedAt: number;
  updatedAt: number;
};

function normalizedId(value: unknown): string {
  return String(value ?? "").trim();
}

function boundedCode(value: unknown, fallback: string): string {
  return String(value ?? "").trim().slice(0, 120) || fallback;
}

async function getOpenAiConnection(ctx: any, userId: any): Promise<OpenAiConnectionRow | null> {
  return (await ctx.db
    .query("userProviderConnections" as any)
    .withIndex("by_user_provider", (q: any) =>
      q.eq("userId", userId).eq("provider", "openai"),
    )
    .first()) as OpenAiConnectionRow | null;
}

export const getCurrentFounderInferenceStatus = query({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const grant = await getExistingFounderInferenceGrant(ctx, userId);
    if (!grant) {
      return {
        eligible: false,
        cohort_key: null,
        status: null,
        model_id: COMMUNITY_OWNER_FUNDED_MODEL_ID,
        key_connected: false,
        key_last_four: null,
        communities: [],
      };
    }
    const [connection, communities] = await Promise.all([
      getOpenAiConnection(ctx, userId),
      ctx.db
        .query("communities" as any)
        .withIndex("by_owner", (q: any) => q.eq("ownerId", userId))
        .collect(),
    ]);
    return {
      eligible: true,
      cohort_key: grant.cohortKey,
      status: grant.status,
      model_id: COMMUNITY_OWNER_FUNDED_MODEL_ID,
      key_connected: Boolean(connection?.encryptedSecretHex),
      key_last_four: String(connection?.keyLastFour ?? "").trim() || null,
      activated_at: grant.activatedAt ? new Date(grant.activatedAt).toISOString() : null,
      suspended_at: grant.suspendedAt ? new Date(grant.suspendedAt).toISOString() : null,
      communities: (communities as Array<Record<string, unknown>>)
        .slice()
        .sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0))
        .map((community) => ({
          id: normalizedId(community._id),
          name: String(community.name ?? "Untitled community").trim() || "Untitled community",
          slug: String(community.slug ?? "").trim(),
        })),
    };
  },
});

export const prepareFounderInferenceActivationInternal = internalMutation({
  args: {
    userId: v.id("users"),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const [grant, connection] = await Promise.all([
      getExistingFounderInferenceGrant(ctx, args.userId),
      getOpenAiConnection(ctx, args.userId),
    ]);
    if (!grant) throw new Error("founder_inference_grant_required");
    if (!connection?.encryptedSecretHex) throw new Error("owner_credential_missing");
    if (!String(connection.keyFingerprint ?? "").trim()) {
      throw new Error("owner_credential_fingerprint_missing");
    }

    let acceptance = await ctx.db
      .query("legalAcceptances" as any)
      .withIndex("by_user_document_version", (q: any) =>
        q
          .eq("userId", args.userId)
          .eq("documentKey", COMMUNITY_OWNER_INFERENCE_TERMS_KEY)
          .eq("documentVersion", COMMUNITY_OWNER_INFERENCE_TERMS_VERSION),
      )
      .first();
    if (!acceptance) {
      const acceptanceId = await ctx.db.insert("legalAcceptances" as any, {
        userId: args.userId,
        documentKey: COMMUNITY_OWNER_INFERENCE_TERMS_KEY,
        documentVersion: COMMUNITY_OWNER_INFERENCE_TERMS_VERSION,
        acceptedAt: args.nowMs,
        source: "founder_inference_settings_activation",
        createdAt: args.nowMs,
      });
      acceptance = await ctx.db.get(acceptanceId as any);
    }
    return { grant, connection, acceptanceId: acceptance?._id };
  },
});

export const completeFounderInferenceActivationInternal = internalMutation({
  args: {
    userId: v.id("users"),
    expectedKeyFingerprint: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const grant = await getExistingFounderInferenceGrant(ctx, args.userId);
    if (!grant) throw new Error("founder_inference_grant_required");
    const connection = await getOpenAiConnection(ctx, args.userId);
    if (!connection?.encryptedSecretHex) throw new Error("owner_credential_missing");
    if (
      String(connection.keyFingerprint ?? "").trim() !==
      String(args.expectedKeyFingerprint ?? "").trim()
    ) {
      throw new Error("owner_credential_changed_during_activation");
    }

    const acceptance = await ctx.db
      .query("legalAcceptances" as any)
      .withIndex("by_user_document_version", (q: any) =>
        q
          .eq("userId", args.userId)
          .eq("documentKey", COMMUNITY_OWNER_INFERENCE_TERMS_KEY)
          .eq("documentVersion", COMMUNITY_OWNER_INFERENCE_TERMS_VERSION),
      )
      .first();
    if (!acceptance) throw new Error("founder_inference_terms_acceptance_missing");
    await ctx.db.patch(grant._id as any, {
      status: "active",
      activationAcceptanceId: acceptance?._id,
      activatedAt: args.nowMs,
      suspendedAt: undefined,
      updatedAt: args.nowMs,
    });
    return { ok: true, status: "active", model_id: COMMUNITY_OWNER_FUNDED_MODEL_ID };
  },
});

export const activateFounderInference = action({
  args: {
    authSubject: v.optional(v.string()),
    acceptedTerms: v.boolean(),
    acceptedTermsVersion: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    if (
      args.acceptedTerms !== true ||
      String(args.acceptedTermsVersion ?? "").trim() !== COMMUNITY_OWNER_INFERENCE_TERMS_VERSION
    ) {
      throw new Error("founder_inference_terms_acceptance_required");
    }
    const actor = (await ctx.runQuery(internalRefs.authActor.resolveAuthenticatedActorInternal, {
      authSubject: args.authSubject ?? undefined,
    })) as { dbUserId?: unknown } | null;
    if (!actor?.dbUserId) throw new Error("authenticated_user_required");
    const userId = actor.dbUserId;
    const activation = (await ctx.runMutation(
      internalRefs.founderInference.prepareFounderInferenceActivationInternal,
      { userId, nowMs: Date.now() },
    )) as { grant?: unknown; connection?: OpenAiConnectionRow | null } | null;
    if (!activation?.grant) throw new Error("founder_inference_grant_required");
    const connection = activation.connection;
    if (!connection?.encryptedSecretHex) throw new Error("owner_credential_missing");
    const keyFingerprint = String(connection.keyFingerprint ?? "").trim();
    if (!keyFingerprint) throw new Error("owner_credential_fingerprint_missing");

    const apiKey = await decryptStoredSecret(connection);
    const probe = await runOpenAiNativeToolCompletion({
      modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
      messages: [
        { role: "system", content: "Return exactly READY." },
        { role: "user", content: "Confirm this model is available." },
      ],
      maxTokens: 16,
      tools: [],
      toolChoice: "none",
      parallelToolCalls: false,
      apiKeyOverride: apiKey,
    });
    if (probe.ok === false) {
      throw new Error(boundedCode(probe.code, "founder_inference_probe_failed"));
    }
    if (probe.type !== "assistant" || !String(probe.assistantText ?? "").trim()) {
      throw new Error("founder_inference_probe_empty");
    }
    return await ctx.runMutation(
      internalRefs.founderInference.completeFounderInferenceActivationInternal,
      {
        userId,
        expectedKeyFingerprint: keyFingerprint,
        nowMs: Date.now(),
      },
    );
  },
});

export const suspendFounderInference = mutation({
  args: { authSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const grant = await getExistingFounderInferenceGrant(ctx, userId);
    if (!grant) throw new Error("founder_inference_grant_required");
    const nowMs = Date.now();
    await ctx.db.patch(grant._id as any, {
      status: "suspended",
      suspendedAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true, status: "suspended" };
  },
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
    ),
    expectedFounderGrantId: v.optional(v.id("founderInferenceGrants")),
    expectedFounderSubscriptionId: v.optional(v.id("founderSubscriptions")),
    claimToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const receiptKey = String(args.receiptKey ?? "").trim();
    const claimToken = String(args.claimToken ?? "").trim();
    if (!receiptKey || !claimToken) throw new Error("founder_inference_receipt_claim_required");

    const admission = await resolveCommunityInferenceFundingAdmission(ctx, args.communityId);
    const authorityMatches = admission.ok === true &&
      admission.mode === args.expectedFundingMode &&
      normalizedId(admission.payerUserId) === normalizedId(args.expectedPayerUserId) &&
      (admission.mode === "owner_api_key"
        ? normalizedId(admission.grantId) === normalizedId(args.expectedFounderGrantId)
        : normalizedId(admission.subscriptionId) === normalizedId(args.expectedFounderSubscriptionId));
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
      surface: "community_agent_mention",
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
    const admission = await resolveCommunityInferenceFundingAdmission(ctx, receipt.communityId);
    const authorityMatches = admission.ok === true &&
      admission.mode === receipt.fundingMode &&
      normalizedId(admission.payerUserId) === normalizedId(receipt.payerUserId) &&
      (admission.mode === "owner_api_key"
        ? normalizedId(admission.grantId) === normalizedId(receipt.founderGrantId)
        : normalizedId(admission.subscriptionId) === normalizedId(receipt.founderSubscriptionId));
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
