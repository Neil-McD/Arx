type WebCommunityResourceModuleModalProps = {
  isOpen: boolean;
  hasActiveCommunity: boolean;
  moduleNameInput: string;
  moduleDescriptionInput: string;
  moduleBannerUrlInput: string;
  moduleError: string | null;
  isSavingModule: boolean;
  onClose: () => void;
  onCancel: () => void;
  onSave: () => Promise<void> | void;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeBannerUrl: (value: string) => void;
};

export function WebCommunityResourceModuleModal(props: WebCommunityResourceModuleModalProps) {
  const {
    isOpen,
    hasActiveCommunity,
    moduleNameInput,
    moduleDescriptionInput,
    moduleBannerUrlInput,
    moduleError,
    isSavingModule,
    onClose,
    onCancel,
    onSave,
    onChangeName,
    onChangeDescription,
    onChangeBannerUrl,
  } = props;

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal resource-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Add module</div>
            <div className="resource-modal-subtitle">
              Create a course-style container for related resources.
            </div>
          </div>
          <button className="modal-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="resource-form">
            <div className="resource-form-section">
              <div className="resource-field-label">Name</div>
              <input
                className="resource-title-input"
                type="text"
                placeholder="Module name"
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

            <div className="resource-form-section">
              <div className="resource-field-label">Description</div>
              <textarea
                className="resource-description-input"
                placeholder="What should members find in this module?"
                value={moduleDescriptionInput}
                onChange={(event) => onChangeDescription(event.target.value)}
                disabled={!hasActiveCommunity}
              />
            </div>

            <div className="resource-form-section">
              <div className="resource-field-label">Banner URL</div>
              <input
                className="resource-title-input"
                type="text"
                placeholder="Optional image URL"
                value={moduleBannerUrlInput}
                onChange={(event) => onChangeBannerUrl(event.target.value)}
                disabled={!hasActiveCommunity}
              />
            </div>

            {moduleError && <div className="auth-error">{moduleError}</div>}
          </div>
        </div>
        <div className="modal-footer">
          <div className="resource-modal-actions">
            <button
              className="platform-save-button"
              onClick={() => void onSave()}
              disabled={!hasActiveCommunity || isSavingModule || moduleNameInput.trim().length === 0}
            >
              {isSavingModule ? "Saving..." : "Save module"}
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
