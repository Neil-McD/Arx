type ActiveCommunityForDeleteModal = {
  name: string;
};

type WebDeleteCommunityModalProps = {
  isOpen: boolean;
  activeCommunity: ActiveCommunityForDeleteModal | null;
  deleteCommunityNameInput: string;
  deleteCommunityConfirmInput: string;
  deleteCommunityError: string | null;
  isDeletingCommunity: boolean;
  onClose: () => void;
  onChangeDeleteCommunityNameInput: (value: string) => void;
  onChangeDeleteCommunityConfirmInput: (value: string) => void;
  onConfirmDelete: () => Promise<void> | void;
};

export function WebDeleteCommunityModal(props: WebDeleteCommunityModalProps) {
  const {
    isOpen,
    activeCommunity,
    deleteCommunityNameInput,
    deleteCommunityConfirmInput,
    deleteCommunityError,
    isDeletingCommunity,
    onClose,
    onChangeDeleteCommunityNameInput,
    onChangeDeleteCommunityConfirmInput,
    onConfirmDelete,
  } = props;

  if (!isOpen || !activeCommunity) return null;

  const expected = activeCommunity.name.trim().toLowerCase();
  const nameOk = expected.length > 0 && deleteCommunityNameInput.trim().toLowerCase() === expected;
  const keywordOk = deleteCommunityConfirmInput.trim().toLowerCase() === "delete";
  const disableDelete = isDeletingCommunity || !(nameOk && keywordOk);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal delete-community-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Delete community</div>
          <button className="modal-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="model-note">
            This permanently deletes <strong>{activeCommunity.name}</strong> and all associated data. This cannot be undone.
          </div>
          <label className="create-community-field">
            <span>Type the community name to confirm</span>
            <input
              type="text"
              placeholder={activeCommunity.name}
              value={deleteCommunityNameInput}
              onChange={(event) => onChangeDeleteCommunityNameInput(event.target.value)}
              disabled={isDeletingCommunity}
            />
          </label>
          <label className="create-community-field">
            <span>Type delete to confirm</span>
            <input
              type="text"
              placeholder="delete"
              value={deleteCommunityConfirmInput}
              onChange={(event) => onChangeDeleteCommunityConfirmInput(event.target.value)}
              disabled={isDeletingCommunity}
            />
          </label>
          {deleteCommunityError && <div className="auth-error">{deleteCommunityError}</div>}
        </div>
        <div className="modal-footer">
          <div className="create-community-actions">
            <button className="create-community-secondary" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="create-community-secondary danger"
              onClick={() => void onConfirmDelete()}
              disabled={disableDelete}
            >
              {isDeletingCommunity ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
