import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type {
  CommunityMemberWorkflowDraft,
  CommunityMemberWorkflowStage,
} from "./communityMemberWorkflow";

type WorkflowGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityMemberWorkflowVersion = {
  id: string;
  version: number;
  status: "draft" | "active" | "retired";
  outcome_name: string;
  outcome_definition: string;
  stages: CommunityMemberWorkflowStage[];
  activated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CloudCommunityMemberWorkflowMember = {
  enrollment_id: string;
  membership_id: string;
  user_id: string;
  workflow_version_id: string;
  activation_sequence: number;
  status: "active" | "paused" | "completed" | "exited";
  current_stage_key: string;
  current_stage_entered_at: string;
  revision: number;
  display_name: string;
  avatar_url: string | null;
  avatar_storage_id: string | null;
  avatar_focus_x: number | null;
  avatar_focus_y: number | null;
  avatar_zoom: number | null;
};

export type CloudCommunityMemberWorkflowBoard = {
  id: string;
  community_id: string;
  name: string;
  status: "draft" | "active" | "archived";
  revision: number;
  active_version: CloudCommunityMemberWorkflowVersion | null;
  draft_version: CloudCommunityMemberWorkflowVersion | null;
  enrollment_backfill_status:
    | "queued"
    | "running"
    | "complete"
    | "error"
    | null;
  enrollment_backfill_error: string | null;
  members: CloudCommunityMemberWorkflowMember[];
  truncated_stage_keys: string[];
  updated_at: string;
};

export type CloudCommunityMemberWorkflowEnrollmentDetail = {
  enrollment: Omit<CloudCommunityMemberWorkflowMember, "enrollment_id"> & {
    id: string;
    workflow_version: CloudCommunityMemberWorkflowVersion;
    completed_at: string | null;
    exited_at: string | null;
  };
  evidence: Array<{
    id: string;
    stage_key: string;
    criterion_key: string | null;
    source_type: string;
    status: string;
    summary: string;
    source_ref: string | null;
    confidence: number;
    uncertainty: string | null;
    observed_at: string;
    created_at: string;
  }>;
  transitions: Array<{
    id: string;
    seq: number;
    from_stage_key: string | null;
    to_stage_key: string | null;
    kind: string;
    reason: string;
    actor_type: string;
    occurred_at: string;
  }>;
};

export async function fetchCloudCommunityMemberWorkflowBoard<SessionT>(
  params: WorkflowGatewayParams<SessionT> & { communityId: string },
): Promise<CloudCommunityMemberWorkflowBoard | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.query(
    "communityMemberWorkflows:getBuilderWorkflowBoard" as any,
    {
      authSubject,
      communityId: params.communityId,
    },
  )) as { workflow?: CloudCommunityMemberWorkflowBoard | null } | null;
  return payload?.workflow ?? null;
}

export async function fetchCloudCommunityMemberWorkflowEnrollment<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    enrollmentId: string;
  },
): Promise<CloudCommunityMemberWorkflowEnrollmentDetail> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  return (await client.query(
    "communityMemberWorkflows:getBuilderEnrollmentDetail" as any,
    {
      authSubject,
      communityId: params.communityId,
      enrollmentId: params.enrollmentId,
    },
  )) as CloudCommunityMemberWorkflowEnrollmentDetail;
}

export async function saveCloudCommunityMemberWorkflowDraft<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    expectedRevision: number;
    draft: CommunityMemberWorkflowDraft;
  },
): Promise<{ workflow_id: string; revision: number; version: number }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  return (await client.mutation(
    "communityMemberWorkflows:saveBuilderWorkflowDraft" as any,
    {
      authSubject,
      communityId: params.communityId,
      expectedRevision: params.expectedRevision,
      draft: params.draft,
    },
  )) as { workflow_id: string; revision: number; version: number };
}

export async function activateCloudCommunityMemberWorkflowDraft<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    expectedRevision: number;
  },
): Promise<{ workflow_id: string; revision: number; version: number }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  return (await client.mutation(
    "communityMemberWorkflows:activateBuilderWorkflowDraft" as any,
    {
      authSubject,
      communityId: params.communityId,
      expectedRevision: params.expectedRevision,
    },
  )) as { workflow_id: string; revision: number; version: number };
}

export async function addCloudCommunityMemberWorkflowEvidence<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    enrollmentId: string;
    stageKey: string;
    summary: string;
    idempotencyKey: string;
  },
): Promise<{ evidence_id: string; replayed: boolean }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  return (await client.mutation(
    "communityMemberWorkflows:recordBuilderEvidence" as any,
    {
      authSubject,
      communityId: params.communityId,
      enrollmentId: params.enrollmentId,
      stageKey: params.stageKey,
      summary: params.summary,
      confidence: 1,
      idempotencyKey: params.idempotencyKey,
    },
  )) as { evidence_id: string; replayed: boolean };
}

export async function moveCloudCommunityMemberWorkflowEnrollment<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    enrollmentId: string;
    expectedRevision: number;
    targetStageKey: string;
    reason: string;
    idempotencyKey: string;
  },
): Promise<{
  transition_id: string;
  enrollment_revision: number;
  replayed: boolean;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  return (await client.mutation(
    "communityMemberWorkflows:moveBuilderWorkflowEnrollment" as any,
    {
      authSubject,
      communityId: params.communityId,
      enrollmentId: params.enrollmentId,
      expectedRevision: params.expectedRevision,
      targetStageKey: params.targetStageKey,
      reason: params.reason,
      idempotencyKey: params.idempotencyKey,
    },
  )) as {
    transition_id: string;
    enrollment_revision: number;
    replayed: boolean;
  };
}

export async function completeCloudCommunityMemberWorkflowEnrollment<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    enrollmentId: string;
    expectedRevision: number;
    reason: string;
    idempotencyKey: string;
  },
): Promise<{
  transition_id: string;
  enrollment_revision: number;
  replayed: boolean;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  return (await client.mutation(
    "communityMemberWorkflows:completeBuilderWorkflowEnrollment" as any,
    {
      authSubject,
      communityId: params.communityId,
      enrollmentId: params.enrollmentId,
      expectedRevision: params.expectedRevision,
      reason: params.reason,
      idempotencyKey: params.idempotencyKey,
    },
  )) as {
    transition_id: string;
    enrollment_revision: number;
    replayed: boolean;
  };
}
