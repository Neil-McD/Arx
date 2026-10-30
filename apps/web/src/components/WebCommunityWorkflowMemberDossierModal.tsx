import { X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useCommunityThemeScope } from "./useCommunityThemeScope";

import { UserAvatar } from "../../../../shared/UserAvatar";
import type { CloudCommunityMemberSuccessDossier } from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
import { formatWorkflowMilestoneAge } from "./WebCommunityWorkflowMemberStub";
import { WorkflowMemberServiceChannel } from "./WorkflowMemberServiceChannel";
import { WebPlatformTabList, platformTabId, platformTabPanelId } from "./WebPlatformChoiceControls";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";

function readableLabel(value: string): string {
  if (value === "not_applicable") return "No longer applicable";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function workflowActivityLabel(
  activity: CloudCommunityMemberSuccessDossier["recent_workflow_activity"][number],
): string {
  if (activity.action_type === "request_form") return `Form · ${readableLabel(activity.status)}`;
  if (activity.action_type === "evaluate_goal") return `${activity.milestone_name} · Goal evaluation · ${activity.status === "responded" ? "Assessed" : readableLabel(activity.status)}`;
  if (activity.action_type === "create_service_channel") return `Personal pod setup · ${readableLabel(activity.status)}`;
  if (activity.status === "requirement_satisfied") return `Requirement satisfied in ${activity.milestone_name}`;
  if (activity.status === "unavailable") {
    return `${activity.action_type === "prompt_agent" ? "Community agent" : "Stage move"} · Status unavailable`;
  }
  if (activity.action_type === "prompt_agent") {
    return `Community agent · ${readableLabel(activity.status)}`;
  }
  if (activity.status === "workflow_completed") {
    return `${activity.milestone_name} → Workflow complete`;
  }
  if (activity.status === "moved") {
    return `${activity.milestone_name} → ${activity.next_milestone_name}`;
  }
  return `Move ${readableLabel(activity.status).toLowerCase()} in ${activity.milestone_name}`;
}

function ActivityTime({ value }: { value: string }) {
  const date = new Date(value);
  return <time dateTime={value} title={date.toLocaleString()} aria-label={date.toLocaleString()}>
    {date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
  </time>;
}

export function WebCommunityWorkflowMemberDossierModal(props: {
  formResponses?: ReactNode;
  courseProgress?: ReactNode;
  /** Plan, what they can use and until when (Members shows the same). */
  access?: ReactNode;
  isOpen: boolean;
  dossier: CloudCommunityMemberSuccessDossier | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  channels: CloudCommunityChannel[];
  channelsUnavailable: boolean;
  isServiceChannelSaving: boolean;
  serviceChannelError: string | null;
  onSetServiceChannel: (channelId: string | null, expectedRevision: number) => Promise<boolean>;
  onForceMove: (snapshot: CloudCommunityMemberSuccessDossier) => Promise<void>;
  onApproveMilestone?: (snapshot: CloudCommunityMemberSuccessDossier) => Promise<void>;
  onRetryGoalReview?: (snapshot: CloudCommunityMemberSuccessDossier) => Promise<void>;
  onRetryAction?: (snapshot: CloudCommunityMemberSuccessDossier, automationKey: string) => Promise<{ status: string; error_code?: string }>;
  onOpenServiceChannel: (channelId: string) => void;
}) {
  const themeScope = useCommunityThemeScope();
  const dialogRef = useRef<HTMLElement | null>(null);
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const approvalPending = useRef(false);
  const approvalGeneration = useRef(0);
  const [retryingGoalReview, setRetryingGoalReview] = useState(false);
  const [goalReviewRetryError, setGoalReviewRetryError] = useState<string | null>(null);
  const [submittedGoalReviewReceipt, setSubmittedGoalReviewReceipt] = useState<string | null>(null);
  const goalReviewRetryPending = useRef(false);
  const [retryingAction, setRetryingAction] = useState<string | null>(null);
  const [actionRetryError, setActionRetryError] = useState<{ key: string; message: string } | null>(null);
  const actionRetryPending = useRef(false);
  const actionRows = useRef(new Map<string, HTMLLIElement>());
  const actionsHeading = useRef<HTMLHeadingElement | null>(null);
  // The action whose Run again was pressed. When its button goes (the write
  // worked), focus goes to its row; when the row goes too (the member moved on
  // or finished), to Actions, else the dialog. It keeps following through each
  // update until the builder moves focus somewhere else.
  const refocusAction = useRef<{ membershipId: string; key: string } | null>(null);
  const refocusTarget = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const tracked = refocusAction.current;
    if (!tracked) return;
    const active = document.activeElement;
    if (!props.isOpen || (props.dossier && props.dossier.membership_id !== tracked.membershipId)
      || (refocusTarget.current && active && active !== refocusTarget.current && active !== document.body)) {
      refocusAction.current = null; refocusTarget.current = null;
      return;
    }
    const row = actionRows.current.get(tracked.key);
    if (row?.querySelector("button")) return;
    const target = row ?? actionsHeading.current ?? dialogRef.current;
    if (target && target !== active) target.focus();
    refocusTarget.current = target;
  }, [props.dossier, props.isOpen]);
  useEffect(() => {
    approvalGeneration.current += 1;
    approvalPending.current = false;
    setApproving(false);
    setApprovalError(null);
    goalReviewRetryPending.current = false;
    setRetryingGoalReview(false);
    setGoalReviewRetryError(null);
    setSubmittedGoalReviewReceipt(null);
    actionRetryPending.current = false;
    setRetryingAction(null);
    setActionRetryError(null);
  }, [props.isOpen, props.dossier?.membership_id, props.dossier?.workflow?.current_milestone_entered_at,
    props.dossier?.workflow?.goal_review?.receipt_ref]);
  const [view, setView] = useState("progress");
  useEffect(() => { setView("progress"); }, [props.isOpen, props.dossier?.membership_id]);
  useEffect(() => {
    const body = dialogRef.current?.querySelector<HTMLElement>(".workflow-member-dossier-body");
    if (body) body.scrollTop = 0;
  }, [view]);
  const [confirmation, setConfirmation] = useState<CloudCommunityMemberSuccessDossier | null>(null);
  const [forcing, setForcing] = useState(false);
  const [forceError, setForceError] = useState<string | null>(null);
  const forcePending = useRef(false);
  const wasConfirming = useRef(false);
  useEffect(() => { setConfirmation(null); setForceError(null); }, [props.isOpen, props.dossier?.membership_id]);
  useEffect(() => {
    if (confirmation) dialogRef.current?.querySelector<HTMLElement>("[data-override-cancel]")?.focus();
    else if (wasConfirming.current) dialogRef.current?.querySelector<HTMLElement>("[data-override-open]")?.focus();
    wasConfirming.current = Boolean(confirmation);
  }, [confirmation]);

  useEffect(() => {
    if (!props.isOpen) return;
    const priorFocus = document.activeElement as HTMLElement | null;
    const appRoot = document.getElementById("root");
    appRoot?.setAttribute("inert", "");
    queueMicrotask(() =>
      dialogRef.current?.querySelector<HTMLElement>("button")?.focus(),
    );
    return () => {
      appRoot?.removeAttribute("inert");
      priorFocus?.focus();
    };
  }, [props.isOpen]);

  if (!props.isOpen) return themeScope.marker;
  const dossier = props.dossier;
  const factsByKind = new Map<string, string[]>();
  for (const fact of dossier?.approved_community_context ?? []) {
    const facts = factsByKind.get(fact.kind) ?? [];
    facts.push(fact.context_kind === "workflow" ? `Workflow-only · ${fact.body}` : fact.body);
    factsByKind.set(fact.kind, facts);
  }

  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => element.getClientRects().length > 0);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    // The dialog itself can hold focus (after its content changed), so Shift+Tab from it wraps too.
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return <>{themeScope.marker}{createPortal(themeScope.scope(
    <div
      className="modal-overlay workflow-member-dossier-overlay"
      onMouseDown={props.onClose}
    >
      <section
        ref={dialogRef}
        className="modal resource-modal workflow-member-dossier-modal"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-member-dossier-title"
        onKeyDown={trapFocus}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header workflow-member-dossier-header">
          {dossier ? (
            <div className="workflow-member-dossier-identity">
              <UserAvatar
                name={dossier.display_name}
                imageUrl={dossier.avatar_url}
                focusX={dossier.avatar_focus_x}
                focusY={dossier.avatar_focus_y}
                zoom={dossier.avatar_zoom}
                className="community-interaction-avatar"
                readyClassName="has-image"
                fallbackClassName="community-interaction-avatar-fallback"
              />
              <div>
                <div className="modal-title" id="workflow-member-dossier-title">
                  {dossier.display_name}
                </div>
                <span>
                  {dossier.workflow ? (
                    <>
                      {dossier.workflow.current_milestone_name} ·{" "}
                      {dossier.workflow.completed_at
                        ? "Workflow complete"
                        : formatWorkflowMilestoneAge(
                            dossier.workflow.current_milestone_entered_at,
                          )}
                    </>
                  ) : (
                    "No workflow configured"
                  )}
                </span>
              </div>
            </div>
          ) : (
            <div className="modal-title" id="workflow-member-dossier-title">
              Member success
            </div>
          )}
          <button
            className="modal-close"
            type="button"
            onClick={props.onClose}
            aria-label="Close member success dossier"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {dossier && !props.isLoading && !props.error && !confirmation ? <div className="workflow-member-dossier-tabs">
          <WebPlatformTabList tabs={[{ id: "progress", label: "Progress" }, { id: "courses", label: "Courses" }, { id: "responses", label: "Responses" }, { id: "access", label: "Access" }, { id: "details", label: "Details" }]}
            activeTab={view} onSelectTab={setView} ariaLabel="Member workflow" idPrefix="member-workflow"
            className="platform-switcher platform-switcher-compact"
            style={buildPlatformSwitcherStyle(5, ["progress", "courses", "responses", "access", "details"].indexOf(view))} />
        </div> : null}
        <div className="modal-body workflow-member-dossier-body">
          {confirmation ? <section className="workflow-member-dossier-section" role="alertdialog" aria-labelledby="force-move-title" aria-describedby="force-move-warning">
            <h3 id="force-move-title">Force {confirmation.workflow?.override_state?.next_milestone_name ? "move to next stage" : "workflow completion"}?</h3>
            <p><strong>{confirmation.display_name}</strong>: {confirmation.workflow?.current_milestone_name} → {confirmation.workflow?.override_state?.next_milestone_name ?? "Workflow complete"}</p>
            <p id="force-move-warning">This bypasses unfinished actions or an unmet goal. Pending forms for this stage will close. Your override will be recorded.</p>
            {forceError ? <p role="alert" className="workflow-error">{forceError}</p> : null}
            <div className="resource-modal-actions">
              <button type="button" className="secondary" data-override-cancel disabled={forcing} onClick={() => setConfirmation(null)}>Cancel</button>
              <button type="button" className="secondary danger" disabled={forcing || Boolean(forceError)} onClick={async () => {
                if (forcePending.current) return;
                forcePending.current = true; setForcing(true);
                try { await props.onForceMove(confirmation); setConfirmation(null); }
                catch (error) { setForceError(error instanceof Error ? error.message : "Move failed. Refresh before trying again."); }
                finally { forcePending.current = false; setForcing(false); }
              }}>{forcing ? "Moving…" : confirmation.workflow?.override_state?.next_milestone_name ? "Force move" : "Force complete"}</button>
            </div>
          </section> : <>
          {props.isLoading ? (
            <div
              className="workflow-member-dossier-loading"
              role="status"
              aria-label="Loading member success"
            >
              <span />
              <span />
              <span />
            </div>
          ) : props.error ? (
            <div className="workflow-member-dossier-error">
              <p className="workflow-error" role="alert">{props.error}</p>
              <div className="resource-modal-actions">
                <button type="button" className="secondary" onClick={() => {
                  dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
                  props.onRetry();
                }}>Retry</button>
              </div>
            </div>
          ) : dossier ? (
            <>
              <div role="tabpanel" id={platformTabPanelId("member-workflow", view)} aria-labelledby={platformTabId("member-workflow", view)}>
              <div hidden={view !== "progress"}>
              {dossier.workflow ? <section className="workflow-member-dossier-section">
                <h3>Stage goal</h3>
                <p>{dossier.workflow.goal || "No goal specified."}</p>
              </section> : null}
              {dossier.workflow && !dossier.workflow.completed_at ? <section className="workflow-member-dossier-section">
                <h3 ref={actionsHeading} tabIndex={-1}>Actions</h3>
                {!dossier.workflow.action_progress ? <p>Action completion unavailable.</p> : <>
                  {dossier.workflow.action_progress.actions.length ? <ul className="workflow-member-action-progress">
                    {dossier.workflow.action_progress.actions.map(action => <li key={action.automation_key} tabIndex={-1}
                      ref={(node) => { if (node) actionRows.current.set(action.automation_key, node); else actionRows.current.delete(action.automation_key); }}>
                      <div><strong>{action.label}</strong>
                        <span>{action.status === "complete" ? action.action_type === "request_form" ? "Form submitted" : action.action_type === "prompt_agent" ? "Response delivered" : action.action_type === "set_client_property" || action.action_type === "set_pod_member" ? "Done" : action.action_type === "send_email" ? "Sent" : "Channel ready"
                          : action.status === "pending" ? action.action_type === "request_form" ? "Awaiting submission" : "Queued"
                          : action.status === "waiting" ? `Waiting for ${action.waiting_for ?? "previous action"}`
                          : action.retryable && action.status === "unavailable" ? "Changed since it ran"
                          : action.status === "unavailable" ? "Completion unavailable" : readableLabel(action.status)}</span></div>
                      {action.evidence ? <small>Verified <ActivityTime value={new Date(action.evidence.completed_at).toISOString()} /></small> : null}
                      {action.retryable && props.onRetryAction ? <>
                        <button type="button" className="workflow-secondary-button" aria-label={`Run again: ${action.label}`}
                          // The pressed button stays enabled (and focused) while it runs; the guard stops a second press.
                          disabled={retryingAction !== null && retryingAction !== action.automation_key}
                          aria-disabled={retryingAction === action.automation_key || undefined} onClick={async (event) => {
                            if (actionRetryPending.current || !props.onRetryAction) return;
                            const generation = approvalGeneration.current;
                            actionRetryPending.current = true; setRetryingAction(action.automation_key); setActionRetryError(null);
                            refocusAction.current = { membershipId: dossier.membership_id, key: action.automation_key };
                            // Followed from the button itself, so moving off it while it runs stops the follow.
                            refocusTarget.current = event.currentTarget;
                            try {
                              const result = await props.onRetryAction(dossier, action.automation_key);
                              if (result.status === "action_failed") refocusAction.current = null;
                              if (generation === approvalGeneration.current && result.status === "action_failed")
                                setActionRetryError({ key: action.automation_key, message: "It failed again. Check this property's type and options in Members, then run it again." });
                            } catch (error) {
                              refocusAction.current = null;
                              if (generation === approvalGeneration.current) {
                                const stale = String(error instanceof Error ? error.message : error).includes("evidence_changed");
                                setActionRetryError({ key: action.automation_key, message: stale ? "The member moved on. Refresh and check their current stage."
                                  : "Could not run it again. Refresh the member panel and try again." });
                              }
                            } finally {
                              if (generation === approvalGeneration.current) { actionRetryPending.current = false; setRetryingAction(null); }
                            }
                          }}>{retryingAction === action.automation_key ? "Running…" : "Run again"}</button>
                        {actionRetryError?.key === action.automation_key ? <p role="alert" className="workflow-error">{actionRetryError.message}</p> : null}
                      </> : null}
                    </li>)}
                  </ul> : <p>No actions configured.</p>}
                  {dossier.workflow.action_progress.scan_truncated ? <p>Only a bounded set of recent receipts was checked. Unproven actions remain unavailable.</p> : null}
                  {dossier.workflow.action_progress.actions.some(action => action.action_type === "prompt_agent") ? <p>A delivered response does not prove the stage goal was achieved.</p> : null}
                </>}
              </section> : null}
              {dossier.workflow && !dossier.workflow.completed_at ? <section className="workflow-member-dossier-section">
                <h3>{dossier.workflow.require_human_approval ? "Human approval" : "Automatic advancement"}</h3>
                {dossier.workflow.require_human_approval ? <>
                  <p>{(dossier.workflow.action_progress?.all_actions_complete || dossier.workflow.action_progress?.actions.length === 0) && !dossier.workflow.action_progress?.scan_truncated
                    ? "Awaiting human approval. Review the actions and goal before advancing."
                    : "Configured actions must be verified complete before approval."}</p>
                  {dossier.workflow.goal?.trim() && dossier.workflow.action_progress?.actions.length ? <>
                    <p>{dossier.workflow.goal_review?.status === "achieved" ? "Agent assessment: goal appears met. Human approval is still required."
                      : dossier.workflow.goal_review?.status === "not_yet" ? "Agent assessment: goal not yet met. Review the evidence before deciding."
                      : dossier.workflow.goal_review?.status === "insufficient_evidence" ? "Agent assessment: evidence is insufficient. Review the evidence before deciding."
                      : dossier.workflow.goal_review?.status === "reviewing" ? "The agent is reviewing the goal. You can still decide from the verified actions."
                      : dossier.workflow.goal_review?.status === "failed" ? "Agent assessment unavailable. You can still review and decide."
                      : dossier.workflow.goal_review?.status === "not_started" ? "No agent assessment has started for this evidence. You can still review and decide."
                      : "The agent will review the goal after all actions are verified complete."}</p>
                    {dossier.workflow.goal_review?.reason ? <p>{dossier.workflow.goal_review.reason}</p> : null}
                  </> : null}
                  <button type="button" className="workflow-secondary-button" disabled={approving || !props.onApproveMilestone
                    || (dossier.workflow.action_progress?.actions.length ?? 0) > 0 && !dossier.workflow.action_progress?.all_actions_complete || !!dossier.workflow.action_progress?.scan_truncated}
                    onClick={async () => {
                      if (approvalPending.current || !props.onApproveMilestone) return;
                      const generation = approvalGeneration.current;
                      approvalPending.current = true; setApproving(true); setApprovalError(null);
                      try { await props.onApproveMilestone(dossier); }
                      catch { if (generation === approvalGeneration.current) setApprovalError("Could not approve. Refresh and review the member’s current actions, goal, and stage before trying again."); }
                      finally { if (generation === approvalGeneration.current) { approvalPending.current = false; setApproving(false); } }
                    }}>{approving ? "Approving…" : dossier.workflow.override_state?.next_milestone_name ? "Approve and advance" : "Approve and complete"}</button>
                  {approvalError ? <p role="alert">{approvalError}</p> : null}
                </> : dossier.workflow.goal?.trim() ? <>
                  <p>{dossier.workflow.goal_review?.status === "reviewing" ? "The agent is reviewing the goal against verified action evidence."
                    : dossier.workflow.goal_review?.status === "achieved" ? "Goal met. Advancement is being validated."
                    : dossier.workflow.goal_review?.status === "not_yet" ? "Goal not met. The member remains in this stage."
                    : dossier.workflow.goal_review?.status === "insufficient_evidence" ? "More proof is needed. The member remains in this stage."
                    : dossier.workflow.goal_review?.status === "failed" ? "Goal review could not complete. No advancement was made."
                    : dossier.workflow.goal_review?.status === "not_started" ? "No review has started for this evidence. Existing work is not automatically backfilled."
                    : "Once all actions are verified complete, the agent reviews the goal before advancing."}</p>
                  {dossier.workflow.goal_review?.reason ? <p>{dossier.workflow.goal_review.reason}</p> : null}
                </>
                  : !dossier.workflow.action_progress ? <p>Action completion information unavailable.</p>
                  : dossier.workflow.action_progress?.actions.length ? <p>Advances when all actions are verified complete. Existing completed work is not automatically backfilled.</p>
                  : <p>No actions configured. This stage will not advance automatically.</p>}
                {dossier.workflow.goal_review?.retryable && props.onRetryGoalReview
                  && dossier.workflow.goal_review.receipt_ref !== submittedGoalReviewReceipt ? <>
                  <button type="button" className="workflow-secondary-button" disabled={retryingGoalReview} onClick={async () => {
                    if (goalReviewRetryPending.current || !props.onRetryGoalReview) return;
                    const generation = approvalGeneration.current;
                    goalReviewRetryPending.current = true; setRetryingGoalReview(true); setGoalReviewRetryError(null);
                    try {
                      await props.onRetryGoalReview(dossier);
                      if (generation === approvalGeneration.current) setSubmittedGoalReviewReceipt(dossier.workflow!.goal_review!.receipt_ref!);
                    }
                    catch (error) {
                      if (generation === approvalGeneration.current) {
                        const stale = String(error instanceof Error ? error.message : error).includes("evidence_changed");
                        setGoalReviewRetryError(stale ? "The member’s evidence changed. Refresh and review it before retrying."
                          : "Review could not restart. Check the community agent, funding, and member access, then try again.");
                      }
                    } finally {
                      if (generation === approvalGeneration.current) { goalReviewRetryPending.current = false; setRetryingGoalReview(false); }
                    }
                  }}>{retryingGoalReview ? "Retrying review…" : "Retry goal review"}</button>
                  {goalReviewRetryError ? <p role="alert" className="workflow-error">{goalReviewRetryError}</p> : null}
                </> : null}
              </section> : null}
              </div>
              <div hidden={view !== "courses"}>{view === "courses" ? props.courseProgress ?? <p>Course progress unavailable.</p> : null}</div>
              <div hidden={view !== "responses"}>{props.formResponses ?? <p>Form responses unavailable.</p>}</div>
              <div hidden={view !== "access"}>{view === "access" ? props.access ?? <p>Access unavailable.</p> : null}</div>
              <div hidden={view !== "details"}>
              <WorkflowMemberServiceChannel key={dossier.membership_id} value={dossier.service_channel}
                channels={props.channels} channelsUnavailable={props.channelsUnavailable}
                saving={props.isServiceChannelSaving} error={props.serviceChannelError}
                onChange={props.onSetServiceChannel} onOpen={props.onOpenServiceChannel} onRefresh={props.onRetry} />
              <section className="workflow-member-dossier-section">
                <h3>Member context</h3>
                {factsByKind.size > 0 ? (
                  <div className="workflow-member-context-list">
                    {Array.from(factsByKind.entries()).map(([kind, facts]) => (
                      <div key={kind}>
                        <strong>{readableLabel(kind)}</strong>
                        {facts.map((fact) => (
                          <p key={fact}>{fact}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>
                    No member-approved context has been shared with this
                    community.
                  </p>
                )}
              </section>
              </div>
              <div hidden={view !== "progress"}>
              <section className="workflow-member-dossier-section">
                <h3>Recent workflow activity</h3>
                {dossier.recent_workflow_activity.length > 0 ? (
                  <ol className="workflow-member-history workflow-member-activity">
                    {dossier.recent_workflow_activity.map((activity) => (
                      <li key={activity.id}>
                        <ActivityTime value={activity.occurred_at} />
                        <div>
                          <strong>{workflowActivityLabel(activity)}</strong>
                          {activity.assessment ? <p>{readableLabel(activity.assessment.verdict)} — {activity.assessment.reason}</p> : null}
                          {activity.assessment ? <details className="workflow-member-instructions">
                            <summary>Goal and evidence at evaluation</summary>
                            <p><strong>Goal:</strong> {activity.assessment.goal || "Original goal unavailable."}</p>
                            {(activity.assessment.citations ?? []).map(citation => <div key={citation.ref}>
                              <p><strong>{citation.form} · {citation.question}</strong></p>
                              <p>{citation.answer}</p>
                            </div>)}
                            {(activity.assessment.citations?.length ?? 0) < activity.assessment.evidenceRefs.length ? <p>Some cited evidence is unavailable in the recorded context.</p> : !activity.assessment.evidenceRefs.length ? <p>No evidence cited.</p> : null}
                            <p>Historical assessment, not proof of the member’s current goal.</p>
                          </details> : null}
                          {activity.failure_reason ? <p>{activity.failure_reason}</p> : null}
                          {activity.delivery_channel_url ? <a href={activity.delivery_channel_url}>Open delivery channel</a> : null}
                          {activity.prompt ? (
                            <details className="workflow-member-instructions">
                              <summary>Agent instructions</summary>
                              <p>{activity.prompt}</p>
                            </details>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No recorded workflow activity.</p>
                )}
              </section>
              </div>
              <div hidden={view !== "details"}>
              <details className="workflow-member-dossier-section workflow-member-milestone-history">
                <summary>Recent stage history</summary>
                {dossier.milestone_history.length > 0 ? (
                  <ol className="workflow-member-history">
                    {dossier.milestone_history.map((entry) => (
                      <li key={entry.id}>
                        <ActivityTime value={entry.occurred_at} />
                        <strong>
                          {entry.completed_workflow
                            ? `${entry.milestone_name} → Workflow complete`
                            : `${entry.milestone_name} → ${entry.next_milestone_name}`}
                          {entry.forced_by_user_id ? " · Builder override" : ""}
                        </strong>
                        {entry.forced_by_user_id ? <p>Advanced by a human override.</p> : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No recorded stage changes.</p>
                )}
              </details>
              {dossier.workflow && !dossier.workflow.completed_at && dossier.workflow.override_state ? <section className="workflow-member-dossier-section">
                <h3>Manual override</h3>
                <p>Bypass unfinished actions or an unmet goal without marking the goal achieved.</p>
                <button type="button" className="workflow-secondary-button" data-override-open onClick={() => { setForceError(null); setConfirmation(dossier); }}>Force move…</button>
              </section> : null}
              </div>
              </div>
            </>
          ) : null}
          </>}
        </div>
      </section>
    </div>,
    ), document.body)}</>;
}
