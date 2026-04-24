type PreviewAccessGateModalState = {
  reason: "new_thread";
} | {
  reason: "preview_issue";
  issueReason: "rate_limited" | "misconfigured" | "unavailable";
  message: string;
} | null;

type WebPreviewAccessGateModalProps = {
  previewAccessGateModal: PreviewAccessGateModalState;
  authError: string | null;
  isRunning: boolean;
  onClose: () => void;
  onContinueToSignIn: () => void;
};

export function WebPreviewAccessGateModal(props: WebPreviewAccessGateModalProps) {
  const {
    previewAccessGateModal,
    authError,
    isRunning,
    onClose,
    onContinueToSignIn,
  } = props;

  if (!previewAccessGateModal) return null;

  const title =
    previewAccessGateModal.reason === "new_thread"
      ? "Create a free account to start more threads"
      : previewAccessGateModal.issueReason === "rate_limited"
        ? "Preview is busy"
        : "Preview is unavailable";
  const message =
    previewAccessGateModal.reason === "new_thread"
      ? "Preview supports one thread. Continue to sign in to save chats, unlock more models, use your ChatGPT Plus / Pro access on Polynet, and discover communities, agents, and apps across the network."
      : previewAccessGateModal.message;

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (isRunning) return;
        onClose();
      }}
    >
      <div
        className="modal modal-auth-gate"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button
            className="modal-close"
            type="button"
            onClick={onClose}
            title="Close"
            disabled={isRunning}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="model-note" style={{ marginBottom: 12 }}>
            {message}
          </div>
          {authError ? (
            <div className="auth-error" style={{ marginBottom: 12 }}>
              {authError}
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          <div className="auth-actions">
            <button
              type="button"
              className="auth-gate-google-button"
              onClick={onContinueToSignIn}
              disabled={isRunning}
            >
              {isRunning ? "Continuing to sign in…" : "Continue to sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
