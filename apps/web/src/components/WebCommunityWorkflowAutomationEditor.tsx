import { X } from "lucide-react";
import { useId, useState } from "react";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import { COMMUNITY_MEMBER_WORKFLOW_PROMPT_MAX_LENGTH } from "../../../../shared/communityMemberWorkflow";
import { WorkflowChannelPicker } from "./WorkflowChannelPicker";
import { replaceWorkflowDraftAction, workflowAutomationIssue, workflowTriggerIssue, workflowChannelLabel, type WorkflowAutomationDraft } from "./workflowMilestoneDraft";

type Props = {
  canAddJoin?: boolean;
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
  const isTimed = automation.trigger.type === "milestone_elapsed";
  const isForm = automation.trigger.type === "form_submitted";
  const isJoin = automation.trigger.type === "member_joined";
  const delayMinutes = automation.trigger.type === "milestone_elapsed" ? automation.trigger.delayMinutes : 1440;
  const [timeUnit, setTimeUnit] = useState(delayMinutes % 1440 === 0 ? 1440 : delayMinutes % 60 === 0 ? 60 : 1);
  const channelId = automation.trigger.type === "member_contributed" ? automation.trigger.channelId : undefined;
  const durationLabel = `${delayMinutes / timeUnit} ${timeUnit === 1440 ? "day" : timeUnit === 60 ? "hour" : "minute"}${delayMinutes === timeUnit ? "" : "s"}`;
  const isPrompt = automation.action.type === "prompt_agent";
  const isRequirement = automation.action.type === "move_member";
  const issue = workflowAutomationIssue(automation, props.channels, props.channelsUnavailable);
  const isPrivate = props.channels.some((channel) => channel.id === channelId && channel.access_mode === "restricted");
  const triggerSelected = !props.creation || props.creation.triggerSelected;
  const actionSelected = !props.creation || props.creation.actionSelected;
  const triggerIssue = triggerSelected ? workflowTriggerIssue(automation, props.channels, props.channelsUnavailable) : null;
  const triggerReady = triggerSelected && !triggerIssue;
  const triggerLabel = isJoin ? "Member joins for the first time" : automation.trigger.type === "form_submitted" ? `Form submitted · ${props.forms?.find(form => form.key === (automation.trigger.type === "form_submitted" ? automation.trigger.formKey : ""))?.name ?? "Choose a form"}` : isTimed ? `After ${durationLabel} in this milestone` : `Posts or replies · ${workflowChannelLabel(channelId, props.channels, props.channelsUnavailable)}`;
  const actionLabel = automation.action.type === "evaluate_goal" ? "Evaluate goal" : automation.action.type === "create_service_channel" ? "Create private channel" : isPrompt ? "Ask community agent" : automation.action.type === "request_form" ? "Request form" : triggerLabel;

  return (
    <div className="workflow-milestone-automation-row" data-automation-key={automation.key}>
      {!props.hideHeading ? <div className="workflow-automation-heading">
        <button type="button" className="workflow-automation-summary" data-workflow-rule-start aria-expanded={props.expanded}
          aria-controls={props.expanded ? `${id}-fields` : undefined} disabled={props.disabled} onClick={props.onToggle}>
          <span>
            <strong>{triggerLabel}</strong>
            {!isRequirement ? <small>→ {actionLabel}</small> : null}
            {issue ? <small className="workflow-automation-issue">{issue}</small> : null}
          </span>
        </button>
        <button type="button" className="workflow-milestone-remove-automation" aria-label={`Remove ${isRequirement ? "condition" : "action"} ${props.index + 1}`}
          disabled={props.disabled} onClick={props.onRemove}><X size={16} aria-hidden="true" /></button>
      </div> : null}

      {props.expanded ? (
        <div className="workflow-milestone-automation-fields" id={`${id}-fields`}>
          <label>When
            <select value={triggerSelected ? automation.trigger.type : ""} disabled={props.disabled} onChange={event => {
              const type = event.target.value;
              if (type === "member_joined") {
                props.onChange({ ...replaceWorkflowDraftAction(automation, automation.action.type === "request_form" ? "request_form" : "create_service_channel"), trigger: { type } });
              } else if (type === "form_submitted") {
                props.onChange({ ...replaceWorkflowDraftAction(automation, isRequirement ? "move_member" : "prompt_agent"), trigger: { type, formKey: "" } });
              } else if (type === "member_contributed" || type === "milestone_elapsed") {
                setTimeUnit(1440);
                const action = automation.action.type === "create_service_channel" || automation.action.type === "evaluate_goal" ? "prompt_agent" : automation.action.type;
                props.onChange({ ...replaceWorkflowDraftAction(automation, action), trigger: type === "member_contributed" ? { type } : { type, delayMinutes: 1440 } });
              } else return;
              props.creation?.onTriggerSelected();
            }}>
              <option value="" disabled>Choose a trigger</option>
              <option value="member_contributed">Member posts or replies</option>
              <option value="milestone_elapsed">Time in milestone</option>
              {!isRequirement && (props.canAddJoin || isJoin) ? <option value="member_joined">Member joins</option> : null}
              <option value="form_submitted">Form submitted</option>
            </select>
          </label>
          {triggerSelected ? <>
          {isJoin ? null : automation.trigger.type === "form_submitted" ? <label>Form<select value={automation.trigger.formKey} disabled={props.disabled} onChange={e => props.onChange({ ...automation, trigger: { type: "form_submitted", formKey: e.target.value } })}><option value="">Choose a published form</option>{props.forms?.map(f => <option key={f.key} value={f.key}>{f.name}</option>)}</select></label> : isTimed ? <div className="workflow-automation-field">
            <label htmlFor={`${id}-duration`}>After</label>
            <div className="workflow-action-choice-row">
              <input id={`${id}-duration`} type="number" min={1} max={Math.floor(525600 / timeUnit)} step={1}
                value={Number.isFinite(delayMinutes) ? delayMinutes / timeUnit : ""} disabled={props.disabled}
                onChange={event => props.onChange({ ...automation, trigger: { type: "milestone_elapsed", delayMinutes: event.target.valueAsNumber * timeUnit } })} />
              <select aria-label="Duration unit" value={timeUnit} disabled={props.disabled} onChange={event => {
                const unit = Number(event.target.value);
                setTimeUnit(unit);
                props.onChange({ ...automation, trigger: { type: "milestone_elapsed", delayMinutes: delayMinutes / timeUnit * unit } });
              }}><option value={1}>minutes</option><option value={60}>hours</option><option value={1440}>days</option></select>
            </div>
            <small className="workflow-field-hint">Applies to future milestone entries. Runs once, at or after the due time. Activity does not reset the timer. Duration edits update pending timers.{isRequirement ? " Changing a satisfied time requirement clears its credit; consumed timers do not restart. Configure these before members enter." : ""}</small>
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
          {triggerReady && !isRequirement ? <label>Then
            <select value={actionSelected ? automation.action.type : ""} disabled={props.disabled} onChange={event => {
              const type = event.target.value;
              if (type !== "create_service_channel" && type !== "prompt_agent" && type !== "request_form" && type !== "evaluate_goal") return;
              props.onChange(replaceWorkflowDraftAction(automation, type));
              props.creation?.onActionSelected();
            }}>
              <option value="" disabled>Choose an action</option>
              {isJoin ? <option value="create_service_channel">Create private channel</option> : <option value="prompt_agent">Ask community agent</option>}
              {!isForm ? <option value="request_form">Request form</option> : <option value="evaluate_goal">Evaluate goal</option>}
            </select>
          </label> : null}

          {triggerReady && actionSelected ? <>
          {isJoin ? <p className="workflow-field-hint">Applies only to future first-time members. Each join action runs independently; no automatic message or milestone movement.</p> : null}
          {automation.action.type === "create_service_channel" ? <p className="workflow-field-hint">Creates a private service channel for the member, community managers, and community agent.</p> : automation.action.type === "request_form" ? <label>Form<select value={automation.action.formKey} disabled={props.disabled} onChange={e => props.onChange({ ...automation, action: { key: automation.action.key, type: "request_form", formKey: e.target.value } })}><option value="">Choose a published form</option>{props.forms?.map(f => <option key={f.key} value={f.key}>{f.name}</option>)}</select><small>Shown privately in the member’s community sidebar. No channel is required. One request per rule and milestone visit.</small></label> : automation.action.type === "prompt_agent" ? (
            <>
              <label>
                <span id={`${id}-prompt-label`}>Agent instructions</span>
                <textarea rows={4} maxLength={COMMUNITY_MEMBER_WORKFLOW_PROMPT_MAX_LENGTH} value={automation.action.prompt}
                  disabled={props.disabled} aria-labelledby={`${id}-prompt-label`} aria-describedby={`${id}-prompt-help`}
                  placeholder="What should the community agent do for this member?"
                  onChange={(event) => props.onChange({ ...automation, action: { key: automation.action.key, type: "prompt_agent", prompt: event.target.value } })} />
              </label>
              <p className="workflow-field-hint" id={`${id}-prompt-help`}>
                {automation.action.prompt.trim() ? "" : "Add instructions to save. "}
                {isForm ? "Uses the submitted answers and responds once in the member’s assigned private service channel. Only the member and community managers may have access. Submission stays saved if delivery is unavailable."
                  : isTimed ? "Delivered once to the member’s assigned service channel. Uses these instructions and community context, without private dossier data or additional tool actions. No delivery if the channel is unavailable."
                  : "The community agent uses this member’s community context and replies in the triggering thread."}
                {!isTimed && !isForm && (isPrivate || channelId === undefined) ? " In private channels, the agent must be invited." : ""}
              </p>
            </>
          ) : automation.action.type === "evaluate_goal" ? <p className="workflow-field-hint">Privately evaluates the goal from Overview using this submitted form. Records a judgment only; no message or milestone movement.</p> : null}
          </> : null}
          {props.hideHeading && (triggerIssue || (actionSelected && issue)) ? <p role="status" className="workflow-automation-issue">{triggerIssue || issue}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
