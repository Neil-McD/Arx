import type { ChangeEvent } from "react";

type WebDeleteProjectModalProps = {
  isOpen: boolean;
  projectName: string;
  confirmationValue: string;
  error: string | null;
  isDeleting: boolean;
  onClose: () => void;
  onChangeConfirmationValue: (value: string) => void;
  onConfirm: () => void | Promise<void>;
};

export function WebDeleteProjectModal(props: WebDeleteProjectModalProps) {
  const {
    isOpen,
    projectName,
    confirmationValue,
    error,
    isDeleting,
    onClose,
    onChangeConfirmationValue,
    onConfirm,
  } = props;

  if (!isOpen) return null;

  const normalizedProjectName = projectName.trim();
  const canDelete = normalizedProjectName.length > 0 && confirmationValue.trim() === normalizedProjectName && !isDeleting;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChangeConfirmationValue(event.target.value);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal delete-project-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="create-project-heading">
            <div className="modal-title">Delete computer</div>
            <div className="create-project-subtitle">
              Type <strong>{normalizedProjectName || "this computer"}</strong> to permanently delete this computer,
              archive its threads, and remove its workspace volume.
            </div>
          </div>
          <button className="modal-close" type="button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="create-project-form">
            <label className="create-project-field">
              <span>Confirm computer name</span>
              <input
                type="text"
                placeholder={normalizedProjectName || "Computer name"}
                value={confirmationValue}
                onChange={handleChange}
                autoFocus
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>
            {error ? <div className="auth-error">{error}</div> : null}
          </div>
        </div>
        <div className="modal-footer create-project-footer">
          <button type="button" className="create-project-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="delete-project-primary"
            onClick={() => void onConfirm()}
            disabled={!canDelete}
          >
            {isDeleting ? "Deleting…" : "Delete computer"}
          </button>
        </div>
      </div>
    </div>
  );
}
