import type {
  CommunityMemberWorkflowAction,
  CommunityMemberWorkflowAutomation,
  CommunityMemberWorkflowMilestone,
} from "../../../../shared/communityMemberWorkflow";

// Editor-only state. Hidden prompt drafts must never enter the saved contract.
export type WorkflowAutomationDraft = CommunityMemberWorkflowAutomation & { promptDraft: string };

export function toWorkflowAutomationDraft(automation: CommunityMemberWorkflowAutomation): WorkflowAutomationDraft {
  return {
    ...automation,
    promptDraft: automation.action.type === "prompt_agent" ? automation.action.prompt : "",
  };
}

export function replaceWorkflowDraftAction(
  automation: WorkflowAutomationDraft,
  type: CommunityMemberWorkflowAction["type"],
): WorkflowAutomationDraft {
  if (automation.action.type === type) return automation;
  const promptDraft = automation.action.type === "prompt_agent" ? automation.action.prompt : automation.promptDraft;
  return {
    ...automation,
    promptDraft,
    action: type === "prompt_agent"
      ? { key: automation.action.key, type, prompt: promptDraft }
      : { key: automation.action.key, type, destination: "next_or_complete" },
  };
}

export function workflowDraftAutomations(automations: WorkflowAutomationDraft[]): CommunityMemberWorkflowAutomation[] {
  return automations.map(({ promptDraft: _promptDraft, ...automation }) => automation);
}

export function isWorkflowMilestoneDraftDirty(
  snapshot: CommunityMemberWorkflowMilestone | null,
  name: string,
  automations: WorkflowAutomationDraft[],
): boolean {
  return snapshot !== null && (
    name !== snapshot.name
    || JSON.stringify(workflowDraftAutomations(automations)) !== JSON.stringify(snapshot.automations)
  );
}
