import {
  bootstrapConvexAuthenticatedClient,
  createConvexClient,
} from "./convexAuthenticatedClient";
import type { CommunityBillingPeriod } from "./communityTypes";
import { resolveAuthSubject } from "./authSession";
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

export async function fetchCloudPublicFunnelStats<SessionT, TPublicCommunityStats>(
  params: CloudPublicFunnelParams<SessionT> & {
    communitySlug: string;
  },
): Promise<{
  ok?: boolean;
  community?: TPublicCommunityStats;
}> {
  const client = createConvexClient();
  return (await client.query("community:resolvePublicFunnelStatsBySlug" as any, {
    communitySlug: params.communitySlug,
  })) as {
    ok?: boolean;
    community?: TPublicCommunityStats;
  };
}

const COMMUNITY_FUNNEL_VISITOR_KEY = "polynet-community-funnel-visitor-key";

function getCommunityFunnelVisitorKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(COMMUNITY_FUNNEL_VISITOR_KEY);
    if (existing) return existing;
    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(COMMUNITY_FUNNEL_VISITOR_KEY, next);
    return next;
  } catch {
    return null;
  }
}

export async function recordCloudPublicFunnelVisit<SessionT>(
  params: CloudPublicFunnelParams<SessionT> & {
    session?: SessionT | null;
    communitySlug: string;
  },
): Promise<void> {
  const client = createConvexClient();
  await client.mutation("community:recordPublicFunnelVisitBySlug" as any, {
    communitySlug: params.communitySlug,
    visitorKey: getCommunityFunnelVisitorKey(),
    authSubject: params.session ? resolveAuthSubject(params.session as any) : undefined,
  });
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
  },
): Promise<{ checkout_url?: unknown }> {
  let client = createConvexClient();
  let authSubject: string | null = null;
  if (params.session) {
    const bootstrapped = await bootstrapConvexAuthenticatedClient(params.session);
    client = bootstrapped.client;
    authSubject = bootstrapped.authSubject;
  }
  return (await client.action("billing:startPublicCommunityCheckout" as any, {
    communitySlug: params.communitySlug,
    billingPeriod: params.billingPeriod,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    ...(authSubject ? { authSubject } : null),
  })) as {
    checkout_url?: unknown;
  };
}
