import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type {
  CommunityMemberWorkflowDefinition,
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
  members: CloudCommunityMemberWorkflowMember[];
  members_truncated: boolean;
  updated_at: string;
};

export async function fetchCloudCommunityMemberWorkflowBoard<SessionT>(
  params: WorkflowGatewayParams<SessionT> & { communityId: string },
): Promise<CloudCommunityMemberWorkflowBoard | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.query(
    "communityMemberWorkflows:getBuilderWorkflowBoard" as any,
    { authSubject, communityId: params.communityId },
  )) as { workflow?: CloudCommunityMemberWorkflowBoard | null } | null;
  return payload?.workflow ?? null;
}

export async function saveCloudCommunityMemberWorkflow<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    expectedRevision: number;
    definition: CommunityMemberWorkflowDefinition;
  },
): Promise<{ workflow_id: string; revision: number }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  return (await client.mutation(
    "communityMemberWorkflows:saveBuilderWorkflow" as any,
    {
      authSubject,
      communityId: params.communityId,
      expectedRevision: params.expectedRevision,
      definition: params.definition,
    },
  )) as { workflow_id: string; revision: number };
}
