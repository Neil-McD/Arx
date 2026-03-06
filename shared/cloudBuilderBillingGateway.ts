import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";

type CloudBuilderBillingGatewayParams<SessionT> = {
  session: SessionT;
};

async function bootstrapConvexUser(sessionRaw: unknown): Promise<{
  client: ConvexClient;
  authSubject: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  return { client, authSubject };
}

export async function startCloudBuilderCheckout<SessionT>(
  params: CloudBuilderBillingGatewayParams<SessionT> & {
    tier: string;
    successUrl: string;
    cancelUrl: string;
  },
): Promise<{ checkout_url?: unknown }> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
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
  const { client, authSubject } = await bootstrapConvexUser(params.session);
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
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  return (await client.query("billing:startConnectOnboarding" as any, {
    authSubject,
    returnUrl: params.returnUrl,
    refreshUrl: params.refreshUrl,
  })) as {
    url?: unknown;
  };
}
