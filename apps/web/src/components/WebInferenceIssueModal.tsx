import { useEffect, useState } from "react";
import {
  paidUsageBillingModeForPaidToolFailure,
  type PaidUsageBillingMode,
} from "../../../../shared/paidUsageBilling";
import {
  formatWorkspaceToolBalanceUsdFromCredits,
  getPaidToolBalancePrimaryMessage,
  type PaidToolKind,
  type WorkspaceCreditTopupSurface,
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
  paidUsageBillingMode?: PaidUsageBillingMode | null;
} | null;

type WebInferenceIssueModalProps = {
  hasSession: boolean;
  inferenceIssueModal: InferenceIssueModalState;
  isInferenceIssueModalRunning: boolean;
  isStartingWorkspaceCreditTopupCheckout?: boolean;
  isStartingWorkspaceCardSetupCheckout?: boolean;
  workspaceCreditTopupError?: string | null;
  workspaceCardSetupError?: string | null;
  onClose: () => void;
  onOpenSettings: (reason: InferenceIssueReason) => void;
  onStartWorkspaceCreditTopupCheckout?: (
    packId?: WorkspaceToolBalanceTopupPackId,
    surface?: WorkspaceCreditTopupSurface,
  ) => Promise<void> | void;
  onStartWorkspaceCardSetupCheckout?: () => Promise<void> | void;
};

