import { Check, Circle, CircleHelp, X } from "lucide-react";
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

export function WebCommunityWorkflowMemberDossierModal(props: {
  isOpen: boolean;
  dossier: CloudCommunityMemberSuccessDossier | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!props.isOpen) return;
    const priorFocus = document.activeElement as HTMLElement | null;
    const appRoot = document.getElementById("root");
    appRoot?.setAttribute("inert", "");
    queueMicrotask(() => dialogRef.current?.querySelector<HTMLElement>("button")?.focus());
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
  const statusByCheck = new Map(
    (dossier?.workflow.check_statuses ?? []).map((status) => [
      status.check_key,
      status,
    ]),
  );

  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
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
    <div className="modal-overlay workflow-member-dossier-overlay" onMouseDown={props.onClose}>
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
                  {dossier.workflow.current_milestone_name} · {dossier.workflow.completed_at
                    ? "Workflow complete"
                    : formatWorkflowMilestoneAge(
                        dossier.workflow.current_milestone_entered_at,
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
            <div className="workflow-member-dossier-loading" aria-label="Loading member success">
              <span />
              <span />
              <span />
            </div>
          ) : props.error ? (
            <p className="workflow-error" role="alert">{props.error}</p>
          ) : dossier ? (
            <>
              <section className="workflow-member-dossier-section">
                <h3>Completion checks</h3>
                {dossier.workflow.checks.length > 0 ? (
                  <ul className="workflow-member-check-list">
                    {dossier.workflow.checks.map((check) => {
                      const status = statusByCheck.get(check.key);
                      const complete = status?.status === "complete";
                      const uncertain = status?.status === "uncertain";
                      const label = check.type === "automatic"
                        ? readableLabel(check.signal)
                        : check.criterion;
                      return (
                        <li key={check.key}>
                          {complete ? (
                            <Check size={16} aria-label="Complete" />
                          ) : uncertain ? (
                            <CircleHelp size={16} aria-label="Uncertain" />
                          ) : (
                            <Circle size={16} aria-label="Pending" />
                          )}
                          <div>
                            <strong>{label}</strong>
                            <span>{check.type === "automatic" ? "Automatic" : "AI judgment"}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p>No completion checks configured.</p>
                )}
              </section>

              <section className="workflow-member-dossier-section">
                <h3>Approved context</h3>
                {factsByKind.size > 0 ? (
                  <div className="workflow-member-context-list">
                    {Array.from(factsByKind.entries()).map(([kind, facts]) => (
                      <div key={kind}>
                        <strong>{readableLabel(kind)}</strong>
                        {facts.map((fact) => <p key={fact}>{fact}</p>)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No member-approved context has been shared with this community.</p>
                )}
              </section>

              <section className="workflow-member-dossier-section">
                <h3>Latest assessment</h3>
                {dossier.latest_evaluation ? (
                  <div className="workflow-member-assessment">
                    <strong>
                      {dossier.latest_evaluation.decision
                        ? readableLabel(dossier.latest_evaluation.decision)
                        : readableLabel(dossier.latest_evaluation.status)}
                    </strong>
                    {dossier.latest_evaluation.explanation ? (
                      <p>{dossier.latest_evaluation.explanation}</p>
                    ) : null}
                    {dossier.latest_evaluation.missing_evidence.length > 0 ? (
                      <div>
                        <span>Still needed</span>
                        <ul>
                          {dossier.latest_evaluation.missing_evidence.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p>No milestone assessment yet.</p>
                )}
              </section>

              <section className="workflow-member-dossier-section">
                <h3>Milestone history</h3>
                {dossier.transitions.length > 0 ? (
                  <ol className="workflow-member-history">
                    {dossier.transitions.map((transition) => (
                      <li key={transition.id}>
                        <span>{new Date(transition.occurred_at).toLocaleString()}</span>
                        <strong>
                          {transition.completed_workflow
                            ? `${transition.milestone_name} → Workflow complete`
                            : `${transition.milestone_name} → ${transition.next_milestone_name}`}
                        </strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No completed milestones yet.</p>
                )}
              </section>
            </>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}
