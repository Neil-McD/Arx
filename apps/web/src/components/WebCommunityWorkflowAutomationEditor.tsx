import { X } from "lucide-react";
import { useId, useState } from "react";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import { COMMUNITY_MEMBER_WORKFLOW_EMAIL_BODY_MAX_LENGTH, COMMUNITY_MEMBER_WORKFLOW_EMAIL_SUBJECT_MAX_LENGTH, COMMUNITY_MEMBER_WORKFLOW_PROMPT_MAX_LENGTH, WORKFLOW_AGENT_SEES_ALL, WORKFLOW_AGENT_SEES_MAX, WORKFLOW_CONDITION_MAX_CLAUSES, WORKFLOW_PROPERTY_DATE_MAX_OFFSET_DAYS, workflowConditionClauses, workflowRuleIsNudge, workflowRuleStartsOnArrival, type CommunityMemberWorkflowAutomation, type CommunityMemberWorkflowCondition, type CommunityMemberWorkflowConditionClause } from "../../../../shared/communityMemberWorkflow";
import { workflowActionPhrase, workflowDurationLabel } from "./workflowStepSentences";
import { WorkflowChannelPicker } from "./WorkflowChannelPicker";
import { applyWorkflowTriggerType, replaceWorkflowDraftAction, type WorkflowTriggerType, workflowAutomationIssue, workflowTriggerIssue, workflowChannelLabel, type WorkflowAutomationDraft } from "./workflowMilestoneDraft";

/** Lessons, courses and client properties a rule can name, loaded with the board. */
type WorkflowCatalogProperty = { key: string; name: string; type: string; options: string[] };
export type WorkflowCatalog = {
  lessons: Array<{ id: string; title: string; course: string; courseId: string }> | null;
  properties: WorkflowCatalogProperty[] | null;
  /** Roadmap tracks; missing until loaded. */
  tracks?: Array<{ key: string; title: string }> | null;
  /** Settings › Offers; missing until loaded. */
  offers?: Array<{ key: string; name: string }> | null;
  /** Members' personal pods, listed after the group pods. */
  guideChannelIds?: string[] | null;
};

type PropertyValue = string | number | boolean | string[] | null;

// The value a "Set client property" rule writes, edited the way the property holds it.
function PropertyValueField(props: { id: string; property: WorkflowCatalogProperty;
  value: PropertyValue; disabled: boolean; onChange: (value: PropertyValue) => void }) {
  const { property, value } = props;
  const label = `Value for ${property.name}`;
  if (property.type === "multi_select") {
    const picked = Array.isArray(value) ? value : [];
    return <fieldset className="workflow-automation-field workflow-property-values"><legend>Set {property.name} to</legend>
      {property.options.map((option) => <label key={option}><input type="checkbox" disabled={props.disabled} checked={picked.includes(option)}
        onChange={(event) => { const next = event.target.checked ? [...picked, option] : picked.filter((item) => item !== option); props.onChange(next.length ? next : null); }} /> {option}</label>)}
      <small className="workflow-field-hint">Pick none to clear it.</small>
    </fieldset>;
  }
  if (property.type === "select" || property.type === "checkbox") {
    const options = property.type === "checkbox" ? [["true", "Yes"], ["false", "No"]] : property.options.map((option) => [option, option]);
    return <label>Set {property.name} to<select aria-label={label} disabled={props.disabled} value={value === null ? "" : String(value)}
      onChange={(event) => props.onChange(event.target.value === "" ? null : property.type === "checkbox" ? event.target.value === "true" : event.target.value)}>
      <option value="">Clear it</option>{options.map(([raw, text]) => <option key={raw} value={raw}>{text}</option>)}</select></label>;
  }
  const inputType = property.type === "number" ? "number" : property.type === "date" ? "date" : property.type === "url" ? "url" : "text";
  return <label>Set {property.name} to<input id={props.id} type={inputType} aria-label={label} disabled={props.disabled}
    value={value === null ? "" : String(value)} placeholder="Leave empty to clear it"
    onChange={(event) => props.onChange(event.target.value === "" ? null : property.type === "number" ? event.target.valueAsNumber : event.target.value)} /></label>;
}

type ConditionClause = CommunityMemberWorkflowConditionClause;

