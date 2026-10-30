import { Bot, ChevronDown, ChevronRight, CircleDot, FileText, GitBranch, Lock, Mail, PenLine, Users, type LucideIcon } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CommunityMemberWorkflowAutomation, CommunityMemberWorkflowMilestone } from "../../../../shared/communityMemberWorkflow";
import {
  subscribeCloudWorkflowRunHistory,
  type CloudWorkflowRun,
  type CloudWorkflowRunHistory,
  type CloudWorkflowRunHistoryFilter,
} from "../../../../shared/cloudCommunityWorkflowRunHistoryGateway";
import type { WebCommunityTestRunContext } from "./WebCommunityTestRun";
import { type WorkflowStepNames } from "./workflowStepSentences";
import { WorkflowSentence, workflowActionParts, workflowTriggerParts } from "./workflowSubjectPills";

// Workflows → Run history, after Airtable's: every automation run, newest
// first, with All / Failed / Tests. A row opens its steps. Tests are the runs
// of test members, and the Test run controls sit above them.

const STEP_ICONS: Record<string, LucideIcon> = {
  prompt_agent: Bot, request_form: FileText, set_client_property: PenLine, create_service_channel: Lock,
  move_member: GitBranch, evaluate_goal: CircleDot, send_email: Mail,
};
const STATUS_WORDS = { done: "Done", failed: "Failed", running: "Running", waiting: "Waiting" } as const;


