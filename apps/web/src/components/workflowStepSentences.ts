import {
  workflowConditionClauses,
  type CommunityMemberWorkflowAutomation,
  type CommunityMemberWorkflowCondition,
  type CommunityMemberWorkflowConditionClause,
} from "../../../../shared/communityMemberWorkflow";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import type { WorkflowCatalog } from "./WebCommunityWorkflowAutomationEditor";

// Each stage rule read as one plain sentence, arranged as the order it runs in:
// rules that start on their own come first, and a rule that waits for an earlier
// step sits under it ("Then…" / "2 days later…").

export type WorkflowStepNames = {
  forms?: Array<{ key: string; name: string }>;
  channels?: CloudCommunityChannel[];
  catalog?: WorkflowCatalog;
};

export type WorkflowStepLine = {
  automation: CommunityMemberWorkflowAutomation;
  /** "When someone joins" / "Then" / "2 days later". */
  lead: string;
  /** Everything after the lead: ", if Plan is Pro, send the Welcome form." */
  rest: string;
  depth: number;
};

export function workflowDurationLabel(minutes: number): string {
  const [size, unit] = minutes % 1440 === 0 ? [minutes / 1440, "day"] : minutes % 60 === 0 ? [minutes / 60, "hour"] : [minutes, "minute"];
  return `${size} ${unit}${size === 1 ? "" : "s"}`;
}

function quote(text: string, max = 70): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return `“${flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat}”`;
}

function formName(key: string, names: WorkflowStepNames): string {
  return names.forms?.find((form) => form.key === key)?.name ?? "a form";
}

function propertyName(key: string, names: WorkflowStepNames): string {
  return names.catalog?.properties?.find((property) => property.key === key)?.name ?? key;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "yes" : "no";
  return value === null || value === undefined || value === "" ? "empty" : String(value);
}

function clausePhrase(clause: CommunityMemberWorkflowConditionClause, names: WorkflowStepNames, negate: boolean): string {
  const name = propertyName(clause.propertyKey, names);
  const op = !negate ? clause.op : clause.op === "is" ? "is_not" : clause.op === "is_not" ? "is" : clause.op === "is_set" ? "is_empty" : "is_set";
  if (op === "is_set") return `${name} is filled in`;
  if (op === "is_empty") return `${name} is empty`;
  return `${name} ${op === "is_not" ? "isn't" : "is"} ${formatValue(clause.value)}`;
}

/** "if Plan is Pro and Goal is filled in". An Otherwise step reads as the
 * opposite (each clause flipped, and/or swapped), so it says when it runs. */
export function workflowConditionPhrase(condition: CommunityMemberWorkflowCondition | undefined, names: WorkflowStepNames): string {
  if (!condition) return "";
  const negate = !!condition.otherwise;
  const any = (condition.match === "any") !== negate;
  return `if ${workflowConditionClauses(condition).map((clause) => clausePhrase(clause, names, negate)).join(any ? " or " : " and ")}`;
}

