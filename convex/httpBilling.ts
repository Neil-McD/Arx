import { internal } from "./_generated/api";
import {
  getStripeClient,
  isBuilderStripePriceId,
  verifyStripeWebhookSignature,
} from "./stripeCore";
import Stripe from "stripe";
import type { PublicHttpAction } from "convex/server";
import { logStructuredError } from "./errorLogging";

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

function readStripeTargetTier(raw: unknown): "builder" | "architect" | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "builder") return "builder";
  if (value === "architect") return "architect";
  return null;
}

function normalizeStripeSubscriptionStatus(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

function stripeSubscriptionGrantsBuilder(status: string): boolean {
  return status === "active" || status === "trialing";
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
                return jsonResponse(req, 200, {
                  ok: true,
                  ignored: true,
                  event: event.type,
                  reason: "workspace_credit_topup_payment_pending",
                });
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
              return jsonResponse(req, 200, {
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
            return jsonResponse(req, 200, {
              ok: true,
              ignored: true,
              event: event.type,
              reason: "builder_local_session_id_missing",
            });
          }
          let providerCustomerId =
            typeof session.customer === "string" ? session.customer : null;
          let providerSubscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : null;
          let providerPriceId: string | null = null;
          let subscriptionStatus = "checkout_completed";
          let grantsAccess: boolean | null = null;
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : null;
          if (subscriptionId) {
            const stripe = getStripeClient();
            const subscription =
              await stripe.subscriptions.retrieve(subscriptionId);
            providerCustomerId =
              typeof subscription.customer === "string"
                ? subscription.customer
                : providerCustomerId;
            providerSubscriptionId = subscription.id;
            providerPriceId = subscription.items.data[0]?.price?.id ?? null;
            subscriptionStatus = normalizeStripeSubscriptionStatus(
              subscription.status,
            );
            if (providerPriceId && isBuilderStripePriceId(providerPriceId)) {
              grantsAccess =
                stripeSubscriptionGrantsBuilder(subscriptionStatus);
            }
            const { cycleStartedAt, cycleEndsAt } =
              readStripeSubscriptionCycle(subscription);
            const syncResult = await (ctx as any).runMutation(
              internal.builderCommerce
                .syncBuilderStripeSubscriptionInternal as any,
              {
                localSessionId,
                providerCheckoutSessionId: session.id,
                providerCustomerId,
                providerSubscriptionId,
                providerPriceId,
                targetTier: readStripeTargetTier(
                  readStripeMetadataString(session.metadata, "target_tier"),
                ),
                subscriptionStatus,
                grantsAccess,
                currentPeriodStartAt: cycleStartedAt,
                currentPeriodEndAt: cycleEndsAt,
                markCheckoutComplete: true,
                nowMs:
                  Number(event.created ?? 0) > 0
                    ? Number(event.created) * 1000
                    : Date.now(),
              },
            );
            if (!cycleStartedAt || !cycleEndsAt) {
              return jsonResponse(req, 200, {
                ok: true,
                ignored: true,
                event: event.type,
                reason: "builder_cycle_missing",
              });
            }
            if (syncResult?.ownerUserId && grantsAccess === true) {
              await (ctx as any).runMutation(
                internal.workspaceCredits
                  .syncBuilderMonthlyCreditsInternal as any,
                {
                  userId: syncResult.ownerUserId,
                  targetTier: syncResult.targetTier,
                  grantsAccess: true,
                  cycleStartedAt,
                  cycleEndsAt,
                  nowMs:
                    Number(event.created ?? 0) > 0
                      ? Number(event.created) * 1000
                      : Date.now(),
                },
              );
            }
          } else {
            await (ctx as any).runMutation(
              internal.builderCommerce
                .syncBuilderStripeSubscriptionInternal as any,
              {
                localSessionId,
                providerCheckoutSessionId: session.id,
                providerCustomerId,
                providerSubscriptionId,
                providerPriceId,
                targetTier: readStripeTargetTier(
                  readStripeMetadataString(session.metadata, "target_tier"),
                ),
                subscriptionStatus,
                grantsAccess,
                currentPeriodStartAt: null,
                currentPeriodEndAt: null,
                markCheckoutComplete: true,
                nowMs:
                  Number(event.created ?? 0) > 0
                    ? Number(event.created) * 1000
                    : Date.now(),
              },
            );
          }
          return jsonResponse(req, 200, {
            ok: true,
            received: true,
            event: event.type,
          });
        }

        if (event.type === "invoice.paid") {
          const invoice = event.data.object as Stripe.Invoice & {
            subscription?: string | Stripe.Subscription | null;
          };
          const subscriptionId =
            typeof invoice.subscription === "string"
              ? invoice.subscription
              : null;
          if (!subscriptionId) {
            return jsonResponse(req, 200, {
              ok: true,
              ignored: true,
              event: event.type,
              reason: "invoice_subscription_missing",
            });
          }
          const stripe = getStripeClient();
          const subscription =
            await stripe.subscriptions.retrieve(subscriptionId);
          const localSessionId = readStripeMetadataString(
            subscription.metadata,
            "local_session_id",
          );
          if (!localSessionId) {
            return jsonResponse(req, 200, {
              ok: true,
              ignored: true,
              event: event.type,
              reason: "builder_local_session_id_missing",
            });
          }
          const providerPriceId = subscription.items.data[0]?.price?.id ?? null;
          if (!isBuilderStripePriceId(providerPriceId)) {
            return jsonResponse(req, 200, {
              ok: true,
              ignored: true,
              event: event.type,
              reason: "non_builder_price",
            });
          }
          const subscriptionStatus = normalizeStripeSubscriptionStatus(
            subscription.status,
          );
          const { cycleStartedAt, cycleEndsAt } =
            readStripeSubscriptionCycle(subscription);
          const syncResult = await (ctx as any).runMutation(
            internal.builderCommerce
              .syncBuilderStripeSubscriptionInternal as any,
            {
              localSessionId,
              providerCustomerId:
                typeof subscription.customer === "string"
                  ? subscription.customer
                  : null,
              providerSubscriptionId: subscription.id,
              providerPriceId,
              targetTier: readStripeTargetTier(
                readStripeMetadataString(subscription.metadata, "target_tier"),
              ),
              subscriptionStatus,
              grantsAccess: stripeSubscriptionGrantsBuilder(subscriptionStatus),
              currentPeriodStartAt: cycleStartedAt,
              currentPeriodEndAt: cycleEndsAt,
              markCheckoutComplete: true,
              nowMs:
                Number(event.created ?? 0) > 0
                  ? Number(event.created) * 1000
                  : Date.now(),
            },
          );
          if (!cycleStartedAt || !cycleEndsAt) {
            return jsonResponse(req, 200, {
              ok: true,
              ignored: true,
              event: event.type,
              reason: "builder_cycle_missing",
            });
          }
          if (syncResult?.ownerUserId) {
            await (ctx as any).runMutation(
              internal.workspaceCredits
                .syncBuilderMonthlyCreditsInternal as any,
              {
                userId: syncResult.ownerUserId,
                targetTier: syncResult.targetTier,
                grantsAccess:
                  stripeSubscriptionGrantsBuilder(subscriptionStatus),
                cycleStartedAt,
                cycleEndsAt,
                nowMs:
                  Number(event.created ?? 0) > 0
                    ? Number(event.created) * 1000
                    : Date.now(),
              },
            );
          }
          return jsonResponse(req, 200, {
            ok: true,
            received: true,
            event: event.type,
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
          if (!localSessionId) {
            return jsonResponse(req, 200, {
              ok: true,
              ignored: true,
              event: event.type,
              reason: "builder_local_session_id_missing",
            });
          }
          const providerPriceId = subscription.items.data[0]?.price?.id ?? null;
          if (!isBuilderStripePriceId(providerPriceId)) {
            return jsonResponse(req, 200, {
              ok: true,
              ignored: true,
              event: event.type,
              reason: "non_builder_price",
            });
          }
          const subscriptionStatus = normalizeStripeSubscriptionStatus(
            subscription.status,
          );
          const { cycleStartedAt, cycleEndsAt } =
            readStripeSubscriptionCycle(subscription);
          await (ctx as any).runMutation(
            internal.builderCommerce
              .syncBuilderStripeSubscriptionInternal as any,
            {
              localSessionId,
              providerCustomerId:
                typeof subscription.customer === "string"
                  ? subscription.customer
                  : null,
              providerSubscriptionId: subscription.id,
              providerPriceId,
              targetTier: readStripeTargetTier(
                readStripeMetadataString(subscription.metadata, "target_tier"),
              ),
              subscriptionStatus,
              grantsAccess: stripeSubscriptionGrantsBuilder(subscriptionStatus),
              currentPeriodStartAt: cycleStartedAt,
              currentPeriodEndAt: cycleEndsAt,
              markCheckoutComplete: true,
              nowMs:
                Number(event.created ?? 0) > 0
                  ? Number(event.created) * 1000
                  : Date.now(),
            },
          );
          return jsonResponse(req, 200, {
            ok: true,
            received: true,
            event: event.type,
          });
        }

        return jsonResponse(req, 200, {
          ok: true,
          ignored: true,
          event: event.type,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logStructuredError("stripe_webhook_failed", {
          error,
          requestPath,
          stripeEventType: stripeEventType ?? undefined,
          stripeEventId: stripeEventId ?? undefined,
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
