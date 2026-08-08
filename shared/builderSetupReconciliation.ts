export type BuilderSetupSubscriptionLike = {
  subscription_id: string;
  grants_setup: boolean;
};

export type BuilderSetupSuppressionReason = "attached" | "unavailable";
export type BuilderSetupSuppressions = Record<string, BuilderSetupSuppressionReason>;

export function findPendingBuilderSetupSubscription<
  SubscriptionT extends BuilderSetupSubscriptionLike,
>(
  subscriptions: SubscriptionT[],
  suppressions: BuilderSetupSuppressions,
): SubscriptionT | null {
  return subscriptions.find((subscription) => (
    subscription.grants_setup
    && !suppressions[subscription.subscription_id]
  )) ?? null;
}

export function reconcileBuilderSetupSuppressions(
  suppressions: BuilderSetupSuppressions,
  subscriptions: BuilderSetupSubscriptionLike[],
): BuilderSetupSuppressions {
  const rowsById = new Map(
    subscriptions.map((subscription) => [subscription.subscription_id, subscription]),
  );
  const next: BuilderSetupSuppressions = {};
  for (const [subscriptionId, reason] of Object.entries(suppressions)) {
    const row = rowsById.get(subscriptionId);
    // Keep a server-confirmed local transition shield only while the stale
    // unassigned row still exists. Once Billing no longer projects that row,
    // canonical server state has caught up and the shield can disappear.
    if (row) next[subscriptionId] = reason;
  }
  return next;
}

export type BuilderSetupModalReconciliation =
  | { kind: "none" }
  | { kind: "open_required"; subscriptionId: string }
  | { kind: "close_required" };

export function resolveBuilderSetupModalReconciliation(input: {
  isModalOpen: boolean;
  requiredSubscriptionId: string | null;
  pendingSubscriptionId: string | null;
}): BuilderSetupModalReconciliation {
  if (
    input.requiredSubscriptionId
    && input.requiredSubscriptionId !== input.pendingSubscriptionId
  ) {
    return { kind: "close_required" };
  }
  if (
    !input.requiredSubscriptionId
    && !input.isModalOpen
    && input.pendingSubscriptionId
  ) {
    return {
      kind: "open_required",
      subscriptionId: input.pendingSubscriptionId,
    };
  }
  return { kind: "none" };
}
