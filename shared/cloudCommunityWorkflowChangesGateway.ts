import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CommunityMemberWorkflowMilestone } from "./communityMemberWorkflow";

// Workflows › Recent changes (convex/communityWorkflowChanges.ts): every saved
// stage change with the stage before and after, and the agents' permission.
export type WorkflowAgentChangeReview = "apply" | "ask_others" | "ask";
export type WorkflowStageChange = {
  change_id: string;
  milestone_key: string;
  stage_name: string;
  via: "app" | "agent";
  changed_by: string;
  on_behalf_of: string | null;
  approved_by: string | null;
  undo_of: string | null;
  before: CommunityMemberWorkflowMilestone | null;
  after: CommunityMemberWorkflowMilestone | null;
  created_at: string;
  can_undo: boolean;
};
export type WorkflowStageChanges = { agent_change_review: WorkflowAgentChangeReview; changes: WorkflowStageChange[] };

export async function listCloudWorkflowChanges(session: unknown, communityId: string): Promise<WorkflowStageChanges> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.query(api.communityWorkflowChanges.listBuilderWorkflowChanges, { authSubject, communityId: communityId as Id<"communities"> }) as Promise<WorkflowStageChanges>;
}
export async function undoCloudWorkflowChange(session: unknown, communityId: string, changeId: string) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.mutation(api.communityWorkflowChanges.undoBuilderWorkflowChange, { authSubject,
    communityId: communityId as Id<"communities">, changeId: changeId as Id<"communityWorkflowChanges"> });
}
export async function setCloudWorkflowAgentChangeReview(session: unknown, communityId: string, review: WorkflowAgentChangeReview) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.mutation(api.communityWorkflowChanges.setBuilderWorkflowAgentChangeReview, { authSubject,
    communityId: communityId as Id<"communities">, review });
}
