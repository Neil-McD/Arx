// Proactive Member Coach gateway (convex/communityMemberCoach.ts).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type {
  BuilderHeartbeatPreferenceView,
  MemberCoachDraftView,
  MemberCoachPreferenceView,
  MemberCoachReason,
  MemberCoachSettingsView,
} from "./communityMemberCoachTypes";

type Params = { session: unknown; communityId: string };

export async function fetchMemberCoachDrafts(params: Params): Promise<MemberCoachDraftView[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return (await client.query("communityMemberCoach:listMemberCoachDrafts" as any, {
    authSubject,
    communityId: params.communityId,
  })) ?? [];
}

export async function sendMemberCoachDraft(
  params: Params & { draftId: string; text?: string },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  await client.mutation("communityMemberCoach:sendMemberCoachDraft" as any, {
    authSubject,
    communityId: params.communityId,
    draftId: params.draftId,
    ...(params.text !== undefined ? { text: params.text } : {}),
  });
}

export async function skipMemberCoachDraft(params: Params & { draftId: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  await client.mutation("communityMemberCoach:skipMemberCoachDraft" as any, {
    authSubject,
    communityId: params.communityId,
    draftId: params.draftId,
  });
}

export async function getCloudMemberCoachSettings(params: Params): Promise<MemberCoachSettingsView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.query("communityMemberCoach:getMemberCoachSettings" as any, {
    authSubject,
    communityId: params.communityId,
  });
}

export async function setCloudMemberCoachSettings(
  params: Params & {
    enabled: boolean;
    autoReasons: MemberCoachReason[];
    autoReplyEnabled?: boolean;
    threadFollowupEnabled?: boolean;
    weeklyDigestEnabled?: boolean;
  },
): Promise<MemberCoachSettingsView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.mutation("communityMemberCoach:setMemberCoachSettings" as any, {
    authSubject,
    communityId: params.communityId,
    enabled: params.enabled,
    autoReasons: params.autoReasons,
    ...(params.autoReplyEnabled !== undefined ? { autoReplyEnabled: params.autoReplyEnabled } : {}),
    ...(params.threadFollowupEnabled !== undefined
      ? { threadFollowupEnabled: params.threadFollowupEnabled }
      : {}),
    ...(params.weeklyDigestEnabled !== undefined
      ? { weeklyDigestEnabled: params.weeklyDigestEnabled }
      : {}),
  });
}

export async function getMyMemberCoachPreference(params: Params): Promise<MemberCoachPreferenceView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.query("communityMemberCoach:getMyMemberCoachPreference" as any, {
    authSubject,
    communityId: params.communityId,
  });
}

export async function setMyMemberCoachPreference(
  params: Params & { coachMuted: boolean },
): Promise<MemberCoachPreferenceView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.mutation("communityMemberCoach:setMyMemberCoachPreference" as any, {
    authSubject,
    communityId: params.communityId,
    coachMuted: params.coachMuted,
  });
}

export async function getMyBuilderHeartbeatPreference(
  params: Params,
): Promise<BuilderHeartbeatPreferenceView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.query("communityBuilderHeartbeat:getMyBuilderHeartbeatPreference" as any, {
    authSubject,
    communityId: params.communityId,
  });
}

export async function setMyBuilderHeartbeatPreference(
  params: Params & { enabled: boolean },
): Promise<BuilderHeartbeatPreferenceView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.mutation("communityBuilderHeartbeat:setMyBuilderHeartbeatPreference" as any, {
    authSubject,
    communityId: params.communityId,
    enabled: params.enabled,
  });
}
