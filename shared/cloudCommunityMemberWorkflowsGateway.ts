import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type {
  CommunityMemberWorkflowInAppTriggerEvent,
  CommunityMemberWorkflowStage,
} from "./communityMemberWorkflow";

type WorkflowGatewayParams<SessionT> = { session: SessionT };

export type CloudCommunityMemberWorkflowMember = {
  membership_id: string;
  current_stage_key: string;
  current_stage_entered_at: string;
  display_name: string;
  avatar_url: string | null;
  avatar_focus_x: number | null;
  avatar_focus_y: number | null;
  avatar_zoom: number | null;
};

export type CloudCommunityMemberWorkflowBoard = {
  id: string;
  community_id: string;
  revision: number;
  stages: CommunityMemberWorkflowStage[];
  updated_at: string;
};

export type CloudCommunityMemberWorkflowBoardPage = {
  board: CloudCommunityMemberWorkflowBoard | null;
  members: CloudCommunityMemberWorkflowMember[];
  totalCount: number | null;
  continueCursor: string | null;
  isDone: boolean;
};

type WorkflowStageMutationResult = {
  workflow_id: string;
  revision: number;
  stage?: CommunityMemberWorkflowStage;
};

export async function fetchCloudCommunityMemberWorkflowBoardPage<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    cursor?: string | null;
    pageSize?: number;
  },
): Promise<CloudCommunityMemberWorkflowBoardPage> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.query(
    "communityMemberWorkflows:getBuilderWorkflowBoardPage" as any,
    {
      authSubject,
      communityId: params.communityId,
      cursor: params.cursor ?? null,
      pageSize: params.pageSize ?? 50,
    },
  )) as {
    workflow?: CloudCommunityMemberWorkflowBoard | null;
    page?: CloudCommunityMemberWorkflowMember[];
    totalCount?: number | null;
    continueCursor?: string | null;
    isDone?: boolean;
  } | null;
  return {
    board: payload?.workflow ?? null,
    members: Array.isArray(payload?.page) ? payload.page : [],
    totalCount:
      typeof payload?.totalCount === "number" ? payload.totalCount : null,
    continueCursor:
      typeof payload?.continueCursor === "string"
        ? payload.continueCursor
        : null,
    isDone: payload?.isDone === true,
  };
}

export async function createCloudCommunityMemberWorkflowStage<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    expectedRevision: number;
    name: string;
  },
): Promise<WorkflowStageMutationResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  return (await client.mutation(
    "communityMemberWorkflows:createBuilderWorkflowStage" as any,
    {
      authSubject,
      communityId: params.communityId,
      expectedRevision: params.expectedRevision,
      name: params.name,
    },
  )) as WorkflowStageMutationResult;
}

export async function updateCloudCommunityMemberWorkflowStage<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    expectedRevision: number;
    stageKey: string;
    name: string;
    completionTriggerEvent: CommunityMemberWorkflowInAppTriggerEvent | null;
  },
): Promise<WorkflowStageMutationResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  return (await client.mutation(
    "communityMemberWorkflows:updateBuilderWorkflowStage" as any,
    {
      authSubject,
      communityId: params.communityId,
      expectedRevision: params.expectedRevision,
      stageKey: params.stageKey,
      name: params.name,
      completionTriggerEvent: params.completionTriggerEvent,
    },
  )) as WorkflowStageMutationResult;
}

export async function deleteCloudCommunityMemberWorkflowStage<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    expectedRevision: number;
    stageKey: string;
  },
): Promise<WorkflowStageMutationResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  return (await client.mutation(
    "communityMemberWorkflows:deleteBuilderWorkflowStage" as any,
    {
      authSubject,
      communityId: params.communityId,
      expectedRevision: params.expectedRevision,
      stageKey: params.stageKey,
    },
  )) as WorkflowStageMutationResult;
}
