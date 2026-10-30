import type {
  CommunityMemberWorkflowAutomation,
  CommunityMemberWorkflowMilestone,
} from "../../../../shared/communityMemberWorkflow";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import { normalizeWorkflowDelayMinutes, normalizeWorkflowStageDelayMinutes, workflowActionIsInstant } from "../../../../shared/communityMemberWorkflow";

export function workflowChannelLabel(channelId: string | undefined, channels: CloudCommunityChannel[], unavailable: boolean): string {
  if (channelId === undefined) return "Any channel";
  const channel = channels.find((item) => item.id === channelId);
  if (channel) return `#${channel.name}`;
  return unavailable ? "Channels unavailable" : "Unavailable channel";
}

export function workflowAutomationIssue(automation: CommunityMemberWorkflowAutomation, channels: CloudCommunityChannel[], unavailable: boolean): string | null {
  if ((automation.action.type === "create_service_channel" && automation.trigger.type !== "member_joined")
    || (automation.trigger.type === "member_joined" && automation.action.type !== "create_service_channel" && automation.action.type !== "request_form")) return "Member joins requires Create a personal pod or Request form";
  if ((automation.action.type === "request_form" && !automation.action.formKey) || (automation.trigger.type === "form_submitted" && !automation.trigger.formKey)) return "Choose a published form";
  if (automation.trigger.type === "form_submitted" && automation.action.type === "request_form") return "Choose Ask agent";
  if ((automation.trigger.type === "lesson_completed" || automation.trigger.type === "course_completed" || automation.trigger.type === "track_completed"
      || automation.trigger.type === "offer_started" || automation.trigger.type === "offer_ended")
    && automation.action.type !== "request_form" && !workflowActionIsInstant(automation.action.type)) return "Choose Request form, Send an email, Update member record or a pod step";
  if (automation.action.type === "set_client_property" && !automation.action.propertyKey) return "Choose a member property";
  if (automation.action.type === "send_email" && (!automation.action.subject.trim() || !automation.action.body.trim())) return "Add a subject and a message";
  if (automation.action.type === "set_pod_member" && !automation.action.channelId) return "Choose a pod";
  const triggerIssue = workflowTriggerIssue(automation, channels, unavailable);
  if (triggerIssue) return triggerIssue;
  return automation.action.type === "prompt_agent" && !automation.action.prompt.trim() ? "Add agent instructions" : null;
}

export function workflowTriggerIssue(automation: CommunityMemberWorkflowAutomation, channels: CloudCommunityChannel[], unavailable: boolean): string | null {
  if (automation.trigger.type === "client_property_changed" && !automation.trigger.propertyKey) return "Choose a field on the member record";
  if (automation.trigger.type === "property_date" && !automation.trigger.propertyKey) return "Add a date field to the member record, then choose it";
  if (automation.trigger.type === "previous_action_completed" && !automation.trigger.predecessorActionKey) return "Choose a preceding action";
  if (automation.trigger.type === "form_submitted" && !automation.trigger.formKey) return "Choose a published form";
  if (automation.trigger.type === "milestone_elapsed") {
    try { normalizeWorkflowStageDelayMinutes(automation.trigger.delayMinutes, automation.trigger.nudge); }
    catch { return "Choose a duration from 1 minute to 365 days"; }
    if (automation.trigger.nudge && automation.action.type !== "prompt_agent") return "A nudge can only ask the agent";
  }
  const channelId = automation.trigger.type === "member_contributed" ? automation.trigger.channelId : undefined;
  if (channelId !== undefined) {
    if (unavailable) return "Waiting for channels";
    if (!channels.some((channel) => channel.id === channelId)) return "Choose an available channel";
  }
  return null;
}

// Editor-only state. Hidden prompt drafts must never enter the saved contract.
export type WorkflowAutomationDraft = CommunityMemberWorkflowAutomation & { promptDraft: string; paused?: boolean };

/** A stage's rules for editing: the running ones, then the switched-off ones marked paused. */
export function workflowStageDrafts(milestone: CommunityMemberWorkflowMilestone): WorkflowAutomationDraft[] {
  return [...milestone.automations.map(toWorkflowAutomationDraft),
    ...(milestone.pausedAutomations ?? []).map((rule) => ({ ...toWorkflowAutomationDraft(rule), paused: true }))];
}

/** What a stage save sends for rules the editor doesn't show: the switched-off ones, as they are. */
export function pausedWorkflowAutomationInputs(milestone: CommunityMemberWorkflowMilestone | null | undefined) {
  return (milestone?.pausedAutomations ?? []).map((rule) => ({ ...rule, paused: true }));
}

export function toWorkflowAutomationDraft(automation: CommunityMemberWorkflowAutomation): WorkflowAutomationDraft {
  return {
    ...automation,
    promptDraft: automation.action.type === "prompt_agent" ? automation.action.prompt : "",
  };
}

