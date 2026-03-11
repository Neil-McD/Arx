import { bootstrapGatewayAuthContext } from "./cloudGateway";

type CloudBuilderBillingGatewayParams<SessionT> = {
  session: SessionT;
};

// Gateway class: authenticated query/mutation bridge, caller-hardened session, fail-closed.

export async function startCloudBuilderCheckout<SessionT>(
  params: CloudBuilderBillingGatewayParams<SessionT> & {
    tier: string;
    successUrl: string;
    cancelUrl: string;
  },
): Promise<{ checkout_url?: unknown }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.mutation("billing:startBuilderCheckout" as any, {
    authSubject,
    tier: params.tier,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    nowMs: Date.now(),
  })) as {
    checkout_url?: unknown;
  };
}

export async function openCloudBuilderBillingPortal<SessionT>(
  params: CloudBuilderBillingGatewayParams<SessionT> & {
    returnUrl: string;
  },
): Promise<{ url?: unknown }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.query("billing:openBuilderBillingPortal" as any, {
    authSubject,
    returnUrl: params.returnUrl,
  })) as {
    url?: unknown;
  };
}

export async function startCloudConnectOnboarding<SessionT>(
  params: CloudBuilderBillingGatewayParams<SessionT> & {
    returnUrl: string;
    refreshUrl: string;
  },
): Promise<{ url?: unknown }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.query("billing:startConnectOnboarding" as any, {
    authSubject,
    returnUrl: params.returnUrl,
    refreshUrl: params.refreshUrl,
  })) as {
    url?: unknown;
  };
}
