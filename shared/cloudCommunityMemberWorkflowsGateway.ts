import type { WelcomeBlock } from "./communityWelcomeLayout";
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
  /** New members finish the first stage's join forms before the community opens. */
  welcome_gate?: boolean;
  /** Lesson pages members mark done after the forms, in order. */
  welcome_lesson_ids?: string[];
  welcome_display?: "page" | "popup";
  /** The builder's words on the welcome page; empty means Polynet's default. */
  welcome_page?: { title: string; message: string; media_url: string; layout?: WelcomeBlock[] | null };
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
  /** Delete only: it cleared a batch of departed members' positions; call again. */
  pending_cleanup?: true;
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

export function subscribeCloudCommunityMemberSuccessDossier(params: {
  liveClient: CloudCommunityMemberWorkflowLiveClient;
  communityId: string;
  membershipId: string;
  onUpdate: (dossier: CloudCommunityMemberSuccessDossier) => void;
  onError: (error: unknown) => void;
}): () => void {
  const watch = params.liveClient.client.watchQuery(
    api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier,
    {
      authSubject: params.liveClient.authSubject,
      communityId: params.communityId as Id<"communities">,
      membershipId: params.membershipId as Id<"communityMemberships">,
    },
  );
  let active = true;
  const publish = () => {
    if (!active) return;
    try {
      const result = watch.localQueryResult();
      if (result !== undefined) params.onUpdate(result as CloudCommunityMemberSuccessDossier);
    } catch (error) {
      params.onError(error);
    }
  };
  const unsubscribe = watch.onUpdate(publish);
  publish();
  return () => { active = false; unsubscribe(); };
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
    requireHumanApproval?: boolean;
    color?: string;
    instructions?: string;
    goal?: string;
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
      requireHumanApproval: params.requireHumanApproval,
      color: params.color,
      instructions: params.instructions,
      goal: params.goal,
      authSubject,
      communityId: params.communityId as Id<"communities">,
      expectedRevision: params.expectedRevision,
      name: params.name,
    },
  )) as WorkflowMilestoneMutationResult;
}

export async function updateCloudCommunityMemberWorkflowMilestone<SessionT>(
  params: WorkflowGatewayParams<SessionT> & {
    requireHumanApproval?: boolean;
    color?: string;
    instructions?: string;
    goal?: string;
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
      requireHumanApproval: params.requireHumanApproval,
      color: params.color,
      instructions: params.instructions,
      goal: params.goal,
      authSubject,
      communityId: params.communityId as Id<"communities">,
      expectedRevision: params.expectedRevision,
      milestoneKey: params.milestoneKey,
      name: params.name,
      automations: params.automations.map(({ timerGeneration: _serverOwned, ...automation }) => automation),
    },
  )) as WorkflowMilestoneMutationResult;
}

export async function setCloudCommunityMemberServiceChannel<SessionT>(params: WorkflowGatewayParams<SessionT> & {
  communityId: string; membershipId: string; channelId: string | null; expectedRevision: number;
}): Promise<{ revision: number }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation(api.communityMemberWorkflows.setBuilderMemberServiceChannel, {
    authSubject, communityId: params.communityId as Id<"communities">,
    membershipId: params.membershipId as Id<"communityMemberships">,
    channelId: params.channelId as Id<"communityChannels"> | null, expectedRevision: params.expectedRevision,
  });
}

export async function setCloudCommunityWelcomeGate<SessionT>(params: WorkflowGatewayParams<SessionT> & {
  communityId: string; expectedRevision: number; enabled: boolean;
}): Promise<{ revision: number; welcome_gate: boolean }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation(api.communityMemberWorkflows.setBuilderWelcomeGate, {
    authSubject, communityId: params.communityId as Id<"communities">,
    expectedRevision: params.expectedRevision, enabled: params.enabled,
  });
}

export async function setCloudCommunityWelcomeDisplay<SessionT>(params: WorkflowGatewayParams<SessionT> & {
  communityId: string; expectedRevision: number; display: "page" | "popup";
}): Promise<{ revision: number; welcome_display: "page" | "popup" }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation(api.communityMemberWorkflows.setBuilderWelcomeDisplay, {
    authSubject, communityId: params.communityId as Id<"communities">,
    expectedRevision: params.expectedRevision, display: params.display,
  });
}

