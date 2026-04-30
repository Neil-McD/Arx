type InferenceIssueReason =
  | "quota"
  | "workspace_credits"
  | "plan"
  | "provider_connection_required"
  | "misconfigured"
  | "disabled"
  | "unavailable";

type InferenceIssueModalState = {
  reason: InferenceIssueReason;
  threadId: string;
  mode: "respond" | "regenerate";
  message: string | null;
} | null;

type WebInferenceIssueModalProps = {
  hasSession: boolean;
  inferenceIssueModal: InferenceIssueModalState;
  isInferenceIssueModalRunning: boolean;
  onClose: () => void;
  onOpenSettings: (reason: InferenceIssueReason) => void;
};

export function WebInferenceIssueModal(props: WebInferenceIssueModalProps) {
  const {
    hasSession,
    inferenceIssueModal,
    isInferenceIssueModalRunning,
    onClose,
    onOpenSettings,
  } = props;

  if (!hasSession || !inferenceIssueModal) return null;

  const title =
    inferenceIssueModal.reason === "provider_connection_required"
      ? "Connect a provider"
      : inferenceIssueModal.reason === "workspace_credits"
        ? "Workspace credits used up"
      : inferenceIssueModal.reason === "quota"
        ? "Provider quota reached"
        : inferenceIssueModal.reason === "plan"
          ? "Model not in your plan"
          : inferenceIssueModal.reason === "misconfigured"
            ? "Provider not configured"
            : inferenceIssueModal.reason === "disabled"
              ? "Model temporarily disabled"
              : "Provider unavailable";

  const primaryMessage =
    inferenceIssueModal.reason === "provider_connection_required"
      ? inferenceIssueModal.message || "Connect ChatGPT to use agent runs."
      : inferenceIssueModal.reason === "workspace_credits"
        ? inferenceIssueModal.message || "You've used your included workspace compute credits for this billing cycle."
      : inferenceIssueModal.reason === "quota"
        ? inferenceIssueModal.message || "Your connected provider has run out of available quota or credits for this model."
        : inferenceIssueModal.reason === "plan"
          ? inferenceIssueModal.message || "This model isn't included in your current plan."
          : inferenceIssueModal.reason === "misconfigured"
            ? inferenceIssueModal.message || "The provider configuration for this model is incomplete."
            : inferenceIssueModal.reason === "disabled"
              ? inferenceIssueModal.message || "This model is currently disabled."
              : inferenceIssueModal.message || "The inference provider is temporarily unavailable.";

  const followupMessage =
    inferenceIssueModal.reason === "provider_connection_required"
      ? "To continue, open Account Settings to connect ChatGPT."
      : inferenceIssueModal.reason === "workspace_credits"
        ? "To continue, open Agent Settings to review or top up your workspace credits. Community tools and web research still work without Daytona compute."
      : inferenceIssueModal.reason === "quota"
        ? "To continue, check your connected provider in Account Settings."
        : inferenceIssueModal.reason === "plan"
          ? "To continue, upgrade to a plan that includes agent runs."
          : "To continue, check your provider in Account Settings.";

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (isInferenceIssueModalRunning) return;
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
            disabled={isInferenceIssueModalRunning}
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
          {inferenceIssueModal.reason === "plan" && (
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
              disabled={isInferenceIssueModalRunning}
            >
              Cancel
            </button>
            {inferenceIssueModal.reason !== "plan" && (
              <button
                type="button"
                className="secondary"
                onClick={() => onOpenSettings(inferenceIssueModal.reason)}
                disabled={isInferenceIssueModalRunning}
              >
                {inferenceIssueModal.reason === "workspace_credits"
                  ? "Open agent settings"
                  : "Open account settings"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
