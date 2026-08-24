export const COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES = 1;
export const COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES = 12;
export const COMMUNITY_MEMBER_WORKFLOW_STAGE_NAME_MAX_LENGTH = 80;
export const COMMUNITY_MEMBER_WORKFLOW_MILESTONE_MAX_LENGTH = 2_000;
export const COMMUNITY_MEMBER_WORKFLOW_STAGE_KEY_MAX_LENGTH = 64;
export const COMMUNITY_MEMBER_WORKFLOW_SOURCE_REF_MAX_LENGTH = 1_024;
export const COMMUNITY_MEMBER_WORKFLOW_EVIDENCE_REF_MAX_COUNT = 64;

export const COMMUNITY_MEMBER_WORKFLOW_EVALUATION_DECISIONS = [
  "complete",
  "not_complete",
  "uncertain",
] as const;

export type CommunityMemberWorkflowEvaluationDecision =
  (typeof COMMUNITY_MEMBER_WORKFLOW_EVALUATION_DECISIONS)[number];

export type CommunityMemberWorkflowStage = {
  key: string;
  name: string;
  milestone?: string;
};

function normalizeInlineText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeCommunityMemberWorkflowStageKey(
  value: unknown,
): string {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, COMMUNITY_MEMBER_WORKFLOW_STAGE_KEY_MAX_LENGTH);
  if (!key || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(key)) {
    throw new Error("community_member_workflow_stage_key_invalid");
  }
  return key;
}

export function normalizeCommunityMemberWorkflowStageName(
  value: unknown,
): string {
  const name = normalizeInlineText(
    value,
    COMMUNITY_MEMBER_WORKFLOW_STAGE_NAME_MAX_LENGTH,
  );
  if (!name) {
    throw new Error("community_member_workflow_stage_name_required");
  }
  return name;
}

export function normalizeCommunityMemberWorkflowMilestone(
  value: unknown,
): string | null {
  const milestone = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, COMMUNITY_MEMBER_WORKFLOW_MILESTONE_MAX_LENGTH);
  return milestone || null;
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
