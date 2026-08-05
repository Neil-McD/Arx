import {
  applyStripeSubscriptionEffect,
  classifyStripeProviderError,
  stripeProviderOptions,
  stripeSubscriptionEffectIsTerminal,
  type StripeProviderErrorDisposition,
  type StripeSubscriptionAccountScope,
  type StripeSubscriptionEffectClient,
  type StripeSubscriptionEffectResult,
} from "./stripeSubscriptionEffectCore";

type StripeCheckoutSessionLike = {
  id?: unknown;
  status?: unknown;
  subscription?: unknown;
};

export type StripeCheckoutSessionEffectClient = {
  checkout: {
    sessions: {
      retrieve: (
        checkoutSessionId: string,
        params?: Record<string, never>,
        options?: { stripeAccount?: string },
      ) => Promise<StripeCheckoutSessionLike>;
      expire: (
        checkoutSessionId: string,
        params?: Record<string, never>,
        options?: { stripeAccount?: string },
      ) => Promise<StripeCheckoutSessionLike>;
    };
  };
};

export type StripeCheckoutCompensationClient =
  & StripeCheckoutSessionEffectClient
  & StripeSubscriptionEffectClient;

export type StripeCheckoutSessionIdentity = {
  accountScope: StripeSubscriptionAccountScope;
  providerCheckoutSessionId: string;
};

export type StripeCheckoutSessionEffectState =
  | "expired"
  | "already_terminal"
  | "completed"
  | "verified_absent"
  | "retryable"
  | "indeterminate"
  | "blocked";

export type StripeCheckoutSessionEffectResult = {
  state: StripeCheckoutSessionEffectState;
  providerCheckoutSessionId: string;
  providerAccountId: string | null;
  providerStatus: string | null;
  providerSubscriptionId: string | null;
  errorCode: string | null;
};

export type StripeCheckoutCompensationResult = {
  state:
    | "expired"
    | "already_terminal"
    | "verified_absent"
    | "completed_subscription_canceled"
    | "retryable"
    | "indeterminate"
    | "blocked";
  checkout: StripeCheckoutSessionEffectResult;
  subscription: StripeSubscriptionEffectResult | null;
  errorCode: string | null;
};

function normalizeObjectId(value: unknown, errorCode: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(errorCode);
  return normalized;
}

function readObjectId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const id = String((value as { id?: unknown }).id ?? "").trim();
    if (id) return id;
  }
  return null;
}

function checkoutResult(args: {
  identity: StripeCheckoutSessionIdentity;
  state: StripeCheckoutSessionEffectState;
  providerStatus?: string | null;
  providerSubscriptionId?: string | null;
  errorCode?: string | null;
}): StripeCheckoutSessionEffectResult {
  return {
    state: args.state,
    providerCheckoutSessionId: args.identity.providerCheckoutSessionId,
    providerAccountId: args.identity.accountScope.kind === "connected"
      ? args.identity.accountScope.providerAccountId
      : null,
    providerStatus: args.providerStatus ?? null,
    providerSubscriptionId: args.providerSubscriptionId ?? null,
    errorCode: args.errorCode ?? null,
  };
}

function failedCheckoutResult(args: {
  identity: StripeCheckoutSessionIdentity;
  disposition: StripeProviderErrorDisposition;
}): StripeCheckoutSessionEffectResult {
  return checkoutResult({
    identity: args.identity,
    state: args.disposition.state,
    errorCode: args.disposition.state === "verified_absent"
      ? "stripe_checkout_not_found_in_bound_scope"
      : args.disposition.errorCode,
  });
}

export function normalizeStripeCheckoutSessionIdentity(args: {
  accountScope: "platform" | "connected";
  providerCheckoutSessionId: unknown;
  providerAccountId?: unknown;
}): StripeCheckoutSessionIdentity {
  const providerCheckoutSessionId = normalizeObjectId(
    args.providerCheckoutSessionId,
    "stripe_checkout_effect_session_id_required",
  );
  if (args.accountScope === "platform") {
    return { accountScope: { kind: "platform" }, providerCheckoutSessionId };
  }
  const providerAccountId = normalizeObjectId(
    args.providerAccountId,
    "stripe_checkout_effect_connected_account_required",
  );
  return {
    accountScope: { kind: "connected", providerAccountId },
    providerCheckoutSessionId,
  };
}

