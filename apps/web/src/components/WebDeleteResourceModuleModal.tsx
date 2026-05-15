type WebDeleteResourceModuleModalProps = {
  isOpen: boolean;
  moduleName: string | null;
  resourceCount: number;
  moduleNameInput: string;
  deleteInput: string;
  isDeleting: boolean;
  error: string | null;
  onChangeModuleNameInput: (value: string) => void;
  onChangeDeleteInput: (value: string) => void;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
};

export function WebDeleteResourceModuleModal(props: WebDeleteResourceModuleModalProps) {
  const {
    isOpen,
    moduleName,
    resourceCount,
    moduleNameInput,
    deleteInput,
    isDeleting,
    error,
    onChangeModuleNameInput,
    onChangeDeleteInput,
    onClose,
    onConfirm,
  } = props;

  if (!isOpen) return null;

  const normalizedModuleName = (moduleName ?? "").trim();
  const canDelete =
    normalizedModuleName.length > 0 &&
    moduleNameInput.trim() === normalizedModuleName &&
    deleteInput.trim() === "delete";
  const visibleResourceLabel = `${resourceCount} loaded resource${resourceCount === 1 ? "" : "s"}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal resource-modal delete-resource-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header resource-delete-header">
          <div className="resource-delete-copy">
            <div className="resource-viewer-eyebrow">Delete module</div>
            <h2 className="resource-delete-title">Delete this module?</h2>
            <div className="resource-modal-subtitle">
              This removes the module container. Its resources stay in the community.
            </div>
          </div>
          <button className="modal-close" type="button" onClick={onClose} title="Close" disabled={isDeleting}>
            x
          </button>
        </div>
        <div className="modal-body resource-delete-body">
          <div className="resource-delete-surface">
            <div className="resource-delete-label">Module</div>
            <div className="resource-delete-name">{moduleName || "This module"}</div>
            <div className="resource-delete-note">
              Resources inside this module will move back to the default Resources section. This cannot be undone.
              {resourceCount > 0 ? ` Currently visible here: ${visibleResourceLabel}.` : ""}
            </div>
          </div>
          <div className="resource-delete-confirm-fields">
            <label>
              <span>Type the module name</span>
              <input
                value={moduleNameInput}
                onChange={(event) => onChangeModuleNameInput(event.target.value)}
                placeholder={moduleName ?? "Module name"}
                disabled={isDeleting}
              />
            </label>
            <label>
              <span>Type delete</span>
              <input
                value={deleteInput}
                onChange={(event) => onChangeDeleteInput(event.target.value)}
                placeholder="delete"
                disabled={isDeleting}
              />
            </label>
          </div>
          {error ? <div className="auth-error">{error}</div> : null}
        </div>
        <div className="modal-footer">
          <div className="resource-modal-actions">
            <button className="secondary" type="button" onClick={onClose} disabled={isDeleting}>
              Cancel
            </button>
            <button
              className="resource-delete-confirm"
              type="button"
              onClick={() => void onConfirm()}
              disabled={isDeleting || !canDelete}
            >
              {isDeleting ? "Deleting..." : "Delete module"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
