export const COMMUNITY_SUBSCRIPTION_RECOVERY_EVENT_TYPES = [
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

export type CommunitySubscriptionRecoveryEventType =
  (typeof COMMUNITY_SUBSCRIPTION_RECOVERY_EVENT_TYPES)[number];

export type CommunitySubscriptionRecoveryStatus =
  | "pending"
  | "leased"
  | "succeeded"
  | "ignored"
  | "terminal";

export const COMMUNITY_SUBSCRIPTION_RECOVERY_MAX_ATTEMPTS = 6;
export const COMMUNITY_SUBSCRIPTION_RECOVERY_LEASE_MS = 5 * 60 * 1_000;
export const COMMUNITY_SUBSCRIPTION_RECOVERY_RETENTION_MS = 45 * 24 * 60 * 60 * 1_000;

const RETRY_DELAYS_MS = [
  60 * 1_000,
  5 * 60 * 1_000,
  15 * 60 * 1_000,
  60 * 60 * 1_000,
  4 * 60 * 60 * 1_000,
] as const;

export type CommunitySubscriptionRecoveryIdentity = {
  providerAccountId: string;
  providerEventId: string;
  providerEventType: CommunitySubscriptionRecoveryEventType;
  providerSubscriptionId: string;
  livemode: boolean;
  providerCreatedAt: number;
};

type RecoveryRowLike = CommunitySubscriptionRecoveryIdentity & {
  status: CommunitySubscriptionRecoveryStatus;
  attemptCount: number;
  nextAttemptAt: number;
  leaseToken?: string;
  leaseExpiresAt?: number;
};

type StripeEventLike = {
  id?: unknown;
  type?: unknown;
  account?: unknown;
  livemode?: unknown;
  created?: unknown;
  data?: { object?: unknown };
};

function requireBoundedIdentity(
  value: unknown,
  errorCode: string,
  maxLength: number,
): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > maxLength) throw new Error(errorCode);
  return normalized;
}

export function normalizeCommunitySubscriptionRecoveryEventType(
  value: unknown,
): CommunitySubscriptionRecoveryEventType {
  if (
    value === "customer.subscription.updated" ||
    value === "customer.subscription.deleted"
  ) {
    return value;
  }
  throw new Error("community_subscription_recovery_event_type_invalid");
}

export function normalizeCommunitySubscriptionRecoveryIdentity(
  input: CommunitySubscriptionRecoveryIdentity,
): CommunitySubscriptionRecoveryIdentity {
  const providerCreatedAt = Number(input.providerCreatedAt);
  if (!Number.isFinite(providerCreatedAt) || providerCreatedAt <= 0) {
    throw new Error("community_subscription_recovery_event_created_at_invalid");
  }
  return {
    providerAccountId: requireBoundedIdentity(
      input.providerAccountId,
      "community_subscription_recovery_account_invalid",
      200,
    ),
    providerEventId: requireBoundedIdentity(
      input.providerEventId,
      "community_subscription_recovery_event_id_invalid",
      200,
    ),
    providerEventType: normalizeCommunitySubscriptionRecoveryEventType(
      input.providerEventType,
    ),
    providerSubscriptionId: requireBoundedIdentity(
      input.providerSubscriptionId,
      "community_subscription_recovery_subscription_id_invalid",
      200,
    ),
    livemode: input.livemode === true,
    providerCreatedAt,
  };
}

export function assertCommunitySubscriptionRecoveryIdentityMatches(
  row: CommunitySubscriptionRecoveryIdentity,
  identity: CommunitySubscriptionRecoveryIdentity,
): void {
  if (
    row.providerAccountId !== identity.providerAccountId ||
    row.providerEventId !== identity.providerEventId ||
    row.providerEventType !== identity.providerEventType ||
    row.providerSubscriptionId !== identity.providerSubscriptionId ||
    row.livemode !== identity.livemode ||
    row.providerCreatedAt !== identity.providerCreatedAt
  ) {
    throw new Error("community_subscription_recovery_identity_conflict");
  }
}

export function communitySubscriptionRecoveryCanBeClaimed(
  row: RecoveryRowLike,
  nowMs: number,
): boolean {
  if (row.status === "pending") return row.nextAttemptAt <= nowMs;
  if (row.status === "leased") {
    return Number(row.leaseExpiresAt ?? 0) <= nowMs;
  }
  return false;
}

export function communitySubscriptionRecoveryRetryDelayMs(
  attemptCount: number,
): number {
  const index = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, attemptCount - 1));
  return RETRY_DELAYS_MS[index];
}

export function resolveCommunitySubscriptionRecoveryFailure(args: {
  attemptCount: number;
  nowMs: number;
}):
  | { status: "pending"; nextAttemptAt: number }
  | { status: "terminal"; nextAttemptAt: number; deleteAfter: number } {
  const attemptCount = Math.max(0, Math.floor(args.attemptCount));
  if (attemptCount >= COMMUNITY_SUBSCRIPTION_RECOVERY_MAX_ATTEMPTS) {
    return {
      status: "terminal",
      nextAttemptAt: args.nowMs,
      deleteAfter: args.nowMs + COMMUNITY_SUBSCRIPTION_RECOVERY_RETENTION_MS,
    };
  }
  return {
    status: "pending",
    nextAttemptAt:
      args.nowMs + communitySubscriptionRecoveryRetryDelayMs(attemptCount),
  };
}

export function communitySubscriptionRecoveryErrorCode(error: unknown): string {
  const record = error && typeof error === "object"
    ? error as { code?: unknown; type?: unknown; message?: unknown }
    : null;
  const candidates = [record?.code, record?.type];
  for (const candidate of candidates) {
    const normalized = String(candidate ?? "").trim().toLowerCase();
    if (
      /^[a-z0-9_:-]{1,120}$/.test(normalized) &&
      !/(?:sk|rk)_(?:live|test)_|whsec_/.test(normalized)
    ) {
      return normalized;
    }
  }
  const internalMessage = String(record?.message ?? "").trim().toLowerCase();
  if (
    /^community_subscription_[a-z0-9_:-]{1,96}$/.test(internalMessage) &&
    !/(?:sk|rk)_(?:live|test)_|whsec_/.test(internalMessage)
  ) {
    return internalMessage;
  }
  return "provider_operation_failed";
}

export function validateRecoveredCommunitySubscriptionEvent(
  job: CommunitySubscriptionRecoveryIdentity,
  event: StripeEventLike,
): StripeEventLike {
  const providerObject = event.data?.object;
  const providerSubscriptionId =
    providerObject !== null && typeof providerObject === "object" &&
      "id" in providerObject
      ? String((providerObject as { id?: unknown }).id ?? "")
      : "";
  const recoveredIdentity = normalizeCommunitySubscriptionRecoveryIdentity({
    providerAccountId: String(event.account ?? "platform"),
    providerEventId: event.id as string,
    providerEventType: event.type as CommunitySubscriptionRecoveryEventType,
    providerSubscriptionId,
    livemode: event.livemode === true,
    providerCreatedAt: Number(event.created ?? 0) * 1_000,
  });
  assertCommunitySubscriptionRecoveryIdentityMatches(job, recoveredIdentity);
  return event;
}
