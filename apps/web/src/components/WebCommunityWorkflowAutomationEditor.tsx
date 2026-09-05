import { ChevronDown, X } from "lucide-react";
import { useId } from "react";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import { COMMUNITY_MEMBER_WORKFLOW_PROMPT_MAX_LENGTH } from "../../../../shared/communityMemberWorkflow";
import { WorkflowChannelPicker } from "./WorkflowChannelPicker";
import { replaceWorkflowDraftAction, workflowAutomationIssue, workflowChannelLabel, workflowMoveLabel, type WorkflowAutomationDraft } from "./workflowMilestoneDraft";

type Props = {
  automation: WorkflowAutomationDraft;
  index: number;
  expanded: boolean;
  channels: CloudCommunityChannel[];
  channelsUnavailable: boolean;
  nextMilestoneName: string | null;
  hasOtherMove: boolean;
  disabled: boolean;
  onToggle: () => void;
  onChange: (automation: WorkflowAutomationDraft) => void;
  onRemove: () => void;
};

export function WebCommunityWorkflowAutomationEditor(props: Props) {
  const id = useId();
  const { automation } = props;
  const isPrompt = automation.action.type === "prompt_agent";
  const issue = workflowAutomationIssue(automation, props.channels, props.channelsUnavailable);
  const isPrivate = props.channels.some((channel) => channel.id === automation.trigger.channelId && channel.access_mode === "restricted");
  const actionLabel = isPrompt ? "Ask community agent" : workflowMoveLabel(props.nextMilestoneName);

  return (
    <div className="workflow-milestone-automation-row" data-automation-key={automation.key}>
      <div className="workflow-automation-heading">
        <button type="button" className="workflow-automation-summary" aria-expanded={props.expanded}
          aria-controls={props.expanded ? `${id}-fields` : undefined} disabled={props.disabled} onClick={props.onToggle}>
          <span>
            <strong>{actionLabel}</strong>
            <small>Posts or replies · {workflowChannelLabel(automation.trigger.channelId, props.channels, props.channelsUnavailable)}</small>
            {issue ? <small className="workflow-automation-issue">{issue}</small> : null}
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        <button type="button" className="workflow-milestone-remove-automation" aria-label={`Remove automation ${props.index + 1}`}
          disabled={props.disabled} onClick={props.onRemove}><X size={16} aria-hidden="true" /></button>
      </div>

      {props.expanded ? (
        <div className="workflow-milestone-automation-fields" id={`${id}-fields`}>
          <div className="workflow-automation-field">
            <span>When a member posts or replies in</span>
            <WorkflowChannelPicker channels={props.channels} channelId={automation.trigger.channelId}
              unavailable={props.channelsUnavailable} disabled={props.disabled} label={`Channel for automation ${props.index + 1}`}
              onChange={(channelId) => props.onChange({ ...automation, trigger: { type: "member_contributed", ...(channelId ? { channelId } : {}) } })} />
            {automation.trigger.channelId !== undefined && issue && issue !== "Add agent instructions" ? <small className="workflow-field-hint" role="status">{issue}. This rule will not be saved as Any channel.</small> : null}
          </div>

          <fieldset className="workflow-action-choices" disabled={props.disabled} aria-describedby={props.hasOtherMove ? `${id}-move-limit` : undefined}>
            <legend>Then</legend>
            <div className="workflow-action-choice-row">
              <label className="workflow-action-choice">
                <input type="radio" name={`${id}-action`} value="prompt_agent" checked={isPrompt}
                  onChange={() => props.onChange(replaceWorkflowDraftAction(automation, "prompt_agent"))} />
                <span>Ask agent</span>
              </label>
              <label className="workflow-action-choice">
                <input type="radio" name={`${id}-action`} value="move_member" checked={!isPrompt} disabled={props.hasOtherMove}
                  onChange={() => props.onChange(replaceWorkflowDraftAction(automation, "move_member"))} />
                <span>Move member</span>
              </label>
            </div>
            {props.hasOtherMove ? <small className="workflow-field-hint" id={`${id}-move-limit`}>This milestone already has a move rule.</small> : null}
          </fieldset>

          {automation.action.type === "prompt_agent" ? (
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
                The community agent uses this member’s community context and replies in the triggering thread.
                {isPrivate || automation.trigger.channelId === undefined ? " In private channels, the agent must be invited." : ""}
              </p>
            </>
          ) : (
            <p className="workflow-action-consequence">
              {props.nextMilestoneName === null
                ? "A matching post or reply completes this member’s workflow."
                : <>A matching post or reply moves this member to <strong>{props.nextMilestoneName}</strong>.</>}
              <small>No agent run or approval is required. It does not wait for other agent actions.</small>
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