// One "<property> <is/isn't/is filled in/is empty> <value>" row of an Only if.
function ConditionClauseRow(props: { id: string; clause: ConditionClause; properties: WorkflowCatalogProperty[];
  disabled: boolean; onChange: (clause: ConditionClause) => void; onRemove?: () => void }) {
  const { clause, properties } = props;
  const property = properties.find((item) => item.key === clause.propertyKey);
  const needsValue = clause.op === "is" || clause.op === "is_not";
  const options = property?.type === "checkbox" ? [["true", "Yes"], ["false", "No"]]
    : property && (property.type === "select" || property.type === "multi_select") ? property.options.map((option) => [option, option]) : null;
  const setValue = (raw: string) => props.onChange({ ...clause, value: property?.type === "checkbox" ? raw === "true" : property?.type === "number" && raw !== "" ? Number(raw) : raw });
  return <div className="workflow-action-choice-row workflow-condition-row">
    <select aria-label="Member property" value={clause.propertyKey} disabled={props.disabled}
      onChange={(event) => props.onChange({ propertyKey: event.target.value, op: clause.op === "is_empty" ? "is_empty" : "is_set" })}>
      {!property ? <option value={clause.propertyKey}>{clause.propertyKey} (archived)</option> : null}
      {properties.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
    </select>
    <select aria-label="Comparison" value={clause.op} disabled={props.disabled} onChange={(event) => {
      const op = event.target.value as ConditionClause["op"];
      props.onChange(op === "is" || op === "is_not" ? { propertyKey: clause.propertyKey, op, value: clause.value ?? (options?.[0] ? (property?.type === "checkbox" ? true : options[0][0]) : "") } : { propertyKey: clause.propertyKey, op });
    }}>
      <option value="is">is</option><option value="is_not">isn't</option><option value="is_set">is filled in</option><option value="is_empty">is empty</option>
    </select>
    {needsValue ? options
      ? <select aria-label="Value" value={String(clause.value ?? "")} disabled={props.disabled} onChange={(event) => setValue(event.target.value)}>
          {options.map(([raw, text]) => <option key={raw} value={raw}>{text}</option>)}</select>
      : <input id={`${props.id}-condition-value`} aria-label="Value" type={property?.type === "number" ? "number" : "text"} value={String(clause.value ?? "")}
          disabled={props.disabled} onChange={(event) => setValue(event.target.value)} /> : null}
    {props.onRemove ? <button type="button" className="workflow-condition-remove" aria-label="Remove this condition" disabled={props.disabled}
      onClick={props.onRemove}>×</button> : null}
  </div>;
}

// "Only if": the step runs when the member's client properties match (all or any
// of up to four), else it's skipped. An Otherwise step runs when they don't.
function ConditionField(props: { id: string; condition: CommunityMemberWorkflowCondition | undefined;
  properties: WorkflowCatalogProperty[] | null | undefined; disabled: boolean;
  onChange: (condition: CommunityMemberWorkflowCondition | undefined) => void }) {
  const { condition } = props;
  const properties = props.properties ?? [];
  if (!condition) {
    return <div className="workflow-automation-field workflow-step-extra">
      <button type="button" className="workflow-step-extra-add" disabled={props.disabled || !properties.length}
        onClick={() => properties[0] && props.onChange({ propertyKey: properties[0].key, op: "is_set" })}>+ Only if…</button>
      <small className="workflow-field-hint">{properties.length ? "Run this step only for some members, by a member property." : "Add a member property in Members to run steps only for some members."}</small>
    </div>;
  }
  const clauses = workflowConditionClauses(condition);
  const match = condition.match ?? "all";
  const set = (next: ConditionClause[], nextMatch = match) => {
    const [first, ...also] = next;
    if (!first) { props.onChange(undefined); return; }
    props.onChange({ ...first, ...(also.length ? { also, match: nextMatch } : {}), ...(condition.otherwise ? { otherwise: true } : {}) });
  };
  return <fieldset className="workflow-agent-inputs">
    <legend className="workflow-agent-inputs-title">{condition.otherwise ? "Otherwise" : "Only if"}</legend>
    {condition.otherwise ? <p className="workflow-field-hint">Runs for members who don't match this:</p> : null}
    {clauses.map((clause, index) => <div key={index} className="workflow-condition-clause">
      {index === 0 ? null : index === 1
        ? <select aria-label="Match all or any" className="workflow-condition-join" value={match} disabled={props.disabled}
            onChange={(event) => set(clauses, event.target.value as "all" | "any")}>
            <option value="all">and</option><option value="any">or</option></select>
        : <span className="workflow-condition-join">{match === "any" ? "or" : "and"}</span>}
      <ConditionClauseRow id={`${props.id}-${index}`} clause={clause} properties={properties} disabled={props.disabled}
        onChange={(next) => set(clauses.map((item, i) => i === index ? next : item))}
        onRemove={clauses.length > 1 ? () => set(clauses.filter((_, i) => i !== index)) : undefined} />
    </div>)}
    {clauses.length < WORKFLOW_CONDITION_MAX_CLAUSES ? <button type="button" className="workflow-step-extra-add" disabled={props.disabled || !properties.length}
      onClick={() => properties[0] && set([...clauses, { propertyKey: properties[0].key, op: "is_set" }])}>+ Add a condition</button> : null}
    <small className="workflow-field-hint">{condition.otherwise ? "Members who do match skip this step and every step after it."
      : "Members who don't match skip this step and every step after it."}</small>
    <button type="button" className="workflow-agent-inputs-reset" disabled={props.disabled} onClick={() => props.onChange(undefined)}>Run for everyone</button>
  </fieldset>;
}

// "What the agent sees" on an Ask-the-agent step. Unset keeps today's bundle;
// once the owner picks, only the ticked inputs reach the agent.
function AgentInputsField(props: { id: string; sees: string[] | undefined; catalog?: WorkflowCatalog;
  forms?: Array<{ key: string; name: string }>; disabled: boolean; onChange: (sees: string[] | undefined) => void }) {
  const { sees } = props;
  if (!sees) {
    return <div className="workflow-agent-inputs">
      <span className="workflow-agent-inputs-title">What the agent sees</span>
      <p className="workflow-field-hint">Facts about the member and the form that started this step.</p>
      <div className="workflow-action-choice-row">
        <button type="button" className="secondary" disabled={props.disabled} onClick={() => props.onChange([WORKFLOW_AGENT_SEES_ALL])}>Use all their data</button>
        <button type="button" className="secondary" disabled={props.disabled} onClick={() => props.onChange(["facts"])}>Choose what it sees</button>
      </div>
    </div>;
  }
  const all = sees.includes(WORKFLOW_AGENT_SEES_ALL);
  const full = sees.length >= WORKFLOW_AGENT_SEES_MAX;
  const toggle = (entry: string, on: boolean) => props.onChange(on ? [...sees, entry] : sees.filter((item) => item !== entry));
  const box = (entry: string, label: string, hint?: string) => {
    const checked = sees.includes(entry);
    return <label key={entry} className="workflow-agent-input">
      <input type="checkbox" checked={checked} disabled={props.disabled || (full && !checked)} onChange={(event) => toggle(entry, event.target.checked)} />
      <span>{label}{hint ? <small>{hint}</small> : null}</span>
    </label>;
  };
  const lessons = props.catalog?.lessons ?? [];
  const pickedLessons = sees.filter((entry) => entry.startsWith("lesson:")).map((entry) => entry.slice(7));
  return <fieldset className="workflow-agent-inputs" aria-describedby={`${props.id}-inputs-help`}>
    <legend className="workflow-agent-inputs-title">What the agent sees</legend>
    <div className="workflow-agent-input-group"><label className="workflow-agent-input">
      <input type="checkbox" checked={all} disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked
          ? [WORKFLOW_AGENT_SEES_ALL, ...sees.filter((entry) => entry.startsWith("lesson:"))]
          : ["facts", ...sees.filter((entry) => entry.startsWith("lesson:"))])} />
      <span>Everything about this member<small>Facts, course progress, guide channel, every form and every field on their record. New forms and fields are included automatically.</small></span>
    </label></div>
    {all ? null : <>
    <div className="workflow-agent-input-group">
      <span>About the member</span>
      {box("facts", "Facts about them", "What they shared that the community keeps")}
      {box("progress", "Course progress", "Lessons done and what comes next")}
      {box("guide_channel", "Guide channel", "The last 20 messages")}
    </div>
    {props.forms?.length ? <div className="workflow-agent-input-group"><span>Form answers</span>
      {props.forms.map((form) => box(`form:${form.key}`, form.name))}</div> : null}
    {props.catalog?.properties?.length ? <div className="workflow-agent-input-group"><span>Member properties</span>
      {props.catalog.properties.map((property) => box(`property:${property.key}`, property.name))}</div> : null}
    </>}
    <div className="workflow-agent-input-group"><span>Your content</span>
      {pickedLessons.map((lessonId) => box(`lesson:${lessonId}`, lessons.find((lesson) => lesson.id === lessonId)?.title ?? "Unavailable lesson"))}
      <select aria-label="Add a lesson the agent reads" value="" disabled={props.disabled || full || !lessons.length}
        onChange={(event) => event.target.value && toggle(`lesson:${event.target.value}`, true)}>
        <option value="">{lessons.length ? "Add a lesson it reads…" : "No published lessons yet"}</option>
        {lessons.filter((lesson) => !pickedLessons.includes(lesson.id)).map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.course} · {lesson.title}</option>)}
      </select>
    </div>
    <p className="workflow-field-hint" id={`${props.id}-inputs-help`}>
      The form that started this step is always included. The member can see anything the agent repeats, so only tick what you're happy for them to read.{full ? ` Up to ${WORKFLOW_AGENT_SEES_MAX} inputs.` : ""}
    </p>
    <button type="button" className="workflow-agent-inputs-reset" disabled={props.disabled} onClick={() => props.onChange(undefined)}>Use the default</button>
  </fieldset>;
}

