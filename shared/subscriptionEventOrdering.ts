export type CanonicalSubscriptionStatus =
  | "active"
  | "cancel_at_period_end"
  | "past_due"
  | "canceled"
  | "ended";

const SUBSCRIPTION_RESTRICTION_RANK: Record<CanonicalSubscriptionStatus, number> = {
  active: 0,
  cancel_at_period_end: 1,
  past_due: 2,
  canceled: 3,
  ended: 3,
};

/**
 * Provider timestamps can have only second-level precision. At an equal
 * timestamp, accept idempotent or more restrictive state and reject any
 * access-expanding transition. Ambiguous delivery therefore fails closed.
 */
export function providerSubscriptionEventShouldApply(args: {
  incomingCreatedAt: number;
  currentCreatedAt: number;
  incomingStatus: CanonicalSubscriptionStatus;
  currentStatus?: CanonicalSubscriptionStatus | null;
}): boolean {
  if (args.incomingCreatedAt > args.currentCreatedAt) return true;
  if (args.incomingCreatedAt < args.currentCreatedAt) return false;
  if (!args.currentStatus) return true;
  return SUBSCRIPTION_RESTRICTION_RANK[args.incomingStatus] >=
    SUBSCRIPTION_RESTRICTION_RANK[args.currentStatus];
}
