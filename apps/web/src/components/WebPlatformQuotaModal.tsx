type PlatformQuotaReason = "quota" | "plan" | "misconfigured" | "disabled" | "unavailable";

type PlatformQuotaModalState = {
  reason: PlatformQuotaReason;
  threadId: string;
  mode: "respond" | "regenerate";
  message: string | null;
} | null;

type WebPlatformQuotaModalProps = {
  hasSession: boolean;
  platformQuotaModal: PlatformQuotaModalState;
  isPlatformQuotaModalRunning: boolean;
  onClose: () => void;
  onChangeModel: (threadId: string) => void;
};

export function WebPlatformQuotaModal(props: WebPlatformQuotaModalProps) {
  const {
    hasSession,
    platformQuotaModal,
    isPlatformQuotaModalRunning,
    onClose,
    onChangeModel,
  } = props;

  if (!hasSession || !platformQuotaModal) return null;

  const title =
    platformQuotaModal.reason === "quota"
      ? "Polynet AI quota reached"
      : platformQuotaModal.reason === "plan"
        ? "Model not in your plan"
        : platformQuotaModal.reason === "misconfigured"
          ? "Model not configured"
          : platformQuotaModal.reason === "disabled"
            ? "Model temporarily disabled"
            : "Polynet AI unavailable";

  const primaryMessage =
    platformQuotaModal.reason === "quota"
      ? "You've used your included Polynet AI quota for this month."
      : platformQuotaModal.reason === "plan"
        ? platformQuotaModal.message || "This model isn't included in your current plan."
        : platformQuotaModal.reason === "misconfigured"
          ? platformQuotaModal.message || "Polynet AI isn't configured for this model yet."
          : platformQuotaModal.reason === "disabled"
            ? platformQuotaModal.message || "Polynet AI is currently disabled for this model."
            : platformQuotaModal.message || "Polynet AI is temporarily unavailable.";

  const followupMessage =
    platformQuotaModal.reason === "quota"
      ? "To continue, choose another available model or upgrade for more included quota."
      : platformQuotaModal.reason === "plan"
        ? "To continue, choose another available model or upgrade to a plan that includes this model."
        : "To continue, choose another available model while this one is being fixed.";

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (isPlatformQuotaModalRunning) return;
        onClose();
      }}
    >
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button
            className="modal-close"
            type="button"
            onClick={onClose}
            title="Close"
            disabled={isPlatformQuotaModalRunning}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="model-note" style={{ marginBottom: 12 }}>
            {primaryMessage}
          </div>
          <div className="model-note" style={{ marginBottom: 12 }}>
            {followupMessage}
          </div>
          {platformQuotaModal.reason === "plan" && (
            <div className="auth-error" style={{ marginBottom: 12 }}>
              This model isn&apos;t available on your current plan.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <div className="auth-actions">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={isPlatformQuotaModalRunning}
            >
              Cancel
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => onChangeModel(platformQuotaModal.threadId)}
              disabled={isPlatformQuotaModalRunning}
            >
              Change model
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
