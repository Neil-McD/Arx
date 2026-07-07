import type { PaidUsageBillingMode } from "../../../../shared/paidUsageBilling";
import type { PaidToolKind } from "../../../../shared/workspaceCredits";

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
  toolKind?: PaidToolKind | null;
  requiredCredits?: number | null;
  paidUsageBillingMode?: PaidUsageBillingMode | null;
} | null;

type WebInferenceIssueModalProps = {
  hasSession: boolean;
  inferenceIssueModal: InferenceIssueModalState;
  isInferenceIssueModalRunning: boolean;
  onClose: () => void;
  onOpenSettings: (reason: InferenceIssueReason) => void;
};

function paidToolUiLabel(kind: PaidToolKind | null): string {
  if (kind === "workspace_tools") return "workspace tools";
  if (kind === "web_research") return "web research";
  if (kind === "voice_input") return "voice input";
  return "premium tools";
}

export function WebInferenceIssueModal(props: WebInferenceIssueModalProps) {
  const {
    hasSession,
    inferenceIssueModal,
    isInferenceIssueModalRunning,
    onClose,
    onOpenSettings,
  } = props;

  if (!hasSession || !inferenceIssueModal) return null;
  const paidToolKind = inferenceIssueModal.toolKind ?? null;
  const isWorkspaceBillingIssue = inferenceIssueModal.reason === "workspace_credits";
  const paidToolLabel = paidToolUiLabel(paidToolKind);

  const paidToolPrimaryMessage =
    isWorkspaceBillingIssue
      ? `Access to ${paidToolLabel} requires Polynet Premium.`
      : inferenceIssueModal.message || `Access to ${paidToolLabel} requires Polynet Premium.`;

  const paidToolFollowupMessage =
    isWorkspaceBillingIssue
      ? "Open Billing to upgrade, then retry this request."
      : "Open Billing to upgrade, then retry this request.";

  const title =
    inferenceIssueModal.reason === "provider_connection_required"
      ? "Connect a provider"
    : inferenceIssueModal.reason === "workspace_credits"
        ? "Premium tools required"
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
      ? inferenceIssueModal.message || "Connect ChatGPT or add an OpenAI API key to use agent runs."
    : inferenceIssueModal.reason === "workspace_credits"
        ? paidToolPrimaryMessage
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
      ? "Use ChatGPT Plus / Pro rate limits with no extra Polynet inference charge, or add an OpenAI API key billed directly through OpenAI."
    : inferenceIssueModal.reason === "workspace_credits"
        ? paidToolFollowupMessage
      : inferenceIssueModal.reason === "quota"
        ? "To continue, check your connected provider in Account Settings."
        : inferenceIssueModal.reason === "plan"
          ? "To continue, check your connected provider in Account Settings."
          : "To continue, check your provider in Account Settings.";
  const modalClassName = "modal inference-issue-modal";

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (isInferenceIssueModalRunning) return;
        onClose();
      }}
    >
      <div className={modalClassName} onClick={(event) => event.stopPropagation()}>
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
          <div className="workspace-billing-modal-copy">
            <div className="model-note">
              {primaryMessage}
            </div>
            <div className="model-note">
              {followupMessage}
            </div>
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
                className="platform-save-button platform-save-button--compact inference-issue-primary-action"
                onClick={() => onOpenSettings(inferenceIssueModal.reason)}
                disabled={isInferenceIssueModalRunning}
              >
                {inferenceIssueModal.reason === "provider_connection_required"
                    ? "Open Account Settings"
                  : inferenceIssueModal.reason === "workspace_credits"
                    ? "Open Billing"
                    : "Open account settings"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
