import { expect, test } from "vitest";

import {
  renderCommunityMemberSuccessDossierMarkdown,
  type CommunityMemberSuccessDossier,
} from "../shared/communityMemberSuccessDossier";

const source: CommunityMemberSuccessDossier = {
  membership_id: "member-1",
  display_name: "Grace Member",
  avatar_url: null,
  avatar_focus_x: 0.5,
  avatar_focus_y: 0.5,
  avatar_zoom: 1,
  joined_at: "2026-08-20T12:00:00.000Z",
  workflow: {
    id: "workflow-1",
    revision: 3,
    current_stage_key: "activated",
    current_stage_name: "Activated",
    current_stage_entered_at: "2026-08-25T12:00:00.000Z",
    milestone: null,
  },
  approved_community_context: [
    { kind: "goal", body: "Ship onboarding" },
    { kind: "preference", body: "Prefer concise feedback" },
  ],
  latest_evaluation: {
    id: "evaluation-1",
    status: "finished",
    decision: "complete",
    evaluator_kind: "model",
    explanation: "The evidence directly satisfies the milestone.",
    missing_evidence: [],
    evidence_refs: ["interaction:root:one"],
    wake_kind: "in_app",
    created_at: "2026-08-25T11:59:00.000Z",
    finished_at: "2026-08-25T12:00:00.000Z",
  },
  transitions: [
    {
      id: "transition-1",
      sequence: 1,
      from_stage_key: "new",
      from_stage_name: "New",
      to_stage_key: "activated",
      to_stage_name: "Activated",
      milestone_evaluation_id: "evaluation-1",
      occurred_at: "2026-08-25T12:00:00.000Z",
    },
  ],
};

test("member success Markdown is a deterministic projection of the dossier", () => {
  const markdown = renderCommunityMemberSuccessDossierMarkdown(source);
  expect(markdown).toContain("# Grace Member — success dossier");
  expect(markdown).toContain("- Current stage: Activated");
  expect(markdown).toContain("### Goals\n- Ship onboarding");
  expect(markdown).toContain("- Decision: Complete");
  expect(markdown).toContain("New → Activated");
});
