import type { ReactNode } from "react";
import type { CommunityMemberWorkflowAutomation } from "../../../../shared/communityMemberWorkflow";
import { workflowDurationLabel, type WorkflowStepNames } from "./workflowStepSentences";
import "./workflowSubjectPills.css";

// Rules read as sentences with the subjects coloured, so "When [Member] submits
// [Welcome form] · Then [Agent] sends [Member] a message" can be followed at a
// glance. Pods share the
// teal of stages: both are places a member is in.

export type WorkflowPill = "member" | "agent" | "owner" | "stage" | "form" | "offer" | "field";
export type WorkflowSentencePart = string | { pill: WorkflowPill; text: string };

const member = { pill: "member", text: "Member" } as const;
const members = { pill: "member", text: "Member’s" } as const;

function named<T extends { name?: string; title?: string }>(items: T[] | null | undefined, match: (item: T) => boolean, fallback: string): string {
  const item = items?.find(match);
  return item?.name ?? item?.title ?? fallback;
}

export function workflowTriggerParts(rule: CommunityMemberWorkflowAutomation, names: WorkflowStepNames, stageName: string): WorkflowSentencePart[] {
  const trigger = rule.trigger;
  const stage = { pill: "stage" as const, text: stageName || "this stage" };
  const field = (key: string) => ({ pill: "field" as const, text: named(names.catalog?.properties, (item) => item.key === key, key || "a field") });
  switch (trigger.type) {
    case "member_joined": return [member, " joins"];
    case "form_submitted": return [member, " submits ", { pill: "form", text: named(names.forms, (item) => item.key === trigger.formKey, "a form") }];
    case "lesson_completed": return [member, ` finishes ${trigger.resourceId ? `“${named(names.catalog?.lessons, (item) => item.id === trigger.resourceId, "a lesson")}”` : "any lesson"}`];
    case "course_completed": {
      const course = trigger.moduleId ? names.catalog?.lessons?.find((item) => item.courseId === trigger.moduleId)?.course : null;
      return [member, ` finishes ${trigger.moduleId ? `the “${course ?? "selected"}” course` : "any course"}`];
    }
    case "track_completed": return [member, ` finishes ${trigger.trackKey ? `the “${named(names.catalog?.tracks, (item) => item.key === trigger.trackKey, "selected")}” track` : "any track"}`];
    case "offer_started":
    case "offer_ended": {
      const verb = trigger.type === "offer_started" ? " starts " : " leaves ";
      return trigger.offerKey ? [member, verb, { pill: "offer", text: named(names.catalog?.offers, (item) => item.key === trigger.offerKey, "an offer") }] : [member, `${verb}any offer`];
    }
    case "client_property_changed":
      return [members, " ", field(trigger.propertyKey), trigger.value === undefined ? " changes" : ` changes to ${String(trigger.value)}`];
    case "property_date": {
      const days = Math.abs(trigger.offsetDays);
      return [trigger.offsetDays === 0 ? "On " : `${days} day${days === 1 ? "" : "s"} ${trigger.offsetDays < 0 ? "before" : "after"} `, members, " ", field(trigger.propertyKey)];
    }
    case "pod_member_added":
      return trigger.channelId ? [member, " is added to ", { pill: "stage", text: named(names.channels, (item) => item.id === trigger.channelId, "a pod") }] : [member, " is added to any pod"];
    case "member_contributed":
      return [member, trigger.channelId ? ` posts in #${named(names.channels, (item) => item.id === trigger.channelId, "a channel")}` : " posts anywhere"];
    case "milestone_elapsed":
      if (trigger.nudge) return [member, " is still in ", stage, ` after ${workflowDurationLabel(trigger.delayMinutes)}`];
      return trigger.delayMinutes === 0 ? [member, " reaches ", stage] : [`${workflowDurationLabel(trigger.delayMinutes)} after `, member, " reaches ", stage];
    case "previous_action_completed":
      return [trigger.delayMinutes ? `${workflowDurationLabel(trigger.delayMinutes)} later` : "Then"];
  }
}

export function workflowActionParts(rule: CommunityMemberWorkflowAutomation, names: WorkflowStepNames): WorkflowSentencePart[] {
  const action = rule.action;
  switch (action.type) {
    case "prompt_agent": return [{ pill: "agent", text: "Agent" }, " sends ", member, " a message"];
    case "send_email": return ["Email ", member];
    case "request_form": return ["Send ", member, " ", { pill: "form", text: named(names.forms, (item) => item.key === action.formKey, "a form") }];
    case "set_client_property": {
      const value = action.value === null ? "empty" : Array.isArray(action.value) ? action.value.join(", ") : String(action.value);
      return ["Set ", members, " ", { pill: "field", text: named(names.catalog?.properties, (item) => item.key === action.propertyKey, action.propertyKey || "a field") }, ` to ${value}`];
    }
    case "set_pod_member": {
      const pod = { pill: "stage" as const, text: named(names.channels, (item) => item.id === action.channelId, "a pod") };
      return action.active ? ["Add ", member, " to ", pod] : ["Take ", member, " out of ", pod];
    }
    case "create_service_channel": return ["Create a personal pod for ", member];
  }
}

export function WorkflowSentence(props: { parts: WorkflowSentencePart[] }): ReactNode {
  return <>{props.parts.map((part, index) => typeof part === "string" ? <span key={index}>{part}</span>
    : <span key={index} className={`pn-pill pn-pill-${part.pill}`}>{part.text}</span>)}</>;
}

/** The same sentence as plain text, for titles and screen readers. */
export function workflowSentenceText(parts: WorkflowSentencePart[]): string {
  return parts.map((part) => typeof part === "string" ? part : part.text).join("");
}
