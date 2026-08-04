export type StripeSubscriptionAccountScope =
  | { kind: "platform" }
  | { kind: "connected"; providerAccountId: string };

export type StripeSubscriptionIdentity = {
  accountScope: StripeSubscriptionAccountScope;
  providerSubscriptionId: string;
};

export type StripeSubscriptionEffectIntent =
  | "cancel_now"
  | "cancel_at_period_end";

export type StripeSubscriptionEffectState =
  | "canceled"
  | "scheduled"
  | "already_terminal"
  | "verified_absent"
  | "retryable"
  | "indeterminate"
  | "blocked";

export type StripeSubscriptionEffectResult = {
  state: StripeSubscriptionEffectState;
  intent: StripeSubscriptionEffectIntent;
  providerSubscriptionId: string;
  providerAccountId: string | null;
  providerStatus: string | null;
  errorCode: string | null;
};

export type StripeSubscriptionCancellationCandidate = {
  source: unknown;
  status: unknown;
  providerAccountId?: unknown;
  providerSubscriptionId?: unknown;
};

export type StripeSubscriptionCancellationBlocker = {
  source: string;
  status: string;
  reason:
    | "stripe_subscription_identity_incomplete"
    | "external_subscription_cancellation_unsupported"
    | "community_subscription_source_invalid";
};

export type StripeSubscriptionCancellationPlan = {
  identities: StripeSubscriptionIdentity[];
  blockers: StripeSubscriptionCancellationBlocker[];
};

type StripeSubscriptionLike = {
  id?: unknown;
  status?: unknown;
  cancel_at_period_end?: unknown;
};

export type StripeSubscriptionEffectClient = {
  subscriptions: {
    retrieve: (
      subscriptionId: string,
      params?: Record<string, never>,
      options?: { stripeAccount?: string },
    ) => Promise<StripeSubscriptionLike>;
    cancel: (
      subscriptionId: string,
      params?: Record<string, never>,
      options?: { stripeAccount?: string },
    ) => Promise<StripeSubscriptionLike>;
    update: (
      subscriptionId: string,
      params: { cancel_at_period_end: true },
      options?: { stripeAccount?: string },
    ) => Promise<StripeSubscriptionLike>;
  };
};

const TERMINAL_PROVIDER_STATUSES = new Set(["canceled", "incomplete_expired"]);
const ACTIVE_RECURRING_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "past_due",
  "cancel_at_period_end",
]);

function boundedErrorCode(raw: unknown): string {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .slice(0, 160);
  return value || "stripe_subscription_effect_failed";
}

function errorEvidence(error: unknown): {
  code: string;
  statusCode: number | null;
} {
  const row = (error ?? {}) as Record<string, unknown>;
  const statusCodeRaw = Number(row.statusCode ?? row.status);
  const statusCode = Number.isFinite(statusCodeRaw)
    ? Math.floor(statusCodeRaw)
    : null;
  return {
    code: boundedErrorCode(row.code ?? row.type ?? (error instanceof Error ? error.message : error)),
    statusCode,
  };
}

function providerStatusOf(subscription: StripeSubscriptionLike | null | undefined): string {
  return String(subscription?.status ?? "").trim().toLowerCase();
}

export function stripeProviderOptions(scope: StripeSubscriptionAccountScope):
  | { stripeAccount: string }
  | undefined {
  return scope.kind === "connected"
    ? { stripeAccount: scope.providerAccountId }
    : undefined;
}

export type StripeProviderErrorDisposition = {
  state: "verified_absent" | "retryable" | "indeterminate" | "blocked";
  errorCode: string;
};

export function classifyStripeProviderError(args: {
  error: unknown;
  mutationAttempted: boolean;
}): StripeProviderErrorDisposition {
  const evidence = errorEvidence(args.error);
  if (evidence.statusCode === 404 || evidence.code === "resource_missing") {
    return {
      state: "verified_absent",
      errorCode: "stripe_object_not_found_in_bound_scope",
    };
  }
  if (args.mutationAttempted) {
    return { state: "indeterminate", errorCode: evidence.code };
  }
  if (
    evidence.statusCode === 429 ||
    (evidence.statusCode !== null && evidence.statusCode >= 500) ||
    evidence.statusCode === null
  ) {
    return { state: "retryable", errorCode: evidence.code };
  }
  return { state: "blocked", errorCode: evidence.code };
}

function result(args: {
  identity: StripeSubscriptionIdentity;
  intent: StripeSubscriptionEffectIntent;
  state: StripeSubscriptionEffectState;
  providerStatus?: string | null;
  errorCode?: string | null;
}): StripeSubscriptionEffectResult {
  return {
    state: args.state,
    intent: args.intent,
    providerSubscriptionId: args.identity.providerSubscriptionId,
    providerAccountId:
      args.identity.accountScope.kind === "connected"
        ? args.identity.accountScope.providerAccountId
        : null,
    providerStatus: args.providerStatus ?? null,
    errorCode: args.errorCode ?? null,
  };
}

function classifyProviderError(args: {
  error: unknown;
  identity: StripeSubscriptionIdentity;
  intent: StripeSubscriptionEffectIntent;
  mutationAttempted: boolean;
}): StripeSubscriptionEffectResult {
  const disposition = classifyStripeProviderError({
    error: args.error,
    mutationAttempted: args.mutationAttempted,
  });
  if (disposition.state === "verified_absent") {
    return result({
      identity: args.identity,
      intent: args.intent,
      state: "verified_absent",
      errorCode: "stripe_subscription_not_found_in_bound_scope",
    });
  }
  return result({
    identity: args.identity,
    intent: args.intent,
    state: disposition.state,
    errorCode: disposition.errorCode,
  });
}

