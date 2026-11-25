import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { JourneyCardStatus, JourneyStageDefinition } from "./communityMemberJourney";

export type CloudMemberJourneyCard = {
  membership_id: string;
  user_id: string;
  name: string;
  handle: string | null;
  avatar_url: string | null;
  avatar_focus_x: number;
  avatar_focus_y: number;
  avatar_zoom: number;
  role: "owner" | "admin" | "moderator" | "member";
  plan_label: string;
  money_kind: "on_hold" | "cancelling" | null;
  stage_key: string;
  status: JourneyCardStatus;
  status_is_manual: boolean;
  founder_instruction: string | null;
  founder_instruction_updated_at: string | null;
  agent_outcome: string | null;
  agent_outcome_at: string | null;
  working_on: string | null;
  joined_at: string | null;
  last_active_at: string | null;
};

export type CloudMemberJourneyBoard = {
  stages: JourneyStageDefinition[];
  auto_advance_enabled: boolean;
  cards: CloudMemberJourneyCard[];
  total_active_members: number;
  capped: boolean;
};

export async function getCloudCommunityMemberJourneyBoard<SessionT>(params: {
  session: SessionT;
  communityId: string;
}): Promise<CloudMemberJourneyBoard> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.query("communityMemberJourney:getCommunityMemberJourneyBoard" as any, {
    authSubject,
    communityId: params.communityId,
  })) as CloudMemberJourneyBoard;
}

export async function saveCloudCommunityJourneyStages<SessionT>(params: {
  session: SessionT;
  communityId: string;
  stages: Array<{ key?: string; name: string; goal: string }>;
  autoAdvanceEnabled?: boolean;
}): Promise<{ stages: JourneyStageDefinition[]; auto_advance_enabled: boolean }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation("communityMemberJourney:saveCommunityJourneyStages" as any, {
    authSubject,
    communityId: params.communityId,
    stages: params.stages,
    ...(params.autoAdvanceEnabled !== undefined ? { autoAdvanceEnabled: params.autoAdvanceEnabled } : {}),
  })) as { stages: JourneyStageDefinition[]; auto_advance_enabled: boolean };
}

export async function updateCloudMemberJourneyCard<SessionT>(params: {
  session: SessionT;
  communityId: string;
  membershipId: string;
  stageKey?: string;
  statusOverride?: JourneyCardStatus | "auto";
  founderInstruction?: string | null;
}): Promise<{
  stage_key: string;
  status_override: JourneyCardStatus | null;
  founder_instruction: string | null;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation("communityMemberJourney:updateMemberJourneyCard" as any, {
    authSubject,
    communityId: params.communityId,
    membershipId: params.membershipId,
    ...(params.stageKey !== undefined ? { stageKey: params.stageKey } : {}),
    ...(params.statusOverride !== undefined ? { statusOverride: params.statusOverride } : {}),
    ...(params.founderInstruction !== undefined ? { founderInstruction: params.founderInstruction ?? "" } : {}),
  })) as {
    stage_key: string;
    status_override: JourneyCardStatus | null;
    founder_instruction: string | null;
  };
}
