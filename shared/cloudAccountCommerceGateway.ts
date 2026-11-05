import { bootstrapGatewayAuthContext } from "./cloudGateway";
type CloudAccountCommerceGatewayParams<SessionT> = {
  session: SessionT;
};

// Gateway class: authenticated query/mutation bridge, caller-hardened session, fail-closed.

export async function startCloudConnectOnboarding<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT> & {
    context: "account" | "community";
    communitySlug?: string | null;
    country?: string | null;
  },
): Promise<{ url?: unknown }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.action("creatorCommerce:startConnectOnboarding" as any, {
    authSubject,
    context: params.context,
    communitySlug: params.communitySlug ?? undefined,
    country: params.country ?? undefined,
  })) as {
    url?: unknown;
  };
}

// Back from Stripe's setup: Polynet reads the payout account from Stripe now.
export async function refreshCloudConnectAccount<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT>,
): Promise<void> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  await client.action("creatorCommerce:refreshMyStripeConnectAccount" as any, { authSubject });
}