export async function applyStripeCheckoutSessionExpiration(args: {
  stripe: StripeCheckoutSessionEffectClient;
  identity: StripeCheckoutSessionIdentity;
}): Promise<StripeCheckoutSessionEffectResult> {
  const options = stripeProviderOptions(args.identity.accountScope);
  let checkout: StripeCheckoutSessionLike;
  try {
    checkout = await args.stripe.checkout.sessions.retrieve(
      args.identity.providerCheckoutSessionId,
      {},
      options,
    );
  } catch (error) {
    return failedCheckoutResult({
      identity: args.identity,
      disposition: classifyStripeProviderError({ error, mutationAttempted: false }),
    });
  }

  const providerStatus = String(checkout.status ?? "").trim().toLowerCase();
  const providerSubscriptionId = readObjectId(checkout.subscription);
  if (providerStatus === "expired") {
    return checkoutResult({
      identity: args.identity,
      state: "already_terminal",
      providerStatus,
      providerSubscriptionId,
    });
  }
  if (providerStatus === "complete") {
    return checkoutResult({
      identity: args.identity,
      state: "completed",
      providerStatus,
      providerSubscriptionId,
    });
  }
  if (providerStatus !== "open") {
    return checkoutResult({
      identity: args.identity,
      state: "blocked",
      providerStatus,
      providerSubscriptionId,
      errorCode: "stripe_checkout_status_invalid",
    });
  }

  try {
    const expired = await args.stripe.checkout.sessions.expire(
      args.identity.providerCheckoutSessionId,
      {},
      options,
    );
    const expiredStatus = String(expired.status ?? "").trim().toLowerCase();
    if (expiredStatus !== "expired") {
      return checkoutResult({
        identity: args.identity,
        state: "indeterminate",
        providerStatus: expiredStatus,
        providerSubscriptionId: readObjectId(expired.subscription),
        errorCode: "stripe_checkout_expire_not_terminal",
      });
    }
    return checkoutResult({
      identity: args.identity,
      state: "expired",
      providerStatus: expiredStatus,
      providerSubscriptionId: readObjectId(expired.subscription),
    });
  } catch (error) {
    return failedCheckoutResult({
      identity: args.identity,
      disposition: classifyStripeProviderError({ error, mutationAttempted: true }),
    });
  }
}

export async function compensateStaleStripeCheckout(args: {
  stripe: StripeCheckoutCompensationClient;
  identity: StripeCheckoutSessionIdentity;
}): Promise<StripeCheckoutCompensationResult> {
  const checkout = await applyStripeCheckoutSessionExpiration(args);
  if (checkout.state !== "completed") {
    return {
      state: checkout.state,
      checkout,
      subscription: null,
      errorCode: checkout.errorCode,
    };
  }
  if (!checkout.providerSubscriptionId) {
    return {
      state: "indeterminate",
      checkout,
      subscription: null,
      errorCode: "stripe_checkout_completed_subscription_missing",
    };
  }
  const subscription = await applyStripeSubscriptionEffect({
    stripe: args.stripe,
    identity: {
      accountScope: args.identity.accountScope,
      providerSubscriptionId: checkout.providerSubscriptionId,
    },
    intent: "cancel_now",
  });
  if (!stripeSubscriptionEffectIsTerminal(subscription)) {
    return {
      state: subscription.state === "retryable"
        ? "retryable"
        : subscription.state === "blocked" ? "blocked" : "indeterminate",
      checkout,
      subscription,
      errorCode: subscription.errorCode,
    };
  }
  return {
    state: "completed_subscription_canceled",
    checkout,
    subscription,
    errorCode: null,
  };
}

export function stripeCheckoutCompensationIsTerminal(
  result: StripeCheckoutCompensationResult,
): boolean {
  return result.state === "expired" ||
    result.state === "already_terminal" ||
    result.state === "verified_absent" ||
    result.state === "completed_subscription_canceled";
}
