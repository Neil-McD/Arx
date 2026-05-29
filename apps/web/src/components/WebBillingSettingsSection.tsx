import { useState } from "react";
import {
  formatWorkspaceToolBalanceUsdFromCredits,
  getOutstandingWorkspaceToolUsageCredits,
  getSpendableWorkspaceToolBalanceCredits,
  WORKSPACE_CREDIT_LOW_BALANCE_THRESHOLD,
  WORKSPACE_TOOL_BALANCE_TOPUP_PACKS,
  type WorkspaceCreditTopupSurface,
  type WorkspaceToolBalanceTopupPackId,
} from "../../../../shared/workspaceCredits";
import type { WorkspaceCreditBalance } from "../../../../shared/workspaceCreditsGateway";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WorkspaceCardOnFileStatus = {
  has_card_on_file?: unknown;
  payment_method_status?: unknown;
  card_brand?: unknown;
  card_last4?: unknown;
} | null;

type WebBillingSettingsSectionProps = {
  session: SessionLike;
  workspaceCreditBalance: WorkspaceCreditBalance | null;
  isLoadingWorkspaceCreditBalance: boolean;
  workspaceCreditBalanceError: string | null;
  isStartingWorkspaceCreditTopupCheckout: boolean;
  workspaceCreditTopupError: string | null;
  workspaceCardOnFileStatus: WorkspaceCardOnFileStatus;
  workspaceCardOnFileError: string | null;
  isStartingWorkspaceCardSetupCheckout: boolean;
  workspaceCardSetupError: string | null;
  startWorkspaceCreditTopupCheckout: (
    packId?: WorkspaceToolBalanceTopupPackId,
    surface?: WorkspaceCreditTopupSurface,
  ) => Promise<void> | void;
  startWorkspaceCardSetupCheckout: () => Promise<void> | void;
};

