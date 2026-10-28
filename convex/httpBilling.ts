import { internal } from "./_generated/api";
import {
  getStripeClient,
  verifyStripeWebhookSignature,
} from "./stripeCore";
import Stripe from "stripe";
import type { PublicHttpAction } from "convex/server";
import { logStructuredError } from "./errorLogging";
import { buildStripeConnectAccountSnapshot } from "./stripeConnectAccountCore";
import { normalizeStripeCommunitySubscriptionStatus } from "./billingCore";
import { requireCommunityProviderAccountMatch } from "./communityCommerceCore";
import { calculateApplicationFeeRefundAllocation } from "./communityApplicationFeeRefundCore";
import {
  FOUNDER_CHECKOUT_RECOVERY_EMAIL_HASH_VERSION,
  hashFounderCheckoutRecoveryEmail,
  normalizeFounderCheckoutRecoveryEmail,
} from "./founderCheckoutReceiptCore";
import { enqueueFounderCheckoutRecoveryEmailInternal } from "./emailEvents";

type HttpRouteMethod = "GET" | "POST" | "DELETE" | "OPTIONS" | "PUT" | "PATCH";

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: HttpRouteMethod;
    handler: PublicHttpAction;
  }) => void;
};

type HttpActionLike = (
  handler: (ctx: unknown, req: Request) => Promise<Response>,
) => PublicHttpAction;

type RegisterRuntimeBillingRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: (req: Request, status: number, payload: unknown) => Response;
  optionsResponse: (req: Request) => Response;
};

