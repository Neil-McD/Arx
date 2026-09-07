export const COMMUNITY_MEMBER_WORKFLOW_MIN_MILESTONES = 1;
export const COMMUNITY_MEMBER_WORKFLOW_MAX_MILESTONES = 12;
export const COMMUNITY_MEMBER_WORKFLOW_MILESTONE_NAME_MAX_LENGTH = 80;
export const COMMUNITY_MEMBER_WORKFLOW_PROMPT_MAX_LENGTH = 4_000;
export const COMMUNITY_MEMBER_WORKFLOW_MILESTONE_KEY_MAX_LENGTH = 64;
export const COMMUNITY_MEMBER_WORKFLOW_AUTOMATION_KEY_MAX_LENGTH = 64;
export const COMMUNITY_MEMBER_WORKFLOW_ACTION_KEY_MAX_LENGTH = 64;
export const COMMUNITY_MEMBER_WORKFLOW_MAX_AUTOMATIONS_PER_MILESTONE = 12;
export const COMMUNITY_MEMBER_WORKFLOW_SOURCE_REF_MAX_LENGTH = 1_024;

export type CommunityMemberWorkflowMemberContributedTrigger = {
  type: "member_contributed";
  /** Absent means any authorized channel; a selected ID never falls back. */
  channelId?: string;
};

export type CommunityMemberWorkflowTrigger =
  | CommunityMemberWorkflowMemberContributedTrigger
  | { type: "milestone_elapsed"; delayMinutes: number };

export function normalizeWorkflowDelayMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 525600) {
    throw new Error("community_member_workflow_delay_invalid");
  }
  return value;
}

export type CommunityMemberWorkflowPromptAgentAction = {
  key: string;
  type: "prompt_agent";
  prompt: string;
};

export type CommunityMemberWorkflowMoveMemberAction = {
  key: string;
  type: "move_member";
  destination: "next_or_complete";
};

export type CommunityMemberWorkflowAction =
  | CommunityMemberWorkflowPromptAgentAction
  | CommunityMemberWorkflowMoveMemberAction;

export type CommunityMemberWorkflowAutomation = {
  key: string;
  /** Server-owned identity: preserved for duration edits, renewed on trigger conversion. */
  timerGeneration?: string;
  trigger: CommunityMemberWorkflowTrigger;
  action: CommunityMemberWorkflowAction;
};

export type CommunityMemberWorkflowMilestone = {
  key: string;
  name: string;
  automations: CommunityMemberWorkflowAutomation[];
};

function normalizeInlineText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeMultilineText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function normalizeOpaqueKey(
  value: unknown,
  maxLength: number,
  errorCode: string,
): string {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  if (!key || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(key)) {
    throw new Error(errorCode);
  }
  return key;
}

export function normalizeCommunityMemberWorkflowMilestoneKey(
  value: unknown,
): string {
  return normalizeOpaqueKey(
    value,
    COMMUNITY_MEMBER_WORKFLOW_MILESTONE_KEY_MAX_LENGTH,
    "community_member_workflow_milestone_key_invalid",
  );
}

export function normalizeCommunityMemberWorkflowAutomationKey(
  value: unknown,
): string {
  return normalizeOpaqueKey(
    value,
    COMMUNITY_MEMBER_WORKFLOW_AUTOMATION_KEY_MAX_LENGTH,
    "community_member_workflow_automation_key_invalid",
  );
}

export function normalizeCommunityMemberWorkflowActionKey(
  value: unknown,
): string {
  return normalizeOpaqueKey(
    value,
    COMMUNITY_MEMBER_WORKFLOW_ACTION_KEY_MAX_LENGTH,
    "community_member_workflow_action_key_invalid",
  );
}

export function normalizeCommunityMemberWorkflowMilestoneName(
  value: unknown,
): string {
  const name = normalizeInlineText(
    value,
    COMMUNITY_MEMBER_WORKFLOW_MILESTONE_NAME_MAX_LENGTH,
  );
  if (!name) {
    throw new Error("community_member_workflow_milestone_name_required");
  }
  return name;
}

export function normalizeCommunityMemberWorkflowPrompt(
  value: unknown,
): string {
  const prompt = normalizeMultilineText(
    value,
    COMMUNITY_MEMBER_WORKFLOW_PROMPT_MAX_LENGTH,
  );
  if (!prompt) {
    throw new Error("community_member_workflow_prompt_required");
  }
  return prompt;
}

export function normalizeCommunityMemberWorkflowSourceRef(
  value: unknown,
): string {
  const sourceRef = normalizeInlineText(
    value,
    COMMUNITY_MEMBER_WORKFLOW_SOURCE_REF_MAX_LENGTH,
  );
  if (!sourceRef) {
    throw new Error("community_member_workflow_source_ref_required");
  }
  return sourceRef;
}
