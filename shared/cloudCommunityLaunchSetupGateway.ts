import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CommunityLaunchSetupStatus } from "./communityLaunchSetup";

type CloudCommunityLaunchSetupGatewayParams<SessionT> = {
  session: SessionT;
};

export async function loadCloudCommunityLaunchSetupStatus<SessionT>(
  params: CloudCommunityLaunchSetupGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CommunityLaunchSetupStatus | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.query("community:getCommunityLaunchSetupStatus" as any, {
    authSubject,
    communityId: params.communityId,
  });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as CommunityLaunchSetupStatus;
}
