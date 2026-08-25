import type { MemberFactKind } from "./memberOntology";

export const COMMUNITY_MEMBER_SUCCESS_TRANSITION_LIMIT = 12;

export type CommunityMemberSuccessFact = {
  kind: MemberFactKind;
  body: string;
};

export type CommunityMemberSuccessEvaluation = {
  id: string;
  status: "queued" | "running" | "finished" | "failed" | "stale";
  decision: "complete" | "not_complete" | "uncertain" | null;
  evaluator_kind: "deterministic" | "model" | null;
  explanation: string | null;
  missing_evidence: string[];
  evidence_refs: string[];
  wake_kind: "in_app" | "time" | "external";
  created_at: string;
  finished_at: string | null;
};

export type CommunityMemberSuccessTransition = {
  id: string;
  sequence: number;
  from_stage_key: string;
  from_stage_name: string;
  to_stage_key: string;
  to_stage_name: string;
  milestone_evaluation_id: string;
  occurred_at: string;
};

export type CommunityMemberSuccessDossier = {
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
    current_stage_key: string;
    current_stage_name: string;
    current_stage_entered_at: string;
    milestone: string | null;
  };
  approved_community_context: CommunityMemberSuccessFact[];
  latest_evaluation: CommunityMemberSuccessEvaluation | null;
  transitions: CommunityMemberSuccessTransition[];
};

function markdownInline(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function readableLabel(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

const FACT_KIND_LABELS: Record<MemberFactKind, string> = {
  situation: "Situation",
  goal: "Goals",
  skill: "Skills",
  interest: "Interests",
  availability: "Availability",
  preference: "Preferences",
  link: "Links",
};

export function renderCommunityMemberSuccessDossierMarkdown(
  source: CommunityMemberSuccessDossier,
): string {
  const lines = [
    `# ${markdownInline(source.display_name)} — success dossier`,
    "",
    `- Current stage: ${markdownInline(source.workflow.current_stage_name)}`,
    `- Entered stage: ${source.workflow.current_stage_entered_at}`,
  ];

  if (source.workflow.milestone) {
    lines.push(`- Milestone: ${markdownInline(source.workflow.milestone)}`);
  } else {
    lines.push("- Milestone: None configured");
  }

  lines.push("", "## Approved community context");
  if (source.approved_community_context.length === 0) {
    lines.push("", "_No member-approved context has been shared with this community._");
  } else {
    const kinds = Array.from(
      new Set(source.approved_community_context.map((fact) => fact.kind)),
    );
    for (const kind of kinds) {
      lines.push("", `### ${FACT_KIND_LABELS[kind]}`);
      for (const fact of source.approved_community_context.filter(
        (candidate) => candidate.kind === kind,
      )) {
        lines.push(`- ${markdownInline(fact.body)}`);
      }
    }
  }

  lines.push("", "## Latest milestone assessment");
  const evaluation = source.latest_evaluation;
  if (!evaluation) {
    lines.push("", "_No milestone assessment yet._");
  } else {
    lines.push(
      `- Status: ${readableLabel(evaluation.status)}`,
      `- Decision: ${evaluation.decision ? readableLabel(evaluation.decision) : "Pending"}`,
      `- Started: ${evaluation.created_at}`,
    );
    if (evaluation.finished_at) lines.push(`- Finished: ${evaluation.finished_at}`);
    if (evaluation.explanation) {
      lines.push("", markdownInline(evaluation.explanation));
    }
    if (evaluation.missing_evidence.length > 0) {
      lines.push(
        "",
        "### Missing evidence",
        ...evaluation.missing_evidence.map(
          (item) => `- ${markdownInline(item)}`,
        ),
      );
    }
  }

  lines.push("", "## Stage history");
  if (source.transitions.length === 0) {
    lines.push("", "_No completed stage transitions yet._");
  } else {
    for (const transition of source.transitions) {
      lines.push(
        `- ${transition.occurred_at}: ${markdownInline(transition.from_stage_name)} → ${markdownInline(transition.to_stage_name)}`,
      );
    }
  }

  return lines.join("\n");
}
