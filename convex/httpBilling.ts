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
import { resolveCurrentCommunitySubscriptionEvent } from "./communitySubscriptionEventConvergenceCore";
import { calculateBuilderPartnerEligibleSettledRevenueBaseUnits } from "../shared/builderPartnerProgram";
import {
  currentChargeRequiresRefundAccessBlock,
  currentDisputeAccessBlock,
} from "./communitySubscriptionAccessCore";
import { communitySubscriptionRecoveryErrorCode } from "./communitySubscriptionRecoveryCore";

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
    eventType:
      | "stripe_webhook_received"
      | "stripe_webhook_processed"
      | "stripe_webhook_recovery_accepted"
      | "stripe_webhook_failed";
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

function parseOptionalString(value: unknown, maxLen = 300): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
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

function readStripePaymentMethodId(value: unknown): string | null {
  const id = readStripeObjectId(value);
  return id && id.startsWith("pm_") ? id : null;
}

function readStripeCustomerId(value: unknown): string | null {
  const id = readStripeObjectId(value);
  return id && id.startsWith("cus_") ? id : null;
}

function readStripeCardPaymentMethod(value: unknown): any | null {
  if (!value || typeof value !== "object") return null;
  const paymentMethodId = readStripePaymentMethodId(value);
  const record = value as { type?: unknown; card?: unknown };
  const type = String(record.type ?? "").trim();
  const hasCardPayload = Boolean(record.card && typeof record.card === "object");
  if (!paymentMethodId || (type !== "card" && !hasCardPayload)) return null;
  return value;
}

function readStripePaymentMethodCardMetadata(value: unknown): {
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
} {
  const paymentMethod = value && typeof value === "object" ? value as any : null;
  const card = paymentMethod?.card && typeof paymentMethod.card === "object"
    ? paymentMethod.card
    : null;
  const expMonth = Math.floor(Number(card?.exp_month ?? 0));
  const expYear = Math.floor(Number(card?.exp_year ?? 0));
  return {
    cardBrand: String(card?.brand ?? "").trim().slice(0, 80) || null,
    cardLast4: String(card?.last4 ?? "").trim().slice(0, 8) || null,
    cardExpMonth: Number.isFinite(expMonth) && expMonth > 0 ? expMonth : null,
    cardExpYear: Number.isFinite(expYear) && expYear > 0 ? expYear : null,
  };
}

