import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE,
  COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE,
  type CommunityInferenceFundingAdmission,
} from "../shared/founderInference";
import {
  FOUNDER_PAID_TOOL_PRICING_VERSION,
  founderPaidToolActionForTool,
  founderPaidToolReservationCostMicros,
  providerCostUsdToMicros,
  type FounderPaidToolAction,
  type FounderPaidToolName,
} from "../shared/founderPaidTools";
import {
  resolveCommunityInferenceFundingAdmission,
} from "./founderInferenceCore";
import {
  reserveFounderUsage,
  settleFounderUsageReservation,
} from "./founderPlanCore";
import { recordProviderCostEntry } from "./providerCostCore";
import {
  reserveOperatorGrantUsage,
  settleOperatorGrantUsageReservation,
} from "./operatorGrantUsageCore";
import { integrationReceiptIntentValidator, validIntegrationReceiptIntent,
  type IntegrationReceiptIntent } from "./communityIntegrationReceiptIntent";
import { requireCommunityChatAccess } from "./communityCore";
import { HUBSPOT_CONTACT_READ_SCOPE } from "./hubspotPilotContract";
import { integrationVerificationPilot, admittedIntegrationPilot } from "./integrationVerificationPilot";

const RECEIPT_LEASE_MS = 10 * 60_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const internalRefs = internal as any;

type MonetaryToolReceiptRow = {
  _id: any;
  receiptKey: string;
  sourceRunId: string;
  toolCallId: string;
  communityId: any;
  actorUserId: any;
  payerUserId: any;
  fundingMode: "platform_subscription" | "platform_operator_grant";
  founderSubscriptionId?: any;
  usageCycleId?: any;
  operatorUsageCycleId?: any;
  toolName: FounderPaidToolName;
  action: FounderPaidToolAction;
  status: "authorized" | "settled" | "failed" | "indeterminate";
  claimToken: string;
  leaseExpiresAt: number;
  providerStartedAt?: number;
  pricingVersion: string;
  reservedCostMicros: number;
  settledCostMicros?: number;
  provider?: string;
  outcomeCode?: string;
  failureCode?: string;
  authorizedAt: number;
  settledAt?: number;
  failedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type IncludedToolReceiptRow = Pick<MonetaryToolReceiptRow,
  "_id" | "receiptKey" | "sourceRunId" | "toolCallId" | "communityId" | "actorUserId" |
  "status" | "claimToken" | "leaseExpiresAt" | "providerStartedAt" | "outcomeCode" |
  "failureCode" | "authorizedAt" | "settledAt" | "failedAt" | "createdAt" | "updatedAt"
> & {
  fundingMode: "platform_included_allowance";
  pilotId: string; pilotExpiresAt: number; reservedOperations: 1;
  costEvidence: "unknown";
  integrationIntent: IntegrationReceiptIntent;
  toolName: "integration"; action: "verify_scopes";
};
export type FounderPaidToolReceiptRow = MonetaryToolReceiptRow | IncludedToolReceiptRow;

function pilotAllows(args: {communityId: unknown; actorUserId: unknown; integrationIntent: IntegrationReceiptIntent; nowMs: number}, pilot = integrationVerificationPilot()) {
  return args.integrationIntent.tool === "HUBSPOT_LIST_GRANTED_SCOPES"
    ? admittedIntegrationPilot({...args, authConfigId: args.integrationIntent.authConfigId}, pilot) : null;
}

async function finalizeIncluded(ctx: any, receipt: IncludedToolReceiptRow,
  outcome: "success" | "failed" | "unknown", nowMs: number) {
  if (receipt.status !== "authorized") return {ok: true, status: receipt.status, costEvidence: "unknown" as const, replayed: true};
  const status = outcome === "success" ? "settled" : outcome === "unknown" ? "indeterminate" : "failed";
  await ctx.db.patch(receipt._id, {status, outcomeCode: outcome, updatedAt: nowMs,
    ...(status === "settled" ? {settledAt: nowMs} : {failedAt: nowMs})});
  return {ok: true, status, costEvidence: "unknown" as const};
}

const toolNameValidator = v.union(v.literal("web_research"), v.literal("web_crawl"), v.literal("integration"));
const actionValidator = v.union(
  v.literal("search"),
  v.literal("open_page"),
  v.literal("find_in_page"),
  v.literal("crawl"),
  v.literal("read_contact"),
  v.literal("verify_scopes"),
);

async function integrationReceiptAccessAllowed(ctx: any, args: {
  communityId: any; actorUserId: any; integrationIntent: IntegrationReceiptIntent; nowMs: number;
}): Promise<boolean> {
  try {
    await requireCommunityChatAccess({ctx, communityId: args.communityId, userId: args.actorUserId});
    const [community, binding] = await Promise.all([
      ctx.db.get(args.communityId), ctx.db.get(args.integrationIntent.bindingId),
    ]);
    const i = args.integrationIntent;
    if (!community?.integrationReadPilotEnabled || !binding || binding.communityId !== args.communityId ||
      binding.ownerUserId !== args.actorUserId || binding.provider !== "composio" || binding.toolkit !== "hubspot" ||
      binding.connectedAccountId !== i.connectedAccountId || binding.providerUserId !== i.providerUserId ||
      binding.authConfigId !== i.authConfigId || binding.generation !== i.generation || binding.revokePending) return false;
    return i.tool === "HUBSPOT_READ_CONTACT"
      ? binding.status === "active" && binding.scopes.includes(HUBSPOT_CONTACT_READ_SCOPE)
      : binding.status === "pending" && binding.callbackClaimed === true && binding.expiresAt > args.nowMs;
  } catch { return false; }
}

function normalizedId(value: unknown): string {
  return String(value ?? "").trim();
}

function requireIdentifier(value: unknown, code: string, maxLength = 240): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > maxLength) throw new Error(code);
  return normalized;
}