async function recordStripeWebhookAudit(
  ctx: any,
  args: {
    eventKey: string;
    eventType: "stripe_webhook_received" | "stripe_webhook_processed" | "stripe_webhook_failed";
    severity?: "info" | "warning" | "error";
    status: "started" | "succeeded" | "failed" | "ignored";
    stripeEventType?: string | null;
    stripeEventId?: string | null;
    providerObjectId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.criticalAudit.recordCriticalAuditEventInternal as any, {
      eventKey: args.eventKey,
      eventType: args.eventType,
      severity: args.severity ?? "info",
      status: args.status,
      provider: "stripe",
      providerObjectId: args.providerObjectId ?? args.stripeEventId ?? null,
      metadata: {
        stripeEventType: args.stripeEventType ?? null,
        stripeEventId: args.stripeEventId ?? null,
        ...(args.metadata ?? {}),
      },
      createdAt: Date.now(),
    });
  } catch (error) {
    console.error("stripe_webhook_audit_record_failed", {
      eventType: args.eventType,
      stripeEventType: args.stripeEventType,
      stripeEventId: args.stripeEventId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function readStripeSignature(req: Request): string | null {
  const signature = String(req.headers.get("stripe-signature") ?? "").trim();
  return signature || null;
}

function readStripeMetadataString(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readStripeLocalSessionIdFromCheckoutSession(
  session: Stripe.Checkout.Session,
): string | null {
  const clientReferenceId = String(session.client_reference_id ?? "").trim();
  if (clientReferenceId) return clientReferenceId;
  return readStripeMetadataString(session.metadata, "local_session_id");
}

async function readFounderCheckoutRecoveryEmail(
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const checkoutEmail = String(session.customer_details?.email ?? "").trim();
  if (checkoutEmail) return normalizeFounderCheckoutRecoveryEmail(checkoutEmail);
  if (session.customer && typeof session.customer !== "string") {
    const expandedEmail = String((session.customer as Stripe.Customer).email ?? "").trim();
    if (expandedEmail) return normalizeFounderCheckoutRecoveryEmail(expandedEmail);
  }
  const customerId = typeof session.customer === "string" ? session.customer : null;
  if (!customerId) return null;
  const customer = await getStripeClient().customers.retrieve(customerId);
  if (customer.deleted) return null;
  const customerEmail = String(customer.email ?? "").trim();
  return customerEmail ? normalizeFounderCheckoutRecoveryEmail(customerEmail) : null;
}

function readStripeInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parentSubscription = (invoice.parent as any)?.subscription_details?.subscription;
  if (typeof parentSubscription === "string" && parentSubscription.trim()) {
    return parentSubscription.trim();
  }
  const legacySubscription = (invoice as any)?.subscription;
  if (typeof legacySubscription === "string" && legacySubscription.trim()) {
    return legacySubscription.trim();
  }
  return null;
}

function readStripeObjectId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function readStripeInvoiceEvidence(invoice: Stripe.Invoice | null | undefined): {
  sourceProviderInvoiceId: string | null;
  sourceProviderPaymentIntentId: string | null;
  sourceProviderChargeId: string | null;
} {
  if (!invoice) {
    return {
      sourceProviderInvoiceId: null,
      sourceProviderPaymentIntentId: null,
      sourceProviderChargeId: null,
    };
  }
  const latestCharge = readStripeObjectId((invoice as any).latest_charge);
  const directCharge = readStripeObjectId((invoice as any).charge);
  const directPaymentIntent = readStripeObjectId((invoice as any).payment_intent);
  const firstInvoicePayment = (invoice as any)?.payments?.data?.[0]?.payment;
  return {
    sourceProviderInvoiceId: readStripeObjectId(invoice),
    sourceProviderPaymentIntentId:
      directPaymentIntent ||
      readStripeObjectId(firstInvoicePayment?.payment_intent) ||
      null,
    sourceProviderChargeId:
      latestCharge ||
      directCharge ||
      readStripeObjectId((invoice as any).payment_intent?.latest_charge) ||
      readStripeObjectId(firstInvoicePayment?.charge) ||
      null,
  };
}

function readStripeSubscriptionLatestInvoice(subscription: Stripe.Subscription): Stripe.Invoice | null {
  const latestInvoice = (subscription as any)?.latest_invoice;
  if (latestInvoice && typeof latestInvoice === "object") return latestInvoice as Stripe.Invoice;
  return null;
}

function readStripeChargeEvidence(charge: Stripe.Charge): {
  sourceProviderChargeId: string | null;
  sourceProviderPaymentIntentId: string | null;
  sourceProviderInvoiceId: string | null;
} {
  return {
    sourceProviderChargeId: readStripeObjectId(charge),
    sourceProviderPaymentIntentId: readStripeObjectId((charge as any).payment_intent),
    sourceProviderInvoiceId: readStripeObjectId((charge as any).invoice),
  };
}

function readStripeRefundEvidence(refund: Stripe.Refund): {
  sourceProviderRefundId: string | null;
  sourceProviderChargeId: string | null;
  sourceProviderPaymentIntentId: string | null;
} {
  return {
    sourceProviderRefundId: readStripeObjectId(refund),
    sourceProviderChargeId: readStripeObjectId((refund as any).charge),
    sourceProviderPaymentIntentId: readStripeObjectId((refund as any).payment_intent),
  };
}

function readStripeDisputeEvidence(dispute: Stripe.Dispute): {
  sourceProviderDisputeId: string | null;
  sourceProviderChargeId: string | null;
  sourceProviderPaymentIntentId: string | null;
} {
  return {
    sourceProviderDisputeId: readStripeObjectId(dispute),
    sourceProviderChargeId: readStripeObjectId((dispute as any).charge),
    sourceProviderPaymentIntentId: readStripeObjectId((dispute as any).payment_intent),
  };
}

function stripeResourceMissing(error: any): boolean {
  return error?.statusCode === 404 || error?.code === "resource_missing";
}

async function retrieveStripeChargeForEvidence(
  chargeId: string | null,
  providerAccountId?: string | null,
): Promise<Stripe.Charge | null> {
  if (!chargeId) return null;
  try {
    return await getStripeClient().charges.retrieve(
      chargeId,
      {},
      providerAccountId ? { stripeAccount: providerAccountId } : undefined,
    );
  } catch (error: any) {
    if (stripeResourceMissing(error)) return null;
    throw error;
  }
}

async function listStripeRefundsForConnectedCharge(args: {
  providerAccountId: string;
  providerChargeId: string;
}): Promise<Stripe.Refund[]> {
  const stripe = getStripeClient();
  const refunds: Stripe.Refund[] = [];
  let startingAfter: string | undefined;
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const page = await stripe.refunds.list(
      {
        charge: args.providerChargeId,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      { stripeAccount: args.providerAccountId },
    );
    refunds.push(...page.data);
    if (!page.has_more) return refunds;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }
  throw new Error("stripe_charge_refund_scan_truncated");
}

function stripeRefundStatusIsSucceeded(refund: Stripe.Refund): boolean {
  return String((refund as any)?.status ?? "").trim().toLowerCase() === "succeeded";
}

async function reverseCommunityApplicationFeesForRefund(args: {
  ctx: any;
  event: Stripe.Event;
  refund: Stripe.Refund;
  charge: Stripe.Charge | null;
}): Promise<Record<string, unknown>> {
  const providerAccountId = readStripeEventAccountId(args.event);
  if (!providerAccountId) {
    return { ok: true, ignored: true, reason: "application_fee_refund_platform_event" };
  }
  if (!args.charge || !stripeRefundStatusIsSucceeded(args.refund)) {
    return { ok: true, ignored: true, reason: "application_fee_refund_not_succeeded" };
  }
  const providerChargeId = readStripeObjectId(args.charge.id);
  const targetProviderRefundId = readStripeObjectId(args.refund.id);
  const providerApplicationFeeId = readStripeObjectId((args.charge as any).application_fee);
  if (!providerChargeId || !targetProviderRefundId || !providerApplicationFeeId) {
    return { ok: true, ignored: true, reason: "application_fee_refund_identity_missing" };
  }
  const providerSubscriptionId = await resolveStripeSubscriptionIdFromCharge(
    args.charge,
    providerAccountId,
  );
  if (!providerSubscriptionId) {
    return { ok: true, ignored: true, reason: "application_fee_refund_subscription_missing" };
  }
  const communitySubscription = await args.ctx.runQuery(
    internal.communityCommerce.getCommunitySubscriptionByProviderSubscriptionIdInternal as any,
    { providerAccountId, providerSubscriptionId },
  );
  if (!communitySubscription?.communityId) {
    return { ok: true, ignored: true, reason: "application_fee_refund_not_community_commerce" };
  }

  const lockClaimToken = crypto.randomUUID();
  const lock = await args.ctx.runMutation(
    (internal as any).communityApplicationFeeRefunds
      .claimCommunityApplicationFeeRefundLockInternal,
    {
      providerAccountId,
      providerApplicationFeeId,
      claimToken: lockClaimToken,
      nowMs: Date.now(),
    },
  );
  if (!lock?.ok) {
    throw new Error(lock?.errorCode ?? "community_application_fee_refund_lock_busy");
  }

  try {
    const applicationFee = await getStripeClient().applicationFees.retrieve(
      providerApplicationFeeId,
    );
    if (
      readStripeObjectId((applicationFee as any).account) !== providerAccountId ||
      readStripeObjectId((applicationFee as any).charge) !== providerChargeId ||
      String(applicationFee.currency ?? "").trim().toLowerCase() !==
        String(args.charge.currency ?? "").trim().toLowerCase()
    ) {
      throw new Error("community_application_fee_refund_provider_identity_mismatch");
    }
    const applicationFeeAmountBaseUnits = Math.max(
      0,
      Math.floor(Number(applicationFee.amount ?? 0)),
    );
    const refunds = (await listStripeRefundsForConnectedCharge({
      providerAccountId,
      providerChargeId,
    }))
      .filter(stripeRefundStatusIsSucceeded)
      .sort((left, right) =>
        Number(left.created ?? 0) - Number(right.created ?? 0) || left.id.localeCompare(right.id),
      );
    if (!refunds.some((refund) => refund.id === targetProviderRefundId)) {
      return { ok: true, ignored: true, reason: "application_fee_target_refund_not_succeeded" };
    }

    const processed: Array<Record<string, unknown>> = [];
    for (const refund of refunds) {
      const allocationAmountBaseUnits = calculateApplicationFeeRefundAllocation({
        chargeAmountBaseUnits: Number(args.charge.amount ?? 0),
        applicationFeeAmountBaseUnits,
        targetRefundId: refund.id,
        refunds: refunds.map((row) => ({
          id: row.id,
          amount: Number(row.amount ?? 0),
          created: Number(row.created ?? 0),
          status: String((row as any)?.status ?? "") || null,
        })),
      });
      if (allocationAmountBaseUnits <= 0) continue;

      const existingRows = await args.ctx.runQuery(
        (internal as any).communityApplicationFeeRefunds
          .listCommunityApplicationFeeRefundsInternal,
        { providerApplicationFeeId },
      ) as Array<{
        providerRefundId?: string;
        amountBaseUnits?: number;
        requestedProviderRefundAmountBaseUnits?: number;
        status?: string;
      }>;
      const existing = existingRows.find((row) => row.providerRefundId === refund.id);
      if (existing?.status === "succeeded") {
        processed.push({ provider_refund_id: refund.id, duplicate: true });
        continue;
      }

      let requestedProviderRefundAmountBaseUnits = Number(
        existing?.requestedProviderRefundAmountBaseUnits,
      );
      if (!Number.isFinite(requestedProviderRefundAmountBaseUnits)) {
        const applicationFee = await getStripeClient().applicationFees.retrieve(
          providerApplicationFeeId,
        );
        const accountedRefundAmount = existingRows
          .filter((row) => row.status === "succeeded")
          .reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.amountBaseUnits ?? 0))), 0);
        const externallyCoveredAmount = Math.max(
          0,
          Math.floor(Number(applicationFee.amount_refunded ?? 0)) - accountedRefundAmount,
        );
        requestedProviderRefundAmountBaseUnits = Math.max(
          0,
          allocationAmountBaseUnits - Math.min(allocationAmountBaseUnits, externallyCoveredAmount),
        );
      }
      requestedProviderRefundAmountBaseUnits = Math.max(
        0,
        Math.floor(requestedProviderRefundAmountBaseUnits),
      );

      const claimToken = crypto.randomUUID();
      const claim = await args.ctx.runMutation(
        (internal as any).communityApplicationFeeRefunds
          .claimCommunityApplicationFeeRefundInternal,
        {
          providerAccountId,
          providerChargeId,
          providerApplicationFeeId,
          providerRefundId: refund.id,
          amountBaseUnits: allocationAmountBaseUnits,
          requestedProviderRefundAmountBaseUnits,
          currency: String(args.charge.currency ?? "").trim().toLowerCase(),
          claimToken,
          nowMs: Date.now(),
        },
      );
      if (!claim?.ok) throw new Error(claim?.errorCode ?? "community_application_fee_refund_claim_failed");
      if (claim.completed) {
        processed.push({ provider_refund_id: refund.id, duplicate: true });
        continue;
      }

      let providerApplicationFeeRefundId: string | undefined;
      try {
        if (requestedProviderRefundAmountBaseUnits > 0) {
          const feeRefund = await getStripeClient().applicationFees.createRefund(
            providerApplicationFeeId,
            { amount: requestedProviderRefundAmountBaseUnits },
            {
              idempotencyKey:
                `community-application-fee-refund:${providerAccountId}:${refund.id}`,
            },
          );
          providerApplicationFeeRefundId = feeRefund.id;
        }
        await args.ctx.runMutation(
          (internal as any).communityApplicationFeeRefunds
            .completeCommunityApplicationFeeRefundInternal,
          {
            providerAccountId,
            providerRefundId: refund.id,
            claimToken,
            providerApplicationFeeRefundId,
            providerRefundedAmountBaseUnits: requestedProviderRefundAmountBaseUnits,
            nowMs: Date.now(),
          },
        );
      } catch (error) {
        await args.ctx.runMutation(
          (internal as any).communityApplicationFeeRefunds
            .failCommunityApplicationFeeRefundInternal,
          {
            providerAccountId,
            providerRefundId: refund.id,
            claimToken,
            failureCode: error instanceof Error ? error.message : String(error),
            disposition: "indeterminate",
            nowMs: Date.now(),
          },
        );
        throw error;
      }
      processed.push({
        provider_refund_id: refund.id,
        application_fee_refund_id: providerApplicationFeeRefundId ?? null,
        allocation_amount_base_units: allocationAmountBaseUnits,
        provider_refunded_amount_base_units: requestedProviderRefundAmountBaseUnits,
      });
    }
    return {
      ok: true,
      provider_account_id: providerAccountId,
      provider_application_fee_id: providerApplicationFeeId,
      processed,
    };
  } finally {
    await args.ctx.runMutation(
      (internal as any).communityApplicationFeeRefunds
        .releaseCommunityApplicationFeeRefundLockInternal,
      {
        providerApplicationFeeId,
        claimToken: lockClaimToken,
        nowMs: Date.now(),
      },
    );
  }
}