export function replaceWorkflowDraftAction(
  automation: WorkflowAutomationDraft,
  type: WorkflowActionType,
): WorkflowAutomationDraft {
  if (automation.action.type === type) return automation;
  const promptDraft = automation.action.type === "prompt_agent" ? automation.action.prompt : automation.promptDraft;
  return {
    ...automation,
    promptDraft,
    action: type === "prompt_agent"
      ? { key: automation.action.key, type, prompt: promptDraft }
      : type === "request_form" ? { key: automation.action.key, type, formKey: "" }
      : type === "set_client_property" ? { key: automation.action.key, type, propertyKey: "", value: null }
      : type === "send_email" ? { key: automation.action.key, type, subject: "", body: "" }
      : type === "set_pod_member" ? { key: automation.action.key, type, channelId: "", active: true }
      : { key: automation.action.key, type: "create_service_channel" },
  };
}

export function workflowDraftAutomations(automations: WorkflowAutomationDraft[]): CommunityMemberWorkflowAutomation[] {
  return automations.map(({ promptDraft: _promptDraft, ...automation }) => automation);
}

export function isWorkflowMilestoneDraftDirty(
  snapshot: CommunityMemberWorkflowMilestone | null,
  name: string,
  automations: WorkflowAutomationDraft[],
  instructions = snapshot?.instructions ?? "",
  goal = snapshot?.goal ?? "",
  requireHumanApproval = snapshot?.requireHumanApproval ?? false,
  color = snapshot?.color,
): boolean {
  return snapshot !== null && (
    name !== snapshot.name
    || color !== snapshot.color
    || instructions !== (snapshot.instructions ?? "")
    || goal !== (snapshot.goal ?? "")
    || requireHumanApproval !== (snapshot.requireHumanApproval ?? false)
    || JSON.stringify(workflowDraftAutomations(automations)) !== JSON.stringify(snapshot.automations)
  );
}

export type WorkflowTriggerType = CommunityMemberWorkflowAutomation["trigger"]["type"];
export type WorkflowActionType = CommunityMemberWorkflowAutomation["action"]["type"];

/** Switch a rule to another trigger, keeping the action when the new trigger allows it. */
export function applyWorkflowTriggerType(automation: WorkflowAutomationDraft, type: WorkflowTriggerType,
  earlierSteps: CommunityMemberWorkflowAutomation[], properties: Array<{ key: string; type: string }> = []): WorkflowAutomationDraft | null {
  const action = automation.action.type;
  const keep = action === "create_service_channel" ? "prompt_agent" : action;
  if (type === "client_property_changed") {
    return { ...replaceWorkflowDraftAction(automation, keep),
      trigger: { type, propertyKey: automation.trigger.type === type ? automation.trigger.propertyKey : properties[0]?.key ?? "" } };
  }
  if (type === "property_date") {
    return { ...replaceWorkflowDraftAction(automation, keep), trigger: automation.trigger.type === type ? automation.trigger
      : { type, propertyKey: properties.find((property) => property.type === "date")?.key ?? "", offsetDays: 0 } };
  }
  if (type === "member_joined") {
    return { ...replaceWorkflowDraftAction(automation, action === "request_form" ? "request_form" : "create_service_channel"), trigger: { type } };
  }
  if (type === "previous_action_completed") {
    const predecessor = earlierSteps.at(-1);
    if (!predecessor) return null;
    return { ...replaceWorkflowDraftAction(automation, action === "request_form" || workflowActionIsInstant(action) ? action : "prompt_agent"),
      trigger: { type, predecessorActionKey: predecessor.action.key } };
  }
  if (type === "form_submitted") {
    return { ...replaceWorkflowDraftAction(automation, workflowActionIsInstant(action) ? action : "prompt_agent"), trigger: { type, formKey: "" } };
  }
  if (type === "lesson_completed" || type === "course_completed" || type === "track_completed" || type === "offer_started" || type === "offer_ended" || type === "pod_member_added") {
    return { ...replaceWorkflowDraftAction(automation, action === "request_form" || workflowActionIsInstant(action) ? action : "prompt_agent"), trigger: { type } };
  }
  const next = action === "request_form" || action === "send_email" ? action : "prompt_agent";
  return { ...replaceWorkflowDraftAction(automation, next), trigger: type === "member_contributed" ? { type } : { type: "milestone_elapsed", delayMinutes: 1440 } };
}

/** The actions a trigger can start. */
export function workflowActionChoices(trigger: WorkflowTriggerType): WorkflowActionType[] {
  const choices: WorkflowActionType[] = [trigger === "member_joined" ? "create_service_channel" : "prompt_agent"];
  if (trigger !== "form_submitted") choices.push("request_form");
  if (trigger !== "member_joined") choices.push("send_email", "set_client_property", "set_pod_member");
  return choices;
}