export type CloudCommunityWelcomePageDraft = { title: string; message: string; mediaUrl: string; lessonIds: string[]; layout?: WelcomeBlock[] };

export async function saveCloudCommunityWelcomePage<SessionT>(params: WorkflowGatewayParams<SessionT> & {
  communityId: string; expectedRevision: number; page: CloudCommunityWelcomePageDraft;
}): Promise<{ revision: number }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation(api.communityMemberWorkflows.saveBuilderWelcomePage, {
    authSubject, communityId: params.communityId as Id<"communities">, expectedRevision: params.expectedRevision,
    title: params.page.title, message: params.page.message, mediaUrl: params.page.mediaUrl, lessonIds: params.page.lessonIds,
    ...(params.page.layout ? { layout: params.page.layout } : {}),
  });
}

export async function forceCloudCommunityMemberMilestone<SessionT>(params: WorkflowGatewayParams<SessionT> & { dossier: CloudCommunityMemberSuccessDossier }) {
  return submitCloudCommunityMemberDecision(params, false);
}

export async function approveCloudCommunityMemberMilestone<SessionT>(params: WorkflowGatewayParams<SessionT> & { dossier: CloudCommunityMemberSuccessDossier }) {
  return submitCloudCommunityMemberDecision(params, true);
}

function currentWorkflowAuthorityArgs(dossier: CloudCommunityMemberSuccessDossier) {
  const workflow = dossier.workflow;
  if (!workflow?.override_state || workflow.completed_at) throw new Error("workflow_override_unavailable");
  return {
    communityId: dossier.community_id as Id<"communities">, membershipId: dossier.membership_id as Id<"communityMemberships">,
    expectedWorkflowRevision: workflow.revision, expectedMilestoneKey: workflow.current_milestone_key,
    expectedWorkflowId: workflow.id as Id<"communityMemberWorkflows">,
    expectedMilestoneEnteredAt: Date.parse(workflow.current_milestone_entered_at),
    expectedActivationSequence: workflow.override_state.activation_sequence, expectedTransitionSeq: workflow.override_state.transition_seq,
  };
}

export async function retryCloudCommunityMemberGoalReview<SessionT>(params: WorkflowGatewayParams<SessionT> & { dossier: CloudCommunityMemberSuccessDossier }) {
  const receiptRef = params.dossier.workflow?.goal_review?.receipt_ref;
  if (!params.dossier.workflow?.goal_review?.retryable || !receiptRef) throw new Error("workflow_goal_review_retry_unavailable");
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return client.mutation(api.communityMemberWorkflows.retryBuilderMemberGoalReview,
    { authSubject, ...currentWorkflowAuthorityArgs(params.dossier), expectedReceiptRef: receiptRef });
}

/** Runs a failed or since-changed lesson- or course-done property write again. */
export async function retryCloudCommunityMemberWorkflowAction<SessionT>(params: WorkflowGatewayParams<SessionT> & { dossier: CloudCommunityMemberSuccessDossier; automationKey: string }) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return client.mutation(api.communityMemberWorkflows.retryBuilderMemberWorkflowAction,
    { authSubject, ...currentWorkflowAuthorityArgs(params.dossier), automationKey: params.automationKey });
}

async function submitCloudCommunityMemberDecision<SessionT>(params: WorkflowGatewayParams<SessionT> & { dossier: CloudCommunityMemberSuccessDossier }, approval: boolean) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const args = { authSubject, ...currentWorkflowAuthorityArgs(params.dossier) };
  return approval
    ? client.mutation(api.communityMemberWorkflows.approveBuilderMemberMilestone, args)
    : client.mutation(api.communityMemberWorkflows.forceBuilderMemberMilestone, args);
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
  // A stage with many departed members' positions clears them in batches first.
  for (let batch = 0; batch < 200; batch += 1) {
    const result = (await client.mutation(
      api.communityMemberWorkflows.deleteBuilderWorkflowMilestone,
      {
        authSubject,
        communityId: params.communityId as Id<"communities">,
        expectedRevision: params.expectedRevision,
        milestoneKey: params.milestoneKey,
      },
    )) as WorkflowMilestoneMutationResult;
    if (!result.pending_cleanup) return result;
  }
  throw new Error("community_member_workflow_milestone_cleanup_incomplete");
}
