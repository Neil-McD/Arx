import type {
  CommunityMemberWorkflowAction,
  CommunityMemberWorkflowAutomation,
  CommunityMemberWorkflowMilestone,
} from "../../../../shared/communityMemberWorkflow";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import { normalizeWorkflowDelayMinutes } from "../../../../shared/communityMemberWorkflow";

export function workflowChannelLabel(channelId: string | undefined, channels: CloudCommunityChannel[], unavailable: boolean): string {
  if (channelId === undefined) return "Any channel";
  const channel = channels.find((item) => item.id === channelId);
  if (channel) return `#${channel.name}`;
  return unavailable ? "Channels unavailable" : "Unavailable channel";
}

export function workflowMoveLabel(nextMilestoneName: string | null): string {
  return nextMilestoneName === null ? "Complete workflow" : `Move to ${nextMilestoneName}`;
}

export function workflowAutomationIssue(automation: CommunityMemberWorkflowAutomation, channels: CloudCommunityChannel[], unavailable: boolean): string | null {
  if (automation.trigger.type === "milestone_elapsed") {
    try { normalizeWorkflowDelayMinutes(automation.trigger.delayMinutes); }
    catch { return "Choose a duration from 1 minute to 365 days"; }
  }
  const channelId = automation.trigger.type === "member_contributed" ? automation.trigger.channelId : undefined;
  if (channelId !== undefined) {
    if (unavailable) return "Waiting for channels";
    if (!channels.some((channel) => channel.id === channelId)) return "Choose an available channel";
  }
  return automation.action.type === "prompt_agent" && !automation.action.prompt.trim() ? "Add agent instructions" : null;
}

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
