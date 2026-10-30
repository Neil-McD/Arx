import { expect, it } from "vitest";
import { automationChains } from "../apps/web/src/components/WebCommunityWorkflowAutomations";
import { applyWorkflowTriggerType, toWorkflowAutomationDraft, workflowActionChoices } from "../apps/web/src/components/workflowMilestoneDraft";

const rule = (key: string, trigger: any, action: any) => toWorkflowAutomationDraft({ key, trigger, action: { key: `${key}-a`, ...action } });

it("groups each starting rule with the steps that wait for it, in run order", () => {
  const rules = [
    rule("join", { type: "member_joined" }, { type: "create_service_channel" }),
    rule("form", { type: "form_submitted", formKey: "welcome" }, { type: "prompt_agent", prompt: "Hi" }),
    rule("later", { type: "previous_action_completed", predecessorActionKey: "form-a", delayMinutes: 2880 }, { type: "prompt_agent", prompt: "Call?" }),
    rule("after", { type: "previous_action_completed", predecessorActionKey: "later-a" }, { type: "set_client_property", propertyKey: "stage", value: "x" }),
    rule("orphan", { type: "previous_action_completed", predecessorActionKey: "gone" }, { type: "prompt_agent", prompt: "?" }),
  ];
  const chains = automationChains(rules);
  expect(chains.map((chain) => chain.root.key)).toEqual(["join", "form", "orphan"]);
  expect(chains[1].steps.map((step) => step.key)).toEqual(["form", "later", "after"]);
});

it("switching triggers keeps a compatible action and offers only allowed actions", () => {
  const draft = rule("r", { type: "milestone_elapsed", delayMinutes: 60 }, { type: "request_form", formKey: "f" });
  expect(applyWorkflowTriggerType(draft, "member_joined", [])?.action.type).toBe("request_form");
  expect(applyWorkflowTriggerType(draft, "form_submitted", [])?.action.type).toBe("prompt_agent");
  expect(applyWorkflowTriggerType(draft, "previous_action_completed", [])).toBeNull();
  expect(workflowActionChoices("member_joined")).toEqual(["create_service_channel", "request_form"]);
  expect(workflowActionChoices("form_submitted")).toEqual(["prompt_agent", "send_email", "set_client_property", "set_pod_member"]);
});
