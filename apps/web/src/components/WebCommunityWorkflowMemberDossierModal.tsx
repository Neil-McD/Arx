import { X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { UserAvatar } from "../../../../shared/UserAvatar";
import type { CloudCommunityMemberSuccessDossier } from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
import { formatWorkflowMilestoneAge } from "./WebCommunityWorkflowMemberStub";
import { WorkflowMemberServiceChannel } from "./WorkflowMemberServiceChannel";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";

function readableLabel(value: string): string {
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
  if (activity.action_type === "evaluate_goal") return `Goal evaluation · ${activity.status === "responded" ? "Assessed" : readableLabel(activity.status)}`;
  if (activity.action_type === "create_service_channel") return `Private channel setup · ${readableLabel(activity.status)}`;
  if (activity.status === "requirement_satisfied") return `Requirement satisfied in ${activity.milestone_name}`;
  if (activity.status === "unavailable") {
    return `${activity.action_type === "prompt_agent" ? "Community agent" : "Milestone move"} · Status unavailable`;
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
  onOpenServiceChannel: (channelId: string) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
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

  if (!props.isOpen) return null;
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
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="modal-overlay workflow-member-dossier-overlay"
      onMouseDown={props.onClose}
    >
      <section
        ref={dialogRef}
        className="modal resource-modal workflow-member-dossier-modal"
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
                className="workflow-member-dossier-avatar"
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

        <div className="modal-body workflow-member-dossier-body">
          {confirmation ? <section className="workflow-member-dossier-section" role="alertdialog" aria-labelledby="force-move-title" aria-describedby="force-move-warning">
            <h3 id="force-move-title">Force {confirmation.workflow?.override_state?.next_milestone_name ? "move to next milestone" : "workflow completion"}?</h3>
            <p><strong>{confirmation.display_name}</strong>: {confirmation.workflow?.current_milestone_name} → {confirmation.workflow?.override_state?.next_milestone_name ?? "Workflow complete"}</p>
            <p id="force-move-warning">This bypasses unmet requirements and does not mean the goal was achieved. Pending forms for this milestone will close. Your override will be recorded.</p>
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
          {dossier?.workflow?.requirements?.length && !dossier.workflow.completed_at ? <section>
            <h3>Move on when all requirements are met</h3>
            <ul>{dossier.workflow.requirements.map(requirement => <li key={requirement.key}>{requirement.satisfied ? "✓" : "○"} {requirement.label}</li>)}</ul>
          </section> : null}
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
              {dossier.workflow ? <section className="workflow-member-dossier-section">
                <h3>Milestone goal</h3>
                <p>{dossier.workflow.goal || "No goal specified."}</p>
                {!dossier.workflow.completed_at && dossier.workflow.override_state ? <button type="button" className="secondary" data-override-open onClick={() => { setForceError(null); setConfirmation(dossier); }}>Force move…</button> : null}
              </section> : null}
              {props.formResponses}
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

              <details className="workflow-member-dossier-section workflow-member-milestone-history">
                <summary>Recent milestone history</summary>
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
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No recorded milestone changes.</p>
                )}
              </details>
            </>
          ) : null}
          </>}
        </div>
      </section>
    </div>,
    document.body,
  );
}