function when(at: number): string {
  const date = new Date(at);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === today.toDateString()) return `Today ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function took(run: CloudWorkflowRun): string {
  if (run.status === "waiting") return "Waiting for a later step";
  if (run.finished_at === null) return "";
  const seconds = Math.max(0, Math.round((run.finished_at - run.started_at) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

const ERRORS: Record<string, string> = {
  channel_access_missing: "They have no personal pod yet, so the agent had nowhere to write.",
  service_channel_missing: "They have no personal pod yet, so the agent had nowhere to write.",
  founder_usage_exhausted: "The agent is out of credits.",
  provider_execution_deadline_exceeded: "The agent took too long to answer.",
  agent_loop_unhandled: "The agent ran into an error.",
  workflow_email_unsubscribe_unavailable: "Email isn't set up on this Polynet yet, so nothing was sent.",
};

// Finished steps that didn't do the usual thing, in words.
const RESULT_NOTES: Record<string, string> = {
  email_opted_out: "Not sent: they unsubscribed from this community's emails.",
  email_not_sent: "Not sent: they have no verified email address.",
  email_previewed: "Previewed by Autoplay, not sent.",
  agent_previewed: "Previewed by Autoplay, not sent.",
};

function errorText(code: string | null): string {
  if (!code) return "This step failed.";
  if (ERRORS[code]) return ERRORS[code];
  return `This step failed (${code.replace(/^community_member_workflow_/, "").replace(/_/g, " ")}).`;
}

type Props = {
  context: WebCommunityTestRunContext;
  milestones: CommunityMemberWorkflowMilestone[];
  names: WorkflowStepNames;
  initialFilter?: CloudWorkflowRunHistoryFilter;
  /** The Test run controls, shown above the test runs. */
  testRun?: ReactNode;
  onOpenMember: (membershipId: string) => void;
};

export function WebCommunityWorkflowRunHistory(props: Props) {
  const [filter, setFilter] = useState<CloudWorkflowRunHistoryFilter>(props.initialFilter ?? "all");
  const [history, setHistory] = useState<CloudWorkflowRunHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setHistory(null); setFailed(false);
    return subscribeCloudWorkflowRunHistory({
      session: props.context.session, ensureSession: props.context.ensureSession, communityId: props.context.communityId, filter,
      update: (next) => { setHistory(next); setFailed(false); }, error: () => setFailed(true),
    });
  }, [props.context.session, props.context.ensureSession, props.context.communityId, filter, retry]);

  const rules = useMemo(() => {
    const byKey = new Map<string, CommunityMemberWorkflowAutomation>();
    for (const milestone of props.milestones) for (const rule of [...milestone.automations, ...(milestone.pausedAutomations ?? [])]) byKey.set(rule.key, rule);
    return byKey;
  }, [props.milestones]);
  // The same coloured sentence the automation reads as in Automations.
  const automationName = (run: CloudWorkflowRun) => {
    const rule = rules.get(run.automation_key);
    return rule ? <WorkflowSentence parts={workflowTriggerParts(rule, props.names, run.milestone_name)} /> : "A changed or deleted automation";
  };
  const stepName = (automationKey: string, actionType: string) => {
    const rule = rules.get(automationKey);
    if (rule) return <WorkflowSentence parts={workflowActionParts(rule, props.names)} />;
    return actionType === "prompt_agent" ? "Agent sent a message" : actionType === "request_form" ? "Sent a form"
      : actionType === "set_client_property" ? "Updated the member record" : actionType === "send_email" ? "Sent an email" : actionType === "set_pod_member" ? "Changed their pods" : actionType === "create_service_channel" ? "Created their personal pod" : "A step";
  };

  return <div className="pn-runs">
    {filter === "tests" && props.testRun ? props.testRun : null}
    <div className="pn-runs-card">
      <div className="pn-runs-bar">
        <div className="pn-runs-seg" role="tablist" aria-label="Show runs">
          {(["all", "failed", "tests"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={filter === value}
            onClick={() => { setFilter(value); setOpen(null); }}>{value === "all" ? "All" : value === "failed" ? "Failed" : "Tests"}</button>)}
        </div>
        <span className="pn-runs-hint">{filter === "tests" ? "Runs of test members. Nothing here reached real members." : "Updates live as automations run."}</span>
      </div>
      {failed ? <div className="pn-runs-empty" role="alert"><strong>Couldn't load runs</strong>
        <button type="button" className="pn-au-btn" onClick={() => setRetry((n) => n + 1)}>Try again</button></div>
        : !history ? <div className="pn-runs-empty"><span className="workflow-loading-line" /></div>
        : !history.runs.length ? <div className="pn-runs-empty"><strong>{filter === "failed" ? "No failed runs" : filter === "tests" ? "No test runs yet" : "No runs yet"}</strong>
          <p>{filter === "tests" ? "Press Test as a new member, or Test on an automation." : "Runs show up here as soon as an automation starts for someone."}</p></div>
        : <div className="pn-runs-scroll"><table className="pn-runs-table">
          <thead><tr><th className="is-toggle" aria-label="Open" /><th>Status</th><th>Automation</th><th>Member</th><th>Started</th><th>Took</th></tr></thead>
          <tbody>
            {history.runs.map((run) => {
              const isOpen = open === run.id;
              return <Fragment key={run.id}>
                <tr className={isOpen ? "is-open" : undefined} onClick={() => setOpen(isOpen ? null : run.id)}>
                  <td className="is-toggle"><button type="button" className="pn-au-iconbtn" aria-expanded={isOpen} aria-label={isOpen ? "Hide steps" : "Show steps"}
                    onClick={(event) => { event.stopPropagation(); setOpen(isOpen ? null : run.id); }}>
                    {isOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}</button></td>
                  <td><span className={`pn-runs-dot is-${run.status}`} />{STATUS_WORDS[run.status]}</td>
                  <td><span className="pn-runs-name">{automationName(run)}</span><small>While in {run.milestone_name}</small></td>
                  <td>{run.member_name}{run.is_test ? <small>Test member</small> : null}</td>
                  <td className="is-muted">{when(run.started_at)}</td>
                  <td className="is-muted">{took(run)}</td>
                </tr>
                {isOpen ? <tr className="pn-runs-steps"><td colSpan={6}>
                  <ol>
                    {run.steps.map((step) => {
                      const Icon = STEP_ICONS[step.action_type] ?? CircleDot;
                      return <li key={step.id}>
                        <Icon size={16} strokeWidth={2} aria-hidden="true" />
                        <span><strong>{stepName(step.automation_key, step.action_type)}</strong>
                          {step.status === "failed" ? <small className="is-error">{errorText(step.error_code)}</small>
                            : step.skipped ? <small>Skipped: its Only if didn't match.</small>
                            : step.result_code && RESULT_NOTES[step.result_code] ? <small>{RESULT_NOTES[step.result_code]}</small>
                            : step.status === "running" ? <small>Running now</small>
                            : <small>Done {when(step.finished_at ?? step.created_at)}</small>}</span>
                        <span className={`pn-runs-dot is-${step.status === "failed" ? "failed" : step.status === "running" ? "running" : step.skipped ? "skipped" : "done"}`} aria-hidden="true" />
                      </li>;
                    })}
                  </ol>
                  <button type="button" className="pn-au-btn" onClick={() => props.onOpenMember(run.membership_id)}>
                    Open {run.member_name}{run.status === "failed" ? " to retry" : ""}</button>
                </td></tr> : null}
              </Fragment>;
            })}
          </tbody>
        </table></div>}
      {history?.truncated ? <p className="pn-runs-foot">Showing the latest runs.</p> : null}
    </div>
  </div>;
}
