import { bootstrapGatewayAuthContext } from "./cloudGateway";

type CloudAccountCommerceGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudWorkspaceCardOnFileStatus = {
  ok?: unknown;
  has_card_on_file?: unknown;
  payment_method_status?: unknown;
  card_brand?: unknown;
  card_last4?: unknown;
  checked_at?: unknown;
};

// Gateway class: authenticated query/mutation bridge, caller-hardened session, fail-closed.

export async function startCloudWorkspaceCreditTopupCheckout<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT> & {
    successUrl: string;
    cancelUrl: string;
    packId?: string;
  },
): Promise<{ checkout_url?: unknown }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.action("billing:startWorkspaceCreditTopupCheckout" as any, {
    authSubject,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    packId: params.packId,
  })) as {
    checkout_url?: unknown;
  };
}

export async function startCloudWorkspaceCardSetupCheckout<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT> & {
    successUrl: string;
    cancelUrl: string;
  },
): Promise<{ checkout_url?: unknown }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.action("billing:startWorkspaceCardSetupCheckout" as any, {
    authSubject,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
  })) as {
    checkout_url?: unknown;
  };
}

export async function refreshCloudWorkspaceCardOnFileStatus<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT>,
): Promise<CloudWorkspaceCardOnFileStatus> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.action("billing:refreshWorkspaceCardOnFileStatus" as any, {
    authSubject,
  })) as CloudWorkspaceCardOnFileStatus;
}

export async function loadCloudWorkspaceCardOnFileStatus<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT>,
): Promise<CloudWorkspaceCardOnFileStatus> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.query("stripeCustomers:getWorkspaceCardOnFileStatus" as any, {
    authSubject,
  })) as CloudWorkspaceCardOnFileStatus;
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
