import { expect, test } from "vitest";
import { composeWorkflowAgentPrompt, normalizeWorkflowMilestoneContext } from "../shared/communityMemberWorkflow";
import { isWorkflowMilestoneDraftDirty } from "../apps/web/src/components/workflowMilestoneDraft";

test("optional context is bounded and old action prompts stay identical", () => {
  expect(normalizeWorkflowMilestoneContext(undefined)).toBe("");
  expect(normalizeWorkflowMilestoneContext(" a\r\nb ")).toBe("a\nb");
  expect(() => normalizeWorkflowMilestoneContext("x".repeat(4001))).toThrow();
  expect(composeWorkflowAgentPrompt("Help")).toBe("Help");
  expect(composeWorkflowAgentPrompt("Help", { goal: "Offer ready" })).toContain("not evidence of completion");
});

test("context-only edits and clears participate in discard protection", () => {
  const milestone = { key: "m", name: "New", instructions: "Coach", goal: "Ready", automations: [] };
  expect(isWorkflowMilestoneDraftDirty(milestone, "New", [], "Coach", "Ready")).toBe(false);
  expect(isWorkflowMilestoneDraftDirty(milestone, "New", [], "", "Ready")).toBe(true);
  expect(isWorkflowMilestoneDraftDirty(milestone, "New", [], "Coach", "Changed")).toBe(true);
});