type Props = {
  canAddJoin?: boolean;
  catalog?: WorkflowCatalog;
  /** The steps above this one; a step can follow any of them except a nudge. */
  earlierSteps?: CommunityMemberWorkflowAutomation[];
  forms?: Array<{ key: string; name: string }>;
  automation: WorkflowAutomationDraft;
  index: number;
  expanded: boolean;
  channels: CloudCommunityChannel[];
  channelsUnavailable: boolean;
  disabled: boolean;
  onToggle: () => void;
  onChange: (automation: WorkflowAutomationDraft) => void;
  onRemove: () => void;
  hideHeading?: boolean;
  /** The Automations panel picks trigger and action from its own lists. */
  hideTypeSelects?: boolean;
  creation?: {
    triggerSelected: boolean;
    actionSelected: boolean;
    onTriggerSelected: () => void;
    onActionSelected: () => void;
  };
};

export function WebCommunityWorkflowAutomationEditor(props: Props) {
  const id = useId();
  const { automation } = props;
  const isSequence = automation.trigger.type === "previous_action_completed";
  const earlierSteps = (props.earlierSteps ?? []).filter((step) => !workflowRuleIsNudge(step) && step.action.key !== automation.action.key);
  const stepNames = { forms: props.forms, channels: props.channels, catalog: props.catalog };
  const stepLabel = (step: CommunityMemberWorkflowAutomation) => { const text = workflowActionPhrase(step, stepNames); return text.charAt(0).toUpperCase() + text.slice(1); };
  const predecessorKey = automation.trigger.type === "previous_action_completed" ? automation.trigger.predecessorActionKey : "";
  const waitMinutes = automation.trigger.type === "previous_action_completed" ? automation.trigger.delayMinutes ?? 0 : 0;
  const [waitUnit, setWaitUnit] = useState(waitMinutes && waitMinutes % 1440 === 0 ? 1440 : waitMinutes && waitMinutes % 60 === 0 ? 60 : waitMinutes ? 1 : 1440);
  const setSequence = (key: string, delay: number) => props.onChange({ ...automation,
    trigger: { type: "previous_action_completed", predecessorActionKey: key, ...(delay > 0 ? { delayMinutes: delay } : {}) } });
  const isTimed = automation.trigger.type === "milestone_elapsed";
  const nudge = automation.trigger.type === "milestone_elapsed" && automation.trigger.nudge === true;
  const isArrival = workflowRuleStartsOnArrival(automation);
  const nudgeFlag = nudge ? { nudge: true } : {};
  const isForm = automation.trigger.type === "form_submitted";
  const isJoin = automation.trigger.type === "member_joined";
  const isLesson = automation.trigger.type === "lesson_completed";
  const isCourse = automation.trigger.type === "course_completed";
  const isTrack = automation.trigger.type === "track_completed";
  const isDate = automation.trigger.type === "property_date";
  const dateTrigger = automation.trigger.type === "property_date" ? automation.trigger : null;
  const dateProperties = (props.catalog?.properties ?? []).filter((item) => item.type === "date");
  const dateName = dateTrigger ? dateProperties.find((item) => item.key === dateTrigger.propertyKey)?.name ?? (dateTrigger.propertyKey || "a date field") : "";
  const setDate = (next: { propertyKey?: string; offsetDays?: number }) => dateTrigger && props.onChange({ ...automation,
    trigger: { ...dateTrigger, ...next } });
  const isRecord = automation.trigger.type === "client_property_changed";
  const recordKey = automation.trigger.type === "client_property_changed" ? automation.trigger.propertyKey : "";
  const recordValue = automation.trigger.type === "client_property_changed" ? automation.trigger.value : undefined;
  const recordProperty = props.catalog?.properties?.find((item) => item.key === recordKey);
  const recordOptions = recordProperty?.type === "checkbox" ? [["true", "Yes"], ["false", "No"]]
    : recordProperty && (recordProperty.type === "select" || recordProperty.type === "multi_select") ? recordProperty.options.map((option) => [option, option]) : null;
  const setRecord = (key: string, value?: string | number | boolean) => props.onChange({ ...automation,
    trigger: { type: "client_property_changed", propertyKey: key, ...(value === undefined || value === "" ? {} : { value }) } });
  const isOffer = automation.trigger.type === "offer_started" || automation.trigger.type === "offer_ended";
  // Pods are the invite-only channels; the general channel never is one. Members'
  // personal pods come after the group pods.
  const allPods = props.channels.filter((channel) => channel.access_mode === "restricted" && !channel.is_general);
  const isPersonal = (channel: { id: string }) => Boolean(props.catalog?.guideChannelIds?.includes(channel.id));
  const pods = [...allPods.filter((pod) => !isPersonal(pod)), ...allPods.filter(isPersonal)];
  const podOptions = <>{pods.filter((pod) => !isPersonal(pod)).map((pod) => <option key={pod.id} value={pod.id}>{pod.name}</option>)}
    {pods.some(isPersonal) ? <optgroup label="Personal pods">{pods.filter(isPersonal).map((pod) => <option key={pod.id} value={pod.id}>{pod.name}</option>)}</optgroup> : null}</>;
  const isPodTrigger = automation.trigger.type === "pod_member_added";
  const podTriggerId = automation.trigger.type === "pod_member_added" ? automation.trigger.channelId : undefined;
  const podName = (podId: string | undefined, any: string) => podId ? pods.find((pod) => pod.id === podId)?.name ?? "Unavailable pod" : any;
  const offers = props.catalog?.offers ?? [];
  const offerKey = automation.trigger.type === "offer_started" || automation.trigger.type === "offer_ended" ? automation.trigger.offerKey : undefined;
  const offerName = offerKey ? offers.find((offer) => offer.key === offerKey)?.name ?? (props.catalog?.offers ? "Unavailable offer" : "An offer") : "Any offer";
  const tracks = props.catalog?.tracks ?? [];
  const trackKey = automation.trigger.type === "track_completed" ? automation.trigger.trackKey : undefined;
  const trackName = trackKey ? tracks.find((track) => track.key === trackKey)?.title ?? (props.catalog?.tracks ? "Unavailable track" : "A track") : "Any track";
  const lessons = props.catalog?.lessons ?? [];
  const courses = [...new Map(lessons.map((lesson) => [lesson.courseId, lesson.course])).entries()];
  const lessonId = automation.trigger.type === "lesson_completed" ? automation.trigger.resourceId : undefined;
  const courseId = automation.trigger.type === "course_completed" ? automation.trigger.moduleId : undefined;
  const lessonName = lessonId ? lessons.find((lesson) => lesson.id === lessonId)?.title ?? (props.catalog?.lessons ? "Unavailable lesson" : "A lesson") : "Any lesson";
  const courseName = courseId ? courses.find(([id]) => id === courseId)?.[1] ?? (props.catalog?.lessons ? "Unavailable course" : "A course") : "Any course";
  const propertyKey = automation.action.type === "set_client_property" ? automation.action.propertyKey : "";
  const property = props.catalog?.properties?.find((item) => item.key === propertyKey);
  const delayMinutes = automation.trigger.type === "milestone_elapsed" ? automation.trigger.delayMinutes : 1440;
  const [timeUnit, setTimeUnit] = useState(delayMinutes % 1440 === 0 ? 1440 : delayMinutes % 60 === 0 ? 60 : 1);
  const channelId = automation.trigger.type === "member_contributed" ? automation.trigger.channelId : undefined;
  const durationLabel = `${delayMinutes / timeUnit} ${timeUnit === 1440 ? "day" : timeUnit === 60 ? "hour" : "minute"}${delayMinutes === timeUnit ? "" : "s"}`;
  const isPrompt = automation.action.type === "prompt_agent";
  const issue = workflowAutomationIssue(automation, props.channels, props.channelsUnavailable);
  const isPrivate = props.channels.some((channel) => channel.id === channelId && channel.access_mode === "restricted");
  const triggerSelected = !props.creation || props.creation.triggerSelected;
  const actionSelected = !props.creation || props.creation.actionSelected;
  const triggerIssue = triggerSelected ? workflowTriggerIssue(automation, props.channels, props.channelsUnavailable) : null;
  const triggerReady = triggerSelected && !triggerIssue;
  const triggerLabel = isSequence ? `${waitMinutes ? `${workflowDurationLabel(waitMinutes)} after` : "After"} ${(() => { const step = earlierSteps.find((item) => item.action.key === predecessorKey); return step ? `“${stepLabel(step).slice(0, 60)}”` : "an earlier step"; })()}` : isJoin ? "Member joins for the first time"
    : isPodTrigger ? `Added to a pod · ${podName(podTriggerId, "Any pod")}`
    : isRecord ? `Record changes · ${recordProperty?.name ?? (recordKey || "Choose a field")}`
    : isDate ? `Date in their record · ${dateName}`
    : isLesson ? `Lesson done · ${lessonName}` : isCourse ? `Course finished · ${courseName}` : isTrack ? `Track finished · ${trackName}` : isOffer ? `${automation.trigger.type === "offer_started" ? "Starts" : "Leaves"} an offer · ${offerName}` : automation.trigger.type === "form_submitted" ? `Form submitted · ${props.forms?.find(form => form.key === (automation.trigger.type === "form_submitted" ? automation.trigger.formKey : ""))?.name ?? "Choose a form"}` : isArrival ? "Reaches this stage" : isTimed ? nudge ? `Still here after ${durationLabel} · nudge` : `After ${durationLabel} in this stage` : `Posts or replies · ${workflowChannelLabel(channelId, props.channels, props.channelsUnavailable)}`;
  const actionLabel = automation.action.type === "set_client_property" ? `Set ${property?.name ?? (propertyKey || "a member property")}`
    : automation.action.type === "send_email" ? "Send an email"
    : automation.action.type === "set_pod_member" ? `${automation.action.active ? "Add to" : "Take out of"} ${podName(automation.action.channelId, "a pod")}`
    : automation.action.type === "create_service_channel" ? "Create a personal pod for this member" : isPrompt ? "Ask community agent" : automation.action.type === "request_form" ? "Request form" : triggerLabel;

  return (
    <div className="workflow-milestone-automation-row" data-automation-key={automation.key}>
      {!props.hideHeading ? <div className="workflow-automation-heading">
        <button type="button" className="workflow-automation-summary" data-workflow-rule-start aria-expanded={props.expanded}
          aria-controls={props.expanded ? `${id}-fields` : undefined} disabled={props.disabled} onClick={props.onToggle}>
          <span>
            <strong>{triggerLabel}</strong>
            <small>→ {actionLabel}</small>
            {issue ? <small className="workflow-automation-issue">{issue}</small> : null}
          </span>
        </button>
        <button type="button" className="workflow-milestone-remove-automation" aria-label={`Remove action ${props.index + 1}`}
          disabled={props.disabled} onClick={props.onRemove}><X size={16} aria-hidden="true" /></button>
      </div> : null}

      {props.expanded ? (
        <div className="workflow-milestone-automation-fields" id={`${id}-fields`}>
          {!props.hideTypeSelects ? <label>When
            <select value={triggerSelected ? automation.trigger.type : ""} disabled={props.disabled} onChange={event => {
              const next = applyWorkflowTriggerType(automation, event.target.value as WorkflowTriggerType, earlierSteps, props.catalog?.properties ?? []);
              if (!next) return;
              if (next.trigger.type === "milestone_elapsed") setTimeUnit(1440);
              props.onChange(next);
              props.creation?.onTriggerSelected();
            }}>
              <option value="" disabled>Choose a trigger</option>
              <option value="previous_action_completed" disabled={!earlierSteps.length && !isSequence}>After an earlier step</option>
              <option value="member_contributed">Member posts or replies</option>
              <option value="milestone_elapsed">Time in stage</option>
              {(props.canAddJoin || isJoin) ? <option value="member_joined">Member joins</option> : null}
              <option value="form_submitted">Form submitted</option>
              <option value="lesson_completed">Lesson done</option>
              <option value="course_completed">Course finished</option>
              <option value="track_completed">Roadmap track finished</option>
              <option value="client_property_changed">Member record changes</option>
              <option value="property_date">A date in their record</option>
              <option value="offer_started">Starts an offer</option>
              <option value="offer_ended">Leaves an offer</option>
            </select>
          </label> : null}
          {triggerSelected ? <>
          {isSequence ? <>
            <label>After this step
              <select value={earlierSteps.some((step) => step.action.key === predecessorKey) ? predecessorKey : ""} disabled={props.disabled}
                onChange={(event) => setSequence(event.target.value, waitMinutes)}>
                <option value="" disabled>{earlierSteps.length ? "Choose an earlier step" : "Add a step above this one first"}</option>
                {earlierSteps.map((step) => <option key={step.action.key} value={step.action.key}>{stepLabel(step)}</option>)}
              </select>
              <small>Starts once that step has finished.</small>
            </label>
            <div className="workflow-automation-field">
              <label htmlFor={`${id}-wait`}>Wait first</label>
              <div className="workflow-action-choice-row">
                <input id={`${id}-wait`} type="number" min={0} max={Math.floor(525600 / waitUnit)} step={1} value={waitMinutes / waitUnit} disabled={props.disabled}
                  onChange={(event) => setSequence(predecessorKey, Math.max(0, Math.round((Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0) * waitUnit)))} />
                <select aria-label="Wait unit" value={waitUnit} disabled={props.disabled} onChange={(event) => {
                  const unit = Number(event.target.value);
                  setWaitUnit(unit);
                  setSequence(predecessorKey, waitMinutes / waitUnit * unit);
                }}><option value={1}>minutes</option><option value={60}>hours</option><option value={1440}>days</option></select>
              </div>
              <small className="workflow-field-hint">{waitMinutes ? `Runs ${workflowDurationLabel(waitMinutes)} after that step finishes.` : "0 starts it straight away."}</small>
            </div>
          </> : isJoin ? null
            : isDate && dateTrigger ? <div className="workflow-automation-field">
              <label>Date field<select value={dateTrigger.propertyKey} disabled={props.disabled} onChange={(event) => setDate({ propertyKey: event.target.value })}>
                {!dateTrigger.propertyKey ? <option value="" disabled>{dateProperties.length ? "Choose a date field" : "No date fields yet"}</option> : null}
                {dateTrigger.propertyKey && !dateProperties.some((item) => item.key === dateTrigger.propertyKey) ? <option value={dateTrigger.propertyKey}>{dateName} (archived)</option> : null}
                {dateProperties.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
              </select></label>
              <div className="workflow-action-choice-row">
                <input type="number" min={0} max={WORKFLOW_PROPERTY_DATE_MAX_OFFSET_DAYS} step={1} aria-label="Days" disabled={props.disabled || dateTrigger.offsetDays === 0}
                  value={Math.abs(dateTrigger.offsetDays) || ""} placeholder="0"
                  onChange={(event) => { const days = Math.min(WORKFLOW_PROPERTY_DATE_MAX_OFFSET_DAYS, Math.max(1, Math.round(event.target.valueAsNumber || 1))); setDate({ offsetDays: dateTrigger.offsetDays < 0 ? -days : days }); }} />
                <select aria-label="Before, on or after" value={dateTrigger.offsetDays < 0 ? "before" : dateTrigger.offsetDays > 0 ? "after" : "on"} disabled={props.disabled}
                  onChange={(event) => { const days = Math.abs(dateTrigger.offsetDays) || 1; setDate({ offsetDays: event.target.value === "on" ? 0 : event.target.value === "before" ? -days : days }); }}>
                  <option value="before">days before</option><option value="on">on the day</option><option value="after">days after</option>
                </select>
              </div>
              <small className="workflow-field-hint">{dateProperties.length ? "Runs at 9:00 UTC that day, once per date, for members in this stage. Dates that have already passed don't run. It never holds them in this stage."
                : "Add a date field to the member record under Members first, like Renewal."}</small>
            </div>
            : isRecord ? <div className="workflow-automation-field">
              <label>Field<select value={recordKey} disabled={props.disabled} onChange={(event) => setRecord(event.target.value)}>
                {!recordKey ? <option value="" disabled>Choose a field</option> : null}
                {recordKey && !recordProperty ? <option value={recordKey}>{recordKey} (archived)</option> : null}
                {(props.catalog?.properties ?? []).map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
              </select></label>
              <label>Changes to{recordOptions
                ? <select value={recordValue === undefined ? "" : String(recordValue)} disabled={props.disabled || !recordKey}
                    onChange={(event) => setRecord(recordKey, recordProperty?.type === "checkbox" && event.target.value ? event.target.value === "true" : event.target.value)}>
                    <option value="">Any new value</option>
                    {recordOptions.map(([raw, text]) => <option key={raw} value={raw}>{text}</option>)}</select>
                : <input type={recordProperty?.type === "number" ? "number" : "text"} value={recordValue === undefined ? "" : String(recordValue)} placeholder="Any new value"
                    disabled={props.disabled || !recordKey} onChange={(event) => setRecord(recordKey, recordProperty?.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)} />}</label>
              <small className="workflow-field-hint">Runs when you, the member, a form or an agent changes it. A Workflow step's own change doesn't count, so automations can't loop. It never holds them in this stage.</small>
            </div>
            : isLesson ? <label>Lesson<select value={lessonId ?? ""} disabled={props.disabled} onChange={e => props.onChange({ ...automation, trigger: { type: "lesson_completed", ...(e.target.value ? { resourceId: e.target.value } : {}) } })}>
                <option value="">Any lesson</option>
                {lessonId && !lessons.some((lesson) => lesson.id === lessonId) ? <option value={lessonId}>{lessonName}</option> : null}
                {courses.map(([id, name]) => <optgroup key={id} label={name || "Lessons"}>{lessons.filter((lesson) => lesson.courseId === id).map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</optgroup>)}
              </select><small>Runs once when the member marks this lesson done{lessonId ? "" : " (any published lesson)"}.</small></label>
            : isCourse ? <label>Course<select value={courseId ?? ""} disabled={props.disabled} onChange={e => props.onChange({ ...automation, trigger: { type: "course_completed", ...(e.target.value ? { moduleId: e.target.value } : {}) } })}>
                <option value="">Any course</option>
                {courseId && !courses.some(([id]) => id === courseId) ? <option value={courseId}>{courseName}</option> : null}
                {courses.map(([id, name]) => <option key={id} value={id}>{name || "Untitled course"}</option>)}
              </select><small>Runs once when the member has every lesson in the course done.</small></label>
            : isTrack ? <label>Track<select value={trackKey ?? ""} disabled={props.disabled} onChange={e => props.onChange({ ...automation, trigger: { type: "track_completed", ...(e.target.value ? { trackKey: e.target.value } : {}) } })}>
                <option value="">Any track</option>
                {trackKey && !tracks.some((track) => track.key === trackKey) ? <option value={trackKey}>{trackName}</option> : null}
                {tracks.map((track) => <option key={track.key} value={track.key}>{track.title}</option>)}
              </select><small>Runs once when the member has every step of this Roadmap track done.</small></label>
            : isOffer ? <label>Offer<select value={offerKey ?? ""} disabled={props.disabled} onChange={e => props.onChange({ ...automation, trigger: { type: automation.trigger.type as "offer_started" | "offer_ended", ...(e.target.value ? { offerKey: e.target.value } : {}) } })}>
                <option value="">Any offer</option>
                {offerKey && !offers.some((offer) => offer.key === offerKey) ? <option value={offerKey}>{offerName}</option> : null}
                {offers.map((offer) => <option key={offer.key} value={offer.key}>{offer.name}</option>)}
              </select><small>{automation.trigger.type === "offer_started"
                ? "Runs when they join on this offer or upgrade to it. It never holds anyone's stage."
                : "Runs when they move down from this offer or their paid time on it ends. It never holds anyone's stage."}</small></label>
            : isPodTrigger ? <label>Pod<select value={podTriggerId ?? ""} disabled={props.disabled}
                onChange={e => props.onChange({ ...automation, trigger: { type: "pod_member_added", ...(e.target.value ? { channelId: e.target.value } : {}) } })}>
                <option value="">Any pod</option>
                {podTriggerId && !pods.some((pod) => pod.id === podTriggerId) ? <option value={podTriggerId}>Unavailable pod</option> : null}
                {podOptions}
              </select><small>Runs when you, an admin, an agent or an offer adds them. A pod step in a workflow never sets it off. It never holds anyone's stage.</small></label>
            : automation.trigger.type === "form_submitted" ? <label>Form<select value={automation.trigger.formKey} disabled={props.disabled} onChange={e => props.onChange({ ...automation, trigger: { type: "form_submitted", formKey: e.target.value } })}><option value="">Choose a published form</option>{props.forms?.map(f => <option key={f.key} value={f.key}>{f.name}</option>)}</select></label> : isArrival ? <div className="workflow-automation-field">
            <small className="workflow-field-hint">Runs the moment someone reaches this stage, once per visit. To wait first, pick "After some time in this stage".</small>
          </div> : isTimed ? <div className="workflow-automation-field">
            <label htmlFor={`${id}-duration`}>After</label>
            <div className="workflow-action-choice-row">
              <input id={`${id}-duration`} type="number" min={1} max={Math.floor(525600 / timeUnit)} step={1}
                value={Number.isFinite(delayMinutes) ? delayMinutes / timeUnit : ""} disabled={props.disabled}
                onChange={event => props.onChange({ ...automation, trigger: { type: "milestone_elapsed", delayMinutes: event.target.valueAsNumber * timeUnit, ...nudgeFlag } })} />
              <select aria-label="Duration unit" value={timeUnit} disabled={props.disabled} onChange={event => {
                const unit = Number(event.target.value);
                setTimeUnit(unit);
                props.onChange({ ...automation, trigger: { type: "milestone_elapsed", delayMinutes: delayMinutes / timeUnit * unit, ...nudgeFlag } });
              }}><option value={1}>minutes</option><option value={60}>hours</option><option value={1440}>days</option></select>
            </div>
            <label className="workflow-nudge-toggle">
              <input type="checkbox" checked={nudge} disabled={props.disabled || !isPrompt}
                onChange={event => props.onChange({ ...automation, trigger: { type: "milestone_elapsed", delayMinutes, ...(event.target.checked ? { nudge: true } : {}) } })} />
              <span>Only a nudge<small>Runs only if they're still in this stage then, and doesn't hold them here: they can move on before it fires.{isPrompt ? "" : " Needs Ask community agent."}</small></span>
            </label>
            <small className="workflow-field-hint">Applies to future stage entries. Runs once, at or after the due time. Activity does not reset the timer. Duration edits update pending timers.</small>
          </div> : (
          <div className="workflow-automation-field">
            <span>When a member posts or replies in</span>
            <WorkflowChannelPicker channels={props.channels} channelId={channelId}
              unavailable={props.channelsUnavailable} disabled={props.disabled} label={`Channel for automation ${props.index + 1}`}
              onChange={(channelId) => props.onChange({ ...automation, trigger: { type: "member_contributed", ...(channelId ? { channelId } : {}) } })} />
            {channelId !== undefined && issue && issue !== "Add agent instructions" ? <small className="workflow-field-hint" role="status">{issue}. This rule will not be saved as Any channel.</small> : null}
          </div>
          )}

          </> : null}
          {triggerReady && !props.hideTypeSelects ? <label>Then
            <select value={actionSelected ? automation.action.type : ""} disabled={props.disabled} onChange={event => {
              const type = event.target.value;
              if (type !== "create_service_channel" && type !== "prompt_agent" && type !== "request_form" && type !== "set_client_property" && type !== "send_email" && type !== "set_pod_member") return;
              props.onChange(replaceWorkflowDraftAction(automation, type));
              props.creation?.onActionSelected();
            }}>
              <option value="" disabled>Choose an action</option>
              {isJoin ? <option value="create_service_channel">Create a personal pod for this member</option> : <option value="prompt_agent">Ask community agent</option>}
              {!isForm ? <option value="request_form">Request form</option> : null}
              {!isJoin ? <option value="send_email">Send an email</option> : null}
              {!isJoin ? <option value="set_client_property">Set member property</option> : null}
              {!isJoin ? <option value="set_pod_member">Add to or take out of a pod</option> : null}
            </select>
          </label> : null}

          {triggerReady && actionSelected ? <>
          {isJoin ? <p className="workflow-field-hint">Applies only to future first-time members. Each join action runs independently; no automatic message or stage movement.</p> : null}
          {automation.action.type === "set_client_property" ? <>
            <label>Member property<select value={propertyKey} disabled={props.disabled || !props.catalog?.properties}
              onChange={e => props.onChange({ ...automation, action: { key: automation.action.key, type: "set_client_property", propertyKey: e.target.value, value: null } })}>
              <option value="">{props.catalog?.properties ? (props.catalog.properties.length ? "Choose a property" : "No member properties yet") : "Loading properties…"}</option>
              {propertyKey && !property && props.catalog?.properties ? <option value={propertyKey}>{propertyKey} (archived)</option> : null}
              {(props.catalog?.properties ?? []).map(item => <option key={item.key} value={item.key}>{item.name}</option>)}
            </select></label>
            {property && automation.action.type === "set_client_property" ? <PropertyValueField id={`${id}-property-value`} property={property} value={automation.action.value}
              disabled={props.disabled} onChange={(value) => props.onChange({ ...automation, action: { key: automation.action.key, type: "set_client_property", propertyKey, value } })} /> : null}
            <p className="workflow-field-hint">Writes this value on the member's member record. You'll see it in the client's timeline as set by Workflow.</p>
          </> : automation.action.type === "set_pod_member" ? <>
            <label>Pod<select value={automation.action.channelId} disabled={props.disabled}
              onChange={e => props.onChange({ ...automation, action: { ...(automation.action as Extract<typeof automation.action, { type: "set_pod_member" }>), channelId: e.target.value } })}>
              <option value="">{pods.length ? "Choose a pod" : "No pods yet"}</option>
              {automation.action.channelId && !pods.some((pod) => pod.id === (automation.action as { channelId: string }).channelId) ? <option value={automation.action.channelId}>Unavailable pod</option> : null}
              {podOptions}
            </select></label>
            <label>What happens<select value={automation.action.active ? "add" : "remove"} disabled={props.disabled}
              onChange={e => props.onChange({ ...automation, action: { ...(automation.action as Extract<typeof automation.action, { type: "set_pod_member" }>), active: e.target.value === "add" } })}>
              <option value="add">Add them to the pod</option>
              <option value="remove">Take them out of the pod</option>
            </select></label>
            <p className="workflow-field-hint">Pods are your invite-only channels. Adding them lets them read and post there and see its calls.</p>
          </> : automation.action.type === "send_email" ? <>
            <label>Subject
              <input value={automation.action.subject} maxLength={COMMUNITY_MEMBER_WORKFLOW_EMAIL_SUBJECT_MAX_LENGTH} disabled={props.disabled}
                placeholder="Welcome to {community}, {first_name}"
                onChange={(event) => props.onChange({ ...automation, action: { ...(automation.action as Extract<typeof automation.action, { type: "send_email" }>), subject: event.target.value } })} />
            </label>
            <label><span id={`${id}-email-label`}>Message</span>
              <textarea rows={7} maxLength={COMMUNITY_MEMBER_WORKFLOW_EMAIL_BODY_MAX_LENGTH} value={automation.action.body} disabled={props.disabled}
                aria-labelledby={`${id}-email-label`} aria-describedby={`${id}-email-help`} placeholder={"Hi {first_name},\n\nWrite what they should read in their inbox."}
                onChange={(event) => props.onChange({ ...automation, action: { ...(automation.action as Extract<typeof automation.action, { type: "send_email" }>), body: event.target.value } })} />
            </label>
            <p className="workflow-field-hint" id={`${id}-email-help`}>{"{first_name}"}, {"{name}"} and {"{community}"} fill in for each member.
              Every email has an unsubscribe link, and a test member's copy comes to you.</p>
          </> : automation.action.type === "create_service_channel" ? <p className="workflow-field-hint">Creates a personal pod with just them, you and the agent.</p> : automation.action.type === "request_form" ? <label>Form<select value={automation.action.formKey} disabled={props.disabled} onChange={e => props.onChange({ ...automation, action: { key: automation.action.key, type: "request_form", formKey: e.target.value } })}><option value="">Choose a published form</option>{props.forms?.map(f => <option key={f.key} value={f.key}>{f.name}</option>)}</select><small>Shown privately in the member’s community sidebar. No channel is required. One request per rule and stage visit.</small></label> : automation.action.type === "prompt_agent" ? (
            <>
              <label>
                <span id={`${id}-prompt-label`}>Agent instructions</span>
                <textarea rows={4} maxLength={COMMUNITY_MEMBER_WORKFLOW_PROMPT_MAX_LENGTH} value={automation.action.prompt}
                  disabled={props.disabled} aria-labelledby={`${id}-prompt-label`} aria-describedby={`${id}-prompt-help`}
                  placeholder="What should the community agent do for this member?"
                  onChange={(event) => props.onChange({ ...automation, action: { ...(automation.action as Extract<typeof automation.action, { type: "prompt_agent" }>), prompt: event.target.value } })} />
              </label>
              <p className="workflow-field-hint" id={`${id}-prompt-help`}>
                {automation.action.prompt.trim() ? "" : "Add instructions to save. "}
                {isForm ? "Uses the submitted answers and responds once in the member’s personal pod. Only the member and community managers may have access. Submission stays saved if delivery is unavailable."
                  : isSequence ? "Starts after the preceding action completes and responds in the member’s personal pod. The next action waits until this response is delivered. No additional tool actions."
                  : isLesson || isCourse ? "Starts once when they finish it and replies in the member’s private guide channel."
                  : isRecord ? "Starts when their record changes and replies in the member’s private guide channel."
                  : isDate ? "Starts on that day and replies in the member’s private guide channel."
                  : isTimed ? "Delivered once to the member’s assigned service channel. Uses these instructions and community context, without private dossier data or additional tool actions. No delivery if the channel is unavailable."
                  : "The community agent uses this member’s community context and replies in the triggering thread."}
                {!isSequence && !isTimed && !isForm && !isLesson && !isCourse && !isRecord && !isDate && (isPrivate || channelId === undefined) ? " In private channels, the agent must be invited." : ""}
              </p>
              <AgentInputsField id={id} sees={automation.action.sees} catalog={props.catalog} forms={props.forms} disabled={props.disabled}
                onChange={(sees) => {
                  const { sees: _previous, ...rest } = automation.action as Extract<typeof automation.action, { type: "prompt_agent" }>;
                  props.onChange({ ...automation, action: sees ? { ...rest, sees } : rest });
                }} />
            </>
          ) : null}
          <ConditionField id={id} condition={automation.condition} properties={props.catalog?.properties} disabled={props.disabled}
            onChange={(condition) => { const { condition: _previous, ...rest } = automation; props.onChange(condition ? { ...rest, condition } : rest); }} />
          </> : null}
          {props.hideHeading && (triggerIssue || (actionSelected && issue)) ? <p role="status" className="workflow-automation-issue">{triggerIssue || issue}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
