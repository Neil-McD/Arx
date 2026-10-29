import {
  bootstrapConvexAuthenticatedClient,
  createConvexClient,
} from "./convexAuthenticatedClient";
import type { CommunityBillingPeriod } from "./communityTypes";
import { resolveAuthSubject } from "./authSession";
import { firstGatewayRow } from "./cloudGateway";
import {
  getBusinessVisitorKey,
  recordCloudBusinessPageVisit,
} from "./cloudBusinessAnalyticsGateway";

type CloudPublicFunnelAuthParams<SessionT> = {
  session: SessionT;
};

type CloudPublicFunnelParams<SessionT> = {
};

export async function cancelCloudMyJoinRequestBySlug<SessionT>(
  params: CloudPublicFunnelAuthParams<SessionT> & {
    communitySlug: string;
  },
): Promise<{ outcome?: "canceled" | "none" | "ignored"; status?: string }> {
  const { client } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation("communityPublic:cancelMyJoinRequestBySlug" as any, {
    communitySlug: params.communitySlug,
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
  return (await client.query("communityPublic:resolvePublicFunnelBySlug" as any, {
    communitySlug: params.communitySlug,
  })) as {
    ok?: boolean;
    community?: TPublicCommunity;
    active_plan?: TPublicPlan | null;
  };
}

export async function fetchCloudPublicFunnelStats<SessionT, TPublicCommunityStats>(
  params: CloudPublicFunnelParams<SessionT> & {
    communitySlug: string;
  },
): Promise<{
  ok?: boolean;
  community?: TPublicCommunityStats;
}> {
  const client = createConvexClient();
  return (await client.query("communityPublic:resolvePublicFunnelStatsBySlug" as any, {
    communitySlug: params.communitySlug,
  })) as {
    ok?: boolean;
    community?: TPublicCommunityStats;
  };
}

export async function fetchCloudPublicCommunityMemoryOverview<SessionT, TOverview>(
  params: CloudPublicFunnelParams<SessionT> & {
    communitySlug: string;
  },
): Promise<{
  ok?: boolean;
  overview?: TOverview;
}> {
  const client = createConvexClient();
  return (await client.query("communityIntelligenceDirectory:resolvePublicCommunityMemoryOverviewBySlug" as any, {
    communitySlug: params.communitySlug,
  })) as {
    ok?: boolean;
    overview?: TOverview;
  };
}

export async function recordCloudPublicFunnelVisit<SessionT>(
  params: CloudPublicFunnelParams<SessionT> & {
    session?: SessionT | null;
    communitySlug: string;
  },
): Promise<void> {
  const client = createConvexClient();
  const visitorKey = getBusinessVisitorKey();
  const authSubject = params.session ? resolveAuthSubject(params.session as any) : undefined;
  await client.mutation("communityPublic:recordPublicFunnelVisitBySlug" as any, {
    communitySlug: params.communitySlug,
    visitorKey: visitorKey ?? undefined,
    authSubject: authSubject ?? undefined,
  });
  await recordCloudBusinessPageVisit<SessionT>({
    session: params.session ?? null,
    pathKind: "community_funnel",
    communitySlug: params.communitySlug,
  });
}

export async function refreshCloudCommunityPresence<SessionT, TSummary = unknown>(
  params: CloudPublicFunnelAuthParams<SessionT> & {
    communityId: string;
  },
): Promise<TSummary | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityPublic:heartbeatCommunityPresence" as any, {
    authSubject,
    communityId: params.communityId,
  });
  const payload = await client.query("communityPublic:getCommunityPresenceSummary" as any, {
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
    offerKey?: string | null;
  },
): Promise<{ checkout_url?: unknown }> {
  let client = createConvexClient();
  let authSubject: string | null = null;
  if (params.session) {
    const bootstrapped = await bootstrapConvexAuthenticatedClient(params.session);
    client = bootstrapped.client;
    authSubject = bootstrapped.authSubject;
  }
  return (await client.action("communityCommerce:startPublicCommunityCheckout" as any, {
    communitySlug: params.communitySlug,
    billingPeriod: params.billingPeriod,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    ...(params.offerKey ? { offerKey: params.offerKey } : null),
    ...(authSubject ? { authSubject } : null),
  })) as {
    checkout_url?: unknown;
  };
}