export function normalizeStripeSubscriptionIdentity(args: {
  providerSubscriptionId: unknown;
  providerAccountId?: unknown;
  accountScope: "platform" | "connected";
}): StripeSubscriptionIdentity {
  const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
  if (!providerSubscriptionId) {
    throw new Error("stripe_subscription_effect_subscription_id_required");
  }
  if (args.accountScope === "platform") {
    return {
      accountScope: { kind: "platform" },
      providerSubscriptionId,
    };
  }
  const providerAccountId = String(args.providerAccountId ?? "").trim();
  if (!providerAccountId) {
    throw new Error("stripe_subscription_effect_connected_account_required");
  }
  return {
    accountScope: { kind: "connected", providerAccountId },
    providerSubscriptionId,
  };
}

export function planConnectedStripeSubscriptionCancellations(
  candidates: StripeSubscriptionCancellationCandidate[],
): StripeSubscriptionCancellationPlan {
  const identitiesByKey = new Map<string, StripeSubscriptionIdentity>();
  const blockers: StripeSubscriptionCancellationBlocker[] = [];

  for (const candidate of candidates) {
    const source = String(candidate.source ?? "").trim().toLowerCase();
    const status = String(candidate.status ?? "").trim().toLowerCase();
    const providerAccountId = String(candidate.providerAccountId ?? "").trim();
    const providerSubscriptionId = String(candidate.providerSubscriptionId ?? "").trim();

    if (source === "stripe") {
      if (providerAccountId && providerSubscriptionId) {
        const identity = normalizeStripeSubscriptionIdentity({
          accountScope: "connected",
          providerAccountId,
          providerSubscriptionId,
        });
        identitiesByKey.set(
          `${providerAccountId}:${providerSubscriptionId}`,
          identity,
        );
      } else if (ACTIVE_RECURRING_SUBSCRIPTION_STATUSES.has(status)) {
        blockers.push({
          source,
          status,
          reason: "stripe_subscription_identity_incomplete",
        });
      }
      continue;
    }

    if (!ACTIVE_RECURRING_SUBSCRIPTION_STATUSES.has(status)) continue;
    blockers.push({
      source: source || "missing",
      status,
      reason: source === "external_sync"
        ? "external_subscription_cancellation_unsupported"
        : "community_subscription_source_invalid",
    });
  }

  return {
    identities: [...identitiesByKey.values()],
    blockers,
  };
}

export function stripeSubscriptionEffectIsTerminal(
  effect: StripeSubscriptionEffectResult,
): boolean {
  return effect.state === "canceled" ||
    effect.state === "scheduled" ||
    effect.state === "already_terminal" ||
    effect.state === "verified_absent";
}

export async function applyStripeSubscriptionEffect(args: {
  stripe: StripeSubscriptionEffectClient;
  identity: StripeSubscriptionIdentity;
  intent: StripeSubscriptionEffectIntent;
}): Promise<StripeSubscriptionEffectResult> {
  const options = stripeProviderOptions(args.identity.accountScope);
  let subscription: StripeSubscriptionLike;
  try {
    subscription = await args.stripe.subscriptions.retrieve(
      args.identity.providerSubscriptionId,
      {},
      options,
    );
  } catch (error) {
    return classifyProviderError({
      error,
      identity: args.identity,
      intent: args.intent,
      mutationAttempted: false,
    });
  }

  const currentStatus = providerStatusOf(subscription);
  if (TERMINAL_PROVIDER_STATUSES.has(currentStatus)) {
    return result({
      identity: args.identity,
      intent: args.intent,
      state: "already_terminal",
      providerStatus: currentStatus,
    });
  }

  if (
    args.intent === "cancel_at_period_end" &&
    subscription.cancel_at_period_end === true
  ) {
    return result({
      identity: args.identity,
      intent: args.intent,
      state: "scheduled",
      providerStatus: currentStatus,
    });
  }

  try {
    const updated = args.intent === "cancel_now"
      ? await args.stripe.subscriptions.cancel(
          args.identity.providerSubscriptionId,
          {},
          options,
        )
      : await args.stripe.subscriptions.update(
          args.identity.providerSubscriptionId,
          { cancel_at_period_end: true },
          options,
        );
    const updatedStatus = providerStatusOf(updated);
    if (args.intent === "cancel_now") {
      if (!TERMINAL_PROVIDER_STATUSES.has(updatedStatus)) {
        return result({
          identity: args.identity,
          intent: args.intent,
          state: "indeterminate",
          providerStatus: updatedStatus,
          errorCode: "stripe_subscription_cancel_not_terminal",
        });
      }
      return result({
        identity: args.identity,
        intent: args.intent,
        state: "canceled",
        providerStatus: updatedStatus,
      });
    }
    if (updated.cancel_at_period_end !== true) {
      return result({
        identity: args.identity,
        intent: args.intent,
        state: "indeterminate",
        providerStatus: updatedStatus,
        errorCode: "stripe_subscription_period_end_not_scheduled",
      });
    }
    return result({
      identity: args.identity,
      intent: args.intent,
      state: "scheduled",
      providerStatus: updatedStatus,
    });
  } catch (error) {
    return classifyProviderError({
      error,
      identity: args.identity,
      intent: args.intent,
      mutationAttempted: true,
    });
  }
}