function boundedCode(value: unknown, fallback: string): string {
  return String(value ?? "").trim().slice(0, 120) || fallback;
}

export async function getUniqueFounderPaidToolReceiptByKey(
  ctx: any,
  receiptKey: string,
): Promise<FounderPaidToolReceiptRow | null> {
  const normalized = requireIdentifier(
    receiptKey,
    "founder_paid_tool_receipt_key_invalid",
  );
  const rows = (await ctx.db
    .query("communityPaidToolReceipts" as any)
    .withIndex("by_receipt_key", (q: any) => q.eq("receiptKey", normalized))
    .take(2)) as FounderPaidToolReceiptRow[];
  if (rows.length > 1) throw new Error("founder_paid_tool_receipt_ambiguous");
  return rows[0] ?? null;
}

function receiptIntentMatches(args: {
  receipt: MonetaryToolReceiptRow;
  sourceRunId: string;
  toolCallId: string;
  communityId: unknown;
  actorUserId: unknown;
  toolName: FounderPaidToolName;
  action: FounderPaidToolAction;
}): boolean {
  return (
    args.receipt.sourceRunId === args.sourceRunId &&
    args.receipt.toolCallId === args.toolCallId &&
    normalizedId(args.receipt.communityId) === normalizedId(args.communityId) &&
    normalizedId(args.receipt.actorUserId) === normalizedId(args.actorUserId) &&
    args.receipt.toolName === args.toolName &&
    args.receipt.action === args.action
  );
}

function fundingAuthorityMatches(args: {
  admission: CommunityInferenceFundingAdmission;
  receipt: Pick<
    MonetaryToolReceiptRow,
    "fundingMode" | "payerUserId" | "founderSubscriptionId"
  >;
}): boolean {
  if (
    args.admission.ok === false ||
    args.admission.mode !== args.receipt.fundingMode ||
    normalizedId(args.admission.payerUserId) !== normalizedId(args.receipt.payerUserId)
  ) {
    return false;
  }
  if (args.admission.mode === "platform_subscription") {
    return normalizedId(args.admission.subscriptionId) ===
      normalizedId(args.receipt.founderSubscriptionId);
  }
  return !args.receipt.founderSubscriptionId;
}

