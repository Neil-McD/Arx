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

type BillingSubscriptionSyncInput = {
  community_id?: unknown;
  communityId?: unknown;
  user_id?: unknown;
  userId?: unknown;
  status?: unknown;
  price_point_id?: unknown;
  pricePointId?: unknown;
  provider_price_id?: unknown;
  providerPriceId?: unknown;
  provider_subscription_id?: unknown;
  providerSubscriptionId?: unknown;
  provider_customer_id?: unknown;
  providerCustomerId?: unknown;
  current_period_start_at?: unknown;
  currentPeriodStartAt?: unknown;
  current_period_end_at?: unknown;
  currentPeriodEndAt?: unknown;
  cancel_at_period_end?: unknown;
  cancelAtPeriodEnd?: unknown;
  now_ms?: unknown;
  nowMs?: unknown;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function parseOptionalString(value: unknown, maxLen = 300): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function parseOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "on"
  )
    return true;
  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "off"
  )
    return false;
  return null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.floor(value);
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function safeEquals(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let index = 0; index < aBytes.length; index += 1) {
    diff |= aBytes[index]! ^ bBytes[index]!;
  }
  return diff === 0;
}

function readSyncSecret(req: Request): string | null {
  const bearer = String(req.headers.get("authorization") ?? "").trim();
  if (bearer.toLowerCase().startsWith("bearer ")) {
    const token = bearer.slice(7).trim();
    if (token) return token;
  }
  const headerSecret = String(
    req.headers.get("x-arx-billing-sync-secret") ?? "",
  ).trim();
  return headerSecret || null;
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

async function retrieveStripeChargeForEvidence(chargeId: string | null): Promise<Stripe.Charge | null> {
  if (!chargeId) return null;
  try {
    return await getStripeClient().charges.retrieve(chargeId);
  } catch {
    return null;
  }
}

async function retrieveStripeInvoiceForEvidence(invoiceId: string | null): Promise<Stripe.Invoice | null> {
  if (!invoiceId) return null;
  try {
    return await getStripeClient().invoices.retrieve(invoiceId);
  } catch {
    return null;
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

export function registerRuntimeBillingRoutes(
  args: RegisterRuntimeBillingRoutesArgs,
): void {
  const { http, httpAction, jsonResponse, optionsResponse } = args;

  http.route({
    path: "/billing/community_subscription_sync",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/billing/community_subscription_sync",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const requestPath = new URL(req.url).pathname;
      const configuredSecret = readEnv("ARX_BILLING_SYNC_SECRET");
      if (!configuredSecret) {
        return jsonResponse(req, 503, {
          ok: false,
          code: "billing_sync_not_configured",
          error: "billing_sync_not_configured",
          message: "Billing sync secret is not configured.",
        });
      }

      const providedSecret = readSyncSecret(req);
      if (!providedSecret || !safeEquals(configuredSecret, providedSecret)) {
        return jsonResponse(req, 401, {
          ok: false,
          code: "billing_sync_forbidden",
          error: "billing_sync_forbidden",
          message: "Billing sync request is not authorized.",
        });
      }

      let input: BillingSubscriptionSyncInput = {};
      try {
        input = (await req.json()) as BillingSubscriptionSyncInput;
      } catch {
        input = {};
      }

      const communityId = parseOptionalString(
        input.community_id ?? input.communityId,
        200,
      );
      const userId = parseOptionalString(input.user_id ?? input.userId, 200);
      const status = parseOptionalString(input.status, 120);
      if (!communityId || !userId || !status) {
        return jsonResponse(req, 400, {
          ok: false,
          code: "billing_sync_invalid_payload",
          error: "billing_sync_invalid_payload",
          message: "community_id, user_id, and status are required.",
        });
      }

      try {
        const result = await (ctx as any).runMutation(
          internal.billing.syncCommunitySubscriptionLifecycleInternal as any,
          {
            communityId,
            userId,
            source: "external_sync",
            status,
            pricePointId:
              parseOptionalString(
                input.price_point_id ?? input.pricePointId,
                200,
              ) ?? undefined,
            providerPriceId:
              parseOptionalString(
                input.provider_price_id ?? input.providerPriceId,
                200,
              ) ?? undefined,
            providerSubscriptionId:
              parseOptionalString(
                input.provider_subscription_id ?? input.providerSubscriptionId,
                300,
              ) ?? undefined,
            providerCustomerId:
              parseOptionalString(
                input.provider_customer_id ?? input.providerCustomerId,
                300,
              ) ?? undefined,
            currentPeriodStartIso:
              parseOptionalString(
                input.current_period_start_at ?? input.currentPeriodStartAt,
                120,
              ) ?? undefined,
            currentPeriodEndIso:
              parseOptionalString(
                input.current_period_end_at ?? input.currentPeriodEndAt,
                120,
              ) ?? undefined,
            cancelAtPeriodEnd:
              parseOptionalBoolean(
                input.cancel_at_period_end ?? input.cancelAtPeriodEnd,
              ) ?? undefined,
            nowMs:
              parseOptionalNumber(input.now_ms ?? input.nowMs) ?? undefined,
          },
        );
        return jsonResponse(req, 200, {
          ok: true,
          result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logStructuredError("billing_sync_failed", {
          error,
          requestPath,
          communityId,
          userId,
          subscriptionStatus: status,
        });
        return jsonResponse(req, 400, {
          ok: false,
          code: message || "billing_sync_failed",
          error: message || "billing_sync_failed",
          message: message || "Billing sync failed.",
        });
      }
    }),
  });

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
        ) => {
          await recordStripeWebhookAudit(ctx, {
            eventKey: `stripe_webhook_processed:${stripeEventId ?? "unknown"}:${status}:${String(responsePayload.reason ?? responsePayload.event ?? "received")}`,
            eventType: "stripe_webhook_processed",
            status,
            stripeEventType,
            stripeEventId,
            metadata: {
              response: responsePayload,
            },
          });
          return jsonResponse(req, 200, responsePayload);
        };

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
              if (
                paymentStatus &&
                paymentStatus !== "paid" &&
                paymentStatus !== "no_payment_required"
              ) {
                return processedResponse({
                  ok: true,
                  ignored: true,
                  event: event.type,
                  reason: "workspace_credit_topup_payment_pending",
                }, "ignored");
              }
              const metadataCreditsAmount = parseOptionalNumber(
                readStripeMetadataString(
                  session.metadata,
                  "workspace_credits_amount",
                ),
              );
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
                  workspaceCreditsAmount: metadataCreditsAmount ?? undefined,
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
                result,
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
          const invoiceEvidence = readStripeInvoiceEvidence(invoice);
          const result = await (ctx as any).runMutation(
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
            result,
          });
        }

        if (
          event.type === "refund.created" ||
          event.type === "refund.updated" ||
          event.type === "refund.failed"
        ) {
          const refund = event.data.object as Stripe.Refund;
          if (event.type === "refund.failed") {
            return processedResponse({
              ok: true,
              ignored: true,
              event: event.type,
              reason: "refund_failed_no_reversal",
            }, "ignored");
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
          );
          const chargeEvidence = charge ? readStripeChargeEvidence(charge) : null;
          const result = await (ctx as any).runMutation(
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
          return processedResponse({
            ok: true,
            received: true,
            event: event.type,
            result,
          });
        }

        if (event.type === "charge.refunded") {
          const charge = event.data.object as Stripe.Charge;
          const chargeEvidence = readStripeChargeEvidence(charge);
          const refunds = Array.isArray((charge as any)?.refunds?.data)
            ? (charge as any).refunds.data as Stripe.Refund[]
            : [];
          const refundRows = refunds.length > 0
            ? refunds
            : [{
                id: `charge_refunded:${charge.id}:${String((charge as any).amount_refunded ?? "")}`,
                amount: (charge as any).amount_refunded,
                currency: charge.currency,
              } as Stripe.Refund];
          const results = [];
          for (const refund of refundRows) {
            const refundEvidence = readStripeRefundEvidence(refund);
            const result = await (ctx as any).runMutation(
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
            results.push(result);
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
          );
          const chargeEvidence = charge ? readStripeChargeEvidence(charge) : null;
          if (event.type === "charge.dispute.created") {
            const result = await (ctx as any).runMutation(
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
            return processedResponse({
              ok: true,
              received: true,
              event: event.type,
              result,
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
          const result = await (ctx as any).runMutation(
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
          return processedResponse({
            ok: true,
            received: true,
            event: event.type,
            result,
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
          if (localSessionId) {
            const communityCheckoutSession = await (ctx as any).runQuery(
              internal.communityCommerce.getCommunityJoinCheckoutSessionInternal as any,
              {
                sessionId: localSessionId,
              },
            );
            if (communityCheckoutSession) {
              await (ctx as any).runMutation(
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
          const existingCommunitySubscription = await (ctx as any).runQuery(
            internal.communityCommerce
              .getCommunitySubscriptionByProviderSubscriptionIdInternal as any,
            {
              providerSubscriptionId: subscription.id,
            },
          );
          if (existingCommunitySubscription?.communityId && existingCommunitySubscription?.userId) {
            await (ctx as any).runMutation(
              internal.billing.syncCommunitySubscriptionLifecycleInternal as any,
              {
                communityId: existingCommunitySubscription.communityId,
                userId: existingCommunitySubscription.userId,
                source: "stripe",
                pricePointId: existingCommunitySubscription.pricePointId ?? undefined,
                providerPriceId,
                providerSubscriptionId: subscription.id,
                providerCustomerId:
                  typeof subscription.customer === "string"
                    ? subscription.customer
                    : null,
                status: normalizedCommunityStatus,
                currentPeriodStartIso:
                  typeof cycleStartedAt === "number"
                    ? new Date(cycleStartedAt).toISOString()
                    : undefined,
                currentPeriodEndIso:
                  typeof cycleEndsAt === "number"
                    ? new Date(cycleEndsAt).toISOString()
                    : undefined,
                cancelAtPeriodEnd: Boolean((subscription as any)?.cancel_at_period_end),
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
            reason: "community_subscription_not_found",
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
