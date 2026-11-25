import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type {
  JourneyCardStatus,
  JourneyCheckpointKind,
  JourneyMilestoneSource,
  JourneyStageCheckpoint,
  JourneyStageDefinition,
} from "./communityMemberJourney";

export type CloudMemberJourneyCheckpoint = {
  key: string;
  label: string;
  kind: JourneyCheckpointKind;
  done: boolean;
  auto: boolean;
  completed_at: string | null;
};

export type CloudMemberJourneyOutcome = {
  id: string;
  text: string;
  at: string;
  source: JourneyMilestoneSource;
};

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
  activity_summary: string | null;
  checkpoints: CloudMemberJourneyCheckpoint[];
  checkpoints_done: number;
  checkpoints_total: number;
  outcomes: CloudMemberJourneyOutcome[];
  latest_outcome: { text: string; at: string } | null;
  joined_at: string | null;
  last_active_at: string | null;
};

export type CloudMemberJourneyBoard = {
  stages: JourneyStageDefinition[];
  auto_advance_enabled: boolean;
  cards: CloudMemberJourneyCard[];
  total_active_members: number;
  capped: boolean;
  hosted_ai_tier?: "free" | "guide" | "chief_of_staff";
  hosted_agent_on?: boolean;
};

export type CloudJourneyStageAdvanceProposal = {
  membership_id: string;
  member_name: string;
  member_handle: string | null;
  from_stage_key: string;
  from_stage_name: string;
  to_stage_key: string;
  to_stage_name: string;
  to_stage_goal: string;
  completed_labels: string[];
};

export async function listCloudJourneyStageAdvanceProposals<SessionT>(params: {
  session: SessionT;
  communityId: string;
}): Promise<CloudJourneyStageAdvanceProposal[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.query("communityMemberJourney:listJourneyStageAdvanceProposals" as any, {
    authSubject,
    communityId: params.communityId,
  })) as CloudJourneyStageAdvanceProposal[];
}

export async function approveCloudJourneyStageAdvance<SessionT>(params: {
  session: SessionT;
  communityId: string;
  membershipId: string;
  expectedFromStageKey: string;
  targetStageKey: string;
}): Promise<{ status: "moved" | "already_moved" | "no_longer_ready"; stage_key: string }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation("communityMemberJourney:approveJourneyStageAdvance" as any, {
    authSubject,
    communityId: params.communityId,
    membershipId: params.membershipId,
    expectedFromStageKey: params.expectedFromStageKey,
    targetStageKey: params.targetStageKey,
  })) as { status: "moved" | "already_moved" | "no_longer_ready"; stage_key: string };
}

export async function dismissCloudJourneyStageAdvance<SessionT>(params: {
  session: SessionT;
  communityId: string;
  membershipId: string;
  expectedFromStageKey: string;
}): Promise<{ dismissed_for_stage_key: string }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation("communityMemberJourney:dismissJourneyStageAdvance" as any, {
    authSubject,
    communityId: params.communityId,
    membershipId: params.membershipId,
    expectedFromStageKey: params.expectedFromStageKey,
  })) as { dismissed_for_stage_key: string };
}

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
  stages: Array<{ key?: string; name: string; goal: string; checkpoints?: JourneyStageCheckpoint[] }>;
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
  toggleMilestone?: { key: string; label?: string; completed: boolean };
  addOutcomeText?: string;
  removeOutcomeId?: string;
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
    ...(params.toggleMilestone !== undefined ? { toggleMilestone: params.toggleMilestone } : {}),
    ...(params.addOutcomeText !== undefined ? { addOutcomeText: params.addOutcomeText } : {}),
    ...(params.removeOutcomeId !== undefined ? { removeOutcomeId: params.removeOutcomeId } : {}),
  })) as {
    stage_key: string;
    status_override: JourneyCardStatus | null;
    founder_instruction: string | null;
  };
}
