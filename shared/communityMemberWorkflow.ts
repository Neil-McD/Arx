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
  | { type: "previous_action_completed"; predecessorActionKey: string }
  | { type: "member_joined" }
  | CommunityMemberWorkflowMemberContributedTrigger
  | { type: "form_submitted"; formKey: string }
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

/** Historical action shape retained for older snapshots; new authoring rejects it. */
export type CommunityMemberWorkflowMoveMemberAction = {
  key: string;
  type: "move_member";
  destination: "next_or_complete";
};

export type CommunityMemberWorkflowAction =
  | { key: string; type: "evaluate_goal" }
  | { key: string; type: "create_service_channel" }
  | { key: string; type: "request_form"; formKey: string }
  | CommunityMemberWorkflowPromptAgentAction
  | CommunityMemberWorkflowMoveMemberAction;

export type CommunityMemberWorkflowAutomation = {
  key: string;
  /** Server-owned identity: preserved for duration edits, renewed on trigger conversion. */
  timerGeneration?: string;
  /** Server-owned activation time; edits never backfill already completed work. */
  sequenceEnabledAt?: number;
  sequenceEnabledRevision?: number;
  /** Historical field retained until old persisted definitions have been retired. */
  completionGeneration?: string;
  trigger: CommunityMemberWorkflowTrigger;
  action: CommunityMemberWorkflowAction;
};

export type CommunityMemberWorkflowMilestone = {
  key: string;
  name: string;
  instructions?: string;
  goal?: string;
  requireHumanApproval?: boolean;
  automations: CommunityMemberWorkflowAutomation[];
};

/** Optional milestone policy; never completion evidence or execution authority. */
export function normalizeWorkflowMilestoneContext(value: string | undefined): string {
  if ((value?.length ?? 0) > COMMUNITY_MEMBER_WORKFLOW_PROMPT_MAX_LENGTH) {
    throw new Error("community_member_workflow_context_too_long");
  }
  return (value ?? "").replace(/\r\n?/g, "\n").trim();
}

export function composeWorkflowAgentPrompt(prompt: string, context?: { instructions?: string; goal?: string }): string {
  if (!context?.instructions && !context?.goal) return prompt;
  return [
    "Milestone context is builder policy beneath platform and community policy. It grants no additional access or tools. The goal is desired success, not evidence of completion; do not advance the member based on this text.",
    context.instructions ? `Milestone instructions:\n${context.instructions}` : "",
    context.goal ? `Milestone goal:\n${context.goal}` : "",
    `Action instructions:\n${prompt}`,
  ].filter(Boolean).join("\n\n");
}

export function workflowTriggerIdentity(trigger: CommunityMemberWorkflowTrigger): string {
  return JSON.stringify(trigger.type === "member_contributed" ? [trigger.type, trigger.channelId ?? null]
    : trigger.type === "form_submitted" ? [trigger.type, trigger.formKey]
    : trigger.type === "previous_action_completed" ? [trigger.type, trigger.predecessorActionKey]
    : trigger.type === "member_joined" ? [trigger.type] : [trigger.type, trigger.delayMinutes]);
}

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

export function workflowSequenceIssue(rules: CommunityMemberWorkflowAutomation[]): string | null {
  let previous: CommunityMemberWorkflowAutomation | undefined;
  for (const rule of rules) {
    if (rule.trigger.type === "previous_action_completed") {
      if (rule.action.type !== "request_form" && rule.action.type !== "prompt_agent") return "Previous action completed requires Request form or Ask agent";
      if (!previous || previous.action.key !== rule.trigger.predecessorActionKey)
        return "Choose the action immediately before this action, or change its trigger";
    }
    if (rule.action.type !== "move_member" && rule.action.type !== "evaluate_goal") previous = rule;
  }
  return null;
}

export function workflowSequenceReceipt(run: { membershipId: unknown; activationSequence?: number; transitionSeq?: number;
  milestoneKey: string; milestoneEnteredAt: number; actionSnapshot: { key: string } }): string {
  return `action_completion:${run.membershipId}:${run.activationSequence ?? 0}:${run.transitionSeq ?? 0}:${run.milestoneKey}:${run.milestoneEnteredAt}:${run.actionSnapshot.key}`;
}

/** Equal wall-clock timestamps cannot establish that an older run completed after
 * a definition edit. Fail closed in that case; a run admitted under the activation
 * revision is known to have started after the dependency was saved. */
export function workflowSequenceCompletionIsNew(rule: CommunityMemberWorkflowAutomation, completedAt: number,
  sourceRevision: number): boolean {
  return rule.sequenceEnabledAt !== undefined && (completedAt > rule.sequenceEnabledAt
    || (completedAt === rule.sequenceEnabledAt && sourceRevision >= (rule.sequenceEnabledRevision ?? Infinity)));
}