async function retrieveStripeInvoiceForEvidence(
  invoiceId: string | null,
  providerAccountId?: string | null,
): Promise<Stripe.Invoice | null> {
  if (!invoiceId) return null;
  try {
    return await getStripeClient().invoices.retrieve(
      invoiceId,
      {},
      providerAccountId ? { stripeAccount: providerAccountId } : undefined,
    );
  } catch (error: any) {
    if (stripeResourceMissing(error)) return null;
    throw error;
  }
}

function toStripeTimestampMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return null;
  return Math.floor(value * 1000);
}

function readStripeSubscriptionCycle(subscription: Stripe.Subscription): {
  cycleStartedAt: number | null;
  cycleEndsAt: number | null;
} {
  const firstItem = subscription.items?.data?.[0] as
    | {
        current_period_start?: unknown;
        current_period_end?: unknown;
      }
    | undefined;
  const itemCycleStartedAt = toStripeTimestampMs(
    firstItem?.current_period_start,
  );
  const itemCycleEndsAt = toStripeTimestampMs(firstItem?.current_period_end);
  if (itemCycleStartedAt && itemCycleEndsAt) {
    return {
      cycleStartedAt: itemCycleStartedAt,
      cycleEndsAt: itemCycleEndsAt,
    };
  }
  return {
    cycleStartedAt: toStripeTimestampMs(
      (subscription as any)?.current_period_start,
    ),
    cycleEndsAt: toStripeTimestampMs((subscription as any)?.current_period_end),
  };
}

function readStripePaymentReady(raw: unknown): boolean {
  const paymentStatus = String(raw ?? "")
    .trim()
    .toLowerCase();
  return paymentStatus === "paid" || paymentStatus === "no_payment_required";
}

function readStripeEventCreatedAtMs(event: Stripe.Event): number {
  return Number(event.created ?? 0) > 0 ? Number(event.created) * 1000 : Date.now();
}

function readStripeEventAccountId(event: Stripe.Event): string | null {
  const providerAccountId = String(event.account ?? "").trim();
  return providerAccountId || null;
}

function toIsoStringOrUndefined(ms: number | null): string | undefined {
  return typeof ms === "number" && Number.isFinite(ms)
    ? new Date(ms).toISOString()
    : undefined;
}

function stripeRefundFullyRefundsCharge(refund: Stripe.Refund, charge: Stripe.Charge | null): boolean {
  const chargeAmount = Number(charge?.amount ?? 0);
  if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) return false;
  const totalRefunded = Number((charge as any)?.amount_refunded ?? 0);
  if (Number.isFinite(totalRefunded) && totalRefunded >= chargeAmount) return true;
  const refundAmount = Number(refund.amount ?? 0);
  return Number.isFinite(refundAmount) && refundAmount >= chargeAmount;
}

async function retrieveStripeSubscriptionForEvidence(
  subscriptionId: string | null,
  providerAccountId?: string | null,
): Promise<Stripe.Subscription | null> {
  const normalized = String(subscriptionId ?? "").trim();
  if (!normalized) return null;
  try {
    return await getStripeClient().subscriptions.retrieve(
      normalized,
      {},
      providerAccountId ? { stripeAccount: providerAccountId } : undefined,
    );
  } catch (error: any) {
    if (stripeResourceMissing(error)) return null;
    throw error;
  }
}

async function resolveStripeSubscriptionIdFromCharge(
  charge: Stripe.Charge | null,
  providerAccountId?: string | null,
): Promise<string | null> {
  const invoiceId = readStripeObjectId((charge as any)?.invoice);
  if (!invoiceId) return null;
  const invoice = await retrieveStripeInvoiceForEvidence(invoiceId, providerAccountId);
  return invoice ? readStripeInvoiceSubscriptionId(invoice) : null;
}

