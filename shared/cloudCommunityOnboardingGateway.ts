import { api } from "../convex/_generated/api";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CloudCommunityChatLiveClient } from "./cloudCommunityChatGateway";
import type {
  CommunityOnboardingConfig,
  CommunityOnboardingOrientationNarration,
  CommunityOnboardingSession,
} from "./communityOnboarding";

export async function fetchCloudCommunityOnboardingConfig<SessionT>(params: {
  session: SessionT;
  communityId: string;
}): Promise<CommunityOnboardingConfig> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.query("communityOnboarding:getCommunityOnboardingConfig" as any, {
    authSubject,
    communityId: params.communityId,
  }) as CommunityOnboardingConfig;
}

export async function saveCloudCommunityOnboardingConfig<SessionT>(params: {
  session: SessionT;
  communityId: string;
  enabled: boolean;
  welcomeMessage: string;
  introVideoUrl: string | null;
}): Promise<CommunityOnboardingConfig> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityOnboarding:saveCommunityOnboardingConfig" as any, {
    authSubject,
    communityId: params.communityId,
    enabled: params.enabled,
    welcomeMessage: params.welcomeMessage,
    introVideoUrl: params.introVideoUrl ?? "",
  }) as CommunityOnboardingConfig;
}

export async function generateCloudCommunityOnboardingOrientationPreview<SessionT>(params: {
  session: SessionT;
  communityId: string;
}): Promise<Pick<
  CommunityOnboardingOrientationNarration,
  "status" | "text"
>> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.action(
    "communityOnboardingConcierge:generateOrientationNarrationPreview" as any,
    {
      authSubject,
      communityId: params.communityId,
    },
  ) as Pick<
    CommunityOnboardingOrientationNarration,
    "status" | "text"
  >;
}

export async function requestCloudCommunityOnboardingOrientation<SessionT>(params: {
  session: SessionT;
  communityId: string;
  sessionId: string;
}): Promise<Pick<CommunityOnboardingOrientationNarration, "status" | "text">> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.action(
    "communityOnboardingConcierge:requestMyOrientationNarration" as any,
    {
      authSubject,
      communityId: params.communityId,
      sessionId: params.sessionId,
    },
  ) as Pick<CommunityOnboardingOrientationNarration, "status" | "text">;
}

async function mutateCloudCommunityOnboardingSession<ResultT, SessionT>(params: {
  session: SessionT;
  communityId: string;
  sessionId: string;
  mutationName:
    | "communityOnboarding:completeMyCommunityOnboardingOrientation"
    | "communityOnboarding:acknowledgeMyCommunityOnboardingAgentTurn"
    | "communityOnboarding:completeMyCommunityOnboardingMcpHandoff"
    | "communityOnboarding:dismissMyCommunityOnboardingSession";
}): Promise<ResultT> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation(params.mutationName as any, {
    authSubject,
    communityId: params.communityId,
    sessionId: params.sessionId,
  }) as ResultT;
}

export async function acknowledgeCloudCommunityOnboardingAgentTurn<SessionT>(params: {
  session: SessionT;
  communityId: string;
  sessionId: string;
}): Promise<CommunityOnboardingSession | null> {
  return await mutateCloudCommunityOnboardingSession<CommunityOnboardingSession | null, SessionT>({
    ...params,
    mutationName: "communityOnboarding:acknowledgeMyCommunityOnboardingAgentTurn",
  });
}

export async function completeCloudCommunityOnboardingOrientation<SessionT>(params: {
  session: SessionT;
  communityId: string;
  sessionId: string;
}): Promise<CommunityOnboardingSession | null> {
  return await mutateCloudCommunityOnboardingSession<CommunityOnboardingSession | null, SessionT>({
    ...params,
    mutationName: "communityOnboarding:completeMyCommunityOnboardingOrientation",
  });
}

export async function dismissCloudCommunityOnboardingSession<SessionT>(params: {
  session: SessionT;
  communityId: string;
  sessionId: string;
}): Promise<void> {
  await mutateCloudCommunityOnboardingSession<{ dismissed: boolean }, SessionT>({
    ...params,
    mutationName: "communityOnboarding:dismissMyCommunityOnboardingSession",
  });
}

export async function completeCloudCommunityOnboardingMcpHandoff<SessionT>(params: {
  session: SessionT;
  communityId: string;
  sessionId: string;
}): Promise<CommunityOnboardingSession | null> {
  return await mutateCloudCommunityOnboardingSession<CommunityOnboardingSession | null, SessionT>({
    ...params,
    mutationName: "communityOnboarding:completeMyCommunityOnboardingMcpHandoff",
  });
}

export function subscribeCloudCommunityOnboardingSession(params: {
  liveClient: CloudCommunityChatLiveClient;
  communityId: string;
  onUpdate: (session: CommunityOnboardingSession | null) => void;
  onError?: (error: unknown) => void;
}): () => void {
  const watch = params.liveClient.client.watchQuery(
    (api as any).communityOnboarding.getMyCommunityOnboardingSession,
    {
      authSubject: params.liveClient.authSubject,
      communityId: params.communityId as any,
    },
  );
  const publish = () => {
    try {
      const result = watch.localQueryResult() as CommunityOnboardingSession | null | undefined;
      if (typeof result === "undefined") return;
      params.onUpdate(result ?? null);
    } catch (error) {
      params.onError?.(error);
    }
  };
  publish();
  return watch.onUpdate(publish);
}
