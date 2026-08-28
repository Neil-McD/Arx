import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  bootstrapConvexAuthenticatedClient,
  requireConvexUrl,
} from "./convexAuthenticatedClient";
import {
  acquireAuthenticatedConvexRealtimeClient,
  type AuthenticatedConvexRealtimeLease,
  type ConvexRealtimeEnsureSession,
} from "./convexRealtimeAuth";
import type {
  CommunityMemberWorkflowAutomation,
  CommunityMemberWorkflowMilestone,
} from "./communityMemberWorkflow";
import type { CommunityMemberSuccessDossier } from "./communityMemberSuccessDossier";

type WorkflowGatewayParams<SessionT> = { session: SessionT };

export type CloudCommunityMemberWorkflowMember = {
  membership_id: string;
  current_milestone_key: string;
  current_milestone_entered_at: string;
  workflow_completed_at: string | null;
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
  milestones: CommunityMemberWorkflowMilestone[];
  updated_at: string;
};

export type CloudCommunityMemberWorkflowBoardPage = {
  board: CloudCommunityMemberWorkflowBoard | null;
  members: CloudCommunityMemberWorkflowMember[];
  totalCount: number | null;
  continueCursor: string | null;
  isDone: boolean;
};

export type CloudCommunityMemberWorkflowBoardProjectionToken = {
  workflow_id: string | null;
  workflow_revision: number;
  active_member_count: number | null;
  latest_transition_id: string | null;
  latest_run_id: string | null;
  latest_run_updated_at: number | null;
};

export type CloudCommunityMemberSuccessDossier =
  CommunityMemberSuccessDossier & { markdown: string };

export type CloudCommunityMemberWorkflowLiveClient =
  AuthenticatedConvexRealtimeLease;

type WorkflowMilestoneMutationResult = {
  workflow_id: string;
  revision: number;
  milestone?: CommunityMemberWorkflowMilestone;
};

export function createCloudCommunityMemberWorkflowLiveClient<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    ensureSession?: ConvexRealtimeEnsureSession<SessionT>;
  },
): CloudCommunityMemberWorkflowLiveClient {
  return acquireAuthenticatedConvexRealtimeClient({
    convexUrl: requireConvexUrl(),
    session: params.session,
    ensureSession: params.ensureSession,
  });
}

export function subscribeCloudCommunityMemberWorkflowBoardProjection(params: {
  liveClient: CloudCommunityMemberWorkflowLiveClient;
  communityId: string;
  onUpdate: (token: CloudCommunityMemberWorkflowBoardProjectionToken) => void;
  onError?: (error: unknown) => void;
}): () => void {
  const watch = params.liveClient.client.watchQuery(
    api.communityMemberWorkflows.getBuilderWorkflowBoardProjectionToken,
    {
      authSubject: params.liveClient.authSubject,
      communityId: params.communityId as Id<"communities">,
    },
  );
  const publish = () => {
    try {
      const result = watch.localQueryResult();
      if (typeof result === "undefined") return;
      params.onUpdate(result as CloudCommunityMemberWorkflowBoardProjectionToken);
    } catch (error) {
      params.onError?.(error);
    }
  };
  publish();
  return watch.onUpdate(publish);
}

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
    api.communityMemberWorkflows.getBuilderWorkflowBoardPage,
    {
      authSubject,
      communityId: params.communityId as Id<"communities">,
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
    totalCount: typeof payload?.totalCount === "number" ? payload.totalCount : null,
    continueCursor:
      typeof payload?.continueCursor === "string" ? payload.continueCursor : null,
    isDone: payload?.isDone === true,
  };
}

export async function fetchCloudCommunityMemberSuccessDossier<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    membershipId: string;
  },
): Promise<CloudCommunityMemberSuccessDossier> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  return (await client.query(
    api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier,
    {
      authSubject,
      communityId: params.communityId as Id<"communities">,
      membershipId: params.membershipId as Id<"communityMemberships">,
    },
  )) as CloudCommunityMemberSuccessDossier;
}

export async function createCloudCommunityMemberWorkflowMilestone<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    expectedRevision: number;
    name: string;
  },
): Promise<WorkflowMilestoneMutationResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  return (await client.mutation(
    api.communityMemberWorkflows.createBuilderWorkflowMilestone,
    {
      authSubject,
      communityId: params.communityId as Id<"communities">,
      expectedRevision: params.expectedRevision,
      name: params.name,
    },
  )) as WorkflowMilestoneMutationResult;
}

export async function updateCloudCommunityMemberWorkflowMilestone<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    expectedRevision: number;
    milestoneKey: string;
    name: string;
    automations: CommunityMemberWorkflowAutomation[];
  },
): Promise<WorkflowMilestoneMutationResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  return (await client.mutation(
    api.communityMemberWorkflows.updateBuilderWorkflowMilestone,
    {
      authSubject,
      communityId: params.communityId as Id<"communities">,
      expectedRevision: params.expectedRevision,
      milestoneKey: params.milestoneKey,
      name: params.name,
      automations: params.automations,
    },
  )) as WorkflowMilestoneMutationResult;
}

export async function deleteCloudCommunityMemberWorkflowMilestone<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    communityId: string;
    expectedRevision: number;
    milestoneKey: string;
  },
): Promise<WorkflowMilestoneMutationResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  return (await client.mutation(
    api.communityMemberWorkflows.deleteBuilderWorkflowMilestone,
    {
      authSubject,
      communityId: params.communityId as Id<"communities">,
      expectedRevision: params.expectedRevision,
      milestoneKey: params.milestoneKey,
    },
  )) as WorkflowMilestoneMutationResult;
}
