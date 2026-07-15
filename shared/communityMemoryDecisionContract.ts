export const COMMUNITY_MEMORY_DECISION_DISPOSITIONS = [
  "retain",
  "carried_forward",
  "dismiss_low_signal",
] as const;

export const COMMUNITY_MEMORY_NODE_TYPES = [
  "playbook",
  "insight",
  "example",
  "warning_failure",
  "decision_judgment",
  "open_question",
] as const;

export type CommunityMemoryDecisionDisposition =
  (typeof COMMUNITY_MEMORY_DECISION_DISPOSITIONS)[number];
export type CommunityMemoryNodeType = (typeof COMMUNITY_MEMORY_NODE_TYPES)[number];

export type CommunityMemoryDecisionV1 = {
  workKey: string;
  disposition: CommunityMemoryDecisionDisposition;
  nodeType: CommunityMemoryNodeType | null;
  title: string | null;
  bodyMd: string | null;
  appliesWhen: string | null;
  doesNotApplyWhen: string | null;
  confidence: number | null;
  existingNodeId: string | null;
  reason: string;
};

const DISPOSITION_SET = new Set<string>(COMMUNITY_MEMORY_DECISION_DISPOSITIONS);
const NODE_TYPE_SET = new Set<string>(COMMUNITY_MEMORY_NODE_TYPES);

function boundedString(raw: unknown, maxLength: number): string {
  return String(raw ?? "").trim().slice(0, maxLength);
}

function nullableBoundedString(raw: unknown, maxLength: number): string | null {
  if (raw === null || raw === undefined) return null;
  return boundedString(raw, maxLength) || null;
}

function nullableConfidence(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error("community_memory_decision_confidence_invalid");
  return Math.max(0, Math.min(1, parsed));
}

export function normalizeCommunityMemoryDecision(
  raw: Record<string, unknown>,
): CommunityMemoryDecisionV1 {
  const workKey = boundedString(raw.workKey, 128);
  if (!workKey) throw new Error("community_memory_decision_work_key_required");
  const disposition = boundedString(raw.disposition, 64);
  if (!DISPOSITION_SET.has(disposition)) {
    throw new Error("community_memory_decision_disposition_invalid");
  }
  const nodeTypeRaw = nullableBoundedString(raw.nodeType, 80);
  if (nodeTypeRaw && !NODE_TYPE_SET.has(nodeTypeRaw)) {
    throw new Error("community_memory_decision_node_type_invalid");
  }
  const decision: CommunityMemoryDecisionV1 = {
    workKey,
    disposition: disposition as CommunityMemoryDecisionDisposition,
    nodeType: nodeTypeRaw as CommunityMemoryNodeType | null,
    title: nullableBoundedString(raw.title, 240),
    bodyMd: nullableBoundedString(raw.bodyMd, 12_000),
    appliesWhen: nullableBoundedString(raw.appliesWhen, 4_000),
    doesNotApplyWhen: nullableBoundedString(raw.doesNotApplyWhen, 4_000),
    confidence: nullableConfidence(raw.confidence),
    existingNodeId: nullableBoundedString(raw.existingNodeId, 128),
    reason: boundedString(raw.reason, 1_000),
  };
  if (!decision.reason) throw new Error("community_memory_decision_reason_required");
  if (decision.disposition === "retain") {
    if (!decision.nodeType || !decision.title || !decision.bodyMd || decision.confidence === null) {
      throw new Error("community_memory_decision_retain_payload_required");
    }
    if (decision.existingNodeId) {
      throw new Error("community_memory_decision_retain_existing_node_forbidden");
    }
  }
  if (
    decision.disposition !== "retain" &&
    (
      decision.nodeType !== null ||
      decision.title !== null ||
      decision.bodyMd !== null ||
      decision.appliesWhen !== null ||
      decision.doesNotApplyWhen !== null ||
      decision.confidence !== null
    )
  ) {
    throw new Error("community_memory_decision_non_retain_payload_forbidden");
  }
  if (decision.disposition === "carried_forward" && !decision.existingNodeId) {
    throw new Error("community_memory_decision_existing_node_required");
  }
  if (decision.disposition === "dismiss_low_signal" && decision.existingNodeId) {
    throw new Error("community_memory_decision_dismiss_existing_node_forbidden");
  }
  return decision;
}