export function workflowTriggerPhrase(automation: CommunityMemberWorkflowAutomation, names: WorkflowStepNames): string {
  const trigger = automation.trigger;
  switch (trigger.type) {
    case "member_joined": return "When someone joins";
    case "form_submitted": return `When they submit ${formName(trigger.formKey, names)}`;
    case "lesson_completed": {
      const lesson = trigger.resourceId ? names.catalog?.lessons?.find((item) => item.id === trigger.resourceId)?.title : null;
      return trigger.resourceId ? `When they finish ${lesson ? quote(lesson, 50) : "a lesson"}` : "When they finish any lesson";
    }
    case "course_completed": {
      const course = trigger.moduleId ? names.catalog?.lessons?.find((item) => item.courseId === trigger.moduleId)?.course : null;
      return trigger.moduleId ? `When they finish ${course ? `the ${quote(course, 50)} course` : "a course"}` : "When they finish any course";
    }
    case "offer_started":
    case "offer_ended": {
      const offer = trigger.offerKey ? names.catalog?.offers?.find((item) => item.key === trigger.offerKey)?.name : null;
      const verb = trigger.type === "offer_started" ? "start" : "leave";
      return trigger.offerKey ? `When they ${verb} ${offer ? `the ${quote(offer, 50)} offer` : "an offer"}` : `When they ${verb} any offer`;
    }
    case "track_completed": {
      const track = trigger.trackKey ? names.catalog?.tracks?.find((item) => item.key === trigger.trackKey)?.title : null;
      return trigger.trackKey ? `When they finish ${track ? `the ${quote(track, 50)} track` : "a track"}` : "When they finish any track";
    }
    case "property_date": {
      const days = Math.abs(trigger.offsetDays);
      const field = `their ${propertyName(trigger.propertyKey, names)} date`;
      return trigger.offsetDays === 0 ? `On ${field}` : `${days} day${days === 1 ? "" : "s"} ${trigger.offsetDays < 0 ? "before" : "after"} ${field}`;
    }
    case "client_property_changed":
      return `When ${propertyName(trigger.propertyKey, names)} changes${trigger.value === undefined ? "" : ` to ${formatValue(trigger.value)}`}`;
    case "member_contributed": {
      const channel = trigger.channelId ? names.channels?.find((item) => item.id === trigger.channelId)?.name : null;
      return trigger.channelId ? `When they post in #${channel ?? "a channel"}` : "When they post anywhere";
    }
    case "pod_member_added": {
      const pod = trigger.channelId ? names.channels?.find((item) => item.id === trigger.channelId)?.name : null;
      return trigger.channelId ? `When they're added to ${pod ? `the ${quote(pod, 50)} pod` : "a pod"}` : "When they're added to any pod";
    }
    case "milestone_elapsed":
      if (trigger.delayMinutes === 0 && !trigger.nudge) return "When they reach this stage";
      return trigger.nudge ? `If they're still here after ${workflowDurationLabel(trigger.delayMinutes)}` : `${workflowDurationLabel(trigger.delayMinutes)} after they reach this stage`;
    case "previous_action_completed":
      return trigger.delayMinutes ? `${workflowDurationLabel(trigger.delayMinutes)} later` : "Then";
  }
}

export function workflowActionPhrase(automation: CommunityMemberWorkflowAutomation, names: WorkflowStepNames): string {
  const action = automation.action;
  switch (action.type) {
    case "create_service_channel": return "open a private guide channel";
    case "request_form": return `send the ${formName(action.formKey, names)} form`;
    case "prompt_agent": return action.prompt.trim() ? `ask the agent: ${quote(action.prompt)}` : "ask the agent (no instructions yet)";
    case "set_client_property": return `set ${propertyName(action.propertyKey, names)} to ${formatValue(action.value)}`;
    case "send_email": return action.subject.trim() ? `email them: ${quote(action.subject)}` : "email them (no subject yet)";
    case "set_pod_member": {
      const pod = names.channels?.find((item) => item.id === action.channelId)?.name;
      return `${action.active ? "add them to" : "take them out of"} ${pod ? `the ${quote(pod, 50)} pod` : "a pod"}`;
    }
  }
}

/** The rules in the order they run, each followed by the steps that wait for it. */
export function workflowStepLines(automations: CommunityMemberWorkflowAutomation[], names: WorkflowStepNames): WorkflowStepLine[] {
  const actionKeys = new Set(automations.map((automation) => automation.action.key));
  const children = new Map<string, CommunityMemberWorkflowAutomation[]>();
  const roots: CommunityMemberWorkflowAutomation[] = [];
  for (const automation of automations) {
    const parent = automation.trigger.type === "previous_action_completed" ? automation.trigger.predecessorActionKey : null;
    if (parent && actionKeys.has(parent) && parent !== automation.action.key) {
      children.set(parent, [...(children.get(parent) ?? []), automation]);
    } else roots.push(automation);
  }
  const lines: WorkflowStepLine[] = [];
  const seen = new Set<string>();
  const visit = (automation: CommunityMemberWorkflowAutomation, depth: number) => {
    if (seen.has(automation.key || automation.action.key)) return;
    seen.add(automation.key || automation.action.key);
    const lead = workflowTriggerPhrase(automation, names);
    const condition = workflowConditionPhrase(automation.condition, names);
    const action = workflowActionPhrase(automation, names);
    // "Then send…" reads straight on; every other lead takes a comma.
    const rest = `${condition ? `, ${condition},` : lead === "Then" ? "" : ","} ${action}${action.endsWith("”") ? "" : "."}`;
    lines.push({ automation, depth, lead, rest });
    for (const child of children.get(automation.action.key) ?? []) visit(child, depth + 1);
  };
  roots.forEach((automation) => visit(automation, 0));
  return lines;
}
