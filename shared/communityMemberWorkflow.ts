export const COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES = 1;
export const COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES = 12;
export const COMMUNITY_MEMBER_WORKFLOW_DESCRIPTION_MAX_LENGTH = 1_200;
export const COMMUNITY_MEMBER_WORKFLOW_STAGE_NAME_MAX_LENGTH = 80;
export const COMMUNITY_MEMBER_WORKFLOW_STAGE_KEY_MAX_LENGTH = 64;
export const COMMUNITY_MEMBER_WORKFLOW_REASON_MAX_LENGTH = 500;
export const COMMUNITY_MEMBER_WORKFLOW_EVIDENCE_SUMMARY_MAX_LENGTH = 1_000;
export const COMMUNITY_MEMBER_WORKFLOW_SOURCE_REF_MAX_LENGTH = 1_024;
export const COMMUNITY_MEMBER_WORKFLOW_IDEMPOTENCY_KEY_MAX_LENGTH = 180;

export const COMMUNITY_MEMBER_WORKFLOW_STATUSES = [
  "draft",
  "active",
  "archived",
] as const;

export const COMMUNITY_MEMBER_WORKFLOW_VERSION_STATUSES = [
  "draft",
  "active",
  "retired",
] as const;

export const COMMUNITY_MEMBER_WORKFLOW_ENROLLMENT_STATUSES = [
  "active",
  "paused",
  "completed",
  "exited",
] as const;

export const COMMUNITY_MEMBER_WORKFLOW_EVIDENCE_SOURCE_TYPES = [
  "member",
  "builder",
  "product",
  "provider",
  "agent_assessment",
] as const;

export const COMMUNITY_MEMBER_WORKFLOW_EVIDENCE_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "superseded",
] as const;

export const COMMUNITY_MEMBER_WORKFLOW_TRANSITION_KINDS = [
  "enrolled",
  "manual_move",
  "evidence_confirmed",
  "completed",
  "paused",
  "resumed",
  "exited",
] as const;

export type CommunityMemberWorkflowStatus =
  (typeof COMMUNITY_MEMBER_WORKFLOW_STATUSES)[number];
export type CommunityMemberWorkflowVersionStatus =
  (typeof COMMUNITY_MEMBER_WORKFLOW_VERSION_STATUSES)[number];
export type CommunityMemberWorkflowEnrollmentStatus =
  (typeof COMMUNITY_MEMBER_WORKFLOW_ENROLLMENT_STATUSES)[number];
export type CommunityMemberWorkflowEvidenceSourceType =
  (typeof COMMUNITY_MEMBER_WORKFLOW_EVIDENCE_SOURCE_TYPES)[number];
export type CommunityMemberWorkflowEvidenceStatus =
  (typeof COMMUNITY_MEMBER_WORKFLOW_EVIDENCE_STATUSES)[number];
export type CommunityMemberWorkflowTransitionKind =
  (typeof COMMUNITY_MEMBER_WORKFLOW_TRANSITION_KINDS)[number];

export type CommunityMemberWorkflowStage = {
  key: string;
  name: string;
};

export type CommunityMemberWorkflowDraft = {
  stages: CommunityMemberWorkflowStage[];
};

function normalizeInlineText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeLongText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
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

export function normalizeCommunityMemberWorkflowDraft(input: {
  stages?: Array<{
    key?: unknown;
    name?: unknown;
  }> | null;
}): CommunityMemberWorkflowDraft {
  const rawStages = Array.isArray(input.stages) ? input.stages : [];
  if (
    rawStages.length < COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES ||
    rawStages.length > COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES
  ) {
    throw new Error("community_member_workflow_stage_count_invalid");
  }
  const keys = new Set<string>();
  const stages = rawStages.map((stage) => {
    const key = normalizeCommunityMemberWorkflowStageKey(stage.key);
    if (keys.has(key))
      throw new Error("community_member_workflow_stage_key_duplicate");
    keys.add(key);
    const normalized = {
      key,
      name: normalizeInlineText(
        stage.name,
        COMMUNITY_MEMBER_WORKFLOW_STAGE_NAME_MAX_LENGTH,
      ),
    };
    if (!normalized.name) {
      throw new Error("community_member_workflow_stage_name_required");
    }
    return normalized;
  });
  return { stages };
}

export function normalizeCommunityMemberWorkflowReason(value: unknown): string {
  const reason = normalizeLongText(
    value,
    COMMUNITY_MEMBER_WORKFLOW_REASON_MAX_LENGTH,
  );
  if (!reason) throw new Error("community_member_workflow_reason_required");
  return reason;
}

export function normalizeCommunityMemberWorkflowEvidenceSummary(
  value: unknown,
): string {
  const summary = normalizeLongText(
    value,
    COMMUNITY_MEMBER_WORKFLOW_EVIDENCE_SUMMARY_MAX_LENGTH,
  );
  if (!summary) {
    throw new Error("community_member_workflow_evidence_summary_required");
  }
  return summary;
}

export function normalizeCommunityMemberWorkflowSourceRef(
  value: unknown,
): string | null {
  const sourceRef = normalizeInlineText(
    value,
    COMMUNITY_MEMBER_WORKFLOW_SOURCE_REF_MAX_LENGTH,
  );
  return sourceRef || null;
}

export function normalizeCommunityMemberWorkflowConfidence(
  value: unknown,
): number {
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("community_member_workflow_evidence_confidence_invalid");
  }
  return confidence;
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

export function buildCommunityMemberWorkflowTransitionFingerprint(input: {
  enrollmentId: unknown;
  expectedRevision: unknown;
  targetStageKey?: unknown;
  kind: unknown;
  reason: unknown;
  evidenceIds?: unknown[] | null;
}): string {
  return JSON.stringify({
    enrollmentId: String(input.enrollmentId ?? "").trim(),
    expectedRevision: Math.max(
      0,
      Math.floor(Number(input.expectedRevision) || 0),
    ),
    targetStageKey: input.targetStageKey
      ? normalizeCommunityMemberWorkflowStageKey(input.targetStageKey)
      : null,
    kind: String(input.kind ?? "").trim(),
    reason: normalizeCommunityMemberWorkflowReason(input.reason),
    evidenceIds: [...(input.evidenceIds ?? [])]
      .map((id) => String(id ?? "").trim())
      .filter(Boolean)
      .sort(),
  });
}