async function syncCommunitySubscriptionFromStripeSubscription(
  ctx: any,
  event: Stripe.Event,
  subscription: Stripe.Subscription | null,
  options?: {
    preserveRiskRevocation?: boolean;
  },
): Promise<Record<string, unknown>> {
  const providerSubscriptionId = String(subscription?.id ?? "").trim();
  if (!subscription || !providerSubscriptionId) {
    return { ok: true, ignored: true, reason: "stripe_subscription_missing" };
  }
  const providerAccountId = readStripeEventAccountId(event);
  if (!providerAccountId) {
    return { ok: true, ignored: true, reason: "community_subscription_provider_account_required" };
  }
  const existingCommunitySubscription = await ctx.runQuery(
    internal.communityCommerce
      .getCommunitySubscriptionByProviderSubscriptionIdInternal as any,
    {
      providerAccountId,
      providerSubscriptionId,
    },
  );
  if (!existingCommunitySubscription?.communityId || !existingCommunitySubscription?.userId) {
    return { ok: true, ignored: true, reason: "community_subscription_not_found" };
  }
  const providerPriceId = subscription.items.data[0]?.price?.id ?? null;
  const { cycleStartedAt, cycleEndsAt } = readStripeSubscriptionCycle(subscription);
  const normalizedCommunityStatus = normalizeStripeCommunitySubscriptionStatus({
    subscriptionStatus: subscription.status,
    cancelAtPeriodEnd: (subscription as any)?.cancel_at_period_end,
  });
  await ctx.runMutation(
    internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal as any,
    {
      communityId: existingCommunitySubscription.communityId,
      userId: existingCommunitySubscription.userId,
      source: "stripe",
      pricePointId: existingCommunitySubscription.pricePointId ?? undefined,
      providerAccountId,
      providerPriceId,
      providerSubscriptionId,
      providerCustomerId:
        typeof subscription.customer === "string" ? subscription.customer : null,
      status: normalizedCommunityStatus,
      currentPeriodStartIso: toIsoStringOrUndefined(cycleStartedAt),
      currentPeriodEndIso: toIsoStringOrUndefined(cycleEndsAt),
      cancelAtPeriodEnd: Boolean((subscription as any)?.cancel_at_period_end),
      preserveRiskRevocation: options?.preserveRiskRevocation === true,
      nowMs: readStripeEventCreatedAtMs(event),
    },
  );
  return {
    ok: true,
    subscription_status: normalizedCommunityStatus,
    provider_subscription_id: providerSubscriptionId,
    provider_account_id: providerAccountId,
  };
}

