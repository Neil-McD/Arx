import type { MemberFactKind, MemberFactProvenance } from "./memberOntology";

export const COMMUNITY_MEMBER_SUCCESS_HISTORY_LIMIT = 12;
export const COMMUNITY_MEMBER_SUCCESS_ACTIVITY_LIMIT = 12;

export type CommunityMemberSuccessFact = {
  id: string;
  provenance: MemberFactProvenance;
  created_at: string;
  updated_at: string;
  kind: MemberFactKind;
  body: string;
};

export type CommunityMemberSuccessMilestoneHistoryEntry = {
  id: string;
  sequence: number;
  milestone_key: string;
  milestone_name: string;
  next_milestone_key: string | null;
  next_milestone_name: string | null;
  completed_workflow: boolean;
  occurred_at: string;
};

export type CommunityMemberSuccessWorkflowActivity = {
  id: string;
  action_type: "prompt_agent" | "move_member";
  status:
    | "queued"
    | "running"
    | "responded"
    | "moved"
    | "workflow_completed"
    | "failed";
  milestone_key: string;
  milestone_name: string;
  next_milestone_key: string | null;
  next_milestone_name: string | null;
  prompt: string | null;
  occurred_at: string;
};

/** Authorized, read-only context for one member in one community. */
export type CommunityMembershipContext = {
  community_id: string;
  user_id: string;
  membership_id: string;
  display_name: string;
  avatar_url: string | null;
  avatar_focus_x: number | null;
  avatar_focus_y: number | null;
  avatar_zoom: number | null;
  joined_at: string;
  workflow: {
    id: string;
    revision: number;
    current_milestone_key: string;
    current_milestone_name: string;
    current_milestone_entered_at: string;
    completed_at: string | null;
  } | null;
  approved_community_context: CommunityMemberSuccessFact[];
  recent_workflow_activity: CommunityMemberSuccessWorkflowActivity[];
  milestone_history: CommunityMemberSuccessMilestoneHistoryEntry[];
};
