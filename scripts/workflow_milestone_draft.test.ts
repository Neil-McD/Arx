import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { CommunityMemberWorkflowAutomation, CommunityMemberWorkflowMilestone } from "../shared/communityMemberWorkflow";
import {
  isWorkflowMilestoneDraftDirty,
  replaceWorkflowDraftAction,
  toWorkflowAutomationDraft,
  workflowDraftAutomations,
  workflowChannelLabel,
  workflowAutomationIssue,
  workflowTriggerIssue,
} from "../apps/web/src/components/workflowMilestoneDraft";

const automation: CommunityMemberWorkflowAutomation = {
  key: "rule-1",
  trigger: { type: "member_contributed", channelId: "private-channel" },
  action: { key: "action-1", type: "prompt_agent", prompt: "Help the member prepare." },
};
const snapshot: CommunityMemberWorkflowMilestone = { key: "milestone-1", name: "New", automations: [automation] };

describe("workflow milestone editor drafts", () => {
  it("lesson and course triggers take a form or a client property, and a property rule needs its property", () => {
    const lessonDone = toWorkflowAutomationDraft({ ...automation, trigger: { type: "lesson_completed", resourceId: "lesson-1" } });
    expect(workflowAutomationIssue(lessonDone, [], false)).toBe("Choose Request form, Send an email, Update member record or a pod step");
    const setTier = replaceWorkflowDraftAction(lessonDone, "set_client_property");
    expect(setTier.action).toEqual({ key: "action-1", type: "set_client_property", propertyKey: "", value: null });
    expect(workflowAutomationIssue(setTier, [], false)).toBe("Choose a member property");
    expect(workflowAutomationIssue({ ...setTier, action: { key: "action-1", type: "set_client_property", propertyKey: "tier", value: "VIP" } }, [], false)).toBeNull();
    // Switching away keeps the prompt the builder had typed.
    expect(replaceWorkflowDraftAction(setTier, "prompt_agent").action).toMatchObject({ type: "prompt_agent", prompt: "Help the member prepare." });
  });
  it("tracks and reverts human approval without changing action definitions", () => {
    const drafts = [toWorkflowAutomationDraft(automation)];
    expect(isWorkflowMilestoneDraftDirty(snapshot, "New", drafts, "", "", true)).toBe(true);
    expect(isWorkflowMilestoneDraftDirty(snapshot, "New", drafts, "", "", false)).toBe(false);
    expect(isWorkflowMilestoneDraftDirty({ ...snapshot, requireHumanApproval: true }, "New", drafts)).toBe(false);
  });
  it("validates trigger setup independently of an unchosen action", () => {
    const draft = { ...automation, trigger: { type: "member_contributed" as const }, action: { key: "a", type: "prompt_agent" as const, prompt: "" } };
    expect(workflowTriggerIssue(draft, [], false)).toBeNull();
    expect(workflowAutomationIssue(draft, [], false)).toBe("Add agent instructions");
    expect(workflowTriggerIssue({ ...draft, trigger: { type: "form_submitted", formKey: "" } }, [], false)).toBe("Choose a published form");
    expect(workflowTriggerIssue({ ...draft, trigger: { type: "form_submitted", formKey: "intake" } }, [], false)).toBeNull();
    expect(workflowTriggerIssue({ ...draft, trigger: { type: "milestone_elapsed", delayMinutes: 0 } }, [], false)).toBeNull();
    expect(workflowTriggerIssue({ ...draft, trigger: { type: "milestone_elapsed", delayMinutes: 0, nudge: true } }, [], false)).toContain("duration");
    expect(workflowTriggerIssue({ ...draft, trigger: { type: "milestone_elapsed", delayMinutes: -1 } }, [], false)).toContain("duration");
    expect(workflowTriggerIssue({ ...draft, trigger: { type: "milestone_elapsed", delayMinutes: 1440 } }, [], false)).toBeNull();
    expect(workflowTriggerIssue({ ...draft, trigger: { type: "member_joined" } }, [], false)).toBeNull();
    expect(workflowTriggerIssue(automation, [], true)).toBe("Waiting for channels");
  });
  it("defers the conflict warning during saves without removing conflict or failure protection", () => {
    const source = readFileSync(new URL("../apps/web/src/components/WebCommunityWorkflowMilestoneModal.tsx", import.meta.url), "utf8");
    expect(source).toContain('{hasConflict && !props.isSaving ? <p className="workflow-error"');
    expect(source).toContain("&& !hasConflict");
    expect(source).toContain('{props.error ? <p className="workflow-error"');
    expect(source).toContain("if (editingSnapshot.current?.key === props.milestone.key) return;");
  });
  it("join form requests reuse form validation without requiring a channel", () => {
    const rule: CommunityMemberWorkflowAutomation = { key: "join-form", trigger: { type: "member_joined" }, action: { key: "form", type: "request_form", formKey: "intake" } };
    expect(workflowAutomationIssue(rule, [], true)).toBeNull();
    expect(workflowAutomationIssue({ ...rule, action: { ...rule.action, type: "request_form", formKey: "" } }, [], false)).toBe("Choose a published form");
    expect(workflowAutomationIssue({ ...rule, action: { key: "p", type: "prompt_agent", prompt: "Help" } }, [], false)).toContain("Member joins");
  });
  it("join provisions a room without requiring prompt, form or channel inputs", () => {
    const draft = { ...replaceWorkflowDraftAction(toWorkflowAutomationDraft(automation), "create_service_channel"), trigger: { type: "member_joined" as const } };
    expect(workflowAutomationIssue(draft, [], true)).toBeNull();
    expect(workflowDraftAutomations([draft])[0].action).toEqual({ key: "action-1", type: "create_service_channel" });
    expect(workflowAutomationIssue({ ...draft, trigger: { type: "member_contributed" } }, [], false)).toContain("Member joins");
    expect(replaceWorkflowDraftAction(draft, "prompt_agent").action).toEqual(automation.action);
  });
  it("never describes a missing scoped channel as Any channel", () => {
    expect(workflowChannelLabel(undefined, [], false)).toBe("Any channel");
    expect(workflowChannelLabel("missing", [], false)).toBe("Unavailable channel");
    expect(workflowChannelLabel("missing", [], true)).toBe("Channels unavailable");
  });

  it("surfaces incomplete collapsed rules without changing their scope", () => {
    expect(workflowAutomationIssue(automation, [], true)).toBe("Waiting for channels");
    expect(workflowAutomationIssue(automation, [], false)).toBe("Choose an available channel");
    const anyChannel = { ...automation, trigger: { type: "member_contributed" as const } };
    expect(workflowAutomationIssue(anyChannel, [], false)).toBeNull();
    expect(workflowAutomationIssue({ ...anyChannel, action: { key: "a", type: "prompt_agent", prompt: "  " } }, [], false)).toBe("Add agent instructions");
    expect(workflowAutomationIssue(replaceWorkflowDraftAction(toWorkflowAutomationDraft(anyChannel), "request_form"), [], false)).toBe("Choose a published form");
    expect(automation.trigger.channelId).toBe("private-channel");
  });

  it("round-trips canonical automations without persisting editor-only state", () => {
    const drafts = [toWorkflowAutomationDraft(automation)];
    expect(workflowDraftAutomations(drafts)).toEqual([automation]);
    expect(workflowDraftAutomations(drafts)[0]).not.toHaveProperty("promptDraft");
    expect(isWorkflowMilestoneDraftDirty(snapshot, "New", drafts)).toBe(false);
  });

  it("preserves the latest typed prompt through an action round trip", () => {
    const typed = {
      ...toWorkflowAutomationDraft(automation),
      action: { ...automation.action, type: "prompt_agent" as const, prompt: "Unsaved revised instructions" },
    };
    const moved = replaceWorkflowDraftAction(typed, "request_form");
    expect(moved.action).toEqual({ key: "action-1", type: "request_form", formKey: "" });
    expect(replaceWorkflowDraftAction(moved, "prompt_agent").action).toEqual(typed.action);
    expect(automation.action).toEqual({ key: "action-1", type: "prompt_agent", prompt: "Help the member prepare." });
  });

  it("keeps trigger scope and action identity stable while switching", () => {
    const moved = replaceWorkflowDraftAction(toWorkflowAutomationDraft(automation), "request_form");
    expect(moved.key).toBe(automation.key);
    expect(moved.trigger).toEqual(automation.trigger);
    expect(moved.action.key).toBe(automation.action.key);
    expect(workflowDraftAutomations([moved])[0].action).not.toHaveProperty("prompt");
  });

  it("does not clear text when the same action is selected", () => {
    const draft = toWorkflowAutomationDraft(automation);
    expect(replaceWorkflowDraftAction(draft, "prompt_agent")).toBe(draft);
  });

  it("initializes a non-prompt action with an empty prompt draft", () => {
    const draft = toWorkflowAutomationDraft({ ...automation, action: { key: "action-1", type: "request_form", formKey: "intake" } });
    expect(replaceWorkflowDraftAction(draft, "prompt_agent").action).toEqual({ key: "action-1", type: "prompt_agent", prompt: "" });
  });

  it("keeps prompt drafts isolated between rules", () => {
    const first = replaceWorkflowDraftAction(toWorkflowAutomationDraft(automation), "request_form");
    const second = replaceWorkflowDraftAction(toWorkflowAutomationDraft({ ...automation, key: "rule-2", action: { key: "action-2", type: "prompt_agent", prompt: "Different instructions" } }), "request_form");
    expect(replaceWorkflowDraftAction(first, "prompt_agent").action).toEqual(automation.action);
    expect(replaceWorkflowDraftAction(second, "prompt_agent").action).toMatchObject({ prompt: "Different instructions" });
  });

  it("detects name, action, and rule changes against the opening snapshot", () => {
    const draft = toWorkflowAutomationDraft(automation);
    expect(isWorkflowMilestoneDraftDirty(snapshot, "Renamed", [draft])).toBe(true);
    expect(isWorkflowMilestoneDraftDirty(snapshot, "New", [replaceWorkflowDraftAction(draft, "request_form")])).toBe(true);
    expect(isWorkflowMilestoneDraftDirty(snapshot, "New", [])).toBe(true);
    expect(isWorkflowMilestoneDraftDirty(snapshot, "New", [draft, { ...draft, key: "new-rule" }])).toBe(true);
  });

  it("recognizes reverted changes as clean", () => {
    const draft = toWorkflowAutomationDraft(automation);
    const restored = replaceWorkflowDraftAction(replaceWorkflowDraftAction(draft, "request_form"), "prompt_agent");
    expect(isWorkflowMilestoneDraftDirty(snapshot, "New", [restored])).toBe(false);
  });

  it("does not leak drafts between editor sessions", () => {
    const oldDraft = replaceWorkflowDraftAction(toWorkflowAutomationDraft(automation), "request_form");
    expect(oldDraft.promptDraft).not.toBe("");
    const reopened = toWorkflowAutomationDraft({ ...automation, action: { key: "action-1", type: "request_form", formKey: "intake" } });
    expect(reopened.promptDraft).toBe("");
  });

  it("treats a new name-only milestone as dirty only after typing", () => {
    const blank = { key: "", name: "", automations: [] };
    expect(isWorkflowMilestoneDraftDirty(blank, "", [])).toBe(false);
    expect(isWorkflowMilestoneDraftDirty(blank, "Onboarding", [])).toBe(true);
    expect(isWorkflowMilestoneDraftDirty(null, "", [])).toBe(false);
  });
});

it("sequential dependencies remain explicit when actions are deleted or reordered", async () => {
  const { workflowSequenceIssue } = await import("../shared/communityMemberWorkflow");
  const next: CommunityMemberWorkflowAutomation = { key: "next", trigger: { type: "previous_action_completed", predecessorActionKey: automation.action.key },
    action: { key: "next-action", type: "request_form", formKey: "intake" } };
  expect(workflowSequenceIssue([automation, next])).toBeNull();
  expect(workflowSequenceIssue([next])).toContain("earlier step");
  expect(workflowSequenceIssue([next, automation])).toContain("earlier step");
  expect(workflowTriggerIssue({ ...next, trigger: { type: "previous_action_completed", predecessorActionKey: "" } }, [], false)).toContain("preceding action");
  expect(workflowAutomationIssue(next, [], false)).toBeNull();
});
