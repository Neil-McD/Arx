import { describe, expect, it } from "vitest";
import type { CommunityMemberWorkflowAutomation, CommunityMemberWorkflowMilestone } from "../shared/communityMemberWorkflow";
import {
  isWorkflowMilestoneDraftDirty,
  replaceWorkflowDraftAction,
  toWorkflowAutomationDraft,
  workflowDraftAutomations,
} from "../apps/web/src/components/workflowMilestoneDraft";

const automation: CommunityMemberWorkflowAutomation = {
  key: "rule-1",
  trigger: { type: "member_contributed", channelId: "private-channel" },
  action: { key: "action-1", type: "prompt_agent", prompt: "Help the member prepare." },
};
const snapshot: CommunityMemberWorkflowMilestone = { key: "milestone-1", name: "New", automations: [automation] };

describe("workflow milestone editor drafts", () => {
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
