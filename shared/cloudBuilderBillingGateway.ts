import { bootstrapGatewayAuthContext } from "./cloudGateway";

type CloudBuilderBillingGatewayParams<SessionT> = {
  session: SessionT;
};

// Gateway class: authenticated query/mutation bridge, caller-hardened session, fail-closed.

export async function startCloudBuilderCheckout<SessionT>(
  params: CloudBuilderBillingGatewayParams<SessionT> & {
    tier: string;
    context: "builder" | "create_community";
  },
): Promise<{ checkout_url?: unknown }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.action("billing:startBuilderCheckout" as any, {
    authSubject,
    tier: params.tier,
    context: params.context,
    nowMs: Date.now(),
  })) as {
    checkout_url?: unknown;
  };
}

export async function openCloudBuilderBillingPortal<SessionT>(
  params: CloudBuilderBillingGatewayParams<SessionT> & {
    context: "builder" | "create_community";
  },
): Promise<{ url?: unknown; unavailable_code?: unknown }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.action("billing:openBuilderBillingPortal" as any, {
    authSubject,
    context: params.context,
  })) as {
    url?: unknown;
    unavailable_code?: unknown;
  };
}

export async function startCloudWorkspaceCreditTopupCheckout<SessionT>(
  params: CloudBuilderBillingGatewayParams<SessionT> & {
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
    nowMs: Date.now(),
  })) as {
    checkout_url?: unknown;
  };
}

export async function startCloudConnectOnboarding<SessionT>(
  params: CloudBuilderBillingGatewayParams<SessionT> & {
    context: "account" | "community";
    communitySlug?: string | null;
  },
): Promise<{ url?: unknown }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.action("billing:startConnectOnboarding" as any, {
    authSubject,
    context: params.context,
    communitySlug: params.communitySlug ?? undefined,
  })) as {
    url?: unknown;
  };
}
