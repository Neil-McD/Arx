import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { CommunityMemberWorkflowAutomation, CommunityMemberWorkflowMilestone } from "../shared/communityMemberWorkflow";
import {
  isWorkflowMilestoneDraftDirty,
  hasAssessmentMovementOverlap,
  replaceWorkflowDraftAction,
  toWorkflowAutomationDraft,
  workflowDraftAutomations,
  workflowChannelLabel,
  workflowMoveLabel,
  workflowAutomationIssue,
} from "../apps/web/src/components/workflowMilestoneDraft";

const automation: CommunityMemberWorkflowAutomation = {
  key: "rule-1",
  trigger: { type: "member_contributed", channelId: "private-channel" },
  action: { key: "action-1", type: "prompt_agent", prompt: "Help the member prepare." },
};
const snapshot: CommunityMemberWorkflowMilestone = { key: "milestone-1", name: "New", automations: [automation] };

describe("workflow milestone editor drafts", () => {
  it("warns only when assessment and movement use the same form", () => {
    const assessment: CommunityMemberWorkflowAutomation = { key: "assess", trigger: { type: "form_submitted", formKey: "intake" }, action: { key: "assess-action", type: "evaluate_goal" } };
    const move: CommunityMemberWorkflowAutomation = { key: "move", trigger: { type: "form_submitted", formKey: "intake" }, action: { key: "move-action", type: "move_member", destination: "next_or_complete" } };
    expect(hasAssessmentMovementOverlap([assessment, move])).toBe(true);
    expect(hasAssessmentMovementOverlap([assessment])).toBe(false);
    expect(hasAssessmentMovementOverlap([move])).toBe(false);
    expect(hasAssessmentMovementOverlap([assessment, { ...move, trigger: { type: "form_submitted", formKey: "other" } }])).toBe(false);
    expect(hasAssessmentMovementOverlap([assessment, { ...move, trigger: { type: "milestone_elapsed", delayMinutes: 5 } }])).toBe(false);
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

  it("distinguishes next milestone movement from final completion", () => {
    expect(workflowMoveLabel("Activated")).toBe("Move to Activated");
    expect(workflowMoveLabel(null)).toBe("Complete workflow");
  });

  it("surfaces incomplete collapsed rules without changing their scope", () => {
    expect(workflowAutomationIssue(automation, [], true)).toBe("Waiting for channels");
    expect(workflowAutomationIssue(automation, [], false)).toBe("Choose an available channel");
    const anyChannel = { ...automation, trigger: { type: "member_contributed" as const } };
    expect(workflowAutomationIssue(anyChannel, [], false)).toBeNull();
    expect(workflowAutomationIssue({ ...anyChannel, action: { key: "a", type: "prompt_agent", prompt: "  " } }, [], false)).toBe("Add agent instructions");
    expect(workflowAutomationIssue(replaceWorkflowDraftAction(toWorkflowAutomationDraft(anyChannel), "move_member"), [], false)).toBeNull();
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
    const moved = replaceWorkflowDraftAction(typed, "move_member");
    expect(moved.action).toEqual({ key: "action-1", type: "move_member", destination: "next_or_complete" });
    expect(replaceWorkflowDraftAction(moved, "prompt_agent").action).toEqual(typed.action);
    expect(automation.action).toEqual({ key: "action-1", type: "prompt_agent", prompt: "Help the member prepare." });
  });

  it("keeps trigger scope and action identity stable while switching", () => {
    const moved = replaceWorkflowDraftAction(toWorkflowAutomationDraft(automation), "move_member");
    expect(moved.key).toBe(automation.key);
    expect(moved.trigger).toEqual(automation.trigger);
    expect(moved.action.key).toBe(automation.action.key);
    expect(workflowDraftAutomations([moved])[0].action).not.toHaveProperty("prompt");
  });

  it("does not clear text when the same action is selected", () => {
    const draft = toWorkflowAutomationDraft(automation);
    expect(replaceWorkflowDraftAction(draft, "prompt_agent")).toBe(draft);
  });

  it("initializes a move action with an empty prompt draft", () => {
    const draft = toWorkflowAutomationDraft({ ...automation, action: { key: "action-1", type: "move_member", destination: "next_or_complete" } });
    expect(replaceWorkflowDraftAction(draft, "prompt_agent").action).toEqual({ key: "action-1", type: "prompt_agent", prompt: "" });
  });

  it("keeps prompt drafts isolated between rules", () => {
    const first = replaceWorkflowDraftAction(toWorkflowAutomationDraft(automation), "move_member");
    const second = replaceWorkflowDraftAction(toWorkflowAutomationDraft({ ...automation, key: "rule-2", action: { key: "action-2", type: "prompt_agent", prompt: "Different instructions" } }), "move_member");
    expect(replaceWorkflowDraftAction(first, "prompt_agent").action).toEqual(automation.action);
    expect(replaceWorkflowDraftAction(second, "prompt_agent").action).toMatchObject({ prompt: "Different instructions" });
  });

  it("detects name, action, and rule changes against the opening snapshot", () => {
    const draft = toWorkflowAutomationDraft(automation);
    expect(isWorkflowMilestoneDraftDirty(snapshot, "Renamed", [draft])).toBe(true);
    expect(isWorkflowMilestoneDraftDirty(snapshot, "New", [replaceWorkflowDraftAction(draft, "move_member")])).toBe(true);
    expect(isWorkflowMilestoneDraftDirty(snapshot, "New", [])).toBe(true);
    expect(isWorkflowMilestoneDraftDirty(snapshot, "New", [draft, { ...draft, key: "new-rule" }])).toBe(true);
  });

  it("recognizes reverted changes as clean", () => {
    const draft = toWorkflowAutomationDraft(automation);
    const restored = replaceWorkflowDraftAction(replaceWorkflowDraftAction(draft, "move_member"), "prompt_agent");
    expect(isWorkflowMilestoneDraftDirty(snapshot, "New", [restored])).toBe(false);
  });

  it("does not leak drafts between editor sessions", () => {
    const oldDraft = replaceWorkflowDraftAction(toWorkflowAutomationDraft(automation), "move_member");
    expect(oldDraft.promptDraft).not.toBe("");
    const reopened = toWorkflowAutomationDraft({ ...automation, action: { key: "action-1", type: "move_member", destination: "next_or_complete" } });
    expect(reopened.promptDraft).toBe("");
  });

  it("treats a new name-only milestone as dirty only after typing", () => {
    const blank = { key: "", name: "", automations: [] };
    expect(isWorkflowMilestoneDraftDirty(blank, "", [])).toBe(false);
    expect(isWorkflowMilestoneDraftDirty(blank, "Onboarding", [])).toBe(true);
    expect(isWorkflowMilestoneDraftDirty(null, "", [])).toBe(false);
  });
});
