import { expect, test, vi } from "vitest";
import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// This test renders web and shared components with the root renderer.
// Keep React unification local: existing web tests use their own web renderer.
const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const requireFromRoot = createRequire(import.meta.url);
if (requireFromWeb.resolve("react") !== requireFromRoot.resolve("react")) {
  vi.doMock(requireFromWeb.resolve("react"), () => React);
}
vi.doMock(requireFromWeb.resolve("react-dom"), () => ({
  createPortal: (children: React.ReactNode) => children,
}));
const { WebCommunityWorkflowMemberDossierModal } = await import(
  "../apps/web/src/components/WebCommunityWorkflowMemberDossierModal"
);

import {
  renderCommunityMemberSuccessDossierMarkdown,
  type CommunityMemberSuccessDossier,
} from "../shared/communityMemberSuccessDossier";

const source: CommunityMemberSuccessDossier = {
  community_id: "community-1",
  user_id: "user-1",
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
    {
      id: "fact-1",
      kind: "goal",
      body: "Ship onboarding",
      provenance: "form_answer",
      created_at: "2026-08-20T12:00:00.000Z",
      updated_at: "2026-08-20T12:00:00.000Z",
    },
    {
      id: "fact-2",
      kind: "preference",
      body: "Prefer concise feedback",
      provenance: "stated_interview",
      created_at: "2026-08-20T12:00:00.000Z",
      updated_at: "2026-08-20T12:00:00.000Z",
    },
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

test("member context Markdown renders without a workflow", () => {
  const markdown = renderCommunityMemberSuccessDossierMarkdown({
    ...source,
    workflow: null,
    recent_workflow_activity: [],
    milestone_history: [],
  });
  expect(markdown).toContain("- Workflow: Not configured");
  expect(markdown).toContain("Ship onboarding");
  expect(markdown).not.toContain("Current milestone:");
  expect(markdown).not.toContain("Workflow status: Active");
});

test.each(["prompt_agent", "move_member"] as const)("%s unavailable is explicit in Markdown and the existing dossier", (action_type) => {
  vi.stubGlobal("document", { body: {} });
  vi.stubGlobal("React", React);
  try {
    const unavailable: CommunityMemberSuccessDossier = { ...source,
      recent_workflow_activity: [{ ...source.recent_workflow_activity[0], action_type, status: "unavailable" }],
    };
    const markdown = renderCommunityMemberSuccessDossierMarkdown(unavailable);
    expect(markdown).toContain("status unavailable");
    expect(markdown).toContain("linked outcome could not be verified");
    expect(markdown).not.toContain("Agent prompt responded");
    const html = renderToStaticMarkup(React.createElement(WebCommunityWorkflowMemberDossierModal, {
      isOpen: true, dossier: { ...unavailable, markdown }, isLoading: false, error: null, onClose: () => {},
    }));
    expect(html).toContain("Status unavailable");
    expect(html).not.toContain("Queued");
    expect(html).not.toContain("Running");
  } finally { vi.unstubAllGlobals(); }
});

test.each([null, source.workflow])(
  "dossier component renders optional workflow %j",
  (workflow) => {
    vi.stubGlobal("document", { body: {} });
    vi.stubGlobal("React", React);
    try {
      const dossier = { ...source, workflow, markdown: "" };
      const html = renderToStaticMarkup(
        React.createElement(WebCommunityWorkflowMemberDossierModal, {
          isOpen: true,
          dossier,
          isLoading: false,
          error: null,
          onClose: () => {},
        }),
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain("Grace Member");
      expect(html).toContain("Ship onboarding");
      expect(html).toContain(workflow ? "Activated" : "No workflow configured");
    } finally {
      vi.unstubAllGlobals();
    }
  },
);
