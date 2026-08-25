export const COMMUNITY_MEMBER_WORKFLOW_MIN_MILESTONES = 1;
export const COMMUNITY_MEMBER_WORKFLOW_MAX_MILESTONES = 12;
export const COMMUNITY_MEMBER_WORKFLOW_MILESTONE_NAME_MAX_LENGTH = 80;
export const COMMUNITY_MEMBER_WORKFLOW_JUDGMENT_CRITERION_MAX_LENGTH = 2_000;
export const COMMUNITY_MEMBER_WORKFLOW_MILESTONE_KEY_MAX_LENGTH = 64;
export const COMMUNITY_MEMBER_WORKFLOW_CHECK_KEY_MAX_LENGTH = 64;
export const COMMUNITY_MEMBER_WORKFLOW_MAX_CHECKS_PER_MILESTONE = 12;
export const COMMUNITY_MEMBER_WORKFLOW_SOURCE_REF_MAX_LENGTH = 1_024;
export const COMMUNITY_MEMBER_WORKFLOW_EVIDENCE_REF_MAX_COUNT = 64;

export const COMMUNITY_MEMBER_WORKFLOW_AUTOMATIC_SIGNALS = [
  "channel_posted",
  "channel_replied",
] as const;

export type CommunityMemberWorkflowAutomaticSignal =
  (typeof COMMUNITY_MEMBER_WORKFLOW_AUTOMATIC_SIGNALS)[number];

export type CommunityMemberWorkflowAutomaticCheck = {
  key: string;
  type: "automatic";
  signal: CommunityMemberWorkflowAutomaticSignal;
};

export type CommunityMemberWorkflowJudgmentCheck = {
  key: string;
  type: "judgment";
  criterion: string;
};

export type CommunityMemberWorkflowCheck =
  | CommunityMemberWorkflowAutomaticCheck
  | CommunityMemberWorkflowJudgmentCheck;

export type CommunityMemberWorkflowMilestone = {
  key: string;
  name: string;
  checks: CommunityMemberWorkflowCheck[];
};

export const COMMUNITY_MEMBER_WORKFLOW_EVALUATION_DECISIONS = [
  "complete",
  "not_complete",
  "uncertain",
] as const;

export type CommunityMemberWorkflowEvaluationDecision =
  (typeof COMMUNITY_MEMBER_WORKFLOW_EVALUATION_DECISIONS)[number];

function normalizeInlineText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
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

export function normalizeCommunityMemberWorkflowCheckKey(
  value: unknown,
): string {
  return normalizeOpaqueKey(
    value,
    COMMUNITY_MEMBER_WORKFLOW_CHECK_KEY_MAX_LENGTH,
    "community_member_workflow_check_key_invalid",
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

export function normalizeCommunityMemberWorkflowJudgmentCriterion(
  value: unknown,
): string {
  const criterion = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, COMMUNITY_MEMBER_WORKFLOW_JUDGMENT_CRITERION_MAX_LENGTH);
  if (!criterion) {
    throw new Error("community_member_workflow_judgment_criterion_required");
  }
  return criterion;
}

export function normalizeCommunityMemberWorkflowAutomaticSignal(
  value: unknown,
): CommunityMemberWorkflowAutomaticSignal {
  const signal = String(value ?? "").trim();
  if (!COMMUNITY_MEMBER_WORKFLOW_AUTOMATIC_SIGNALS.includes(signal as any)) {
    throw new Error("community_member_workflow_automatic_signal_invalid");
  }
  return signal as CommunityMemberWorkflowAutomaticSignal;
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

export function communityMemberWorkflowCheckDefinition(
  check: CommunityMemberWorkflowCheck,
): Record<string, string> {
  return check.type === "automatic"
    ? { key: check.key, type: check.type, signal: check.signal }
    : { key: check.key, type: check.type, criterion: check.criterion };
}
