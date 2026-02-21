type WebCommunityResourceModalProps = {
  isOpen: boolean;
  hasActiveCommunity: boolean;
  editingResourceId: string | null;
  resourceTitleInput: string;
  resourceUrlInput: string;
  resourceBodyInput: string;
  resourcePinnedInput: boolean;
  resourceError: string | null;
  isSavingResource: boolean;
  onClose: () => void;
  onCancel: () => void;
  onSave: () => Promise<void> | void;
  onChangeTitle: (value: string) => void;
  onChangeUrl: (value: string) => void;
  onChangeBody: (value: string) => void;
  onChangePinned: (value: boolean) => void;
};

export function WebCommunityResourceModal(props: WebCommunityResourceModalProps) {
  const {
    isOpen,
    hasActiveCommunity,
    editingResourceId,
    resourceTitleInput,
    resourceUrlInput,
    resourceBodyInput,
    resourcePinnedInput,
    resourceError,
    isSavingResource,
    onClose,
    onCancel,
    onSave,
    onChangeTitle,
    onChangeUrl,
    onChangeBody,
    onChangePinned,
  } = props;

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal resource-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{editingResourceId ? "Edit resource" : "Add resource"}</div>
          <button className="modal-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="resource-form">
            <input
              type="text"
              placeholder="Title"
              value={resourceTitleInput}
              onChange={(event) => onChangeTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void onSave();
                }
              }}
              disabled={!hasActiveCommunity}
            />
            <input
              type="text"
              placeholder="Embed video (YouTube/Wistia URL)"
              value={resourceUrlInput}
              onChange={(event) => onChangeUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void onSave();
                }
              }}
              disabled={!hasActiveCommunity}
            />
            <textarea
              placeholder="Short description"
              value={resourceBodyInput}
              onChange={(event) => onChangeBody(event.target.value)}
              disabled={!hasActiveCommunity}
            />
            <label className="resource-pin">
              <input
                type="checkbox"
                checked={resourcePinnedInput}
                onChange={(event) => onChangePinned(event.target.checked)}
                disabled={!hasActiveCommunity}
              />
              Pin to top
            </label>
            {resourceError && <div className="auth-error">{resourceError}</div>}
          </div>
        </div>
        <div className="modal-footer">
          <div className="resource-modal-actions">
            <button
              onClick={() => void onSave()}
              disabled={
                !hasActiveCommunity ||
                isSavingResource ||
                resourceTitleInput.trim().length === 0 ||
                resourceBodyInput.trim().length === 0
              }
            >
              {isSavingResource ? "Saving..." : editingResourceId ? "Save changes" : "Save resource"}
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
