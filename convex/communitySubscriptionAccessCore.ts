export type CommunitySubscriptionAccessStatus =
  | "active"
  | "past_due"
  | "cancel_at_period_end"
  | "canceled"
  | "ended";

export type CommunitySubscriptionAccessBlockReason =
  | "subscription_refunded"
  | "subscription_dispute_opened"
  | "subscription_dispute_lost";

export const MAX_COMMUNITY_SUBSCRIPTION_ACCESS_BLOCKS = 16;

export const COMMUNITY_SUBSCRIPTION_ACCESS_STATUSES = new Set<
  CommunitySubscriptionAccessStatus
>(["active", "past_due", "cancel_at_period_end"]);

const SUBSCRIPTION_PROJECTION_REASONS = new Set<string>([
  "subscription_refunded",
  "subscription_dispute_opened",
  "subscription_dispute_lost",
  "subscription_canceled",
  "subscription_ended",
]);

const ACCESS_BLOCK_REASON_PRIORITY: Record<
  CommunitySubscriptionAccessBlockReason,
  number
> = {
  subscription_dispute_lost: 3,
  subscription_refunded: 2,
  subscription_dispute_opened: 1,
};

export function communitySubscriptionStatusGrantsAccess(
  status: CommunitySubscriptionAccessStatus | null | undefined,
): boolean {
  return status != null && COMMUNITY_SUBSCRIPTION_ACCESS_STATUSES.has(status);
}

export function isCommunitySubscriptionProjectionReason(
  reasonRaw: unknown,
): boolean {
  return SUBSCRIPTION_PROJECTION_REASONS.has(String(reasonRaw ?? "").trim());
}

export function deriveCommunitySubscriptionMembershipProjection(args: {
  membershipActive: boolean;
  membershipRevokedAt?: number;
  membershipRevokedReason?: string;
  subscriptionStatus: CommunitySubscriptionAccessStatus;
  activeBlockReasons: CommunitySubscriptionAccessBlockReason[];
  nowMs: number;
}): {
  active: boolean;
  revokedAt: number | undefined;
  revokedReason: string | undefined;
  preservedNonFinancialRevocation: boolean;
} {
  const existingReason = String(args.membershipRevokedReason ?? "").trim();
  if (
    args.membershipActive === false &&
    !isCommunitySubscriptionProjectionReason(existingReason)
  ) {
    return {
      active: false,
      revokedAt: args.membershipRevokedAt ?? args.nowMs,
      revokedReason: existingReason || undefined,
      preservedNonFinancialRevocation: true,
    };
  }

  const primaryBlockReason = [...args.activeBlockReasons].sort(
    (left, right) =>
      ACCESS_BLOCK_REASON_PRIORITY[right] - ACCESS_BLOCK_REASON_PRIORITY[left],
  )[0];
  if (primaryBlockReason) {
    return {
      active: false,
      revokedAt: args.membershipRevokedAt ?? args.nowMs,
      revokedReason: primaryBlockReason,
      preservedNonFinancialRevocation: false,
    };
  }

  if (communitySubscriptionStatusGrantsAccess(args.subscriptionStatus)) {
    return {
      active: true,
      revokedAt: undefined,
      revokedReason: undefined,
      preservedNonFinancialRevocation: false,
    };
  }

  return {
    active: false,
    revokedAt: args.membershipRevokedAt ?? args.nowMs,
    revokedReason: `subscription_${args.subscriptionStatus}`,
    preservedNonFinancialRevocation: false,
  };
}

export function currentChargeRequiresRefundAccessBlock(args: {
  amountBaseUnits: unknown;
  amountRefundedBaseUnits: unknown;
  refunded: unknown;
}): boolean {
  const amount = Number(args.amountBaseUnits);
  const amountRefunded = Number(args.amountRefundedBaseUnits);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("stripe_charge_amount_invalid");
  }
  if (!Number.isFinite(amountRefunded) || amountRefunded < 0) {
    throw new Error("stripe_charge_refund_amount_invalid");
  }
  return args.refunded === true || amountRefunded >= amount;
}

export function currentDisputeAccessBlock(args: {
  status: unknown;
}):
  | { action: "clear" }
  | {
    action: "set";
    reason: "subscription_dispute_opened" | "subscription_dispute_lost";
  } {
  const status = String(args.status ?? "").trim().toLowerCase();
  if (status === "won" || status === "warning_closed") {
    return { action: "clear" };
  }
  if (status === "lost") {
    return {
      action: "set",
      reason: "subscription_dispute_lost",
    };
  }
  if (
    status === "needs_response" ||
    status === "under_review" ||
    status === "warning_needs_response" ||
    status === "warning_under_review"
  ) {
    return {
      action: "set",
      reason: "subscription_dispute_opened",
    };
  }
  throw new Error("stripe_dispute_status_unknown");
}