async function settleReceiptReservation(args: {
  ctx: any;
  receipt: MonetaryToolReceiptRow;
  settledCostMicros: number;
  nowMs: number;
}): Promise<void> {
  if (args.receipt.fundingMode === "platform_operator_grant") {
    // Receipts created before the operator ledger existed carry no cycle.
    if (!args.receipt.operatorUsageCycleId) return;
    await settleOperatorGrantUsageReservation({
      ctx: args.ctx,
      operatorUsageCycleId: args.receipt.operatorUsageCycleId,
      communityId: args.receipt.communityId,
      reservedCostMicros: args.receipt.reservedCostMicros,
      settledCostMicros: args.settledCostMicros,
      nowMs: args.nowMs,
    });
    return;
  }
  if (args.receipt.fundingMode !== "platform_subscription") return;
  if (!args.receipt.usageCycleId || !args.receipt.founderSubscriptionId) {
    throw new Error("founder_paid_tool_receipt_authority_missing");
  }
  const [cycle, subscription] = await Promise.all([
    args.ctx.db.get(args.receipt.usageCycleId as any),
    args.ctx.db.get(args.receipt.founderSubscriptionId as any),
  ]);
  if (
    !cycle ||
    !subscription ||
    normalizedId(cycle.founderSubscriptionId) !== normalizedId(subscription._id) ||
    normalizedId(cycle.communityId) !== normalizedId(args.receipt.communityId) ||
    normalizedId(subscription.communityId) !== normalizedId(args.receipt.communityId) ||
    normalizedId(subscription.ownerUserId) !== normalizedId(args.receipt.payerUserId)
  ) {
    throw new Error("founder_paid_tool_usage_authority_mismatch");
  }
  await settleFounderUsageReservation({
    ctx: args.ctx,
    usageCycleId: args.receipt.usageCycleId,
    reservedCostMicros: args.receipt.reservedCostMicros,
    settledCostMicros: args.settledCostMicros,
    nowMs: args.nowMs,
  });
}

