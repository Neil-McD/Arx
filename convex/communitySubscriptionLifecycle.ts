// A community subscription is in one of four states, and every write of that
// state goes through here, so status, cancelAtPeriodEnd and endedAt can't
// disagree:
//   active                renewing, grants access
//   past_due              a payment failed; still grants access while Stripe retries
//   cancel_at_period_end  won't renew; grants access until the paid period ends
//   ended                 no longer grants access (Stripe's "canceled" is stored as ended)
// What the membership does in response lives in communityMembershipLifecycle.

export type CommunitySubscriptionStatus = "active" | "past_due" | "cancel_at_period_end" | "ended";

export function normalizeCommunitySubscriptionStatus(raw: unknown): CommunitySubscriptionStatus | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "canceled") return "ended";
  if (value === "active" || value === "past_due" || value === "cancel_at_period_end" || value === "ended") return value;
  return null;
}

export function communitySubscriptionStatusGrantsAccess(status: string | null | undefined): boolean {
  return status === "active" || status === "past_due" || status === "cancel_at_period_end";
}

// The fields that move together with the status. cancelAtPeriodEnd is always
// true for cancel_at_period_end and false once ended; Stripe can also mark an
// active or past-due subscription to stop at the period's end.
export function communitySubscriptionStatusFields(args: {
  status: CommunitySubscriptionStatus;
  cancelAtPeriodEnd?: boolean | null;
  current?: { status?: string; endedAt?: number } | null;
  nowMs: number;
}): { status: CommunitySubscriptionStatus; cancelAtPeriodEnd: boolean; endedAt: number | undefined } {
  const ended = args.status === "ended";
  return {
    status: args.status,
    cancelAtPeriodEnd: args.status === "cancel_at_period_end" || (!ended && Boolean(args.cancelAtPeriodEnd)),
    // An ended subscription keeps the moment it first ended.
    endedAt: ended
      ? (args.current?.status === "ended" && typeof args.current.endedAt === "number" ? args.current.endedAt : args.nowMs)
      : undefined,
  };
}

// Ends a subscription locally (a removal, an archive). Stripe is told separately.
export async function endCommunitySubscription(ctx: any, row: any, nowMs: number): Promise<void> {
  await ctx.db.patch(row._id, {
    ...communitySubscriptionStatusFields({ status: "ended", current: row, nowMs }),
    updatedAt: nowMs,
  });
}
