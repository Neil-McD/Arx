import { X } from "lucide-react";
import { useEffect } from "react";

import { UserAvatar } from "../../../../shared/UserAvatar";
import type { CloudCommunityMemberSuccessDossier } from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
import { formatWorkflowStageAge } from "./WebCommunityWorkflowMemberStub";

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
  useEffect(() => {
    if (!props.isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.isOpen, props.onClose]);

  if (!props.isOpen) return null;
  const dossier = props.dossier;
  const factsByKind = new Map<string, string[]>();
  for (const fact of dossier?.approved_community_context ?? []) {
    const facts = factsByKind.get(fact.kind) ?? [];
    facts.push(fact.body);
    factsByKind.set(fact.kind, facts);
  }

  return (
    <div
      className="modal-overlay workflow-member-dossier-overlay"
      onMouseDown={props.onClose}
    >
      <section
        className="modal resource-modal workflow-member-dossier-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-member-dossier-title"
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
                  {dossier.workflow.current_stage_name} · {formatWorkflowStageAge(
                    dossier.workflow.current_stage_entered_at,
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
                <h3>Current milestone</h3>
                <p>
                  {dossier.workflow.milestone ??
                    "This stage has no milestone configured."}
                </p>
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
                <h3>Stage history</h3>
                {dossier.transitions.length > 0 ? (
                  <ol className="workflow-member-history">
                    {dossier.transitions.map((transition) => (
                      <li key={transition.id}>
                        <span>{new Date(transition.occurred_at).toLocaleDateString()}</span>
                        <strong>{transition.from_stage_name} → {transition.to_stage_name}</strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No completed stage transitions yet.</p>
                )}
              </section>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