async function finalizeExpiredReceipt(args: {
  ctx: any;
  receipt: FounderPaidToolReceiptRow;
  nowMs: number;
}): Promise<void> {
  const providerStarted = args.receipt.providerStartedAt !== undefined;
  if (args.receipt.fundingMode === "platform_included_allowance") {
    await finalizeIncluded(args.ctx, args.receipt, providerStarted ? "unknown" : "failed", args.nowMs);
    return;
  }
  await settleReceiptReservation({
    ctx: args.ctx,
    receipt: args.receipt,
    settledCostMicros: providerStarted ? args.receipt.reservedCostMicros : 0,
    nowMs: args.nowMs,
  });
  await args.ctx.db.patch(args.receipt._id as any, {
    status: providerStarted ? "indeterminate" : "failed",
    settledCostMicros: providerStarted ? args.receipt.reservedCostMicros : 0,
    failureCode: providerStarted
      ? "paid_tool_provider_outcome_unknown"
      : "paid_tool_authorization_expired_before_provider",
    failedAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

export const claimFounderPaidToolReceiptInternal = internalMutation({
  args: {
    receiptKey: v.string(),
    sourceRunId: v.string(),
    toolCallId: v.string(),
    communityId: v.id("communities"),
    actorUserId: v.id("users"),
    toolName: toolNameValidator,
    action: actionValidator,
    integrationIntent: v.optional(integrationReceiptIntentValidator),
    claimToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const receiptKey = requireIdentifier(
      args.receiptKey,
      "founder_paid_tool_receipt_key_invalid",
    );
    const sourceRunId = requireIdentifier(
      args.sourceRunId,
      "founder_paid_tool_source_run_invalid",
    );
    const toolCallId = requireIdentifier(
      args.toolCallId,
      "founder_paid_tool_call_id_invalid",
    );
    const claimToken = requireIdentifier(
      args.claimToken,
      "founder_paid_tool_claim_token_invalid",
      128,
    );
    if (args.toolName === "integration" ? !validIntegrationReceiptIntent(args.integrationIntent, args.action, sourceRunId, toolCallId)
      : args.integrationIntent !== undefined || founderPaidToolActionForTool({...args, toolName: args.toolName}) !== args.action) {
      throw new Error("founder_paid_tool_action_invalid");
    }

    if (args.toolName === "integration") {
      if (!await integrationReceiptAccessAllowed(ctx, {...args, integrationIntent: args.integrationIntent!}))
        return {ok: false, errorCode: "integration_access_denied"};
      const pilot = pilotAllows({...args, integrationIntent: args.integrationIntent!});
      if (!pilot || args.action !== "verify_scopes")
        return {ok: false, errorCode: "integration_funding_policy_unavailable"};
      if (await getUniqueFounderPaidToolReceiptByKey(ctx, receiptKey))
        return {ok: false, errorCode: "founder_paid_tool_receipt_conflict"};
      // Convex serializes this indexed range read with insertion: one total slot
      // per pilot, across every attempt and terminal outcome. Never replenished.
      if (await ctx.db.query("communityPaidToolReceipts").withIndex("by_pilot", (q: any) => q.eq("pilotId", pilot.id)).first())
        return {ok: false, errorCode: "integration_pilot_exhausted"};
      const leaseExpiresAt = Math.min(pilot.expiresAt, args.nowMs + RECEIPT_LEASE_MS);
      const receiptId = await ctx.db.insert("communityPaidToolReceipts", {
        receiptKey, sourceRunId, toolCallId, communityId: args.communityId, actorUserId: args.actorUserId,
        fundingMode: "platform_included_allowance", pilotId: pilot.id, pilotExpiresAt: pilot.expiresAt,
        reservedOperations: 1, costEvidence: "unknown", integrationIntent: args.integrationIntent!,
        toolName: "integration", action: "verify_scopes", status: "authorized", claimToken,
        leaseExpiresAt, authorizedAt: args.nowMs, createdAt: args.nowMs, updatedAt: args.nowMs,
      });
      await ctx.scheduler.runAfter(Math.max(0, leaseExpiresAt - args.nowMs),
        internalRefs.founderPaidTools.expireFounderPaidToolReceiptInternal,
        {receiptKey, claimToken, nowMs: leaseExpiresAt});
      return {ok: true, receiptId, fundingMode: "platform_included_allowance", reservedOperations: 1};
    }
    if (args.action === "read_contact" || args.action === "verify_scopes")
      throw new Error("founder_paid_tool_action_invalid");

    const existing = await getUniqueFounderPaidToolReceiptByKey(ctx, receiptKey);
    if (existing) {
      if (existing.fundingMode === "platform_included_allowance")
        return {ok: false, errorCode: "founder_paid_tool_receipt_conflict"};
      if (!receiptIntentMatches({
        receipt: existing,
        sourceRunId,
        toolCallId,
        communityId: args.communityId,
        actorUserId: args.actorUserId,
        toolName: args.toolName,
        action: args.action,
      })) {
        return { ok: false, errorCode: "founder_paid_tool_receipt_conflict" };
      }
      if (existing.status === "authorized" && existing.leaseExpiresAt <= args.nowMs) {
        await finalizeExpiredReceipt({ ctx, receipt: existing, nowMs: args.nowMs });
        return { ok: false, errorCode: "founder_paid_tool_receipt_expired" };
      }
      return {
        ok: false,
        errorCode:
          existing.status === "authorized"
            ? "founder_paid_tool_receipt_in_progress"
            : `founder_paid_tool_receipt_${existing.status}`,
      };
    }

    const reservationCostMicros = founderPaidToolReservationCostMicros(args.action);
    const admission = await resolveCommunityInferenceFundingAdmission(
      ctx,
      args.communityId,
      args.nowMs,
    );
    if (admission.ok === false) {
      return { ok: false, errorCode: admission.code };
    }

    const sinceMs = args.nowMs - RATE_LIMIT_WINDOW_MS;
    const [actorRows, communityRows] = await Promise.all([
      ctx.db
        .query("communityPaidToolReceipts" as any)
        .withIndex("by_actor_community_createdAt", (q: any) =>
          q
            .eq("actorUserId", args.actorUserId)
            .eq("communityId", args.communityId)
            .gte("createdAt", sinceMs),
        )
        .take(COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE),
      ctx.db
        .query("communityPaidToolReceipts" as any)
        .withIndex("by_community_createdAt", (q: any) =>
          q.eq("communityId", args.communityId).gte("createdAt", sinceMs),
        )
        .take(COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE),
    ]);
    if (actorRows.length >= COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE) {
      return { ok: false, errorCode: "founder_paid_tool_actor_rate_limited" };
    }
    if (communityRows.length >= COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE) {
      return { ok: false, errorCode: "founder_paid_tool_community_rate_limited" };
    }

    let usageCycleId: any | undefined;
    let operatorUsageCycleId: any | undefined;
    let reservedCostMicros = 0;
    if (admission.mode === "platform_operator_grant") {
      const reservation = await reserveOperatorGrantUsage({
        ctx,
        communityId: args.communityId,
        reservationCostMicros,
        nowMs: args.nowMs,
      });
      if (!reservation.ok) return { ok: false, errorCode: reservation.code };
      operatorUsageCycleId = reservation.cycle._id;
      reservedCostMicros = reservation.reservationCostMicros;
    }
    if (admission.mode === "platform_subscription") {
      const reservation = await reserveFounderUsage({
        ctx,
        founderSubscriptionId: admission.subscriptionId,
        communityId: args.communityId,
        reservationCostMicros,
        nowMs: args.nowMs,
      });
      if (!reservation.ok) return { ok: false, errorCode: reservation.code };
      usageCycleId = reservation.cycle._id;
      reservedCostMicros = reservation.reservationCostMicros;
    }

    const receiptId = await ctx.db.insert("communityPaidToolReceipts" as any, {
      receiptKey,
      sourceRunId,
      toolCallId,
      communityId: args.communityId,
      actorUserId: args.actorUserId,
      payerUserId: admission.payerUserId,
      fundingMode: admission.mode,
      ...(admission.mode === "platform_subscription"
        ? { founderSubscriptionId: admission.subscriptionId }
        : {}),
      usageCycleId,
      operatorUsageCycleId,
      toolName: args.toolName,
      action: args.action,
      status: "authorized",
      claimToken,
      leaseExpiresAt: args.nowMs + RECEIPT_LEASE_MS,
      pricingVersion: FOUNDER_PAID_TOOL_PRICING_VERSION,
      reservedCostMicros,
      authorizedAt: args.nowMs,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    await ctx.scheduler.runAfter(
      RECEIPT_LEASE_MS,
      internalRefs.founderPaidTools.expireFounderPaidToolReceiptInternal,
      { receiptKey, claimToken, nowMs: args.nowMs + RECEIPT_LEASE_MS },
    );
    return {
      ok: true,
      receiptId,
      fundingMode: admission.mode,
      reservationCostMicros: reservedCostMicros,
    };
  },
});

export const markFounderPaidToolProviderStartedInternal = internalMutation({
  args: {
    receiptKey: v.string(),
    claimToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const receipt = await getUniqueFounderPaidToolReceiptByKey(ctx, args.receiptKey);
    if (!receipt || receipt.claimToken !== args.claimToken) {
      return { ok: false, errorCode: "founder_paid_tool_receipt_claim_invalid" };
    }
    if (receipt.status !== "authorized") {
      return { ok: false, errorCode: `founder_paid_tool_receipt_${receipt.status}` };
    }
    if (receipt.providerStartedAt !== undefined) {
      return { ok: true, providerStarted: true, replayed: true, dispatchAuthorized: false };
    }
    if (receipt.leaseExpiresAt <= args.nowMs) {
      await finalizeExpiredReceipt({ ctx, receipt, nowMs: args.nowMs });
      return { ok: false, errorCode: "founder_paid_tool_receipt_expired" };
    }
    if (receipt.fundingMode === "platform_included_allowance") {
      const pilot = pilotAllows({...receipt, nowMs: args.nowMs});
      if (!pilot || pilot.id !== receipt.pilotId || pilot.expiresAt !== receipt.pilotExpiresAt ||
        !await integrationReceiptAccessAllowed(ctx, {...receipt, nowMs: args.nowMs})) {
        await finalizeIncluded(ctx, receipt, "failed", args.nowMs);
        return {ok: false, errorCode: "integration_access_denied"};
      }
      await ctx.db.patch(receipt._id, {providerStartedAt: args.nowMs, updatedAt: args.nowMs});
      return {ok: true, dispatchAuthorized: true};
    }
    const admission = await resolveCommunityInferenceFundingAdmission(
      ctx,
      receipt.communityId,
      args.nowMs,
    );
    if (!fundingAuthorityMatches({ admission, receipt })) {
      await settleReceiptReservation({
        ctx,
        receipt,
        settledCostMicros: 0,
        nowMs: args.nowMs,
      });
      await ctx.db.patch(receipt._id as any, {
        status: "failed",
        settledCostMicros: 0,
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
    return { ok: true, dispatchAuthorized: true };
  },
});

export const settleFounderPaidToolReceiptInternal = internalMutation({
  args: {
    receiptKey: v.string(),
    claimToken: v.string(),
    rawVendorCostUsd: v.number(),
    provider: v.string(),
    evidence: v.union(
      v.literal("estimated"),
      v.literal("provider_reported"),
      v.literal("exact"),
    ),
    metadata: v.optional(v.any()),
    outcomeCode: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const receipt = await getUniqueFounderPaidToolReceiptByKey(ctx, args.receiptKey);
    if (!receipt || receipt.claimToken !== args.claimToken) {
      return { ok: false, errorCode: "founder_paid_tool_receipt_claim_invalid" };
    }
    if (receipt.fundingMode === "platform_included_allowance")
      return {ok: false, errorCode: "integration_monetary_settlement_forbidden"};
    if (receipt.status === "settled" || receipt.status === "indeterminate") {
      return {
        ok: true,
        status: receipt.status,
        settledCostMicros: receipt.settledCostMicros ?? 0,
        replayed: true,
      };
    }
    if (receipt.status !== "authorized") {
      return { ok: false, errorCode: `founder_paid_tool_receipt_${receipt.status}` };
    }
    if (receipt.providerStartedAt === undefined) {
      return { ok: false, errorCode: "founder_paid_tool_provider_not_started" };
    }
    const providerCostMicros = providerCostUsdToMicros(args.rawVendorCostUsd);
    const exceedsReservation = providerCostMicros > receipt.reservedCostMicros;
    const settledCostMicros = exceedsReservation
      ? receipt.reservedCostMicros
      : providerCostMicros;
    const provider = String(args.provider ?? "").trim().slice(0, 80) || "unknown";
    const providerCostKey = `platform_tool:${receipt.receiptKey}:provider_cost`;
    await recordProviderCostEntry(
      ctx,
      {
        costKey: providerCostKey,
        userId: receipt.actorUserId,
        communityId: receipt.communityId,
        runId: receipt.sourceRunId,
        category: "web",
        component:
          receipt.toolName === "web_crawl"
            ? "web_crawl_provider_call"
            : "web_research_call",
        provider,
        periodStart: receipt.providerStartedAt,
        periodEnd: args.nowMs,
        quantityKind: "call",
        quantity: 1,
        rawVendorCostUsd: args.rawVendorCostUsd,
        evidence: args.evidence,
        billingDisposition:
          receipt.fundingMode === "platform_subscription"
            ? "rolled_into_user_usage"
            : "platform_absorbed",
        linkedCreditKey: receipt.receiptKey,
        metadata: {
          ...(args.metadata && typeof args.metadata === "object" && !Array.isArray(args.metadata)
            ? args.metadata
            : {}),
          founder_paid_tool_receipt_key: receipt.receiptKey,
          founder_paid_tool_pricing_version: receipt.pricingVersion,
          founder_paid_tool_action: receipt.action,
          founder_paid_tool_reserved_cost_micros: receipt.reservedCostMicros,
          provider_cost_source: "founder_paid_tool_settlement",
        },
        nowMs: args.nowMs,
      },
      { failOnIdentityMismatch: true },
    );
    await settleReceiptReservation({
      ctx,
      receipt,
      settledCostMicros,
      nowMs: args.nowMs,
    });
    const status = exceedsReservation ? "indeterminate" : "settled";
    await ctx.db.patch(receipt._id as any, {
      status,
      settledCostMicros,
      provider,
      outcomeCode: boundedCode(args.outcomeCode, "completed"),
      failureCode: exceedsReservation ? "paid_tool_cost_exceeds_reservation" : undefined,
      ...(exceedsReservation ? { failedAt: args.nowMs } : { settledAt: args.nowMs }),
      updatedAt: args.nowMs,
    });
    return { ok: true, status, settledCostMicros };
  },
});

export const finalizeFounderPaidToolFailureInternal = internalMutation({
  args: {
    receiptKey: v.string(),
    claimToken: v.string(),
    failureCode: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const receipt = await getUniqueFounderPaidToolReceiptByKey(ctx, args.receiptKey);
    if (!receipt || receipt.claimToken !== args.claimToken) {
      return { ok: false, errorCode: "founder_paid_tool_receipt_claim_invalid" };
    }
    if (receipt.fundingMode === "platform_included_allowance")
      return finalizeIncluded(ctx, receipt, receipt.providerStartedAt !== undefined ? "unknown" : "failed", args.nowMs);
    if (receipt.status === "failed" || receipt.status === "indeterminate") {
      return {
        ok: true,
        status: receipt.status,
        settledCostMicros: receipt.settledCostMicros ?? 0,
        replayed: true,
      };
    }
    if (receipt.status !== "authorized") {
      return { ok: false, errorCode: `founder_paid_tool_receipt_${receipt.status}` };
    }
    const providerStarted = receipt.providerStartedAt !== undefined;
    const settledCostMicros = providerStarted ? receipt.reservedCostMicros : 0;
    await settleReceiptReservation({
      ctx,
      receipt,
      settledCostMicros,
      nowMs: args.nowMs,
    });
    const status = providerStarted ? "indeterminate" : "failed";
    await ctx.db.patch(receipt._id as any, {
      status,
      settledCostMicros,
      failureCode: boundedCode(args.failureCode, "paid_tool_provider_error"),
      failedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { ok: true, status, settledCostMicros };
  },
});

// Records operation outcome only. It neither activates a connection nor asserts
// a monetary cost; activation still requires the existing identity/scope checks.
export const finalizeIntegrationVerificationReceiptInternal = internalMutation({
  args: {receiptKey: v.string(), claimToken: v.string(),
    outcome: v.union(v.literal("success"), v.literal("failed"), v.literal("unknown")), nowMs: v.number()},
  handler: async (ctx, args) => {
    const receipt = await getUniqueFounderPaidToolReceiptByKey(ctx, args.receiptKey);
    if (!receipt || receipt.claimToken !== args.claimToken || receipt.fundingMode !== "platform_included_allowance")
      return {ok: false, errorCode: "founder_paid_tool_receipt_claim_invalid"};
    if (receipt.status === "authorized" && receipt.leaseExpiresAt <= args.nowMs) {
      await finalizeExpiredReceipt({ctx, receipt, nowMs: args.nowMs});
      return {ok: false, errorCode: "founder_paid_tool_receipt_expired"};
    }
    if (args.outcome === "success" && receipt.providerStartedAt === undefined)
      return {ok: false, errorCode: "founder_paid_tool_provider_not_started"};
    return finalizeIncluded(ctx, receipt, args.outcome, args.nowMs);
  },
});

export const expireFounderPaidToolReceiptInternal = internalMutation({
  args: {
    receiptKey: v.string(),
    claimToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const receipt = await getUniqueFounderPaidToolReceiptByKey(ctx, args.receiptKey);
    if (
      !receipt ||
      receipt.status !== "authorized" ||
      receipt.claimToken !== args.claimToken ||
      receipt.leaseExpiresAt > args.nowMs
    ) {
      return { ok: true, expired: false };
    }
    await finalizeExpiredReceipt({ ctx, receipt, nowMs: args.nowMs });
    return { ok: true, expired: true };
  },
});
