import {
  bootstrapConvexAuthenticatedClient,
  createConvexClient,
} from "./convexAuthenticatedClient";
import type { CommunityBillingPeriod } from "./communityTypes";

type CloudPublicFunnelAuthParams<SessionT> = {
  session: SessionT;
};

type CloudPublicFunnelParams<SessionT> = {
};

function coerceObjectRows<TRow>(payload: unknown): TRow[] {
  if (Array.isArray(payload)) return payload as TRow[];
  if (!payload || typeof payload !== "object") return [];
  const payloadObj = payload as Record<string, unknown>;
  const keys = ["rows", "items", "data"] as const;
  for (const key of keys) {
    const value = payloadObj[key];
    if (Array.isArray(value)) return value as TRow[];
  }
  return [payload as TRow];
}

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
  const rows = coerceObjectRows<TRow>(payload);
  return rows[0] ?? null;
}

export async function requestCloudCommunityAccessBySlug<SessionT, TRow = unknown>(
  params: CloudPublicFunnelAuthParams<SessionT> & {
    communitySlug: string;
    message?: string | null;
  },
): Promise<TRow | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:requestCommunityAccessBySlug" as any, {
    authSubject,
    communitySlug: params.communitySlug,
    message: params.message ?? null,
  });
  const rows = coerceObjectRows<TRow>(payload);
  return rows[0] ?? null;
}

export async function resolveCloudPublicFunnel<SessionT, TPublicCommunity, TPublicPlan>(
  params: CloudPublicFunnelParams<SessionT> & {
    communitySlug: string;
  },
): Promise<{
  ok?: boolean;
  community?: TPublicCommunity;
  active_plan?: TPublicPlan | null;
  active_plans?: TPublicPlan[] | null;
}> {
  const client = createConvexClient();
  return (await client.query("community:resolvePublicFunnelBySlug" as any, {
    communitySlug: params.communitySlug,
  })) as {
    ok?: boolean;
    community?: TPublicCommunity;
    active_plan?: TPublicPlan | null;
    active_plans?: TPublicPlan[] | null;
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
  const rows = coerceObjectRows<TSummary>(payload);
  return rows[0] ?? null;
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