async function syncFounderSubscriptionFromStripeSubscription(
  ctx: any,
  event: Stripe.Event,
  subscription: Stripe.Subscription | null,
  options?: {
    forceStatus?: "past_due" | "ended";
    allowRiskRestoration?: boolean;
  },
): Promise<Record<string, any>> {
  if (readStripeEventAccountId(event)) {
    return { ok: true, ignored: true, reason: "founder_subscription_connected_event" };
  }
  const providerSubscriptionId = String(subscription?.id ?? "").trim();
  if (!subscription || !providerSubscriptionId) {
    return { ok: true, ignored: true, reason: "stripe_subscription_missing" };
  }
  const providerPriceId = subscription.items.data[0]?.price?.id ?? null;
  const { cycleStartedAt, cycleEndsAt } = readStripeSubscriptionCycle(subscription);
  return await ctx.runMutation(
    (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
    {
      localSessionId:
        readStripeMetadataString(subscription.metadata, "local_session_id") ?? null,
      providerCustomerId:
        typeof subscription.customer === "string" ? subscription.customer : null,
      providerSubscriptionId,
      providerPriceId,
      subscriptionStatus:
        options?.forceStatus ?? normalizeStripeCommunitySubscriptionStatus({
          subscriptionStatus: subscription.status,
          cancelAtPeriodEnd: (subscription as any)?.cancel_at_period_end,
        }),
      currentPeriodStartAt: cycleStartedAt,
      currentPeriodEndAt: cycleEndsAt,
      cancelAtPeriodEnd: Boolean((subscription as any)?.cancel_at_period_end),
      providerEventCreatedAt: readStripeEventCreatedAtMs(event),
      allowRiskRestoration: options?.allowRiskRestoration === true,
    },
  );
}

async function syncFounderSubscriptionRiskStatus(
  ctx: any,
  event: Stripe.Event,
  args: {
    providerSubscriptionId: string | null;
    status: "past_due" | "ended";
    revokedReason: string;
  },
): Promise<Record<string, any>> {
  if (readStripeEventAccountId(event)) {
    return { ok: true, ignored: true, reason: "founder_subscription_connected_event" };
  }
  const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
  if (!providerSubscriptionId) {
    return { ok: true, ignored: true, reason: "founder_subscription_id_missing" };
  }
  return await ctx.runMutation(
    (internal as any).founderBilling.syncFounderSubscriptionRiskStatusInternal,
    {
      providerSubscriptionId,
      status: args.status,
      revokedReason: args.revokedReason,
      providerEventCreatedAt: readStripeEventCreatedAtMs(event),
    },
  );
}

async function syncCommunitySubscriptionRiskStatus(
  ctx: any,
  event: Stripe.Event,
  args: {
    providerSubscriptionId: string | null;
    status: "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended";
    revokedReason: string;
  },
): Promise<Record<string, unknown>> {
  const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
  if (!providerSubscriptionId) {
    return { ok: true, ignored: true, reason: "community_subscription_id_missing" };
  }
  const providerAccountId = readStripeEventAccountId(event);
  if (!providerAccountId) {
    return { ok: true, ignored: true, reason: "community_subscription_provider_account_required" };
  }
  const existingCommunitySubscription = await ctx.runQuery(
    internal.communityCommerce
      .getCommunitySubscriptionByProviderSubscriptionIdInternal as any,
    {
      providerAccountId,
      providerSubscriptionId,
    },
  );
  if (!existingCommunitySubscription?.communityId || !existingCommunitySubscription?.userId) {
    return { ok: true, ignored: true, reason: "community_subscription_not_found" };
  }
  await ctx.runMutation(
    internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal as any,
    {
      communityId: existingCommunitySubscription.communityId,
      userId: existingCommunitySubscription.userId,
      source: "stripe",
      pricePointId: existingCommunitySubscription.pricePointId ?? undefined,
      providerAccountId,
      providerSubscriptionId,
      status: args.status,
      revokedReason: args.revokedReason,
      nowMs: readStripeEventCreatedAtMs(event),
    },
  );
  return {
    ok: true,
    provider_subscription_id: providerSubscriptionId,
    provider_account_id: providerAccountId,
    subscription_status: args.status,
    revoked_reason: args.revokedReason,
  };
}

async function syncCommunityAccessForRefund(
  ctx: any,
  event: Stripe.Event,
  args: {
    refund: Stripe.Refund;
    charge: Stripe.Charge | null;
  },
): Promise<Record<string, unknown>> {
  if (!args.charge) return { ok: true, ignored: true, reason: "refund_charge_missing" };
  const providerAccountId = readStripeEventAccountId(event);
  const providerSubscriptionId = await resolveStripeSubscriptionIdFromCharge(
    args.charge,
    providerAccountId,
  );
  if (!stripeRefundFullyRefundsCharge(args.refund, args.charge)) {
    return {
      ok: true,
      ignored: true,
      reason: "partial_refund_access_retained",
      provider_subscription_id: providerSubscriptionId,
    };
  }
  const founderSubscriptionResult = await syncFounderSubscriptionRiskStatus(ctx, event, {
    providerSubscriptionId,
    status: "ended",
    revokedReason: "subscription_refunded",
  });
  if (!founderSubscriptionResult?.ignored) return founderSubscriptionResult;
  return await syncCommunitySubscriptionRiskStatus(ctx, event, {
    providerSubscriptionId,
    status: "ended",
    revokedReason: "subscription_refunded",
  });
}

async function syncCommunityAccessForDispute(
  ctx: any,
  event: Stripe.Event,
  args: {
    charge: Stripe.Charge | null;
    outcome: "opened" | "won" | "lost" | "funds_reinstated" | "unknown";
  },
): Promise<Record<string, unknown>> {
  const providerAccountId = readStripeEventAccountId(event);
  const providerSubscriptionId = await resolveStripeSubscriptionIdFromCharge(
    args.charge,
    providerAccountId,
  );
  if (!providerSubscriptionId) {
    return { ok: true, ignored: true, reason: "dispute_subscription_missing" };
  }
  if (args.outcome === "opened") {
    const founderSubscriptionResult = await syncFounderSubscriptionRiskStatus(ctx, event, {
      providerSubscriptionId,
      status: "ended",
      revokedReason: "subscription_dispute_opened",
    });
    if (!founderSubscriptionResult?.ignored) return founderSubscriptionResult;
    return await syncCommunitySubscriptionRiskStatus(ctx, event, {
      providerSubscriptionId,
      status: "ended",
      revokedReason: "subscription_dispute_opened",
    });
  }
  if (args.outcome === "lost") {
    const founderSubscriptionResult = await syncFounderSubscriptionRiskStatus(ctx, event, {
      providerSubscriptionId,
      status: "ended",
      revokedReason: "subscription_dispute_lost",
    });
    if (!founderSubscriptionResult?.ignored) return founderSubscriptionResult;
    return await syncCommunitySubscriptionRiskStatus(ctx, event, {
      providerSubscriptionId,
      status: "ended",
      revokedReason: "subscription_dispute_lost",
    });
  }
  if (args.outcome === "won" || args.outcome === "funds_reinstated") {
    const subscription = await retrieveStripeSubscriptionForEvidence(
      providerSubscriptionId,
      providerAccountId,
    );
    const founderSubscriptionResult = await syncFounderSubscriptionFromStripeSubscription(
      ctx,
      event,
      subscription,
      { allowRiskRestoration: true },
    );
    if (!founderSubscriptionResult?.ignored) return founderSubscriptionResult;
    return await syncCommunitySubscriptionFromStripeSubscription(ctx, event, subscription);
  }
  return {
    ok: true,
    ignored: true,
    reason: "dispute_outcome_unknown",
    provider_subscription_id: providerSubscriptionId,
  };
}

export function registerRuntimeBillingRoutes(
  args: RegisterRuntimeBillingRoutesArgs,
): void {
  const { http, httpAction, jsonResponse } = args;

  http.route({
    path: "/billing/stripe_webhook",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const requestPath = new URL(req.url).pathname;
      const signature = readStripeSignature(req);
      if (!signature) {
        return jsonResponse(req, 400, {
          ok: false,
          code: "stripe_signature_missing",
          error: "stripe_signature_missing",
          message: "Missing Stripe signature.",
        });
      }

      const payload = await req.text();
      let event: Stripe.Event;
      let webhookScope: "account" | "connect" | null = null;
      let stripeEventType: string | null = null;
      let stripeEventId: string | null = null;
      try {
        const verifiedWebhook = await verifyStripeWebhookSignature({ payload, signature });
        event = verifiedWebhook.event;
        webhookScope = verifiedWebhook.scope;
        stripeEventType = event.type;
        stripeEventId = event.id;
        await recordStripeWebhookAudit(ctx, {
          eventKey: `stripe_webhook_received:${event.id}`,
          eventType: "stripe_webhook_received",
          status: "started",
          stripeEventType,
          stripeEventId,
          metadata: {
            stripeAccountId: readStripeEventAccountId(event),
            webhookScope,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logStructuredError("stripe_webhook_signature_invalid", {
          error,
          requestPath,
          hasSignature: true,
        });
        return jsonResponse(req, 400, {
          ok: false,
          code: "stripe_signature_invalid",
          error: "stripe_signature_invalid",
          message,
        });
      }

      try {
        const processedResponse = async (
          responsePayload: Record<string, unknown>,
          status: "succeeded" | "ignored" = "succeeded",
        ) => {
          await recordStripeWebhookAudit(ctx, {
            eventKey: `stripe_webhook_processed:${stripeEventId ?? "unknown"}:${status}:${String(responsePayload.reason ?? responsePayload.event ?? "received")}`,
            eventType: "stripe_webhook_processed",
            status,
            stripeEventType,
            stripeEventId,
            metadata: {
              stripeAccountId: readStripeEventAccountId(event),
              webhookScope,
              response: responsePayload,
            },
          });
          return jsonResponse(req, 200, responsePayload);
        };

        const eventCreatedAt =
          Number(event.created ?? 0) > 0
            ? Number(event.created) * 1000
            : Date.now();
        const providerAccountId = readStripeEventAccountId(event);

        if (
          event.type === "checkout.session.completed" ||
          event.type === "checkout.session.async_payment_succeeded"
        ) {
          const session = event.data.object as Stripe.Checkout.Session;
          const localSessionId =
            readStripeLocalSessionIdFromCheckoutSession(session);
          if (localSessionId) {
            const founderCheckoutSession = providerAccountId
              ? null
              : await (ctx as any).runQuery(
                  (internal as any).founderBilling
                    .getFounderSubscriptionCheckoutSessionInternal,
                  { sessionId: localSessionId },
                );
            if (founderCheckoutSession) {
              if (!readStripePaymentReady(session.payment_status)) {
                return processedResponse({
                  ok: true,
                  ignored: true,
                  event: event.type,
                  reason: "founder_subscription_payment_pending",
                }, "ignored");
              }
              const subscriptionId =
                typeof session.subscription === "string" ? session.subscription : null;
              if (!subscriptionId) {
                return processedResponse({
                  ok: true,
                  ignored: true,
                  event: event.type,
                  reason: "founder_subscription_missing",
                }, "ignored");
              }
              const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
              const isAnonymousBuilderCheckout =
                !founderCheckoutSession.ownerUserId;
              const recoveryEmail = isAnonymousBuilderCheckout
                ? await readFounderCheckoutRecoveryEmail(session)
                : null;
              const recoveryEmailHash = recoveryEmail
                ? await hashFounderCheckoutRecoveryEmail(recoveryEmail)
                : null;
              const providerPriceId = subscription.items.data[0]?.price?.id ?? null;
              const { cycleStartedAt, cycleEndsAt } = readStripeSubscriptionCycle(subscription);
              const result = await (ctx as any).runMutation(
                (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
                {
                  localSessionId,
                  providerCheckoutSessionId: session.id,
                  providerCustomerId:
                    typeof subscription.customer === "string"
                      ? subscription.customer
                      : typeof session.customer === "string"
                        ? session.customer
                        : null,
                  providerSubscriptionId: subscription.id,
                  providerPriceId,
                  subscriptionStatus: normalizeStripeCommunitySubscriptionStatus({
                    subscriptionStatus: subscription.status,
                    cancelAtPeriodEnd: (subscription as any)?.cancel_at_period_end,
                  }),
                  currentPeriodStartAt: cycleStartedAt,
                  currentPeriodEndAt: cycleEndsAt,
                  cancelAtPeriodEnd: Boolean((subscription as any)?.cancel_at_period_end),
                  verifiedCheckoutPayment: true,
                  providerEventCreatedAt: eventCreatedAt,
                  recoveryEmail,
                  recoveryEmailHash,
                  recoveryEmailHashVersion: recoveryEmailHash
                    ? FOUNDER_CHECKOUT_RECOVERY_EMAIL_HASH_VERSION
                    : null,
                },
              );
              const recoveryEmailResult =
                result?.receiptStatus === "paid_unclaimed" && recoveryEmail
                  ? await enqueueFounderCheckoutRecoveryEmailInternal({
                      ctx,
                      recipientEmail: recoveryEmail,
                      sessionId: localSessionId,
                      nowMs: eventCreatedAt,
                    })
                  : null;
              return processedResponse({
                ok: true,
                received: true,
                event: event.type,
                result,
                recovery_email_enqueued: recoveryEmailResult?.ok === true,
              });
            }
          }
        }

        if (event.type === "checkout.session.completed") {
          const session = event.data.object as Stripe.Checkout.Session;
          const localSessionId =
            readStripeLocalSessionIdFromCheckoutSession(session);
          if (!localSessionId) {
            return processedResponse({
              ok: true,
              ignored: true,
              event: event.type,
              reason: "checkout_local_session_id_missing",
            }, "ignored");
          }
          const communityCheckoutSession = await (ctx as any).runQuery(
            internal.communityCommerce.getCommunityJoinCheckoutSessionInternal as any,
            {
              sessionId: localSessionId,
            },
          );
          if (communityCheckoutSession) {
            const communityProviderAccountId = requireCommunityProviderAccountMatch({
              expectedProviderAccountId: communityCheckoutSession.providerAccountId,
              actualProviderAccountId: providerAccountId,
              missingCode: "community_checkout_provider_account_required",
              mismatchCode: "community_checkout_provider_account_mismatch",
            });
            if (!readStripePaymentReady(session.payment_status)) {
              return processedResponse({
                ok: true,
                ignored: true,
                event: event.type,
                reason: "community_checkout_payment_pending",
              }, "ignored");
            }
            const subscriptionId =
              typeof session.subscription === "string"
                ? session.subscription
                : null;
            if (!subscriptionId) {
              return processedResponse({
                ok: true,
                ignored: true,
                event: event.type,
                reason: "community_subscription_missing",
              }, "ignored");
            }
            const stripe = getStripeClient();
            const subscription =
              await stripe.subscriptions.retrieve(
                subscriptionId,
                {},
                { stripeAccount: communityProviderAccountId },
              );
            const providerPriceId = subscription.items.data[0]?.price?.id ?? null;
            const { cycleStartedAt, cycleEndsAt } =
              readStripeSubscriptionCycle(subscription);
            const latestInvoice =
              readStripeSubscriptionLatestInvoice(subscription) ??
              await retrieveStripeInvoiceForEvidence(
                readStripeObjectId((subscription as any)?.latest_invoice),
                communityProviderAccountId,
              );
            const initialInvoiceEvidence = readStripeInvoiceEvidence(
              latestInvoice,
            );
            await (ctx as any).runMutation(
              internal.communityCommerce
                .syncPendingCommunityCheckoutSubscriptionInternal as any,
              {
                sessionId: localSessionId,
                providerAccountId: communityProviderAccountId,
                providerCheckoutSessionId: session.id,
                providerCustomerId:
                  typeof subscription.customer === "string"
                    ? subscription.customer
                    : typeof session.customer === "string"
                      ? session.customer
                      : null,
                providerSubscriptionId: subscription.id,
                sourceProviderInvoiceId:
                  initialInvoiceEvidence.sourceProviderInvoiceId ?? undefined,
                sourceProviderPaymentIntentId:
                  initialInvoiceEvidence.sourceProviderPaymentIntentId ?? undefined,
                sourceProviderChargeId:
                  initialInvoiceEvidence.sourceProviderChargeId ?? undefined,
                providerPriceId,
                subscriptionStatus: normalizeStripeCommunitySubscriptionStatus({
                  subscriptionStatus: subscription.status,
                  cancelAtPeriodEnd: (subscription as any)?.cancel_at_period_end,
                }),
                currentPeriodStartAt: cycleStartedAt,
                currentPeriodEndAt: cycleEndsAt,
                cancelAtPeriodEnd: Boolean((subscription as any)?.cancel_at_period_end),
                markComplete: true,
                nowMs:
                  Number(event.created ?? 0) > 0
                    ? Number(event.created) * 1000
                    : Date.now(),
              },
            );
            return processedResponse({
              ok: true,
              received: true,
              event: event.type,
            });
          }
          return processedResponse({
            ok: true,
            ignored: true,
            event: event.type,
            reason: "checkout_session_not_found",
          }, "ignored");
        }

        if (
          event.type === "invoice.paid" ||
          event.type === "invoice.payment_succeeded"
        ) {
          const invoice = event.data.object as Stripe.Invoice;
          const billingReason = String(invoice.billing_reason ?? "").trim();
          if (billingReason !== "subscription_cycle") {
            return processedResponse({
              ok: true,
              ignored: true,
              event: event.type,
              reason: "invoice_not_subscription_cycle",
              billingReason,
            }, "ignored");
          }
          const providerSubscriptionId = readStripeInvoiceSubscriptionId(invoice);
          if (!providerSubscriptionId) {
            return processedResponse({
              ok: true,
              ignored: true,
              event: event.type,
              reason: "invoice_subscription_missing",
            }, "ignored");
          }
          const amountBaseUnits = Number(invoice.amount_paid ?? 0);
          const currency = String(invoice.currency ?? "").trim().toLowerCase();
          if (!Number.isFinite(amountBaseUnits) || amountBaseUnits <= 0 || !currency) {
            return processedResponse({
              ok: true,
              ignored: true,
              event: event.type,
              reason: "invoice_paid_amount_missing",
            }, "ignored");
          }
          const subscription = await retrieveStripeSubscriptionForEvidence(
            providerSubscriptionId,
            providerAccountId,
          );
          const founderSubscriptionResult = await syncFounderSubscriptionFromStripeSubscription(
            ctx,
            event,
            subscription,
          );
          if (!founderSubscriptionResult?.ignored) {
            return processedResponse({
              ok: true,
              received: true,
              event: event.type,
              founderSubscriptionResult,
            });
          }
          const communityLifecycleResult = await syncCommunitySubscriptionFromStripeSubscription(
            ctx,
            event,
            subscription,
          );
          return processedResponse({
            ok: true,
            received: true,
            event: event.type,
            communityLifecycleResult,
          });
        }

        if (event.type === "invoice.payment_failed") {
          const invoice = event.data.object as Stripe.Invoice;
          const providerSubscriptionId = readStripeInvoiceSubscriptionId(invoice);
          if (!providerSubscriptionId) {
            return processedResponse({
              ok: true,
              ignored: true,
              event: event.type,
              reason: "invoice_subscription_missing",
            }, "ignored");
          }
          const subscription = await retrieveStripeSubscriptionForEvidence(
            providerSubscriptionId,
            providerAccountId,
          );
          const founderSubscriptionResult = await syncFounderSubscriptionFromStripeSubscription(
            ctx,
            event,
            subscription,
            { forceStatus: "past_due" },
          );
          if (!founderSubscriptionResult?.ignored) {
            return processedResponse({
              ok: true,
              received: true,
              event: event.type,
              founderSubscriptionResult,
            });
          }
          const founderRiskResult = await syncFounderSubscriptionRiskStatus(ctx, event, {
            providerSubscriptionId,
            status: "past_due",
            revokedReason: "subscription_payment_failed",
          });
          if (!founderRiskResult?.ignored) {
            return processedResponse({
              ok: true,
              received: true,
              event: event.type,
              founderSubscriptionResult: founderRiskResult,
            });
          }
          const communityLifecycleResult = subscription
            ? await syncCommunitySubscriptionFromStripeSubscription(ctx, event, subscription, {
              preserveRiskRevocation: true,
            })
            : await syncCommunitySubscriptionRiskStatus(ctx, event, {
              providerSubscriptionId,
              status: "past_due",
              revokedReason: "subscription_payment_failed",
            });
          return processedResponse({
            ok: true,
            received: true,
            event: event.type,
            communityLifecycleResult,
          });
        }

        if (
          event.type === "refund.created" ||
          event.type === "refund.updated" ||
          event.type === "refund.failed"
        ) {
          const refund = event.data.object as Stripe.Refund;
          const refundStatus = String((refund as any)?.status ?? "")
            .trim()
            .toLowerCase();
          if (
            event.type === "refund.failed" ||
            refundStatus === "failed" ||
            refundStatus === "canceled"
          ) {
            const refundEvidence = readStripeRefundEvidence(refund);
            const charge = await retrieveStripeChargeForEvidence(
              refundEvidence.sourceProviderChargeId,
              providerAccountId,
            );
            const providerSubscriptionId = await resolveStripeSubscriptionIdFromCharge(
              charge,
              providerAccountId,
            );
            const subscription = await retrieveStripeSubscriptionForEvidence(
              providerSubscriptionId,
              providerAccountId,
            );
            const founderSubscriptionResult = await syncFounderSubscriptionFromStripeSubscription(
              ctx,
              event,
              subscription,
              { allowRiskRestoration: true },
            );
            if (!founderSubscriptionResult?.ignored) {
              return processedResponse({
                ok: true,
                received: true,
                event: event.type,
                reason: "refund_failed_no_reversal",
                founderSubscriptionResult,
              });
            }
            const communityAccessResult = await syncCommunitySubscriptionFromStripeSubscription(
              ctx,
              event,
              subscription,
              { preserveRiskRevocation: true },
            );
            return processedResponse({
              ok: true,
              received: true,
              event: event.type,
              reason: "refund_failed_no_reversal",
              communityAccessResult,
            });
          }
          const refundEvidence = readStripeRefundEvidence(refund);
          if (!refundEvidence.sourceProviderRefundId) {
            return processedResponse({
              ok: true,
              ignored: true,
              event: event.type,
              reason: "refund_id_missing",
            }, "ignored");
          }
          const charge = await retrieveStripeChargeForEvidence(
            refundEvidence.sourceProviderChargeId,
            providerAccountId,
          );
          const communityAccessResult = await syncCommunityAccessForRefund(ctx, event, {
            refund,
            charge,
          });
          const applicationFeeRefundResult = await reverseCommunityApplicationFeesForRefund({
            ctx,
            event,
            refund,
            charge,
          });
          return processedResponse({
            ok: true,
            received: true,
            event: event.type,
            communityAccessResult,
            applicationFeeRefundResult,
          });
        }

        if (event.type === "charge.refunded") {
          const charge = event.data.object as Stripe.Charge;
          const chargeEvidence = readStripeChargeEvidence(charge);
          const refunds = Array.isArray((charge as any)?.refunds?.data)
            ? (charge as any).refunds.data as Stripe.Refund[]
            : [];
          if (refunds.length <= 0) {
            return processedResponse({
              ok: true,
              ignored: true,
              event: event.type,
              reason: "charge_refunded_refunds_missing",
              sourceProviderChargeId: chargeEvidence.sourceProviderChargeId,
            }, "ignored");
          }
          const results = [];
          for (const refund of refunds) {
            const communityAccessResult = await syncCommunityAccessForRefund(ctx, event, {
              refund,
              charge,
            });
            const applicationFeeRefundResult = await reverseCommunityApplicationFeesForRefund({
              ctx,
              event,
              refund,
              charge,
            });
            results.push({
              communityAccessResult,
              applicationFeeRefundResult,
            });
          }
          return processedResponse({
            ok: true,
            received: true,
            event: event.type,
            results,
          });
        }

        if (
          event.type === "charge.dispute.created" ||
          event.type === "charge.dispute.closed" ||
          event.type === "charge.dispute.funds_reinstated"
        ) {
          const dispute = event.data.object as Stripe.Dispute;
          const disputeEvidence = readStripeDisputeEvidence(dispute);
          if (!disputeEvidence.sourceProviderDisputeId) {
            return processedResponse({
              ok: true,
              ignored: true,
              event: event.type,
              reason: "dispute_id_missing",
            }, "ignored");
          }
          const charge = await retrieveStripeChargeForEvidence(
            disputeEvidence.sourceProviderChargeId,
            providerAccountId,
          );
          const chargeEvidence = charge ? readStripeChargeEvidence(charge) : null;
          if (event.type === "charge.dispute.created") {
            const communityAccessResult = await syncCommunityAccessForDispute(ctx, event, {
              charge,
              outcome: "opened",
            });
            return processedResponse({
              ok: true,
              received: true,
              event: event.type,
              communityAccessResult,
            });
          }
          const disputeStatus = String(dispute.status ?? "").trim().toLowerCase();
          const outcome =
            event.type === "charge.dispute.funds_reinstated"
              ? "funds_reinstated"
              : disputeStatus === "won"
                ? "won"
                : disputeStatus === "lost"
                  ? "lost"
                  : "unknown";
          const communityAccessResult = await syncCommunityAccessForDispute(ctx, event, {
            charge,
            outcome,
          });
          return processedResponse({
            ok: true,
            received: true,
            event: event.type,
            communityAccessResult,
          });
        }

        if (
          event.type === "customer.subscription.updated" ||
          event.type === "customer.subscription.deleted"
        ) {
          const subscription = event.data.object as Stripe.Subscription;
          const localSessionId = readStripeMetadataString(
            subscription.metadata,
            "local_session_id",
          );
          const providerPriceId = subscription.items.data[0]?.price?.id ?? null;
          const { cycleStartedAt, cycleEndsAt } =
            readStripeSubscriptionCycle(subscription);
          const normalizedCommunityStatus =
            normalizeStripeCommunitySubscriptionStatus({
              subscriptionStatus: subscription.status,
              cancelAtPeriodEnd: (subscription as any)?.cancel_at_period_end,
            });
          const founderSubscriptionResult = await syncFounderSubscriptionFromStripeSubscription(
            ctx,
            event,
            subscription,
            event.type === "customer.subscription.deleted" ? { forceStatus: "ended" } : undefined,
          );
          if (!founderSubscriptionResult?.ignored) {
            return processedResponse({
              ok: true,
              received: true,
              event: event.type,
              founderSubscriptionResult,
            });
          }
          if (localSessionId) {
            const communityCheckoutSession = await (ctx as any).runQuery(
              internal.communityCommerce.getCommunityJoinCheckoutSessionInternal as any,
              {
                sessionId: localSessionId,
              },
            );
            if (communityCheckoutSession) {
              const communityProviderAccountId = requireCommunityProviderAccountMatch({
                expectedProviderAccountId: communityCheckoutSession.providerAccountId,
                actualProviderAccountId: providerAccountId,
                missingCode: "community_subscription_provider_account_required",
                mismatchCode: "community_subscription_provider_account_mismatch",
              });
              await (ctx as any).runMutation(
                internal.communityCommerce
                  .syncPendingCommunityCheckoutSubscriptionInternal as any,
                {
                  sessionId: localSessionId,
                  providerAccountId: communityProviderAccountId,
                  providerCustomerId:
                    typeof subscription.customer === "string"
                      ? subscription.customer
                      : null,
                  providerSubscriptionId: subscription.id,
                  providerPriceId,
                  subscriptionStatus: normalizedCommunityStatus,
                  currentPeriodStartAt: cycleStartedAt,
                  currentPeriodEndAt: cycleEndsAt,
                  cancelAtPeriodEnd: Boolean((subscription as any)?.cancel_at_period_end),
                  markComplete: false,
                  nowMs:
                    Number(event.created ?? 0) > 0
                      ? Number(event.created) * 1000
                      : Date.now(),
                },
              );
            }
          }
          const communityLifecycleResult = await syncCommunitySubscriptionFromStripeSubscription(
            ctx,
            event,
            subscription,
            { preserveRiskRevocation: true },
          );
          if (!communityLifecycleResult.ignored) {
            return processedResponse({
              ok: true,
              received: true,
              event: event.type,
              communityLifecycleResult,
            });
          }
          return processedResponse({
            ok: true,
            ignored: true,
            event: event.type,
            reason: communityLifecycleResult.reason ?? "community_subscription_not_found",
          }, "ignored");
        }

        if (event.type === "account.updated") {
          const account = event.data.object as Stripe.Account;
          const nowMs =
            Number(event.created ?? 0) > 0 ? Number(event.created) * 1000 : Date.now();
          const existingConnectAccount = await (ctx as any).runQuery(
            internal.creatorCommerce.getUserStripeConnectAccountByStripeAccountIdInternal as any,
            {
              stripeAccountId: account.id,
            },
          );
          const metadataUserId = readStripeMetadataString(account.metadata, "user_id");
          const userId = existingConnectAccount?.userId ?? metadataUserId ?? null;
          if (!userId) {
            return processedResponse({
              ok: true,
              ignored: true,
              event: event.type,
              reason: "stripe_connect_user_missing",
            }, "ignored");
          }
          const snapshot = buildStripeConnectAccountSnapshot(account, { readyAtMs: nowMs });
          await (ctx as any).runMutation(
            internal.creatorCommerce.syncUserStripeConnectAccountInternal as any,
            {
              userId,
              stripeAccountId: snapshot.stripeAccountId,
              accountType: snapshot.accountType,
              country: snapshot.country,
              serviceAgreement: snapshot.serviceAgreement,
              transfersEnabled: snapshot.transfersEnabled,
              status: snapshot.status,
              detailsSubmitted: snapshot.detailsSubmitted,
              chargesEnabled: snapshot.chargesEnabled,
              payoutsEnabled: snapshot.payoutsEnabled,
              requirementsCurrentlyDue: snapshot.requirementsCurrentlyDue,
              requirementsEventuallyDue: snapshot.requirementsEventuallyDue,
              requirementsDisabledReason: snapshot.requirementsDisabledReason,
              onboardingCompleteAt: snapshot.onboardingCompleteAt,
              nowMs,
            },
          );
          return processedResponse({
            ok: true,
            received: true,
            event: event.type,
          });
        }

        return processedResponse({
          ok: true,
          ignored: true,
          event: event.type,
        }, "ignored");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logStructuredError("stripe_webhook_failed", {
          error,
          requestPath,
          stripeEventType: stripeEventType ?? undefined,
          stripeEventId: stripeEventId ?? undefined,
        });
        await recordStripeWebhookAudit(ctx, {
          eventKey: `stripe_webhook_failed:${stripeEventId ?? "unknown"}:${message || "stripe_webhook_failed"}`,
          eventType: "stripe_webhook_failed",
          severity: "error",
          status: "failed",
          stripeEventType,
          stripeEventId,
          metadata: {
            stripeAccountId: readStripeEventAccountId(event),
            webhookScope,
            requestPath,
            errorMessage: message || "Stripe webhook failed.",
          },
        });
        return jsonResponse(req, 400, {
          ok: false,
          code: message || "stripe_webhook_failed",
          error: message || "stripe_webhook_failed",
          message: message || "Stripe webhook failed.",
        });
      }
    }),
  });
}