export function WebInferenceIssueModal(props: WebInferenceIssueModalProps) {
  const {
    hasSession,
    inferenceIssueModal,
    isInferenceIssueModalRunning,
    isStartingWorkspaceCreditTopupCheckout = false,
    isStartingWorkspaceCardSetupCheckout = false,
    workspaceCreditTopupError = null,
    workspaceCardSetupError = null,
    onClose,
    onOpenSettings,
    onStartWorkspaceCreditTopupCheckout,
    onStartWorkspaceCardSetupCheckout,
  } = props;

  const [showManualBalance, setShowManualBalance] = useState(false);
  useEffect(() => {
    setShowManualBalance(false);
  }, [
    inferenceIssueModal?.reason,
    inferenceIssueModal?.threadId,
    inferenceIssueModal?.paidUsageBillingMode,
  ]);

  if (!hasSession || !inferenceIssueModal) return null;
  const paidToolKind = inferenceIssueModal.toolKind ?? null;
  const paidUsageBillingMode =
    inferenceIssueModal.reason === "workspace_credits"
      ? inferenceIssueModal.paidUsageBillingMode ??
        paidUsageBillingModeForPaidToolFailure(paidToolKind)
      : null;
  const isWorkspaceBillingIssue = inferenceIssueModal.reason === "workspace_credits";
  const requiresWorkspaceCardSetup =
    isWorkspaceBillingIssue &&
    (paidUsageBillingMode === "card_required" ||
      paidUsageBillingMode === "card_preferred");
  const manualBalanceAllowed =
    isWorkspaceBillingIssue && paidUsageBillingMode !== "card_required";
  const shouldShowToolBalancePacks =
    isWorkspaceBillingIssue &&
    (paidUsageBillingMode === "prepaid_required" ||
      (manualBalanceAllowed && showManualBalance));
  const checkoutBusy =
    isInferenceIssueModalRunning ||
    isStartingWorkspaceCreditTopupCheckout ||
    isStartingWorkspaceCardSetupCheckout;
  const requiredCredits =
    typeof inferenceIssueModal.requiredCredits === "number" &&
    Number.isFinite(inferenceIssueModal.requiredCredits) &&
    inferenceIssueModal.requiredCredits > 0
      ? inferenceIssueModal.requiredCredits
      : null;

  const paidToolTitle =
    requiresWorkspaceCardSetup
      ? "Add a card to use workspace tools"
    : isWorkspaceBillingIssue
      ? "Add balance to use premium tools"
      : "Add balance to use premium tools";

  const paidToolPrimaryMessage =
    requiresWorkspaceCardSetup
      ? "No charge today."
    : inferenceIssueModal.message ||
      (paidToolKind
        ? getPaidToolBalancePrimaryMessage(paidToolKind)
        : getPaidToolBalancePrimaryMessage(null));

  const paidToolFollowupMessage =
    requiresWorkspaceCardSetup
      ? "Usage is billed only when workspace tools run."
    : requiredCredits !== null
      ? `This needs ${formatWorkspaceToolBalanceUsdFromCredits(requiredCredits)} in prepaid tool balance.`
      : "Add prepaid balance, then retry the paid tool.";

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
  const modalClassName = `modal inference-issue-modal${
    requiresWorkspaceCardSetup ? " inference-issue-modal--workspace-card" : ""
  }`;

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
          {!requiresWorkspaceCardSetup && (
            <div className="workspace-billing-modal-copy">
              <div className="model-note">
                {primaryMessage}
              </div>
              <div className="model-note">
                {followupMessage}
              </div>
            </div>
          )}
          {inferenceIssueModal.reason === "plan" && (
            <div className="auth-error" style={{ marginBottom: 12 }}>
              This model isn&apos;t available on your current plan.
            </div>
          )}
          {requiresWorkspaceCardSetup && (
            <div className="workspace-billing-trust-panel" aria-label="Workspace billing details">
              <div className="workspace-billing-trust-title">No charge today</div>
              <div className="workspace-billing-trust-copy">
                Usage is billed only when workspace tools run.
              </div>
            </div>
          )}
          {requiresWorkspaceCardSetup && (
            <div className="workspace-billing-primary-row">
              <button
                type="button"
                className="platform-save-button platform-save-button--compact inference-issue-primary-action workspace-billing-primary-button"
                onClick={() => void onStartWorkspaceCardSetupCheckout?.()}
                disabled={checkoutBusy}
              >
                {isStartingWorkspaceCardSetupCheckout ? "Opening..." : "Add card"}
              </button>
            </div>
          )}
          {manualBalanceAllowed && paidUsageBillingMode !== "prepaid_required" ? (
            <div className="workspace-billing-secondary-action">
              <button
                type="button"
                className="workspace-billing-inline-link"
                onClick={() => setShowManualBalance((value) => !value)}
                disabled={checkoutBusy}
              >
                {showManualBalance
                  ? "Use card instead"
                  : "Prefer prepaid balance? Add balance manually."}
              </button>
            </div>
          ) : null}
          {inferenceIssueModal.reason === "workspace_credits" && shouldShowToolBalancePacks && (
            <>
              <div className="tool-balance-pack-grid modal-tool-balance-pack-grid">
                {WORKSPACE_TOOL_BALANCE_TOPUP_PACKS.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    className={`tool-balance-pack-button${pack.recommended ? " recommended" : ""}`}
                    onClick={() => void onStartWorkspaceCreditTopupCheckout?.(pack.id, "tool_balance_modal")}
                    disabled={checkoutBusy}
                  >
                    <strong>{pack.label}</strong>
                    {pack.recommended ? <span>Best</span> : null}
                  </button>
                ))}
              </div>
              {workspaceCreditTopupError ? (
                <div className="auth-error workspace-billing-error">
                  {workspaceCreditTopupError}
                </div>
              ) : null}
            </>
          )}
          {workspaceCardSetupError ? (
            <div className="auth-error workspace-billing-error">
              {workspaceCardSetupError}
            </div>
          ) : null}
        </div>
        {!requiresWorkspaceCardSetup && (
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
              {inferenceIssueModal.reason !== "plan" && inferenceIssueModal.reason !== "workspace_credits" && (
                <button
                  type="button"
                  className="platform-save-button platform-save-button--compact inference-issue-primary-action"
                  onClick={() => onOpenSettings(inferenceIssueModal.reason)}
                  disabled={isInferenceIssueModalRunning}
                >
                  {inferenceIssueModal.reason === "provider_connection_required"
                      ? "Open Account Settings"
                    : "Open account settings"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
