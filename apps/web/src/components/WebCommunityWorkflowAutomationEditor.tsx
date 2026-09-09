import { ChevronDown, X } from "lucide-react";
import { useId, useState } from "react";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import { COMMUNITY_MEMBER_WORKFLOW_PROMPT_MAX_LENGTH } from "../../../../shared/communityMemberWorkflow";
import { WorkflowChannelPicker } from "./WorkflowChannelPicker";
import { replaceWorkflowDraftAction, workflowAutomationIssue, workflowChannelLabel, type WorkflowAutomationDraft } from "./workflowMilestoneDraft";

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
  const triggerLabel = isJoin ? "Member joins for the first time" : automation.trigger.type === "form_submitted" ? `Form submitted · ${props.forms?.find(form => form.key === (automation.trigger.type === "form_submitted" ? automation.trigger.formKey : ""))?.name ?? "Choose a form"}` : isTimed ? `After ${durationLabel} in this milestone` : `Posts or replies · ${workflowChannelLabel(channelId, props.channels, props.channelsUnavailable)}`;
  const actionLabel = automation.action.type === "evaluate_goal" ? "Evaluate goal" : automation.action.type === "create_service_channel" ? "Create private channel" : isPrompt ? "Ask community agent" : automation.action.type === "request_form" ? "Request form" : triggerLabel;

  return (
    <div className="workflow-milestone-automation-row" data-automation-key={automation.key}>
      <div className="workflow-automation-heading">
        <button type="button" className="workflow-automation-summary" data-workflow-rule-start aria-expanded={props.expanded}
          aria-controls={props.expanded ? `${id}-fields` : undefined} disabled={props.disabled} onClick={props.onToggle}>
          <span>
            <strong>{actionLabel}</strong>
            {!isRequirement ? <small>{triggerLabel}</small> : null}
            {issue ? <small className="workflow-automation-issue">{issue}</small> : null}
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        <button type="button" className="workflow-milestone-remove-automation" aria-label={`Remove ${isRequirement ? "condition" : "action"} ${props.index + 1}`}
          disabled={props.disabled} onClick={props.onRemove}><X size={16} aria-hidden="true" /></button>
      </div>

      {props.expanded ? (
        <div className="workflow-milestone-automation-fields" id={`${id}-fields`}>
          <fieldset className="workflow-action-choices" disabled={props.disabled}>
            <legend>When</legend>
            <div className="workflow-action-choice-row">
              <label className="workflow-action-choice"><input type="radio" name={`${id}-trigger`} checked={!isTimed && !isForm && !isJoin}
                onChange={() => props.onChange({ ...replaceWorkflowDraftAction(automation, automation.action.type === "create_service_channel" ? "prompt_agent" : automation.action.type), trigger: { type: "member_contributed" } })} /><span>Member activity</span></label>
              <label className="workflow-action-choice"><input type="radio" name={`${id}-trigger`} checked={isTimed}
                onChange={() => { setTimeUnit(1440); props.onChange({ ...replaceWorkflowDraftAction(automation, automation.action.type === "create_service_channel" ? "prompt_agent" : automation.action.type), trigger: { type: "milestone_elapsed", delayMinutes: 1440 } }); }} /><span>Time in milestone</span></label>
            </div>
            {!isRequirement && (props.canAddJoin || isJoin) ? <label className="workflow-action-choice"><input type="radio" name={`${id}-trigger`} checked={isJoin}
              onChange={() => props.onChange({ ...replaceWorkflowDraftAction(automation, automation.action.type === "request_form" ? "request_form" : "create_service_channel"), trigger: { type: "member_joined" } })} /><span>Member joins</span></label> : null}
            <label className="workflow-action-choice"><input type="radio" name={`${id}-trigger`} checked={isForm}
              onChange={() => props.onChange({ ...replaceWorkflowDraftAction(automation, isRequirement ? "move_member" : "prompt_agent"), trigger: { type: "form_submitted", formKey: "" } })} /><span>Form submitted</span></label>
          </fieldset>
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

          {!isRequirement ? <fieldset className="workflow-action-choices" disabled={props.disabled}>
            <legend>Then</legend>
            <div className="workflow-action-choice-row">
              {isJoin ? <label className="workflow-action-choice"><input type="radio" name={`${id}-action`} checked={automation.action.type === "create_service_channel"} onChange={() => props.onChange(replaceWorkflowDraftAction(automation, "create_service_channel"))} /><span>Create private channel</span></label> : <label className="workflow-action-choice">
                <input type="radio" name={`${id}-action`} value="prompt_agent" checked={isPrompt}
                  onChange={() => props.onChange(replaceWorkflowDraftAction(automation, "prompt_agent"))} />
                <span>Ask agent</span>
              </label>}
              <label className="workflow-action-choice"><input type="radio" name={`${id}-action`} checked={automation.action.type === "request_form"} disabled={isForm} onChange={() => props.onChange(replaceWorkflowDraftAction(automation, "request_form"))} /><span>Request form</span></label>
              {isForm ? <label className="workflow-action-choice"><input type="radio" name={`${id}-action`} checked={automation.action.type === "evaluate_goal"} onChange={() => props.onChange(replaceWorkflowDraftAction(automation, "evaluate_goal"))} /><span>Evaluate goal</span></label> : null}
            </div>
          </fieldset> : null}

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
          ) : automation.action.type === "evaluate_goal" ? <p className="workflow-field-hint">Privately evaluates the milestone goal using this submitted form. Add a goal above to save. Records a judgment only; no message or milestone movement.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
