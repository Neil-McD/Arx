type WebDeleteResourceModalProps = {
  isOpen: boolean;
  resourceTitle: string | null;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
};

export function WebDeleteResourceModal(props: WebDeleteResourceModalProps) {
  const { isOpen, resourceTitle, isDeleting, onClose, onConfirm } = props;

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal resource-modal delete-resource-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header resource-delete-header">
          <div className="resource-delete-copy">
            <div className="resource-viewer-eyebrow">Delete lesson</div>
            <h2 className="resource-delete-title">Delete this lesson?</h2>
            <div className="resource-modal-subtitle">
              This will remove the lesson for everyone in the community.
            </div>
          </div>
          <button className="modal-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body resource-delete-body">
          <div className="resource-delete-surface">
            <div className="resource-delete-label">Lesson</div>
            <div className="resource-delete-name">{resourceTitle || "This lesson"}</div>
            <div className="resource-delete-note">
              Members will no longer be able to find or open it from this course.
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <div className="resource-modal-actions">
            <button className="secondary" onClick={onClose} disabled={isDeleting}>
              Cancel
            </button>
            <button className="resource-delete-confirm" onClick={() => void onConfirm()} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete lesson"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
