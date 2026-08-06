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

type StripeCancellationClient = Pick<Stripe, "checkout" | "subscriptions">;

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
