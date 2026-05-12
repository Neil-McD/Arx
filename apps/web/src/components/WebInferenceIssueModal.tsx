import {
  formatWorkspaceToolBalanceUsdFromCredits,
  type PaidToolKind,
  WORKSPACE_TOOL_BALANCE_TOPUP_PACKS,
  type WorkspaceToolBalanceTopupPackId,
} from "../../../../shared/workspaceCredits";

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
} | null;

type WebInferenceIssueModalProps = {
  hasSession: boolean;
  inferenceIssueModal: InferenceIssueModalState;
  isInferenceIssueModalRunning: boolean;
  isStartingWorkspaceCreditTopupCheckout?: boolean;
  workspaceCreditTopupError?: string | null;
  onClose: () => void;
  onOpenSettings: (reason: InferenceIssueReason) => void;
  onStartWorkspaceCreditTopupCheckout?: (packId?: WorkspaceToolBalanceTopupPackId) => Promise<void> | void;
};

export function WebInferenceIssueModal(props: WebInferenceIssueModalProps) {
  const {
    hasSession,
    inferenceIssueModal,
    isInferenceIssueModalRunning,
    isStartingWorkspaceCreditTopupCheckout = false,
    workspaceCreditTopupError = null,
    onClose,
    onOpenSettings,
    onStartWorkspaceCreditTopupCheckout,
  } = props;

  if (!hasSession || !inferenceIssueModal) return null;
  const paidToolKind = inferenceIssueModal.toolKind ?? null;
  const requiredCredits =
    typeof inferenceIssueModal.requiredCredits === "number" &&
    Number.isFinite(inferenceIssueModal.requiredCredits) &&
    inferenceIssueModal.requiredCredits > 0
      ? inferenceIssueModal.requiredCredits
      : null;

  const paidToolTitle =
    paidToolKind === "voice_input"
      ? "Add balance to use voice input"
      : paidToolKind === "web_research"
        ? "Add balance to research the web"
      : paidToolKind === "workspace_tools"
        ? "Add balance to use workspace tools"
      : "Add balance to use premium tools";

  const paidToolPrimaryMessage =
    paidToolKind === "voice_input"
      ? "Voice input uses paid transcription so you can dictate into chats and workspace threads."
      : paidToolKind === "web_research"
        ? "Web research uses paid provider calls to search, open pages, and bring current web context into a run."
      : paidToolKind === "workspace_tools"
        ? "Workspace tools use paid sandbox compute for project, file, terminal, browser, and computer-use work."
      : inferenceIssueModal.message || "Premium tools use paid provider or sandbox infrastructure, so they need tool balance before they run.";

  const paidToolFollowupMessage =
    requiredCredits !== null
      ? `This call needs at least ${formatWorkspaceToolBalanceUsdFromCredits(requiredCredits)} in tool balance. Add balance below, then retry from the same thread.`
      : "Add balance below, then retry from the same thread. Chat still uses your connected ChatGPT account or OpenAI API key.";

  const title =
    inferenceIssueModal.reason === "provider_connection_required"
      ? "Connect a provider"
    : inferenceIssueModal.reason === "workspace_credits"
        ? paidToolTitle
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
          {inferenceIssueModal.reason === "workspace_credits" && (
            <>
              <div className="tool-balance-pack-grid modal-tool-balance-pack-grid">
                {WORKSPACE_TOOL_BALANCE_TOPUP_PACKS.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    className={`tool-balance-pack-button${pack.recommended ? " recommended" : ""}`}
                    onClick={() => void onStartWorkspaceCreditTopupCheckout?.(pack.id)}
                    disabled={isInferenceIssueModalRunning || isStartingWorkspaceCreditTopupCheckout}
                  >
                    <strong>{pack.label}</strong>
                    <span>{pack.recommended ? "Recommended" : "Add balance"}</span>
                  </button>
                ))}
              </div>
              <div className="model-note">
                Tool balance is non-refundable and only works inside Polynet.
              </div>
              {workspaceCreditTopupError ? (
                <div className="auth-error" style={{ marginTop: 12 }}>
                  {workspaceCreditTopupError}
                </div>
              ) : null}
            </>
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
                {inferenceIssueModal.reason === "workspace_credits"
                  ? "Manage in Agent Settings"
                  : inferenceIssueModal.reason === "provider_connection_required"
                    ? "Open Account Settings"
                  : "Open account settings"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
