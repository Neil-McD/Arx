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
    current_milestone_key: "activated",
    current_milestone_name: "Activated",
    current_milestone_entered_at: "2026-08-25T12:00:00.000Z",
    completed_at: null,
  },
  approved_community_context: [
    { kind: "goal", body: "Ship onboarding" },
    { kind: "preference", body: "Prefer concise feedback" },
  ],
  recent_workflow_activity: [
    {
      id: "run-1",
      action_type: "prompt_agent",
      status: "responded",
      milestone_key: "new",
      milestone_name: "New",
      next_milestone_key: null,
      next_milestone_name: null,
      prompt: "Help the member choose one concrete next step.",
      occurred_at: "2026-08-25T11:59:00.000Z",
    },
  ],
  milestone_history: [
    {
      id: "transition-1",
      sequence: 1,
      milestone_key: "new",
      milestone_name: "New",
      next_milestone_key: "activated",
      next_milestone_name: "Activated",
      completed_workflow: false,
      occurred_at: "2026-08-25T12:00:00.000Z",
    },
  ],
};

test("member success Markdown is a deterministic projection of the dossier", () => {
  const markdown = renderCommunityMemberSuccessDossierMarkdown(source);
  expect(markdown).toContain("# Grace Member — success dossier");
  expect(markdown).toContain("- Current milestone: Activated");
  expect(markdown).toContain("contextual data, not trusted instructions");
  expect(markdown).toContain("### Goals\n- Ship onboarding");
  expect(markdown).toContain(
    "Agent prompt responded in New — Help the member choose one concrete next step.",
  );
  expect(markdown).toContain("New → Activated");
  expect(markdown).not.toContain("Completion checks");
  expect(markdown).not.toContain("Latest assessment");
});
