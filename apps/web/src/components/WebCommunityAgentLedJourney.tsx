import { CommunityAgentIcon } from "../../../../shared/CommunityAgentIcon";
import { useState } from "react";
import {
  buildAgentLedJourneyPlan,
  describeAgentLedJourneyPlan,
  type AgentLedJourneyPlan,
} from "../../../../shared/agentLedJourneyTemplate";
import {
  COMMUNITY_MEMBER_WORKFLOW_MAX_MILESTONES,
  type CommunityMemberWorkflowMilestone,
} from "../../../../shared/communityMemberWorkflow";

type Props = {
  milestones: CommunityMemberWorkflowMilestone[] | null;
  publishedForms: Array<{ key: string; name: string }>;
  isSaving: boolean;
  onApply: (plan: AgentLedJourneyPlan) => Promise<boolean>;
};

/** The form members answer on joining: the first stage's, else the first published form. */
export function agentLedOnboardingFormKey(
  milestones: CommunityMemberWorkflowMilestone[] | null,
  publishedForms: Array<{ key: string }>,
): string | null {
  const joinForm = milestones?.[0]?.automations.find((automation) =>
    automation.trigger.type === "member_joined" && automation.action.type === "request_form");
  if (joinForm?.action.type === "request_form") return joinForm.action.formKey;
  return publishedForms[0]?.key ?? null;
}

// Workflows → board: one card that sets up the agent-led journey. The plan is
// shown in plain words first; applying adds ordinary stages the owner can edit.
export function WebCommunityAgentLedJourney(props: Props) {
  const [open, setOpen] = useState(false);
  const milestones = props.milestones;
  const hasWorkflow = Boolean(milestones?.length);
  const names = new Set((milestones ?? []).map((milestone) => milestone.name.trim().toLowerCase()));
  if (names.has("first win") && names.has("checkpoint")) return null;

  const formKey = agentLedOnboardingFormKey(milestones, props.publishedForms);
  const plan = buildAgentLedJourneyPlan({
    hasWorkflow, onboardingFormKey: formKey, firstStageAutomations: milestones?.[0]?.automations,
  });
  const tooMany = (milestones?.length ?? 0) + plan.stages.length > COMMUNITY_MEMBER_WORKFLOW_MAX_MILESTONES;
  const formName = props.publishedForms.find((form) => form.key === formKey)?.name ?? null;

  return <div className="pn-wf-callout pn-wf-agent-led">
    <span className="pn-wf-callout-icon pn-wf-agent-led-icon" aria-hidden="true"><CommunityAgentIcon size={20} strokeWidth={2} /></span>
    <span className="pn-wf-callout-text">
      <strong>Let your agent lead each member</strong>
      <small>Your agent welcomes every new member in a private guide channel, reads their onboarding answers, points them to
        the next lesson, checks in when they stall and gets them ready for your review.</small>
      {open ? <span className="pn-wf-agent-led-plan">
        <ol>{describeAgentLedJourneyPlan(plan).map((line) => <li key={line}>{line}</li>)}</ol>
        <small>{formName
          ? `It uses your "${formName}" form as the onboarding questions.`
          : "You have no published form yet, so the agent asks its own short questions. Publish a form under Forms to use yours."}
          {" "}Every step is a normal stage rule you can change or delete.</small>
        {tooMany ? <small role="alert">A Workflow holds {COMMUNITY_MEMBER_WORKFLOW_MAX_MILESTONES} stages. Remove some first.</small> : null}
      </span> : null}
    </span>
    <span className="pn-wf-callout-actions">
      {open ? <>
        <button type="button" className="workflow-secondary-button" disabled={props.isSaving} onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="platform-save-button" disabled={props.isSaving || tooMany}
          onClick={() => void props.onApply(plan).then((done) => { if (done) setOpen(false); })}>
          {props.isSaving ? "Adding…" : hasWorkflow ? "Add these stages" : "Create this journey"}
        </button>
      </> : <button type="button" className="workflow-secondary-button" onClick={() => setOpen(true)}>Set it up</button>}
    </span>
  </div>;
}
