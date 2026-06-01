type WebCommunityResourceModuleModalProps = {
  isOpen: boolean;
  isEditingModule: boolean;
  hasActiveCommunity: boolean;
  moduleNameInput: string;
  moduleError: string | null;
  isSavingModule: boolean;
  onClose: () => void;
  onCancel: () => void;
  onSave: () => Promise<void> | void;
  onDelete: (() => Promise<boolean> | boolean) | null;
  onChangeName: (value: string) => void;
};

export function WebCommunityResourceModuleModal(props: WebCommunityResourceModuleModalProps) {
  const {
    isOpen,
    isEditingModule,
    hasActiveCommunity,
    moduleNameInput,
    moduleError,
    isSavingModule,
    onClose,
    onCancel,
    onSave,
    onDelete,
    onChangeName,
  } = props;

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal resource-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEditingModule ? "Edit category" : "Add category"}</div>
            <div className="resource-modal-subtitle">
              {isEditingModule
                ? "Rename this resource category or remove it from the community."
                : "Name the category that will hold related pages."}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} title="Close">
            x
          </button>
        </div>
        <div className="modal-body">
          <div className="resource-form">
            <div className="resource-form-section">
              <div className="resource-field-label">Name</div>
              <input
                className="resource-title-input"
                type="text"
                placeholder="Category name"
                value={moduleNameInput}
                onChange={(event) => onChangeName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void onSave();
                  }
                }}
                disabled={!hasActiveCommunity}
              />
            </div>

            {moduleError && <div className="auth-error">{moduleError}</div>}
          </div>
        </div>
        <div className="modal-footer">
          <div className="resource-modal-actions">
            {isEditingModule && onDelete ? (
              <button
                className="secondary danger"
                onClick={() => void onDelete()}
                disabled={!hasActiveCommunity || isSavingModule}
              >
                Delete
              </button>
            ) : null}
            <button
              className="platform-save-button"
              onClick={() => void onSave()}
              disabled={!hasActiveCommunity || isSavingModule || moduleNameInput.trim().length === 0}
            >
              {isSavingModule ? "Saving..." : "Save category"}
            </button>
            <button className="secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
