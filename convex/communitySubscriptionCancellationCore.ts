type ProviderSubscriptionLike = {
  status?: unknown;
  cancel_at_period_end?: unknown;
};

export async function scheduleProviderSubscriptionCancellationAtPeriodEnd<
  SubscriptionT extends ProviderSubscriptionLike,
>(args: {
  providerSubscriptionId: string;
  retrieve: (providerSubscriptionId: string) => Promise<SubscriptionT>;
  update: (
    providerSubscriptionId: string,
    patch: { cancel_at_period_end: true },
  ) => Promise<unknown>;
  isResourceMissing: (error: unknown) => boolean;
}): Promise<
  | { outcome: "missing"; subscription: null; provider_updated: false }
  | { outcome: "current"; subscription: SubscriptionT; provider_updated: boolean }
> {
  const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
  if (!providerSubscriptionId) {
    throw new Error("community_subscription_provider_id_required");
  }

  let current: SubscriptionT;
  try {
    current = await args.retrieve(providerSubscriptionId);
  } catch (error) {
    if (args.isResourceMissing(error)) {
      return {
        outcome: "missing",
        subscription: null,
        provider_updated: false,
      };
    }
    throw error;
  }

  const status = String(current.status ?? "").trim().toLowerCase();
  if (status === "canceled" || current.cancel_at_period_end === true) {
    return {
      outcome: "current",
      subscription: current,
      provider_updated: false,
    };
  }

  await args.update(providerSubscriptionId, { cancel_at_period_end: true });
  return {
    outcome: "current",
    subscription: await args.retrieve(providerSubscriptionId),
    provider_updated: true,
  };
}