async function syncWorkspaceCardTruthForStripeCustomer(args: {
  ctx: any;
  providerCustomerId: string;
  checkedAt: number;
  preferredPaymentMethod?: unknown;
  missingStatus?: "missing" | "detached";
}) {
  const providerCustomerId = readStripeCustomerId(args.providerCustomerId);
  if (!providerCustomerId) {
    return {
      ok: false,
      reason: "workspace_card_customer_id_missing",
    };
  }
  const localCustomer = await args.ctx.runQuery(
    internal.stripeCustomers.getUserStripeCustomerByProviderCustomerIdInternal as any,
    {
      providerCustomerId,
    },
  );
  const userId = localCustomer?.userId;
  if (!userId) {
    return {
      ok: true,
      ignored: true,
      reason: "workspace_card_customer_not_local",
      provider_customer_id: providerCustomerId,
    };
  }

  const stripe = getStripeClient();
  let paymentMethod = readStripeCardPaymentMethod(args.preferredPaymentMethod);
  if (!paymentMethod) {
    let customer: any;
    try {
      customer = await stripe.customers.retrieve(providerCustomerId, {
        expand: ["invoice_settings.default_payment_method"],
      });
    } catch (error) {
      if (String((error as { code?: unknown; type?: unknown })?.code ?? "").trim() !== "resource_missing") {
        throw error;
      }
      customer = null;
    }
    if (!customer || Boolean((customer as { deleted?: unknown })?.deleted)) {
      await args.ctx.runMutation(
        internal.stripeCustomers.syncUserStripeCustomerPaymentMethodInternal as any,
        {
          userId,
          providerCustomerId,
          status: args.missingStatus ?? "missing",
          providerDefaultPaymentMethodId: null,
          checkedAt: args.checkedAt,
        },
      );
      return {
        ok: true,
        reason: "workspace_card_missing_synced",
        has_card_on_file: false,
      };
    }

    const defaultPaymentMethod = (customer as any)?.invoice_settings?.default_payment_method;
    paymentMethod = readStripeCardPaymentMethod(defaultPaymentMethod);
    const defaultPaymentMethodId = readStripePaymentMethodId(defaultPaymentMethod);
    if (!paymentMethod && defaultPaymentMethodId) {
      try {
        paymentMethod = readStripeCardPaymentMethod(
          await stripe.paymentMethods.retrieve(defaultPaymentMethodId),
        );
      } catch (error) {
        if (String((error as { code?: unknown; type?: unknown })?.code ?? "").trim() !== "resource_missing") {
          throw error;
        }
      }
    }
    if (!paymentMethod) {
      const listed = await stripe.paymentMethods.list({
        customer: providerCustomerId,
        type: "card",
        limit: 1,
      });
      paymentMethod = readStripeCardPaymentMethod(listed.data[0]);
      const paymentMethodId = readStripePaymentMethodId(paymentMethod);
      if (paymentMethodId) {
        await stripe.customers.update(providerCustomerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
      }
    }
  }

  const paymentMethodId = readStripePaymentMethodId(paymentMethod);
  if (!paymentMethodId) {
    await args.ctx.runMutation(
      internal.stripeCustomers.syncUserStripeCustomerPaymentMethodInternal as any,
      {
        userId,
        providerCustomerId,
        status: args.missingStatus ?? "missing",
        providerDefaultPaymentMethodId: null,
        checkedAt: args.checkedAt,
      },
    );
    return {
      ok: true,
      reason: "workspace_card_missing_synced",
      has_card_on_file: false,
    };
  }

  const cardMetadata = readStripePaymentMethodCardMetadata(paymentMethod);
  await args.ctx.runMutation(
    internal.stripeCustomers.syncUserStripeCustomerPaymentMethodInternal as any,
    {
      userId,
      providerCustomerId,
      status: "active",
      providerDefaultPaymentMethodId: paymentMethodId,
      cardBrand: cardMetadata.cardBrand,
      cardLast4: cardMetadata.cardLast4,
      cardExpMonth: cardMetadata.cardExpMonth,
      cardExpYear: cardMetadata.cardExpYear,
      checkedAt: args.checkedAt,
    },
  );
  return {
    ok: true,
    reason: "workspace_card_active_synced",
    has_card_on_file: true,
    provider_default_payment_method_id: paymentMethodId,
  };
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

async function retrieveStripeChargeForEvidence(chargeId: string | null): Promise<Stripe.Charge | null> {
  if (!chargeId) return null;
  try {
    return await getStripeClient().charges.retrieve(chargeId);
  } catch (error: any) {
    if (stripeResourceMissing(error)) return null;
    throw error;
  }
}

async function retrieveStripeInvoiceForEvidence(invoiceId: string | null): Promise<Stripe.Invoice | null> {
  if (!invoiceId) return null;
  try {
    return await getStripeClient().invoices.retrieve(invoiceId);
  } catch (error: any) {
    if (stripeResourceMissing(error)) return null;
    throw error;
  }
}

async function retrieveStripeDisputeForEvidence(
  disputeId: string | null,
): Promise<Stripe.Dispute | null> {
  if (!disputeId) return null;
  try {
    return await getStripeClient().disputes.retrieve(disputeId);
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

function buildCommunityAccessEventEffect(event: Stripe.Event) {
  const object = event.data.object as any;
  return {
    providerAccountId: String((event as any).account ?? "platform").trim() || "platform",
    providerEventId: String(event.id ?? "").trim(),
    providerEventType: String(event.type ?? "").trim(),
    providerObjectType: String(object?.object ?? "").trim(),
    providerObjectId: String(object?.id ?? "").trim(),
    livemode: event.livemode === true,
    providerCreatedAt: readStripeEventCreatedAtMs(event),
  };
}

function toIsoStringOrUndefined(ms: number | null): string | undefined {
  return typeof ms === "number" && Number.isFinite(ms)
    ? new Date(ms).toISOString()
    : undefined;
}

function readStripeSubscriptionApplicationFeeBps(
  subscription: Stripe.Subscription,
): number | null {
  const applicationFeePercent = Number((subscription as any)?.application_fee_percent);
  if (
    !Number.isFinite(applicationFeePercent) ||
    applicationFeePercent < 0 ||
    applicationFeePercent > 100
  ) {
    return null;
  }
  return Math.round(applicationFeePercent * 100);
}

function readSettledInvoiceRevenueExcludingTax(invoice: Stripe.Invoice): number {
  const totalTax = Array.isArray((invoice as any)?.total_taxes)
    ? (invoice as any).total_taxes.reduce(
        (sum: number, tax: any) => sum + Math.max(0, Number(tax?.amount ?? 0)),
        0,
      )
    : 0;
  return calculateBuilderPartnerEligibleSettledRevenueBaseUnits({
    amountPaidBaseUnits: Number(invoice.amount_paid ?? 0),
    totalExcludingTaxBaseUnits: (invoice as any)?.total_excluding_tax,
    totalTaxBaseUnits: totalTax,
  });
}

async function retrieveStripeSubscriptionForEvidence(
  subscriptionId: string | null,
): Promise<Stripe.Subscription | null> {
  const normalized = String(subscriptionId ?? "").trim();
  if (!normalized) return null;
  try {
    return await getStripeClient().subscriptions.retrieve(normalized);
  } catch (error: any) {
    if (stripeResourceMissing(error)) return null;
    throw error;
  }
}

async function resolveStripeSubscriptionIdFromCharge(
  charge: Stripe.Charge | null,
): Promise<string | null> {
  const invoiceId = readStripeObjectId((charge as any)?.invoice);
  if (!invoiceId) return null;
  const invoice = await retrieveStripeInvoiceForEvidence(invoiceId);
  return invoice ? readStripeInvoiceSubscriptionId(invoice) : null;
}

async function syncCommunitySubscriptionFromStripeSubscription(
  ctx: any,
  event: Stripe.Event,
  subscription: Stripe.Subscription | null,
): Promise<Record<string, unknown>> {
  const providerSubscriptionId = String(subscription?.id ?? "").trim();
  if (!subscription || !providerSubscriptionId) {
    return { ok: true, ignored: true, reason: "stripe_subscription_missing" };
  }
  const existingCommunitySubscription = await ctx.runQuery(
    internal.communityCommerce
      .getCommunitySubscriptionByProviderSubscriptionIdInternal as any,
    {
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
    internal.billing.syncCommunitySubscriptionLifecycleInternal as any,
    {
      communityId: existingCommunitySubscription.communityId,
      userId: existingCommunitySubscription.userId,
      pricePointId: existingCommunitySubscription.pricePointId ?? undefined,
      providerPriceId,
      providerSubscriptionId,
      providerCustomerId:
        typeof subscription.customer === "string" ? subscription.customer : null,
      platformFeeBps: readStripeSubscriptionApplicationFeeBps(subscription),
      status: normalizedCommunityStatus,
      currentPeriodStartIso: toIsoStringOrUndefined(cycleStartedAt),
      currentPeriodEndIso: toIsoStringOrUndefined(cycleEndsAt),
      cancelAtPeriodEnd: Boolean((subscription as any)?.cancel_at_period_end),
      eventEffect: buildCommunityAccessEventEffect(event),
      nowMs: Date.now(),
    },
  );
  return {
    ok: true,
    subscription_status: normalizedCommunityStatus,
    provider_subscription_id: providerSubscriptionId,
  };
}

async function syncCommunitySubscriptionRiskStatus(
  ctx: any,
  event: Stripe.Event,
  args: {
    providerSubscriptionId: string | null;
    status: "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended";
  },
): Promise<Record<string, unknown>> {
  const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
  if (!providerSubscriptionId) {
    return { ok: true, ignored: true, reason: "community_subscription_id_missing" };
  }
  const existingCommunitySubscription = await ctx.runQuery(
    internal.communityCommerce
      .getCommunitySubscriptionByProviderSubscriptionIdInternal as any,
    {
      providerSubscriptionId,
    },
  );
  if (!existingCommunitySubscription?.communityId || !existingCommunitySubscription?.userId) {
    return { ok: true, ignored: true, reason: "community_subscription_not_found" };
  }
  await ctx.runMutation(
    internal.billing.syncCommunitySubscriptionLifecycleInternal as any,
    {
      communityId: existingCommunitySubscription.communityId,
      userId: existingCommunitySubscription.userId,
      pricePointId: existingCommunitySubscription.pricePointId ?? undefined,
      providerSubscriptionId,
      status: args.status,
      eventEffect: buildCommunityAccessEventEffect(event),
      nowMs: Date.now(),
    },
  );
  return {
    ok: true,
    provider_subscription_id: providerSubscriptionId,
    subscription_status: args.status,
  };
}

function communitySubscriptionMutationSnapshot(
  subscription: Stripe.Subscription | null,
): Record<string, unknown> {
  if (!subscription) return { status: "ended" };
  const providerPriceId = subscription.items.data[0]?.price?.id ?? null;
  const { cycleStartedAt, cycleEndsAt } = readStripeSubscriptionCycle(subscription);
  return {
    status: normalizeStripeCommunitySubscriptionStatus({
      subscriptionStatus: subscription.status,
      cancelAtPeriodEnd: (subscription as any)?.cancel_at_period_end,
    }),
    providerPriceId,
    providerCustomerId:
      typeof subscription.customer === "string" ? subscription.customer : null,
    platformFeeBps: readStripeSubscriptionApplicationFeeBps(subscription),
    currentPeriodStartIso: toIsoStringOrUndefined(cycleStartedAt),
    currentPeriodEndIso: toIsoStringOrUndefined(cycleEndsAt),
    cancelAtPeriodEnd: Boolean((subscription as any)?.cancel_at_period_end),
  };
}

async function syncCommunityAccessForCurrentRefund(
  ctx: any,
  event: Stripe.Event,
  args: {
    charge: Stripe.Charge;
  },
): Promise<Record<string, unknown>> {
  const providerSubscriptionId = await resolveStripeSubscriptionIdFromCharge(args.charge);
  const subscription = await retrieveStripeSubscriptionForEvidence(providerSubscriptionId);
  const blockRequired = currentChargeRequiresRefundAccessBlock({
    amountBaseUnits: args.charge.amount,
    amountRefundedBaseUnits: (args.charge as any).amount_refunded,
    refunded: args.charge.refunded,
  });
  return await ctx.runMutation(
    internal.communityCommerce.applyCommunitySubscriptionAccessEventInternal as any,
    {
      providerSubscriptionId: providerSubscriptionId ?? undefined,
      ...communitySubscriptionMutationSnapshot(subscription),
      blockKind: "refund",
      blockSourceProviderObjectId: args.charge.id,
      blockAction: blockRequired ? "set" : "clear",
      blockReason: blockRequired ? "subscription_refunded" : undefined,
      eventEffect: buildCommunityAccessEventEffect(event),
      nowMs: Date.now(),
    },
  );
}

async function syncCommunityAccessForCurrentDispute(
  ctx: any,
  event: Stripe.Event,
  args: {
    dispute: Stripe.Dispute;
    charge: Stripe.Charge;
  },
): Promise<Record<string, unknown>> {
  const providerSubscriptionId = await resolveStripeSubscriptionIdFromCharge(args.charge);
  const subscription = await retrieveStripeSubscriptionForEvidence(providerSubscriptionId);
  const block = currentDisputeAccessBlock({ status: args.dispute.status });
  return await ctx.runMutation(
    internal.communityCommerce.applyCommunitySubscriptionAccessEventInternal as any,
    {
      providerSubscriptionId: providerSubscriptionId ?? undefined,
      ...communitySubscriptionMutationSnapshot(subscription),
      blockKind: "dispute",
      blockSourceProviderObjectId: args.dispute.id,
      blockAction: block.action,
      blockReason: block.action === "set" ? block.reason : undefined,
      eventEffect: buildCommunityAccessEventEffect(event),
      nowMs: Date.now(),
    },
  );
}

export async function syncCommunitySubscriptionEventFromCurrentProvider(
  ctx: any,
  event: Stripe.Event,
  deliveredSubscription: Stripe.Subscription,
): Promise<{
  status: "succeeded" | "ignored";
  payload: Record<string, unknown>;
}> {
  if (
    event.type !== "customer.subscription.updated" &&
    event.type !== "customer.subscription.deleted"
  ) {
    throw new Error("community_subscription_event_type_invalid");
  }

  const resolution = await resolveCurrentCommunitySubscriptionEvent({
    eventType: event.type,
    eventSubscription: deliveredSubscription,
    retrieveCurrent: retrieveStripeSubscriptionForEvidence,
  });
  const eventCreatedAt = readStripeEventCreatedAtMs(event);
  const providerSubscriptionId = resolution.providerSubscriptionId;
  const resolvedSubscription =
    resolution.kind === "current" ? resolution.subscription : null;
  const localSessionId =
    readStripeMetadataString(
      resolvedSubscription?.metadata,
      "local_session_id",
    ) ??
    readStripeMetadataString(
      deliveredSubscription.metadata,
      "local_session_id",
    );
  const communityCheckoutSession = localSessionId
    ? await ctx.runQuery(
        internal.communityCommerce
          .getCommunityJoinCheckoutSessionInternal as any,
        { sessionId: localSessionId },
      )
    : null;

  if (resolution.kind === "missing") {
    if (communityCheckoutSession && localSessionId) {
      await ctx.runMutation(
        internal.communityCommerce
          .syncPendingCommunityCheckoutSubscriptionInternal as any,
        {
          sessionId: localSessionId,
          providerSubscriptionId,
          subscriptionStatus: "ended",
          cancelAtPeriodEnd: false,
          markComplete: false,
          nowMs: eventCreatedAt,
        },
      );
    }
    const communityLifecycleResult =
      await syncCommunitySubscriptionRiskStatus(ctx, event, {
        providerSubscriptionId,
        status: "ended",
      });
    if (communityCheckoutSession || !communityLifecycleResult.ignored) {
      return {
        status: "succeeded",
        payload: {
          received: true,
          reason: "community_subscription_provider_missing",
          communityLifecycleResult,
        },
      };
    }
    return {
      status: "ignored",
      payload: {
        ignored: true,
        reason: "community_subscription_not_found",
      },
    };
  }

  const subscription = resolution.subscription;
  const providerPriceId = subscription.items.data[0]?.price?.id ?? null;
  const cycle = readStripeSubscriptionCycle(subscription);
  const subscriptionStatus = normalizeStripeCommunitySubscriptionStatus({
    subscriptionStatus: subscription.status,
    cancelAtPeriodEnd: (subscription as any)?.cancel_at_period_end,
  });
  if (communityCheckoutSession && localSessionId) {
    await ctx.runMutation(
      internal.communityCommerce
        .syncPendingCommunityCheckoutSubscriptionInternal as any,
      {
        sessionId: localSessionId,
        providerCustomerId:
          typeof subscription.customer === "string"
            ? subscription.customer
            : null,
        providerSubscriptionId: subscription.id,
        providerPriceId,
        subscriptionStatus,
        currentPeriodStartAt: cycle.cycleStartedAt,
        currentPeriodEndAt: cycle.cycleEndsAt,
        cancelAtPeriodEnd: Boolean(
          (subscription as any)?.cancel_at_period_end,
        ),
        markComplete: false,
        nowMs: eventCreatedAt,
      },
    );
  }
  const communityLifecycleResult =
    await syncCommunitySubscriptionFromStripeSubscription(
      ctx,
      event,
      subscription,
    );
  if (!communityLifecycleResult.ignored) {
    return {
      status: "succeeded",
      payload: { received: true, communityLifecycleResult },
    };
  }
  return {
    status: "ignored",
    payload: {
      ignored: true,
      reason:
        communityLifecycleResult.reason ??
        "community_subscription_not_found",
    },
  };
}

async function hasRecoverableCommunitySubscriptionAuthority(
  ctx: any,
  deliveredSubscription: Stripe.Subscription,
): Promise<boolean> {
  const providerSubscriptionId = String(deliveredSubscription.id ?? "").trim();
  if (!providerSubscriptionId) {
    throw new Error("community_subscription_event_identity_missing");
  }
  const existingCommunitySubscription = await ctx.runQuery(
    internal.communityCommerce
      .getCommunitySubscriptionByProviderSubscriptionIdInternal as any,
    { providerSubscriptionId },
  );
  if (existingCommunitySubscription?.communityId) return true;
  const localSessionId = readStripeMetadataString(
    deliveredSubscription.metadata,
    "local_session_id",
  );
  if (!localSessionId) return false;
  const communityCheckoutSession = await ctx.runQuery(
    internal.communityCommerce.getCommunityJoinCheckoutSessionInternal as any,
    { sessionId: localSessionId },
  );
  return Boolean(communityCheckoutSession?.communityId);
}

async function processCommunitySubscriptionEventWithRecovery(
  ctx: any,
  event: Stripe.Event,
  deliveredSubscription: Stripe.Subscription,
): Promise<{
  status: "succeeded" | "ignored";
  payload: Record<string, unknown>;
  acknowledgedOnly?: boolean;
}> {
  const effect = buildCommunityAccessEventEffect(event);
  const leaseToken = `stripe_subscription_${crypto.randomUUID()}`;
  const recovery = await ctx.runMutation(
    (internal as any).communitySubscriptionRecovery
      .beginCommunitySubscriptionEventRecoveryInternal,
    {
      providerAccountId: effect.providerAccountId,
      providerEventId: effect.providerEventId,
      providerEventType: event.type,
      providerSubscriptionId: String(deliveredSubscription.id ?? "").trim(),
      livemode: effect.livemode,
      providerCreatedAt: effect.providerCreatedAt,
      leaseToken,
      nowMs: Date.now(),
    },
  );
  if (!recovery?.claimed) {
    return {
      status: recovery?.status === "ignored" ? "ignored" : "succeeded",
      payload: {
        received: true,
        reason: "community_subscription_recovery_already_owned",
        recovery_status: recovery?.status ?? "unknown",
      },
      acknowledgedOnly: true,
    };
  }

  try {
    const result = await syncCommunitySubscriptionEventFromCurrentProvider(
      ctx,
      event,
      deliveredSubscription,
    );
    const completion = await ctx.runMutation(
      (internal as any).communitySubscriptionRecovery
        .completeCommunitySubscriptionEventRecoveryInternal,
      {
        recoveryId: recovery.recoveryId,
        leaseToken,
        outcome: result.status,
        nowMs: Date.now(),
      },
    );
    if (!completion?.ok) {
      throw new Error("community_subscription_recovery_stale_lease");
    }
    return result;
  } catch (error) {
    const failure = await ctx.runMutation(
      (internal as any).communitySubscriptionRecovery
        .failCommunitySubscriptionEventRecoveryInternal,
      {
        recoveryId: recovery.recoveryId,
        leaseToken,
        errorCode: communitySubscriptionRecoveryErrorCode(error),
        nowMs: Date.now(),
      },
    );
    if (!failure?.ok) throw error;
    return {
      status: "succeeded",
      payload: {
        received: true,
        reason: failure.terminal
          ? "community_subscription_recovery_terminal"
          : "community_subscription_recovery_queued",
        recovery_status: failure.status,
        next_attempt_at: failure.nextAttemptAt,
      },
      acknowledgedOnly: true,
    };
  }
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
      let stripeEventType: string | null = null;
      let stripeEventId: string | null = null;
      try {
        event = await verifyStripeWebhookSignature({ payload, signature });
        stripeEventType = event.type;
        stripeEventId = event.id;
        await recordStripeWebhookAudit(ctx, {
          eventKey: `stripe_webhook_received:${event.id}`,
          eventType: "stripe_webhook_received",
          status: "started",
          stripeEventType,
          stripeEventId,
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
          auditEventType:
            | "stripe_webhook_processed"
            | "stripe_webhook_recovery_accepted" = "stripe_webhook_processed",
        ) => {
          const auditSuffix = `${stripeEventId ?? "unknown"}:${status}:${String(responsePayload.reason ?? responsePayload.event ?? "received")}`;
          const auditIdentity = {
            status,
            stripeEventType,
            stripeEventId,
            metadata: { response: responsePayload },
          };
          if (auditEventType === "stripe_webhook_recovery_accepted") {
            await recordStripeWebhookAudit(ctx, {
              ...auditIdentity,
              eventKey: `stripe_webhook_recovery_accepted:${auditSuffix}`,
              eventType: "stripe_webhook_recovery_accepted",
            });
          } else {
            await recordStripeWebhookAudit(ctx, {
              ...auditIdentity,
              eventKey: `stripe_webhook_processed:${auditSuffix}`,
              eventType: "stripe_webhook_processed",
            });
          }
          return jsonResponse(req, 200, responsePayload);
        };

        const eventCreatedAt =
          Number(event.created ?? 0) > 0
            ? Number(event.created) * 1000
            : Date.now();

        if (event.type === "setup_intent.succeeded") {
          const setupIntent = event.data.object as Stripe.SetupIntent;
          if (readStripeMetadataString(setupIntent.metadata, "checkout_mode") === "workspace_card_setup") {
            const providerCustomerId = readStripeCustomerId(setupIntent.customer);
            const paymentMethodId = readStripePaymentMethodId(setupIntent.payment_method);
            if (!providerCustomerId || !paymentMethodId) {
              return processedResponse({
                ok: true,
                ignored: true,
                event: event.type,
                reason: "workspace_card_setup_intent_identity_missing",
              }, "ignored");
            }
            const stripe = getStripeClient();
            const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
            await stripe.customers.update(providerCustomerId, {
              invoice_settings: {
                default_payment_method: paymentMethodId,
              },
            });
            const result = await syncWorkspaceCardTruthForStripeCustomer({
              ctx,
              providerCustomerId,
              checkedAt: eventCreatedAt,
              preferredPaymentMethod: paymentMethod,
            });
            return processedResponse({
              ok: true,
              received: true,
              event: event.type,
              result,
            });
          }
        }

        if (event.type === "payment_method.detached") {
          const paymentMethod = event.data.object as Stripe.PaymentMethod;
          const paymentMethodId = readStripePaymentMethodId(paymentMethod);
          const localCustomerByPaymentMethod = paymentMethodId
            ? await (ctx as any).runQuery(
                internal.stripeCustomers
                  .getUserStripeCustomerByProviderPaymentMethodIdInternal as any,
                {
                  providerDefaultPaymentMethodId: paymentMethodId,
                },
              )
            : null;
          const providerCustomerId =
            readStripeCustomerId((paymentMethod as any).customer) ??
            readStripeCustomerId((event.data as any)?.previous_attributes?.customer) ??
            readStripeCustomerId(localCustomerByPaymentMethod?.providerCustomerId);
          if (!providerCustomerId) {
            return processedResponse({
              ok: true,
              ignored: true,
              event: event.type,
              reason: "workspace_card_detached_customer_missing",
            }, "ignored");
          }
          const result = await syncWorkspaceCardTruthForStripeCustomer({
            ctx,
            providerCustomerId,
            checkedAt: eventCreatedAt,
            missingStatus: "detached",
          });
          return processedResponse({
            ok: true,
            received: true,
            event: event.type,
            result,
          });
        }

        if (event.type === "customer.updated") {
          const customer = event.data.object as Stripe.Customer;
          const providerCustomerId = readStripeCustomerId(customer);
          if (!providerCustomerId) {
            return processedResponse({
              ok: true,
              ignored: true,
              event: event.type,
              reason: "workspace_card_customer_updated_id_missing",
            }, "ignored");
          }
          const result = await syncWorkspaceCardTruthForStripeCustomer({
            ctx,
            providerCustomerId,
            checkedAt: eventCreatedAt,
            preferredPaymentMethod: (customer as any)?.invoice_settings?.default_payment_method,
          });
          return processedResponse({
            ok: true,
            received: true,
            event: event.type,
            result,
          });
        }

        if (
          event.type === "checkout.session.completed" ||
          event.type === "checkout.session.async_payment_succeeded"
        ) {
          const session = event.data.object as Stripe.Checkout.Session;
          const localSessionId =
            readStripeLocalSessionIdFromCheckoutSession(session);
          if (localSessionId) {
            const topupCheckoutSession = await (ctx as any).runQuery(
              internal.workspaceCredits
                .getWorkspaceCreditTopupCheckoutSessionInternal as any,
              {
                sessionId: localSessionId,
              },
            );
            if (topupCheckoutSession) {
              const paymentStatus = String(session.payment_status ?? "")
                .trim()
                .toLowerCase();
              if (paymentStatus !== "paid") {
                return processedResponse({
                  ok: true,
                  ignored: true,
                  event: event.type,
                  reason: "workspace_credit_topup_payment_pending",
                }, "ignored");
              }
              const result = await (ctx as any).runMutation(
                internal.workspaceCredits
                  .completeWorkspaceCreditTopupCheckoutSessionInternal as any,
                {
                  localSessionId,
                  providerCheckoutSessionId: session.id,
                  providerCustomerId:
                    typeof session.customer === "string"
                      ? session.customer
                      : null,
                  providerPriceId: topupCheckoutSession.providerPriceId ?? null,
                  nowMs: eventCreatedAt,
                },
              );
              return processedResponse({
                ok: true,
                received: true,
                event: event.type,
                result,
              });
            }
            const premiumCheckoutSession = await (ctx as any).runQuery(
              (internal as any).premiumBilling
                .getPremiumSubscriptionCheckoutSessionInternal,
              {
                sessionId: localSessionId,
              },
            );
            if (premiumCheckoutSession) {
              if (!readStripePaymentReady(session.payment_status)) {
                return processedResponse({
                  ok: true,
                  ignored: true,
                  event: event.type,
                  reason: "premium_subscription_payment_pending",
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
                  reason: "premium_subscription_missing",
                }, "ignored");
              }
              const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
              const providerPriceId = subscription.items.data[0]?.price?.id ?? null;
              const { cycleStartedAt, cycleEndsAt } =
                readStripeSubscriptionCycle(subscription);
              const subscriptionStatus = normalizeStripeCommunitySubscriptionStatus({
                subscriptionStatus: subscription.status,
                cancelAtPeriodEnd: (subscription as any)?.cancel_at_period_end,
              });
              const result = await (ctx as any).runMutation(
                (internal as any).premiumBilling
                  .completePremiumSubscriptionCheckoutSessionInternal,
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
                  subscriptionStatus,
                  currentPeriodStartAt: cycleStartedAt,
                  currentPeriodEndAt: cycleEndsAt,
                  cancelAtPeriodEnd: Boolean((subscription as any)?.cancel_at_period_end),
                  nowMs: eventCreatedAt,
                },
              );
              return processedResponse({
                ok: true,
                received: true,
                event: event.type,
                result,
              });
            }
          }
        }

        if (event.type === "checkout.session.completed") {
          const session = event.data.object as Stripe.Checkout.Session;
          if (readStripeMetadataString(session.metadata, "checkout_mode") === "workspace_card_setup") {
            const userId = readStripeMetadataString(session.metadata, "user_id");
            const providerCustomerId = readStripeCustomerId(session.customer);
            const setupIntentId = readStripeObjectId(session.setup_intent);
            if (!userId || !providerCustomerId || !setupIntentId) {
              return processedResponse({
                ok: true,
                ignored: true,
                event: event.type,
                reason: "workspace_card_setup_identity_missing",
              }, "ignored");
            }
            const stripe = getStripeClient();
            const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, {
              expand: ["payment_method"],
            });
            const paymentMethod = (setupIntent as any)?.payment_method;
            const paymentMethodId = readStripePaymentMethodId(paymentMethod);
            if (!paymentMethodId) {
              return processedResponse({
                ok: true,
                ignored: true,
                event: event.type,
                reason: "workspace_card_setup_payment_method_missing",
              }, "ignored");
            }
            await stripe.customers.update(providerCustomerId, {
              invoice_settings: {
                default_payment_method: paymentMethodId,
              },
            });
            const result = await syncWorkspaceCardTruthForStripeCustomer({
              ctx,
              providerCustomerId,
              checkedAt: eventCreatedAt,
              preferredPaymentMethod: paymentMethod,
            });
            return processedResponse({
              ok: true,
              received: true,
              event: event.type,
              reason: "workspace_card_setup_synced",
              result,
            });
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
              await stripe.subscriptions.retrieve(subscriptionId);
            const providerPriceId = subscription.items.data[0]?.price?.id ?? null;
            const { cycleStartedAt, cycleEndsAt } =
              readStripeSubscriptionCycle(subscription);
            const latestInvoice =
              readStripeSubscriptionLatestInvoice(subscription) ??
              await retrieveStripeInvoiceForEvidence(
                readStripeObjectId((subscription as any)?.latest_invoice),
              );
            if (!latestInvoice) {
              throw new Error("community_checkout_invoice_evidence_missing");
            }
            const initialInvoiceEvidence = readStripeInvoiceEvidence(
              latestInvoice,
            );
            await (ctx as any).runMutation(
              internal.communityCommerce
                .syncPendingCommunityCheckoutSubscriptionInternal as any,
              {
                sessionId: localSessionId,
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
                settledRevenueBaseUnits: readSettledInvoiceRevenueExcludingTax(latestInvoice),
                platformFeeBps: readStripeSubscriptionApplicationFeeBps(subscription),
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
          const amountBaseUnits = readSettledInvoiceRevenueExcludingTax(invoice);
          const currency = String(invoice.currency ?? "").trim().toLowerCase();
          if (!Number.isFinite(amountBaseUnits) || amountBaseUnits <= 0 || !currency) {
            return processedResponse({
              ok: true,
              ignored: true,
              event: event.type,
              reason: "invoice_paid_amount_missing",
            }, "ignored");
          }
          const invoiceEvidence = readStripeInvoiceEvidence(invoice);
          const subscription = await retrieveStripeSubscriptionForEvidence(providerSubscriptionId);
          const communityLifecycleResult = await syncCommunitySubscriptionFromStripeSubscription(
            ctx,
            event,
            subscription,
          );
          const partnerCommissionResult = await (ctx as any).runMutation(
            internal.builderPartners
              .recordCommunitySubscriptionInvoicePartnerCommissionInternal as any,
            {
              providerSubscriptionId,
              sourceProviderInvoiceId: invoice.id,
              sourceProviderPaymentIntentId:
                invoiceEvidence.sourceProviderPaymentIntentId ?? undefined,
              sourceProviderChargeId:
                invoiceEvidence.sourceProviderChargeId ?? undefined,
              amountBaseUnits,
              currency,
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
            communityLifecycleResult,
            partnerCommissionResult,
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
          const subscription = await retrieveStripeSubscriptionForEvidence(providerSubscriptionId);
          const communityLifecycleResult = subscription
            ? await syncCommunitySubscriptionFromStripeSubscription(ctx, event, subscription)
            : await syncCommunitySubscriptionRiskStatus(ctx, event, {
              providerSubscriptionId,
              status: "past_due",
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
          );
          if (!charge) throw new Error("stripe_refund_charge_current_truth_missing");
          const chargeEvidence = readStripeChargeEvidence(charge);
          const refundStatus = String((refund as any)?.status ?? "")
            .trim()
            .toLowerCase();
          const refundFailed =
            event.type === "refund.failed" ||
            refundStatus === "failed" ||
            refundStatus === "canceled";
          if (refundFailed) {
            const communityAccessResult = await syncCommunityAccessForCurrentRefund(
              ctx,
              event,
              { charge },
            );
            return processedResponse({
              ok: true,
              received: true,
              event: event.type,
              reason: "refund_current_charge_reconciled",
              communityAccessResult,
            });
          }
          const partnerAdjustmentResult = await (ctx as any).runMutation(
            internal.builderPartners
              .recordPartnerCommissionRefundAdjustmentInternal as any,
            {
              sourceProviderRefundId: refundEvidence.sourceProviderRefundId,
              sourceProviderChargeId:
                refundEvidence.sourceProviderChargeId ??
                chargeEvidence?.sourceProviderChargeId ??
                undefined,
              sourceProviderPaymentIntentId:
                refundEvidence.sourceProviderPaymentIntentId ??
                chargeEvidence?.sourceProviderPaymentIntentId ??
                undefined,
              sourceProviderInvoiceId:
                chargeEvidence?.sourceProviderInvoiceId ?? undefined,
              refundAmountBaseUnits:
                typeof refund.amount === "number" ? refund.amount : undefined,
              chargeAmountBaseUnits:
                typeof charge?.amount === "number" ? charge.amount : undefined,
              currency: String(refund.currency ?? charge?.currency ?? "")
                .trim()
                .toLowerCase() || undefined,
              nowMs:
                Number(event.created ?? 0) > 0
                  ? Number(event.created) * 1000
                : Date.now(),
            },
          );
          const communityAccessResult = await syncCommunityAccessForCurrentRefund(
            ctx,
            event,
            { charge },
          );
          return processedResponse({
            ok: true,
            received: true,
            event: event.type,
            partnerAdjustmentResult,
            communityAccessResult,
          });
        }

        if (event.type === "charge.refunded") {
          const deliveredCharge = event.data.object as Stripe.Charge;
          const deliveredChargeId = readStripeObjectId(deliveredCharge);
          const charge = await retrieveStripeChargeForEvidence(deliveredChargeId);
          if (!charge) throw new Error("stripe_refunded_charge_current_truth_missing");
          const chargeEvidence = readStripeChargeEvidence(charge);
          const refunds = Array.isArray((deliveredCharge as any)?.refunds?.data)
            ? (deliveredCharge as any).refunds.data as Stripe.Refund[]
            : [];
          const partnerAdjustmentReason = refunds.length <= 0
            ? "charge_refunded_refunds_missing"
            : undefined;
          const results = [];
          for (const refund of refunds) {
            const refundEvidence = readStripeRefundEvidence(refund);
            const partnerAdjustmentResult = await (ctx as any).runMutation(
              internal.builderPartners
                .recordPartnerCommissionRefundAdjustmentInternal as any,
              {
                sourceProviderRefundId:
                  refundEvidence.sourceProviderRefundId ?? String(refund.id ?? ""),
                sourceProviderChargeId:
                  refundEvidence.sourceProviderChargeId ??
                  chargeEvidence.sourceProviderChargeId ??
                  undefined,
                sourceProviderPaymentIntentId:
                  refundEvidence.sourceProviderPaymentIntentId ??
                  chargeEvidence.sourceProviderPaymentIntentId ??
                  undefined,
                sourceProviderInvoiceId:
                  chargeEvidence.sourceProviderInvoiceId ?? undefined,
                refundAmountBaseUnits:
                  typeof refund.amount === "number" ? refund.amount : undefined,
                chargeAmountBaseUnits:
                  typeof charge.amount === "number" ? charge.amount : undefined,
                currency: String(refund.currency ?? charge.currency ?? "")
                  .trim()
                  .toLowerCase() || undefined,
                nowMs:
                  Number(event.created ?? 0) > 0
                    ? Number(event.created) * 1000
                  : Date.now(),
              },
            );
            results.push({
              partnerAdjustmentResult,
            });
          }
          const communityAccessResult = await syncCommunityAccessForCurrentRefund(
            ctx,
            event,
            { charge },
          );
          return processedResponse({
            ok: true,
            received: true,
            event: event.type,
            results,
            partnerAdjustmentReason,
            communityAccessResult,
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
          const currentDispute = await retrieveStripeDisputeForEvidence(
            disputeEvidence.sourceProviderDisputeId,
          );
          if (!currentDispute) throw new Error("stripe_dispute_current_truth_missing");
          const currentDisputeEvidence = readStripeDisputeEvidence(currentDispute);
          const charge = await retrieveStripeChargeForEvidence(
            currentDisputeEvidence.sourceProviderChargeId,
          );
          if (!charge) throw new Error("stripe_dispute_charge_current_truth_missing");
          const chargeEvidence = readStripeChargeEvidence(charge);
          if (event.type === "charge.dispute.created") {
            const partnerAdjustmentResult = await (ctx as any).runMutation(
              internal.builderPartners
                .recordPartnerCommissionDisputeOpenedInternal as any,
              {
                sourceProviderDisputeId: disputeEvidence.sourceProviderDisputeId,
                sourceProviderChargeId:
                  disputeEvidence.sourceProviderChargeId ??
                  chargeEvidence?.sourceProviderChargeId ??
                  undefined,
                sourceProviderPaymentIntentId:
                  disputeEvidence.sourceProviderPaymentIntentId ??
                  chargeEvidence?.sourceProviderPaymentIntentId ??
                  undefined,
                sourceProviderInvoiceId:
                  chargeEvidence?.sourceProviderInvoiceId ?? undefined,
                disputeAmountBaseUnits:
                  typeof dispute.amount === "number" ? dispute.amount : undefined,
                chargeAmountBaseUnits:
                  typeof charge?.amount === "number" ? charge.amount : undefined,
                currency: String(dispute.currency ?? charge?.currency ?? "")
                  .trim()
                  .toLowerCase() || undefined,
                nowMs:
                  Number(event.created ?? 0) > 0
                    ? Number(event.created) * 1000
                  : Date.now(),
              },
            );
            const communityAccessResult = await syncCommunityAccessForCurrentDispute(ctx, event, {
              dispute: currentDispute,
              charge,
            });
            return processedResponse({
              ok: true,
              received: true,
              event: event.type,
              partnerAdjustmentResult,
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
          const partnerAdjustmentResult = await (ctx as any).runMutation(
            internal.builderPartners
              .recordPartnerCommissionDisputeClosedInternal as any,
            {
              sourceProviderDisputeId: disputeEvidence.sourceProviderDisputeId,
              outcome,
              sourceProviderChargeId:
                disputeEvidence.sourceProviderChargeId ??
                chargeEvidence?.sourceProviderChargeId ??
                undefined,
              sourceProviderPaymentIntentId:
                disputeEvidence.sourceProviderPaymentIntentId ??
                chargeEvidence?.sourceProviderPaymentIntentId ??
                undefined,
              sourceProviderInvoiceId:
                chargeEvidence?.sourceProviderInvoiceId ?? undefined,
              disputeAmountBaseUnits:
                typeof dispute.amount === "number" ? dispute.amount : undefined,
              chargeAmountBaseUnits:
                typeof charge?.amount === "number" ? charge.amount : undefined,
              currency: String(dispute.currency ?? charge?.currency ?? "")
                .trim()
                .toLowerCase() || undefined,
              nowMs:
                Number(event.created ?? 0) > 0
                  ? Number(event.created) * 1000
                : Date.now(),
            },
          );
          const communityAccessResult = await syncCommunityAccessForCurrentDispute(ctx, event, {
            dispute: currentDispute,
            charge,
          });
          return processedResponse({
            ok: true,
            received: true,
            event: event.type,
            partnerAdjustmentResult,
            communityAccessResult,
          });
        }

        if (
          event.type === "customer.subscription.updated" ||
          event.type === "customer.subscription.deleted"
        ) {
          const deliveredSubscription = event.data.object as Stripe.Subscription;
          const deliveredLocalSessionId = readStripeMetadataString(
            deliveredSubscription.metadata,
            "local_session_id",
          );
          const deliveredProviderPriceId =
            deliveredSubscription.items.data[0]?.price?.id ?? null;
          const { cycleStartedAt, cycleEndsAt } =
            readStripeSubscriptionCycle(deliveredSubscription);
          const normalizedCommunityStatus =
            normalizeStripeCommunitySubscriptionStatus({
              subscriptionStatus: deliveredSubscription.status,
              cancelAtPeriodEnd:
                (deliveredSubscription as any)?.cancel_at_period_end,
            });
          const premiumSubscriptionResult = await (ctx as any).runMutation(
            (internal as any).premiumBilling
              .syncPremiumSubscriptionFromStripeInternal,
            {
              localSessionId: deliveredLocalSessionId,
              providerCustomerId:
                typeof deliveredSubscription.customer === "string"
                  ? deliveredSubscription.customer
                  : null,
              providerSubscriptionId: deliveredSubscription.id,
              providerPriceId: deliveredProviderPriceId,
              subscriptionStatus: normalizedCommunityStatus,
              currentPeriodStartAt: cycleStartedAt,
              currentPeriodEndAt: cycleEndsAt,
              cancelAtPeriodEnd: Boolean(
                (deliveredSubscription as any)?.cancel_at_period_end,
              ),
              nowMs:
                Number(event.created ?? 0) > 0
                  ? Number(event.created) * 1000
                  : Date.now(),
            },
          );
          if (!premiumSubscriptionResult?.ignored) {
            return processedResponse({
              ok: true,
              received: true,
              event: event.type,
              premiumSubscriptionResult,
            });
          }

          const communityRecoveryEnabled =
            await hasRecoverableCommunitySubscriptionAuthority(
              ctx,
              deliveredSubscription,
            );
          const communityResult = communityRecoveryEnabled
            ? await processCommunitySubscriptionEventWithRecovery(
                ctx,
                event,
                deliveredSubscription,
              )
            : await syncCommunitySubscriptionEventFromCurrentProvider(
                ctx,
                event,
                deliveredSubscription,
              );
          if (
            "acknowledgedOnly" in communityResult &&
            communityResult.acknowledgedOnly
          ) {
            return processedResponse({
              ok: true,
              event: event.type,
              ...communityResult.payload,
            }, "succeeded", "stripe_webhook_recovery_accepted");
          }
          return processedResponse({
            ok: true,
            event: event.type,
            ...communityResult.payload,
          }, communityResult.status);
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
