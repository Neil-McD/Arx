import {
  bootstrapConvexAuthenticatedClient,
  createConvexClient,
} from "./convexAuthenticatedClient";
import type { CommunityBillingPeriod } from "./communityTypes";
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

export async function fetchCloudPublicCommunityMemoryOverview<SessionT, TOverview>(
  params: CloudPublicFunnelParams<SessionT> & {
    communitySlug: string;
  },
): Promise<{
  ok?: boolean;
  overview?: TOverview;
}> {
  const client = createConvexClient();
  return (await client.query("community:resolvePublicCommunityMemoryOverviewBySlug" as any, {
    communitySlug: params.communitySlug,
  })) as {
    ok?: boolean;
    overview?: TOverview;
  };
}

export async function recordCloudPublicFunnelVisit(params: {
  communitySlug: string;
}): Promise<void> {
  const client = createConvexClient();
  const visitorKey = getBusinessVisitorKey();
  if (visitorKey) {
    await client.mutation("community:recordPublicFunnelVisitBySlug" as any, {
      communitySlug: params.communitySlug,
      visitorKey,
    });
  }
  await recordCloudBusinessPageVisit({
    pathKind: "community_funnel",
    communitySlug: params.communitySlug,
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
    session: SessionT;
    communitySlug: string;
    billingPeriod: CommunityBillingPeriod;
    successUrl: string;
    cancelUrl: string;
    checkoutAttemptId: string;
  },
): Promise<PublicCommunityCheckoutStartResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const result = await client.action("billing:startPublicCommunityCheckout" as any, {
    communitySlug: params.communitySlug,
    billingPeriod: params.billingPeriod,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    checkoutAttemptId: params.checkoutAttemptId,
    authSubject,
  });
  return requirePublicCommunityCheckoutStartResult(
    result,
    params.checkoutAttemptId,
  );
}

export type PublicCommunityCheckoutStartResult = {
  checkout_attempt_id: string;
  session_id: string;
  checkout_url: string;
};

export function requirePublicCommunityCheckoutStartResult(
  value: unknown,
  expectedAttemptId: string,
): PublicCommunityCheckoutStartResult {
  if (!value || typeof value !== "object") {
    throw new Error("community_checkout_start_contract_invalid");
  }
  const row = value as Record<string, unknown>;
  const checkoutAttemptId = String(row.checkout_attempt_id ?? "").trim();
  const sessionId = String(row.session_id ?? "").trim();
  const checkoutUrl = String(row.checkout_url ?? "").trim();
  let parsed: URL;
  try {
    parsed = new URL(checkoutUrl);
  } catch {
    throw new Error("community_checkout_start_contract_invalid");
  }
  if (
    checkoutAttemptId !== String(expectedAttemptId ?? "").trim() ||
    !sessionId ||
    parsed.protocol !== "https:" ||
    parsed.hostname !== "checkout.stripe.com"
  ) {
    throw new Error("community_checkout_start_contract_invalid");
  }
  return {
    checkout_attempt_id: checkoutAttemptId,
    session_id: sessionId,
    checkout_url: parsed.toString(),
  };
}
