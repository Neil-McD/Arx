import {
  bootstrapConvexAuthenticatedClient,
  createConvexClient,
} from "./convexAuthenticatedClient";
import { firstGatewayRow } from "./cloudGateway";

type CloudPublicFunnelAuthParams<SessionT> = {
  session: SessionT;
};

type CloudPublicFunnelParams<SessionT> = {
};

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

// Being in a community: a heartbeat. Who else is here is read live
// (communityPublic:getCommunityPresenceSummary, shared/liveQuery.ts).
export async function heartbeatCloudCommunityPresence<SessionT>(
  params: CloudPublicFunnelAuthParams<SessionT> & {
    communityId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityPublic:heartbeatCommunityPresence" as any, {
    authSubject,
    communityId: params.communityId,
  });
}

