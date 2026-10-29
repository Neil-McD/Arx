import { expect, test } from "vitest";
import { buildAgentLedJourneyPlan, withJourneyPropertyKey, AGENT_LED_JOURNEY_PROPERTY_PLACEHOLDER } from "../shared/agentLedJourneyTemplate";
import { workflowSequenceIssue, type CommunityMemberWorkflowAutomation } from "../shared/communityMemberWorkflow";

const keyed = (rules: Array<Omit<CommunityMemberWorkflowAutomation, "key">>) => rules.map((rule, i) => ({ ...rule, key: `a${i}` }));

test("a new community gets Welcome plus three stages; every stage passes the engine's rule checks", () => {
  const plan = buildAgentLedJourneyPlan({ hasWorkflow: false, onboardingFormKey: "intake" });
  expect(plan.stages.map((s) => s.name)).toEqual(["Welcome", "First win", "Build it", "Checkpoint"]);
  expect(plan.firstStageAdditions).toEqual([]);
  for (const stage of plan.stages) {
    expect(workflowSequenceIssue(keyed(stage.automations))).toBeNull();
    for (const rule of stage.automations) {
      // Engine rules: lessons/courses may only write a property or ask a form; joins only open a channel or ask a form.
      if (rule.trigger.type === "lesson_completed" || rule.trigger.type === "course_completed") expect(rule.action.type).toBe("set_client_property");
      if (rule.trigger.type === "member_joined") expect(["create_service_channel", "request_form"]).toContain(rule.action.type);
    }
  }
  expect(plan.stages.at(-1)!.requireHumanApproval).toBe(true);
});

test("an existing Workflow keeps its first stage and only gains what it lacks", () => {
  const plan = buildAgentLedJourneyPlan({
    hasWorkflow: true, onboardingFormKey: "intake",
    firstStageAutomations: [{ key: "x", trigger: { type: "member_joined" }, action: { key: "f", type: "request_form", formKey: "intake" } }],
  });
  expect(plan.stages.map((s) => s.name)).toEqual(["First win", "Build it", "Checkpoint"]);
  expect(plan.firstStageAdditions.map((r) => r.action.type)).toEqual(["create_service_channel", "prompt_agent"]);
});

test("without a published form the agent asks its own questions on entry", () => {
  const plan = buildAgentLedJourneyPlan({ hasWorkflow: false, onboardingFormKey: null });
  expect(plan.stages[0].automations.map((r) => r.trigger.type)).toEqual(["member_joined", "milestone_elapsed"]);
});

test("the Journey property key replaces the placeholder", () => {
  const plan = buildAgentLedJourneyPlan({ hasWorkflow: false, onboardingFormKey: null });
  const rules = withJourneyPropertyKey(plan.stages[1].automations, "journey");
  expect(JSON.stringify(rules)).not.toContain(AGENT_LED_JOURNEY_PROPERTY_PLACEHOLDER);
  expect(rules.find((r) => r.action.type === "set_client_property")?.action).toMatchObject({ propertyKey: "journey", value: "Finished first lesson" });
});

test("stalled-member check-ins are nudges, so they never hold a stage", () => {
  const plan = buildAgentLedJourneyPlan({ hasWorkflow: false, onboardingFormKey: "intake" });
  const nudges = plan.stages.flatMap((s) => s.automations).filter((r) => r.trigger.type === "milestone_elapsed" && r.trigger.nudge);
  expect(nudges.map((r) => r.trigger.type === "milestone_elapsed" && r.trigger.delayMinutes)).toEqual([3 * 1440, 7 * 1440]);
  expect(nudges.every((r) => r.action.type === "prompt_agent")).toBe(true);
});