export function WebBillingSettingsSection({
  session,
  workspaceCreditBalance,
  isLoadingWorkspaceCreditBalance,
  workspaceCreditBalanceError,
  isStartingWorkspaceCreditTopupCheckout,
  workspaceCreditTopupError,
  workspaceCardOnFileStatus,
  workspaceCardOnFileError,
  isStartingWorkspaceCardSetupCheckout,
  workspaceCardSetupError,
  startWorkspaceCreditTopupCheckout,
  startWorkspaceCardSetupCheckout,
}: WebBillingSettingsSectionProps) {
  const [showManualWorkspaceBalance, setShowManualWorkspaceBalance] = useState(false);
  const totalCredits = getSpendableWorkspaceToolBalanceCredits(workspaceCreditBalance);
  const purchasedCredits = workspaceCreditBalance?.purchasedCreditsBalance ?? 0;
  const outstandingUsageCredits = getOutstandingWorkspaceToolUsageCredits(workspaceCreditBalance);
  const hasOutstandingUsageCredits = outstandingUsageCredits > 0;
  const hasCardOnFile = workspaceCardOnFileStatus?.has_card_on_file === true;
  const cardBrand =
    typeof workspaceCardOnFileStatus?.card_brand === "string"
      ? workspaceCardOnFileStatus.card_brand.trim()
      : "";
  const cardLast4 =
    typeof workspaceCardOnFileStatus?.card_last4 === "string"
      ? workspaceCardOnFileStatus.card_last4.trim()
      : "";
  const paymentMethodLabel = hasCardOnFile
    ? `${cardBrand || "Card"}${cardLast4 ? ` ending ${cardLast4}` : ""}`
    : "No card on file";

  return (
    <>
      <div className="panel-title">Billing</div>
      <div className="memory-panel">
        <div className="settings-section">
          <div className="settings-section-title">
            <svg viewBox="0 0 24 24">
              <rect x="3" y="6" width="18" height="12" rx="2" />
              <path d="M3 10h18" />
              <path d="M7 15h4" />
            </svg>
            Workspace billing
          </div>
          <div className="settings-section-desc">
            Add a card to use workspace tools. No charge today. Usage is billed only when workspace tools run.
          </div>

          {!session ? (
            <div className="model-note">Sign in to manage workspace billing.</div>
          ) : isLoadingWorkspaceCreditBalance && !workspaceCreditBalance ? (
            <div className="model-note">Checking workspace billing...</div>
          ) : (
            <>
              {hasOutstandingUsageCredits && !hasCardOnFile ? (
                <div className="auth-error" style={{ marginBottom: 12 }}>
                  {formatWorkspaceToolBalanceUsdFromCredits(outstandingUsageCredits)} of prior tool usage must be cleared before premium tools can run.
                </div>
              ) : hasOutstandingUsageCredits ? (
                <div className="model-note" style={{ marginBottom: 12 }}>
                  Pending workspace usage: {formatWorkspaceToolBalanceUsdFromCredits(outstandingUsageCredits)}.
                </div>
              ) : !hasCardOnFile && totalCredits <= WORKSPACE_CREDIT_LOW_BALANCE_THRESHOLD ? (
                <div className="auth-error" style={{ marginBottom: 12 }}>
                  You&apos;re running low on prepaid balance. Add a card or manual balance to keep workspace tools available.
                </div>
              ) : null}

              <div className="account-row">
                <div className="account-identity">
                  <span>Payment method</span>
                  <strong>{paymentMethodLabel}</strong>
                </div>
                <button
                  className="platform-save-button platform-save-button--compact workspace-billing-card-action"
                  type="button"
                  onClick={() => void startWorkspaceCardSetupCheckout()}
                  disabled={isStartingWorkspaceCardSetupCheckout}
                >
                  {isStartingWorkspaceCardSetupCheckout
                    ? "Opening..."
                    : hasCardOnFile
                      ? "Update card"
                      : "Add card"}
                </button>
              </div>

              <div className="account-row">
                <div className="account-identity">
                  <span>Prepaid balance</span>
                  <strong>{formatWorkspaceToolBalanceUsdFromCredits(totalCredits)}</strong>
                </div>
              </div>

              <div className="settings-section-desc">
                {purchasedCredits > 0
                  ? `${formatWorkspaceToolBalanceUsdFromCredits(purchasedCredits)} prepaid balance is available. `
                  : ""}
                {hasOutstandingUsageCredits && !hasCardOnFile
                  ? `Your next top-up clears ${formatWorkspaceToolBalanceUsdFromCredits(outstandingUsageCredits)} of prior usage first. `
                  : ""}
                A card is the default way to keep workspace tools available. Manual prepaid balance is non-refundable and only works inside Polynet.
              </div>

              <div className="workspace-billing-secondary-action">
                <button
                  type="button"
                  className="workspace-billing-inline-link"
                  onClick={() => setShowManualWorkspaceBalance((value) => !value)}
                  disabled={isStartingWorkspaceCreditTopupCheckout}
                >
                  {showManualWorkspaceBalance
                    ? "Hide manual balance"
                    : "Prefer prepaid balance? Add balance manually."}
                </button>
              </div>

              {showManualWorkspaceBalance ? (
                <div className="tool-balance-pack-grid">
                  {WORKSPACE_TOOL_BALANCE_TOPUP_PACKS.map((pack) => (
                    <button
                      key={pack.id}
                      type="button"
                      className={`tool-balance-pack-button${pack.recommended ? " recommended" : ""}`}
                      onClick={() => void startWorkspaceCreditTopupCheckout(pack.id, "settings_billing")}
                      disabled={isStartingWorkspaceCreditTopupCheckout}
                    >
                      <strong>{pack.label}</strong>
                      <span>{pack.recommended ? "Recommended" : "Add balance"}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}

          {workspaceCreditBalanceError && <div className="auth-error">{workspaceCreditBalanceError}</div>}
          {workspaceCreditTopupError && <div className="auth-error">{workspaceCreditTopupError}</div>}
          {workspaceCardOnFileError && <div className="auth-error">{workspaceCardOnFileError}</div>}
          {workspaceCardSetupError && <div className="auth-error">{workspaceCardSetupError}</div>}
        </div>
      </div>
    </>
  );
}
