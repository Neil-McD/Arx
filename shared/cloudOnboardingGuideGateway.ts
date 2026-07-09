import { type AuthSessionLike } from "./authSession";
import {
  bootstrapGatewayAuthContextIfAvailable,
  readGatewayConvexIdMaybe,
} from "./cloudGateway";

export type CloudOnboardingGuideKickoffResult = {
  ok?: boolean;
  status?: string | null;
  activation_id?: string | null;
  thread_id?: string | null;
  community_id?: string | null;
  run_id?: string | null;
  run_required?: boolean | null;
  error?: string | null;
};

// Gateway class: authenticated lifecycle preparation, fail-soft when Convex is unavailable locally.
export async function requestOnboardingGuideKickoff<SessionT extends AuthSessionLike>(
  params: {
    session: SessionT;
    communityId?: string | null;
  },
): Promise<CloudOnboardingGuideKickoffResult | null> {
  const bootstrapped = await bootstrapGatewayAuthContextIfAvailable(params.session);
  if (!bootstrapped) return null;
  const { client, authSubject } = bootstrapped;
  const maybeCommunityId = readGatewayConvexIdMaybe(params.communityId);
  return (await client.action("onboardingLifecycle:requestOnboardingGuideKickoff" as any, {
    authSubject,
    ...(maybeCommunityId ? { communityId: maybeCommunityId } : {}),
  })) as CloudOnboardingGuideKickoffResult;
}
