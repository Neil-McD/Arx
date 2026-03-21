import {
  bootstrapConvexAuthenticatedClient,
  createConvexClient,
} from "./convexAuthenticatedClient";
import type { CommunityBillingPeriod } from "./communityTypes";
import { firstGatewayRow } from "./cloudGateway";

type CloudPublicFunnelAuthParams<SessionT> = {
  session: SessionT;
};

type CloudPublicFunnelParams<SessionT> = {
};

export async function fetchCloudMyJoinRequestBySlug<SessionT, TRow = unknown>(
  params: CloudPublicFunnelAuthParams<SessionT> & {
    communitySlug: string;
  },
): Promise<TRow | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getMyJoinRequestBySlug" as any, {
    authSubject,
    communitySlug: params.communitySlug,
  });
  return firstGatewayRow<TRow>(payload);
}

export async function cancelCloudMyJoinRequestBySlug<SessionT>(
  params: CloudPublicFunnelAuthParams<SessionT> & {
    communitySlug: string;
  },
): Promise<{ outcome?: "canceled" | "none" | "ignored"; status?: string }> {
  const { client } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation("community:cancelMyJoinRequestBySlug" as any, {
    communitySlug: params.communitySlug,
    nowMs: Date.now(),
  })) as { outcome?: "canceled" | "none" | "ignored"; status?: string };
}

export async function resolveCloudPublicFunnel<SessionT, TPublicCommunity, TPublicPlan>(
  params: CloudPublicFunnelParams<SessionT> & {
    communitySlug: string;
  },
): Promise<{
  ok?: boolean;
  community?: TPublicCommunity;
  active_plan?: TPublicPlan | null;
}> {
  const client = createConvexClient();
  return (await client.query("community:resolvePublicFunnelBySlug" as any, {
    communitySlug: params.communitySlug,
  })) as {
    ok?: boolean;
    community?: TPublicCommunity;
    active_plan?: TPublicPlan | null;
  };
}

export async function heartbeatCloudCommunityPresence<SessionT>(
  params: CloudPublicFunnelAuthParams<SessionT> & {
    communityId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:heartbeatCommunityPresence" as any, {
    authSubject,
    communityId: params.communityId,
    nowMs: Date.now(),
  });
}

export async function fetchCloudCommunityPresenceSummary<SessionT, TSummary = unknown>(
  params: CloudPublicFunnelAuthParams<SessionT> & {
    communityId: string;
  },
): Promise<TSummary | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getCommunityPresenceSummary" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return firstGatewayRow<TSummary>(payload);
}

export async function startCloudPublicFunnelCheckout<SessionT>(
  params: CloudPublicFunnelParams<SessionT> & {
    session: SessionT | null;
    communitySlug: string;
    billingPeriod: CommunityBillingPeriod;
    successUrl: string;
    cancelUrl: string;
    brandosAid?: string | null;
  },
): Promise<{ checkout_url?: unknown }> {
  let client = createConvexClient();
  let authSubject: string | null = null;
  if (params.session) {
    const bootstrapped = await bootstrapConvexAuthenticatedClient(params.session);
    client = bootstrapped.client;
    authSubject = bootstrapped.authSubject;
  }
  return (await client.mutation("billing:startPublicCommunityCheckout" as any, {
    communitySlug: params.communitySlug,
    billingPeriod: params.billingPeriod,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    brandosAid: params.brandosAid ?? null,
    ...(authSubject ? { authSubject } : null),
    nowMs: Date.now(),
  })) as {
    checkout_url?: unknown;
  };
}
