import { bootstrapGatewayAuthContext } from "./cloudGateway";
type CloudAccountCommerceGatewayParams<SessionT> = {
  session: SessionT;
};

// Gateway class: authenticated query/mutation bridge, caller-hardened session, fail-closed.

export async function startCloudPremiumSubscriptionCheckout<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT> & {
    successUrl: string;
    cancelUrl: string;
  },
): Promise<{ checkout_url?: unknown }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.action("billing:startPremiumSubscriptionCheckout" as any, {
    authSubject,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
  })) as {
    checkout_url?: unknown;
  };
}

export async function startCloudConnectOnboarding<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT> & {
    context: "account" | "community";
    communitySlug?: string | null;
    country?: string | null;
  },
): Promise<{ url?: unknown }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.action("billing:startConnectOnboarding" as any, {
    authSubject,
    context: params.context,
    communitySlug: params.communitySlug ?? undefined,
    country: params.country ?? undefined,
  })) as {
    url?: unknown;
  };
}
