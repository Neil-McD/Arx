export const PUBLIC_COMMUNITY_CHECKOUT_ATTEMPT_TTL_MS = 23 * 60 * 60 * 1000;
export const PUBLIC_COMMUNITY_CHECKOUT_MIN_CREATE_WINDOW_MS = 30 * 60 * 1000;

export type PublicCommunityCheckoutAttemptBinding = {
  ownerUserId: string;
  communityId: string;
  communitySlug: string;
  billingPeriod: "monthly" | "annual";
  checkoutAttemptId: string;
  successUrl: string;
  cancelUrl: string;
};

export type PublicCommunityCheckoutAttemptSnapshot =
  PublicCommunityCheckoutAttemptBinding & {
    sessionId: string;
    claimToken: string;
    pricePointId: string;
    providerPriceId: string;
    providerCustomerId: string;
    providerDestinationAccountId: string;
    platformFeeBps: number;
    checkoutAttemptExpiresAt: number;
    status: "pending" | "complete" | "expired";
    providerCheckoutSessionId: string | null;
  };

export type ProviderCheckoutSessionSnapshot = {
  id: string;
  url: string | null;
  status: string;
  expiresAtMs: number;
  clientReferenceId: string | null;
  localSessionId: string | null;
};

export function normalizePublicCommunityCheckoutAttemptId(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(value)) {
    throw new Error("checkout_attempt_id_invalid");
  }
  return value;
}

export function buildPublicCommunityCheckoutStripeIdempotencyKey(sessionId: string): string {
  const normalized = String(sessionId ?? "").trim();
  if (!normalized) throw new Error("checkout_session_id_required");
  return `community_checkout:${normalized}`;
}

export function requirePublicCommunityCheckoutAttemptBinding(args: {
  attempt: PublicCommunityCheckoutAttemptSnapshot;
  requested: PublicCommunityCheckoutAttemptBinding;
}): PublicCommunityCheckoutAttemptSnapshot {
  const fields: Array<keyof PublicCommunityCheckoutAttemptBinding> = [
    "ownerUserId",
    "communityId",
    "communitySlug",
    "billingPeriod",
    "checkoutAttemptId",
    "successUrl",
    "cancelUrl",
  ];
  for (const field of fields) {
    if (args.attempt[field] !== args.requested[field]) {
      throw new Error("checkout_attempt_binding_conflict");
    }
  }
  return args.attempt;
}

export function requireUniquePublicCommunityCheckoutAttempt(
  attempts: PublicCommunityCheckoutAttemptSnapshot[],
): PublicCommunityCheckoutAttemptSnapshot | null {
  if (attempts.length > 1) throw new Error("checkout_attempt_duplicate_rows");
  return attempts[0] ?? null;
}

export function requirePublicCommunityCheckoutMayStart(
  membership: { active?: boolean } | null,
): void {
  if (membership?.active === true) {
    throw new Error("community_access_already_active");
  }
}

export function requirePublicCommunityCheckoutProviderAttachment(args: {
  currentProviderSessionId: unknown;
  requestedProviderSessionId: unknown;
  belongsToAnotherCheckout: boolean;
}): string {
  const requested = String(args.requestedProviderSessionId ?? "").trim();
  if (!requested) throw new Error("provider_checkout_session_id_required");
  const current = String(args.currentProviderSessionId ?? "").trim();
  if (
    (current && current !== requested) ||
    args.belongsToAnotherCheckout
  ) {
    throw new Error("checkout_provider_session_conflict");
  }
  return requested;
}

export function requireOpenProviderCheckoutSession(args: {
  providerSession: ProviderCheckoutSessionSnapshot;
  attempt: PublicCommunityCheckoutAttemptSnapshot;
  nowMs: number;
}): { sessionId: string; checkoutUrl: string } {
  const provider = args.providerSession;
  if (
    provider.id.trim() === "" ||
    provider.clientReferenceId !== args.attempt.sessionId ||
    provider.localSessionId !== args.attempt.sessionId
  ) {
    throw new Error("checkout_provider_session_identity_invalid");
  }
  if (provider.status === "complete") throw new Error("checkout_attempt_complete");
  if (provider.status === "expired" || provider.expiresAtMs <= args.nowMs) {
    throw new Error("checkout_attempt_expired");
  }
  if (provider.status !== "open") throw new Error("checkout_provider_session_status_invalid");
  const checkoutUrl = String(provider.url ?? "").trim();
  let parsed: URL;
  try {
    parsed = new URL(checkoutUrl);
  } catch {
    throw new Error("stripe_checkout_url_invalid");
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "checkout.stripe.com") {
    throw new Error("stripe_checkout_url_invalid");
  }
  return {
    sessionId: provider.id,
    checkoutUrl,
  };
}

export async function executePublicCommunityCheckoutProviderStart(args: {
  attempt: PublicCommunityCheckoutAttemptSnapshot;
  nowMs: number;
  retrieveProviderSession: (providerSessionId: string) => Promise<ProviderCheckoutSessionSnapshot>;
  createProviderSession: (idempotencyKey: string) => Promise<ProviderCheckoutSessionSnapshot>;
  attachProviderSession: (providerSession: ProviderCheckoutSessionSnapshot) => Promise<void>;
}): Promise<{ providerSessionId: string; checkoutUrl: string }> {
  if (args.attempt.status === "complete") throw new Error("checkout_attempt_complete");
  if (
    args.attempt.status === "expired" ||
    args.attempt.checkoutAttemptExpiresAt <= args.nowMs
  ) {
    throw new Error("checkout_attempt_expired");
  }
  if (
    !args.attempt.providerCheckoutSessionId &&
    args.attempt.checkoutAttemptExpiresAt - args.nowMs <
      PUBLIC_COMMUNITY_CHECKOUT_MIN_CREATE_WINDOW_MS
  ) {
    throw new Error("checkout_attempt_expired");
  }

  const providerSession = args.attempt.providerCheckoutSessionId
    ? await args.retrieveProviderSession(args.attempt.providerCheckoutSessionId)
    : await args.createProviderSession(
        buildPublicCommunityCheckoutStripeIdempotencyKey(args.attempt.sessionId),
      );
  const ready = requireOpenProviderCheckoutSession({
    providerSession,
    attempt: args.attempt,
    nowMs: args.nowMs,
  });
  if (!args.attempt.providerCheckoutSessionId) {
    await args.attachProviderSession(providerSession);
  }
  return {
    providerSessionId: ready.sessionId,
    checkoutUrl: ready.checkoutUrl,
  };
}
