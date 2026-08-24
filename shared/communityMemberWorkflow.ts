export const COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES = 1;
export const COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES = 12;
export const COMMUNITY_MEMBER_WORKFLOW_STAGE_NAME_MAX_LENGTH = 80;
export const COMMUNITY_MEMBER_WORKFLOW_STAGE_KEY_MAX_LENGTH = 64;
export const COMMUNITY_MEMBER_WORKFLOW_IDEMPOTENCY_KEY_MAX_LENGTH = 180;
export const COMMUNITY_MEMBER_WORKFLOW_SOURCE_REF_MAX_LENGTH = 1_024;

export const COMMUNITY_MEMBER_WORKFLOW_TRANSITION_CAUSE_TYPES = [
  "builder",
  "in_app",
  "time",
  "external",
  "system",
] as const;

export const COMMUNITY_MEMBER_WORKFLOW_TRANSITION_ACTOR_TYPES = [
  "builder",
  "agent",
  "system",
] as const;

export type CommunityMemberWorkflowTransitionCauseType =
  (typeof COMMUNITY_MEMBER_WORKFLOW_TRANSITION_CAUSE_TYPES)[number];
export type CommunityMemberWorkflowTransitionActorType =
  (typeof COMMUNITY_MEMBER_WORKFLOW_TRANSITION_ACTOR_TYPES)[number];

export type CommunityMemberWorkflowStage = {
  key: string;
  name: string;
};

export type CommunityMemberWorkflowDefinition = {
  stages: CommunityMemberWorkflowStage[];
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

export function normalizeCommunityMemberWorkflowDefinition(input: {
  stages?: Array<{ key?: unknown; name?: unknown }> | null;
}): CommunityMemberWorkflowDefinition {
  const rawStages = Array.isArray(input.stages) ? input.stages : [];
  if (
    rawStages.length < COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES ||
    rawStages.length > COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES
  ) {
    throw new Error("community_member_workflow_stage_count_invalid");
  }
  const keys = new Set<string>();
  return {
    stages: rawStages.map((stage) => {
      const key = normalizeCommunityMemberWorkflowStageKey(stage.key);
      if (keys.has(key)) {
        throw new Error("community_member_workflow_stage_key_duplicate");
      }
      keys.add(key);
      const name = normalizeInlineText(
        stage.name,
        COMMUNITY_MEMBER_WORKFLOW_STAGE_NAME_MAX_LENGTH,
      );
      if (!name) {
        throw new Error("community_member_workflow_stage_name_required");
      }
      return { key, name };
    }),
  };
}

export function normalizeCommunityMemberWorkflowIdempotencyKey(
  value: unknown,
): string {
  const key = normalizeInlineText(
    value,
    COMMUNITY_MEMBER_WORKFLOW_IDEMPOTENCY_KEY_MAX_LENGTH,
  );
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(key)) {
    throw new Error("community_member_workflow_idempotency_key_invalid");
  }
  return key;
}

export function normalizeCommunityMemberWorkflowSourceRef(
  value: unknown,
): string | null {
  return (
    normalizeInlineText(
      value,
      COMMUNITY_MEMBER_WORKFLOW_SOURCE_REF_MAX_LENGTH,
    ) || null
  );
}
