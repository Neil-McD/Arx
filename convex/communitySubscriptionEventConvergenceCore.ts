export type CommunitySubscriptionEventType =
  | "customer.subscription.updated"
  | "customer.subscription.deleted";

export type StripeSubscriptionIdentityLike = {
  id?: unknown;
};

export type CommunitySubscriptionEventResolution<T> =
  | {
      kind: "current";
      providerSubscriptionId: string;
      subscription: T;
    }
  | {
      kind: "missing";
      providerSubscriptionId: string;
    };

function normalizeProviderSubscriptionId(value: unknown): string {
  return String(value ?? "").trim();
}

export async function resolveCurrentCommunitySubscriptionEvent<
  T extends StripeSubscriptionIdentityLike,
>(args: {
  eventType: CommunitySubscriptionEventType;
  eventSubscription: T;
  retrieveCurrent: (providerSubscriptionId: string) => Promise<T | null>;
}): Promise<CommunitySubscriptionEventResolution<T>> {
  if (
    args.eventType !== "customer.subscription.updated" &&
    args.eventType !== "customer.subscription.deleted"
  ) {
    throw new Error("community_subscription_event_type_invalid");
  }

  const providerSubscriptionId = normalizeProviderSubscriptionId(
    args.eventSubscription?.id,
  );
  if (!providerSubscriptionId) {
    throw new Error("community_subscription_event_identity_missing");
  }

  const current = await args.retrieveCurrent(providerSubscriptionId);
  if (!current) {
    return {
      kind: "missing",
      providerSubscriptionId,
    };
  }

  if (normalizeProviderSubscriptionId(current.id) !== providerSubscriptionId) {
    throw new Error("community_subscription_provider_identity_mismatch");
  }

  return {
    kind: "current",
    providerSubscriptionId,
    subscription: current,
  };
}
