// Per-community Distribution Engineer connection gateway (owner-only).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export type CloudCommunityDistributionConnection = {
  connected: boolean;
  account_id: string | null;
  webhook_key_hint: string | null;
  updated_at: string | null;
  stats: {
    delivered_count: number;
    pending_count: number;
    needs_attention_count: number;
    last_delivered_at: string | null;
    last_error_code: string | null;
  };
};

type DistributionCall = { session: unknown; communityId: string };

async function client(session: unknown) {
  return await bootstrapConvexAuthenticatedClient(session as any);
}

export async function fetchCloudCommunityDistributionConnection(
  params: DistributionCall,
): Promise<CloudCommunityDistributionConnection> {
  const { client: convex, authSubject } = await client(params.session);
  return (await convex.query("distributionAttribution:getCommunityDistributionConnection" as any, {
    authSubject,
    communityId: params.communityId,
  })) as CloudCommunityDistributionConnection;
}

export async function saveCloudCommunityDistributionConnection(
  params: DistributionCall & { accountId: string; webhookKey?: string },
): Promise<{
  connected: boolean;
  account_id: string;
  webhook_key_hint: string;
  updated_at: string;
}> {
  const { client: convex, authSubject } = await client(params.session);
  return (await convex.mutation(
    "distributionAttribution:saveCommunityDistributionConnection" as any,
    {
      authSubject,
      communityId: params.communityId,
      accountId: params.accountId,
      ...(params.webhookKey ? { webhookKey: params.webhookKey } : {}),
    },
  )) as {
    connected: boolean;
    account_id: string;
    webhook_key_hint: string;
    updated_at: string;
  };
}

export async function disconnectCloudCommunityDistributionConnection(
  params: DistributionCall,
): Promise<{ disconnected: boolean }> {
  const { client: convex, authSubject } = await client(params.session);
  return (await convex.mutation(
    "distributionAttribution:disconnectCommunityDistributionConnection" as any,
    {
      authSubject,
      communityId: params.communityId,
    },
  )) as { disconnected: boolean };
}

export async function retryCloudCommunityDistributionDeliveries(
  params: DistributionCall,
): Promise<{ resumed_count: number }> {
  const { client: convex, authSubject } = await client(params.session);
  return (await convex.mutation(
    "distributionAttribution:retryCommunityDistributionDeliveries" as any,
    {
      authSubject,
      communityId: params.communityId,
    },
  )) as { resumed_count: number };
}
