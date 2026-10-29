import type { MemberFactKind, MemberFactProvenance } from "./memberOntology";
import type { CommunityFormQuestion } from "./communityForms";

export type CommunitySubmittedFormEvidence = {
  submissions: {
    request_id: string; version_id: string; form_name: string;
    form_revision: number; answer_revision: number; workflow_id: string;
    milestone_key: string; milestone_entered_at: string; activation_sequence: number;
    submitted_at: string;
    questions: { key: string; title: string; type: CommunityFormQuestion["type"];
      answer: string | string[] | null; truncated: boolean }[];
    omitted_questions: number;
  }[];
  truncated: boolean;
  unavailable_records: number;
};

export const COMMUNITY_MEMBER_SUCCESS_HISTORY_LIMIT = 12;
export const COMMUNITY_MEMBER_SUCCESS_ACTIVITY_LIMIT = 12;

export type CommunityMemberSuccessFact = {
  context_kind?: "profile" | "workflow";
  id: string;
  provenance: MemberFactProvenance;
  created_at: string;
  updated_at: string;
  kind: MemberFactKind;
  body: string;
};

export type CommunityMemberSuccessMilestoneHistoryEntry = {
  forced_by_user_id?: string;
  id: string;
  sequence: number;
  milestone_key: string;
  milestone_name: string;
  next_milestone_key: string | null;
  next_milestone_name: string | null;
  completed_workflow: boolean;
  occurred_at: string;
};

type WorkflowActionProgressItem = {
  automation_key: string; action_key: string;
  label: string;
  action_type: "prompt_agent" | "request_form" | "create_service_channel" | "set_client_property" | "send_email" | "set_pod_member";
  status: "pending" | "running" | "complete" | "failed" | "unavailable" | "waiting";
  waiting_for?: string;
  /** A lesson- or course-done property write a builder can run again. */
  retryable?: boolean;
  evidence: { run_id: string; source_id: string; completed_at: number } | null;
};

export type WorkflowActionProgress = {
  actions: WorkflowActionProgressItem[];
  /** Record-change automations and their later steps: tracked, never holding the stage. */
  reactive_actions?: WorkflowActionProgressItem[];
  /** Proven work only, never authority to advance or a goal judgment. */
  all_actions_complete: boolean;
  scan_truncated: boolean;
};

export type CommunityMemberSuccessWorkflowActivity = {
  id: string;
  action_type: "prompt_agent" | "move_member" | "request_form" | "create_service_channel" | "evaluate_goal";
  assessment?: { verdict: "achieved" | "not_yet" | "insufficient_evidence"; reason: string; evidenceRefs: string[]; assessedAt: number;
    goal?: string; citations?: { ref: string; form: string; question: string; answer: string }[] };
  status:
    | "queued"
    | "requested"
    | "channel_ready"
    | "requirement_satisfied"
    | "running"
    | "responded"
    | "moved"
    | "workflow_completed"
    | "failed"
    | "not_applicable"
    | "unavailable";
  milestone_key: string;
  milestone_name: string;
  next_milestone_key: string | null;
  next_milestone_name: string | null;
  prompt: string | null;
  delivery_channel_url?: string | null;
  failure_reason?: string | null;
  occurred_at: string;
};

/** Builder-only current evidence observation; conveys no execution authority. */
export type WorkflowMilestoneApproval = { eligible: true; membership_ref: string;
  expected_activation_sequence: number; review_ref: string };

/** Authorized, read-only context for one member in one community. */
export type CommunityMemberServiceChannel = {
  status: "unassigned" | "available" | "unavailable";
  revision: number;
  channel_id: string | null;
  name: string | null;
};

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
  membership_status?: "active";
  /** Builder-only projection of current channel access; absent from self/workflow reads. */
  channel_access?: { status: "available" | "unavailable"; channels: { name: string; slug: string; access_mode: "all_members" | "restricted" }[]; truncated: boolean };
  /** The same bio, links and community relationships visible in the member's profile. */
  visible_profile?: { bio: string | null; social_links: { youtube: string; x: string; instagram: string };
    owned_communities: { name: string; slug: string }[]; mutual_communities: { name: string; slug: string }[] };
  service_channel: CommunityMemberServiceChannel;
  workflow: {
    approval?: WorkflowMilestoneApproval | null;
    action_progress?: WorkflowActionProgress;
    require_human_approval?: boolean;
    goal_review?: { status: "waiting" | "not_started" | "reviewing" | "failed" | "achieved" | "not_yet" | "insufficient_evidence" | "configured"; reason?: string; retryable?: boolean; receipt_ref?: string };
    goal?: string;
    instructions?: string;
    override_state?: { activation_sequence: number; transition_seq: number; next_milestone_name: string | null };
    id: string;
    revision: number;
    current_milestone_key: string;
    current_milestone_name: string;
    current_milestone_entered_at: string;
    completed_at: string | null;
  } | null;
  approved_community_context: CommunityMemberSuccessFact[];
  submitted_form_evidence: CommunitySubmittedFormEvidence;
  recent_workflow_activity: CommunityMemberSuccessWorkflowActivity[];
  milestone_history: CommunityMemberSuccessMilestoneHistoryEntry[];
};
