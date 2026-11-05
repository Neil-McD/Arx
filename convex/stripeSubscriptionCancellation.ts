import type Stripe from "stripe";

import { getStripeClient } from "./stripeCore";

export type StripeSubscriptionCancellationTarget = {
  providerSubscriptionId: string;
  providerAccountId?: string | null;
};

export type StripeCheckoutExpirationTarget = {
  providerCheckoutSessionId: string;
  providerAccountId?: string | null;
};

type StripeCancellationClient = Pick<Stripe, "checkout" | "subscriptions"> & Partial<Pick<Stripe, "refunds">>;

function normalizeStripeId(value: unknown): string {
  return String(value ?? "").trim();
}

function stripeRequestOptions(providerAccountId: unknown): Stripe.RequestOptions | undefined {
  const account = normalizeStripeId(providerAccountId);
  return account ? { stripeAccount: account } : undefined;
}

function stripeResourceMissing(error: any): boolean {
  return error?.statusCode === 404 || error?.code === "resource_missing";
}

function stripeCheckoutAlreadyClosed(error: any): boolean {
  const code = String(error?.code ?? "").trim();
  return code === "checkout_session_not_open" || code === "resource_missing";
}

export async function cancelStripeSubscriptionIfActive(
  target: StripeSubscriptionCancellationTarget,
  stripe: StripeCancellationClient = getStripeClient(),
): Promise<"canceled" | "already_inactive" | "missing"> {
  const subscriptionId = normalizeStripeId(target.providerSubscriptionId);
  if (!subscriptionId) return "missing";
  const options = stripeRequestOptions(target.providerAccountId);
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(
      subscriptionId,
      {},
      options,
    );
  } catch (error: any) {
    if (stripeResourceMissing(error)) return "missing";
    throw error;
  }
  const status = String(subscription.status ?? "").trim().toLowerCase();
  if (status === "canceled" || status === "incomplete_expired") {
    return "already_inactive";
  }
  try {
    await stripe.subscriptions.cancel(subscriptionId, {}, options);
    return "canceled";
  } catch (error: any) {
    if (stripeResourceMissing(error)) return "already_inactive";
    throw error;
  }
}

function readObjectId(value: unknown): string {
  if (typeof value === "string") return normalizeStripeId(value);
  return normalizeStripeId((value as { id?: unknown } | null)?.id);
}

async function readFirstInvoicePayment(
  target: StripeSubscriptionCancellationTarget,
  stripe: StripeCancellationClient,
  options: Stripe.RequestOptions | undefined,
): Promise<{ paymentIntentId: string; chargeId: string } | "nothing_paid"> {
  const subscription = await stripe.subscriptions.retrieve(
    normalizeStripeId(target.providerSubscriptionId),
    { expand: ["latest_invoice.payments"] },
    options,
  );
  const invoice = (subscription as any)?.latest_invoice;
  if (!invoice || typeof invoice !== "object") return { paymentIntentId: "", chargeId: "" };
  if (invoice.status === "paid" && Number(invoice.amount_paid ?? 0) === 0) return "nothing_paid";
  const payment = invoice.payments?.data?.find((row: any) => row?.status === "paid")?.payment
    ?? invoice.payments?.data?.[0]?.payment;
  return {
    paymentIntentId: readObjectId(invoice.payment_intent) || readObjectId(payment?.payment_intent),
    chargeId: readObjectId(invoice.charge) || readObjectId(payment?.charge),
  };
}

// A second subscription for someone who is already a paying member: cancel it
// now and refund its first payment in full (the platform fee too). Safe to repeat.
export async function cancelAndRefundDuplicateSubscription(
  target: StripeSubscriptionCancellationTarget & { paymentIntentId?: string | null; chargeId?: string | null },
  stripe: StripeCancellationClient = getStripeClient(),
): Promise<{ cancelled: "canceled" | "already_inactive" | "missing"; refunded: boolean }> {
  const cancelled = await cancelStripeSubscriptionIfActive(target, stripe);
  const options = stripeRequestOptions(target.providerAccountId);
  let paymentIntentId = normalizeStripeId(target.paymentIntentId);
  let chargeId = normalizeStripeId(target.chargeId);
  if (!paymentIntentId && !chargeId) {
    // The checkout notice didn't name the payment: find it on the first invoice.
    const recovered = await readFirstInvoicePayment(target, stripe, options);
    if (recovered === "nothing_paid") return { cancelled, refunded: false };
    paymentIntentId = recovered.paymentIntentId;
    chargeId = recovered.chargeId;
    // Not found yet: throw so the caller's retry chain tries again.
    if (!paymentIntentId && !chargeId) throw new Error("duplicate_refund_payment_not_found");
  }
  try {
    await stripe.refunds!.create(
      { ...(paymentIntentId ? { payment_intent: paymentIntentId } : { charge: chargeId }), reason: "duplicate", refund_application_fee: true },
      { ...(options ?? {}), idempotencyKey: `duplicate-subscription-refund:${normalizeStripeId(target.providerSubscriptionId)}` },
    );
    return { cancelled, refunded: true };
  } catch (error: any) {
    if (error?.code === "charge_already_refunded") return { cancelled, refunded: true };
    throw error;
  }
}

// Leaving a paid community: Stripe stops renewing and the member keeps what they
// paid for until the period ends; Stripe's notice then ends the subscription.
export async function cancelStripeSubscriptionAtPeriodEnd(
  target: StripeSubscriptionCancellationTarget,
  stripe: StripeCancellationClient = getStripeClient(),
): Promise<"scheduled" | "already_inactive" | "missing"> {
  const subscriptionId = normalizeStripeId(target.providerSubscriptionId);
  if (!subscriptionId) return "missing";
  const options = stripeRequestOptions(target.providerAccountId);
  try {
    const updated = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true }, options);
    const status = String(updated.status ?? "").trim().toLowerCase();
    return status === "canceled" || status === "incomplete_expired" ? "already_inactive" : "scheduled";
  } catch (error: any) {
    if (stripeResourceMissing(error)) return "missing";
    throw error;
  }
}

export async function expireStripeCheckoutSessionIfOpen(
  target: StripeCheckoutExpirationTarget,
  stripe: StripeCancellationClient = getStripeClient(),
): Promise<{
  outcome: "expired" | "already_closed" | "missing";
  providerSubscriptionId: string | null;
}> {
  const checkoutSessionId = normalizeStripeId(target.providerCheckoutSessionId);
  if (!checkoutSessionId) {
    return { outcome: "missing", providerSubscriptionId: null };
  }
  const options = stripeRequestOptions(target.providerAccountId);
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(
      checkoutSessionId,
      {},
      options,
    );
  } catch (error: any) {
    if (stripeResourceMissing(error)) {
      return { outcome: "missing", providerSubscriptionId: null };
    }
    throw error;
  }
  const providerSubscriptionId = typeof session.subscription === "string"
    ? normalizeStripeId(session.subscription) || null
    : normalizeStripeId(session.subscription?.id) || null;
  if (session.status !== "open") {
    return { outcome: "already_closed", providerSubscriptionId };
  }
  try {
    await stripe.checkout.sessions.expire(checkoutSessionId, {}, options);
    return { outcome: "expired", providerSubscriptionId };
  } catch (error: any) {
    if (stripeCheckoutAlreadyClosed(error)) {
      return { outcome: "already_closed", providerSubscriptionId };
    }
    throw error;
  }
}
