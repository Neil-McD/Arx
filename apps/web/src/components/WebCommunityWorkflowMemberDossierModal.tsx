import { X } from "lucide-react";
import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import { UserAvatar } from "../../../../shared/UserAvatar";
import type { CloudCommunityMemberSuccessDossier } from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
import { formatWorkflowMilestoneAge } from "./WebCommunityWorkflowMemberStub";

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
  isOpen: boolean;
  dossier: CloudCommunityMemberSuccessDossier | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);

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
    facts.push(fact.body);
    factsByKind.set(fact.kind, facts);
  }

  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
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
              <section className="workflow-member-dossier-section">
                <h3>Shared context</h3>
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
        </div>
      </section>
    </div>,
    document.body,
  );
}
