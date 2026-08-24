import { Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import type { CommunityMemberWorkflowStage } from "../../../../shared/communityMemberWorkflow";

type WebCommunityWorkflowStageModalProps = {
  isOpen: boolean;
  stage: CommunityMemberWorkflowStage | null;
  stageNumber: number;
  isSaving: boolean;
  canDelete: boolean;
  deleteDisabledReason: string | null;
  error: string | null;
  onClose: () => void;
  onSave: (stage: CommunityMemberWorkflowStage) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
};

export function WebCommunityWorkflowStageModal(
  props: WebCommunityWorkflowStageModalProps,
) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (!props.isOpen || !props.stage) return;
    setName(props.stage.name);
  }, [props.isOpen, props.stage]);

  useEffect(() => {
    if (!props.isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !props.isSaving) props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.isOpen, props.isSaving, props.onClose]);

  if (!props.isOpen || !props.stage) return null;

  const canSave = name.trim().length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave || props.isSaving) return;
    void props.onSave({
      ...props.stage!,
      name,
    });
  };

  return (
    <div
      className="modal-overlay workflow-stage-modal-overlay"
      onMouseDown={props.isSaving ? undefined : props.onClose}
    >
      <form
        className="modal resource-modal workflow-stage-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-stage-modal-title"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title" id="workflow-stage-modal-title">
              {props.stage.name.trim()
                ? props.stage.name
                : `Set up stage ${props.stageNumber}`}
            </div>
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={props.onClose}
            disabled={props.isSaving}
            aria-label="Close stage editor"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          <div className="workflow-stage-form">
            <label>
              <span>Stage name</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Getting started"
                disabled={props.isSaving}
              />
            </label>
            {props.error ? (
              <p className="workflow-error" role="alert">
                {props.error}
              </p>
            ) : null}
          </div>
        </div>

        <div className="modal-footer">
          <div className="workflow-stage-modal-actions">
            <button
              className="secondary danger workflow-stage-delete-button"
              type="button"
              onClick={() => void props.onDelete()}
              disabled={!props.canDelete || props.isSaving}
              title={props.deleteDisabledReason ?? "Delete stage"}
            >
              <Trash2 size={15} aria-hidden="true" /> Delete
            </button>
            <div>
              <button
                className="secondary"
                type="button"
                onClick={props.onClose}
                disabled={props.isSaving}
              >
                Cancel
              </button>
              <button
                className="platform-save-button"
                type="submit"
                disabled={!canSave || props.isSaving}
              >
                {props.isSaving ? "Saving…" : "Save stage"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
