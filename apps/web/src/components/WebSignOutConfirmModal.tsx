type WebSignOutConfirmModalProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
};

export function WebSignOutConfirmModal(props: WebSignOutConfirmModalProps) {
  const { isOpen, isSubmitting, onClose, onConfirm } = props;

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={isSubmitting ? undefined : onClose}>
      <div className="modal resource-modal delete-resource-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header resource-delete-header">
          <div className="resource-delete-copy">
            <div className="resource-viewer-eyebrow">Sign out</div>
            <h2 className="resource-delete-title">Sign out of Polynet?</h2>
            <div className="resource-modal-subtitle">
              You&apos;ll be signed out on this device and can sign back in whenever you want.
            </div>
          </div>
          <button className="modal-close" onClick={onClose} title="Close" disabled={isSubmitting}>
            ×
          </button>
        </div>
        <div className="modal-body resource-delete-body">
          {props.error ? <div role="alert" className="error">{props.error}</div> : null}
          <div className="resource-delete-surface">
            <div className="resource-delete-label">What happens next</div>
            <div className="resource-delete-note">
              Your communities, projects, and connected accounts stay intact. This only ends the current session.
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <div className="resource-modal-actions">
            <button className="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button className="platform-save-button" onClick={() => void onConfirm()} disabled={isSubmitting}>
              {isSubmitting ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
