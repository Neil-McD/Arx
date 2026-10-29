import { expect, test, vi } from "vitest";

test("forms Markdown makes missing and bounded evidence explicit", () => {
  const markdown = renderCommunitySubmittedFormsMarkdown({ submissions: [], truncated: true, unavailable_records: 1 });
  expect(markdown).toContain("No submitted form evidence available");
  expect(markdown).toContain("additional records, questions, or text were omitted");
  expect(markdown).toContain("could not be verified");
  expect(markdown).toContain("not instructions or proof");
});
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
  renderCommunitySubmittedFormsMarkdown,
  type CommunityMemberSuccessDossier,
} from "../shared/communityMemberSuccessDossier";

const source: CommunityMemberSuccessDossier = {
  submitted_form_evidence: { submissions: [], truncated: false, unavailable_records: 0 },
  service_channel: { status: "unassigned", revision: 0, channel_id: null, name: null },
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
  expect(markdown).toContain("- Current stage: Activated");
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
  expect(markdown).not.toContain("Current stage:");
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
      ...serviceProps, isOpen: true, dossier: { ...unavailable, markdown }, isLoading: false, error: null, onClose: () => {}, onRetry: () => {},
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
          ...serviceProps,
          isOpen: true,
          dossier,
          isLoading: false,
          error: null,
          onClose: () => {},
          onRetry: () => {},
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

function renderDossier(overrides: Partial<React.ComponentProps<typeof WebCommunityWorkflowMemberDossierModal>> = {}) {
  vi.stubGlobal("document", { body: {} });
  vi.stubGlobal("React", React);
  try {
    return renderToStaticMarkup(React.createElement(WebCommunityWorkflowMemberDossierModal, {
      ...serviceProps,
      isOpen: true, dossier: { ...source, markdown: "" }, isLoading: false, error: null,
      onClose: () => {}, onRetry: () => {}, ...overrides,
    }));
  } finally { vi.unstubAllGlobals(); }
}

const serviceProps = {
  onForceMove: async () => {},
  channels: [], channelsUnavailable: false, isServiceChannelSaving: false, serviceChannelError: null,
  onSetServiceChannel: async () => true, onOpenServiceChannel: () => {},
};

test("normal human approval is separate from force move and fails closed on incomplete proof", () => {
  const workflow = { ...source.workflow!, require_human_approval: true,
    override_state: { activation_sequence: 1, transition_seq: 0, next_milestone_name: "Review" },
    action_progress: { actions: [{ automation_key: "a", action_key: "b", label: "Ask agent", action_type: "prompt_agent" as const,
      status: "complete" as "complete" | "pending", evidence: { run_id: "run", source_id: "reply", completed_at: 1 } }], all_actions_complete: true, scan_truncated: false } };
  const render = () => renderDossier({ onApproveMilestone: async () => {}, dossier: { ...source, markdown: "", workflow } });
  expect(render()).toContain("Awaiting human approval");
  expect(render()).toContain('class="workflow-secondary-button">Approve and advance</button>');
  expect(render()).toContain("Force move…");
  workflow.action_progress.scan_truncated = true;
  expect(render()).toContain('disabled="">Approve and advance</button>');
  workflow.action_progress.scan_truncated = false;
  workflow.action_progress.all_actions_complete = false;
  workflow.action_progress.actions[0].status = "pending";
  expect(render()).toContain("Configured actions must be verified complete before approval");
  expect(render()).toContain('disabled="">Approve and advance</button>');
});

test.each([
  ["achieved", "goal appears met"],
  ["not_yet", "goal not yet met"],
  ["insufficient_evidence", "evidence is insufficient"],
  ["failed", "Agent assessment unavailable"],
] as const)("human approval shows advisory %s without removing the approval gate", (status, message) => {
  const html = renderDossier({ onApproveMilestone: async () => {}, dossier: { ...source, markdown: "", workflow: {
    ...source.workflow!, goal: "Member is ready", require_human_approval: true,
    action_progress: { actions: [{ automation_key: "a", action_key: "b", label: "Ask agent", action_type: "prompt_agent",
      status: "complete", evidence: { run_id: "run", source_id: "reply", completed_at: 1 } }],
      all_actions_complete: true, scan_truncated: false },
    goal_review: { status, reason: "Current bounded evidence" },
    override_state: { activation_sequence: 1, transition_seq: 0, next_milestone_name: "Review" },
  } } });
  expect(html).toContain(message);
  expect(html).toContain("Current bounded evidence");
  expect(html).toContain('class="workflow-secondary-button">Approve and advance</button>');
  expect(html).not.toContain("Advancement is being validated");
});

test("progress distinguishes verified work, empty configuration, and unavailable proof", () => {
  const dossier = { ...source, markdown: "", workflow: { ...source.workflow!, action_progress: {
    actions: [{ automation_key: "a", action_key: "b", label: "Ask agent: Introduce yourself",
      action_type: "prompt_agent" as const, status: "complete" as const,
      evidence: { run_id: "run", source_id: "response", completed_at: 1_780_000_000_000 } }],
    all_actions_complete: true, scan_truncated: true,
  } } };
  const html = renderDossier({ dossier });
  expect(html).toContain("Response delivered");
  expect(html).toContain("Ask agent: Introduce yourself");
  expect(html).toContain("does not prove the stage goal");
  expect(html).toContain("Unproven actions remain unavailable");
  expect(renderDossier()).toContain("Action completion unavailable.");
  dossier.workflow.action_progress.actions = [];
  expect(renderDossier({ dossier })).toContain("No actions configured.");
});

test("progress is the default without a movement-condition section", () => {
  const html = renderDossier({ dossier: { ...source, markdown: "", workflow: source.workflow } });
  expect(html).toContain('id="member-workflow-tab-progress"');
  expect(html).toContain('aria-labelledby="member-workflow-tab-progress"');
  expect(html).not.toContain('Movement conditions');
  expect(html).toContain('Action completion information unavailable.');
});

test.each([
  ["reviewing", "The agent is reviewing the goal"],
  ["not_yet", "Goal not met"],
  ["insufficient_evidence", "More proof is needed"],
  ["failed", "Goal review could not complete"],
] as const)("progress renders current goal review %s in the existing popup", (status, text) => {
  const html = renderDossier({ dossier: { ...source, markdown: "", workflow: { ...source.workflow!,
    goal: "Member is ready", goal_review: { status, reason: "Bounded evidence explanation" } } } });
  expect(html).toContain(text);
  expect(html).toContain("Bounded evidence explanation");
  expect(html).not.toContain("Automatic goal review is not enabled yet");
});

test("force-move entry reuses themed workflow control and stays hidden after completion", () => {
  const workflow = { ...source.workflow!, override_state: { activation_sequence: 1, transition_seq: 0, next_milestone_name: "Review" } };
  const html = renderDossier({ dossier: { ...source, markdown: "", workflow } });
  expect(html).toContain('class="workflow-secondary-button" data-override-open');
  expect(html).toContain("Force move…");
  expect(renderDossier({ dossier: { ...source, markdown: "", workflow: { ...workflow, completed_at: "2026-09-07T00:00:00.000Z" } } })).not.toContain("data-override-open");
});

test("assessment disclosure shows original stage, goal and cited answer", () => {
  const html = renderDossier({ dossier: { ...source, markdown: "", recent_workflow_activity: [{
    ...source.recent_workflow_activity[0], action_type: "evaluate_goal", status: "responded", milestone_name: "Original stage",
    assessment: { verdict: "achieved", reason: "Offer supplied", assessedAt: 1, evidenceRefs: ["r:v:q"], goal: "Original goal",
      citations: [{ ref: "r:v:q", form: "Original form", question: "What is your offer?", answer: "A coaching program" }] },
  }] } });
  expect(html).toContain("Original stage · Goal evaluation");
  expect(html).toContain("Goal and evidence at evaluation");
  expect(html).toContain("Original goal");
  expect(html).toContain("A coaching program");
  expect(html).toContain("Historical assessment");
  expect(html).not.toContain("<details open");
});

test("legacy assessment never substitutes current answers for missing snapshots", () => {
  const html = renderDossier({ dossier: { ...source, markdown: "", recent_workflow_activity: [{
    ...source.recent_workflow_activity[0], action_type: "evaluate_goal", status: "responded",
    assessment: { verdict: "achieved", reason: "Historical result", assessedAt: 1, evidenceRefs: ["r:v:q"] },
  }] } });
  expect(html).toContain("Original goal unavailable.");
  expect(html).toContain("Some cited evidence is unavailable");
});

test("service channel starts unassigned without an Open action", () => {
  const html = renderDossier();
  expect(html).toContain("Not assigned");
  expect(html).toContain("Choose channel");
  expect(html).not.toContain("Open channel");
});

test("unavailable service channel can be cleared but cannot be opened", () => {
  const html = renderDossier({ dossier: { ...source, markdown: "", service_channel: {
    status: "unavailable", revision: 2, channel_id: null, name: null,
  } } });
  expect(html).toContain("Unavailable");
  expect(html).toContain("Clear");
  expect(html).not.toContain("Open channel");
});

test("member details use collapsed disclosures without dropping instructions or history", () => {
  const html = renderDossier();
  expect(html).toContain("Member context");
  expect(html).toContain("Recent workflow activity");
  expect(html).toContain('<summary>Agent instructions</summary>');
  expect(html).toContain(source.recent_workflow_activity[0].prompt);
  expect(html).toContain('<summary>Recent stage history</summary>');
  expect(html).not.toContain("<details open");
  expect(html).toContain('<time dateTime="2026-08-25T11:59:00.000Z"');
});

test("missing records do not imply the member never progressed", () => {
  const html = renderDossier({ dossier: { ...source, markdown: "", approved_community_context: [], recent_workflow_activity: [], milestone_history: [] } });
  expect(html).toContain("Activated");
  expect(html).toContain("No recorded workflow activity.");
  expect(html).toContain("No recorded stage changes.");
  expect(html).not.toContain("No completed stages yet");
});

test.each(["queued", "running", "responded", "failed", "unavailable"] as const)("agent status %s retains its meaning", (status) => {
  const html = renderDossier({ dossier: { ...source, markdown: "", milestone_history: [], recent_workflow_activity: [{ ...source.recent_workflow_activity[0], status }] } });
  expect(html).toContain(status === "unavailable" ? "Status unavailable" : status[0].toUpperCase() + status.slice(1));
  expect(html).not.toContain("Workflow complete");
});

test("all bounded rows and full long instructions remain present", () => {
  const prompt = "Help the member.\n".repeat(150) + "Final instruction.";
  const html = renderDossier({ dossier: { ...source, markdown: "",
    recent_workflow_activity: Array.from({ length: 12 }, (_, i) => ({ ...source.recent_workflow_activity[0], id: `run-${i}`, prompt })),
    milestone_history: Array.from({ length: 12 }, (_, i) => ({ ...source.milestone_history[0], id: `move-${i}` })),
  } });
  expect(html.match(/<li>/g)).toHaveLength(24);
  expect(html.match(/Final instruction\./g)).toHaveLength(12);
});

test("error offers retry, loading announces state without showing stale activity", () => {
  const error = renderDossier({ dossier: null, error: "Connection unavailable" });
  expect(error).toContain('role="alert"');
  expect(error).toContain('>Retry</button>');
  const loading = renderDossier({ isLoading: true });
  expect(loading).toContain('role="status"');
  expect(loading).not.toContain("Recent workflow activity");
});

test("completion is shown only from supplied workflow state and transition evidence", () => {
  const html = renderDossier({ dossier: { ...source, markdown: "", workflow: { ...source.workflow!, completed_at: "2026-09-06T12:00:00Z" },
    recent_workflow_activity: [{ ...source.recent_workflow_activity[0], action_type: "move_member", status: "workflow_completed", prompt: null }],
  } });
  expect(html).toContain("Workflow complete");
  expect(html).not.toContain("Agent instructions");
});
