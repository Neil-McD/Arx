import { useState } from "react";
import {
  formatWorkspaceToolBalanceUsdFromCredits,
  getOutstandingWorkspaceToolUsageCredits,
  getSpendableWorkspaceToolBalanceCredits,
  WORKSPACE_TOOL_BALANCE_TOPUP_PACKS,
  type WorkspaceCreditTopupSurface,
  type WorkspaceToolBalanceTopupPackId,
} from "../../../../shared/workspaceCredits";
import type {
  WorkspaceBillingOverview,
  WorkspaceCreditBalance,
} from "../../../../shared/workspaceCreditsGateway";

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
  workspaceBillingOverview: WorkspaceBillingOverview | null;
  isLoadingWorkspaceBillingOverview: boolean;
  workspaceBillingOverviewError: string | null;
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
  workspaceBillingOverview,
  isLoadingWorkspaceBillingOverview,
  workspaceBillingOverviewError,
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
  const currentPeriod = workspaceBillingOverview?.currentPeriod ?? null;
  const currentUsageCredits = currentPeriod?.currentUsageCredits ?? outstandingUsageCredits;
  const hasCurrentUsageCredits = currentUsageCredits > 0;
  const prepaidBalanceCredits = currentPeriod?.prepaidBalanceCredits ?? totalCredits;
  const prepaidBalanceUsd =
    currentPeriod?.prepaidBalanceUsd ?? formatWorkspaceToolBalanceUsdFromCredits(totalCredits);
  const currentUsageUsd =
    currentPeriod?.currentUsageUsd ?? formatWorkspaceToolBalanceUsdFromCredits(outstandingUsageCredits);
  const workspaceUsageThisMonthUsd = currentPeriod?.workspaceUsageUsd ?? "$0";
  const paidThisMonthUsd = currentPeriod?.paidUsd ?? "$0";
  const currentPeriodLabel = currentPeriod?.label ?? "Current month";
  const visibleBillingHistory = (workspaceBillingOverview?.history ?? []).filter(
    (month) => month.workspaceUsageCredits > 0 || month.paidCredits > 0,
  );
  const isLoadingBilling =
    isLoadingWorkspaceCreditBalance || isLoadingWorkspaceBillingOverview;
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
          ) : isLoadingBilling && !workspaceCreditBalance && !workspaceBillingOverview ? (
            <div className="model-note">Checking workspace billing...</div>
          ) : (
            <>
              {hasCurrentUsageCredits && !hasCardOnFile ? (
                <div className="auth-error" style={{ marginBottom: 12 }}>
                  Add a card or manual balance to keep workspace tools available.
                </div>
              ) : hasCurrentUsageCredits ? (
                <div className="model-note" style={{ marginBottom: 12 }}>
                  Current usage will be collected automatically.
                </div>
              ) : !hasCardOnFile && prepaidBalanceCredits <= 0 ? (
                <div className="auth-error" style={{ marginBottom: 12 }}>
                  Add a card before workspace tools run, or add manual balance.
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
                  <span>Current month</span>
                  <strong>{currentPeriodLabel}</strong>
                </div>
              </div>

              <div className="workspace-billing-summary-grid">
                <div className="workspace-billing-summary-card">
                  <span>Prepaid balance</span>
                  <strong>{prepaidBalanceUsd}</strong>
                </div>
                <div className="workspace-billing-summary-card">
                  <span>Current usage</span>
                  <strong>{currentUsageUsd}</strong>
                </div>
                <div className="workspace-billing-summary-card">
                  <span>Usage this month</span>
                  <strong>{workspaceUsageThisMonthUsd}</strong>
                </div>
                <div className="workspace-billing-summary-card">
                  <span>Paid this month</span>
                  <strong>{paidThisMonthUsd}</strong>
                </div>
              </div>

              <div className="settings-section-desc">
                {purchasedCredits > 0
                  ? `${formatWorkspaceToolBalanceUsdFromCredits(purchasedCredits)} prepaid balance is available. `
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

              <div className="workspace-billing-history">
                <div className="settings-section-title">Billing history</div>
                {isLoadingWorkspaceBillingOverview && !workspaceBillingOverview ? (
                  <div className="model-note">Loading billing history...</div>
                ) : visibleBillingHistory.length ? (
                  <div className="workspace-billing-history-list">
                    {visibleBillingHistory.map((month) => (
                      <div key={month.key} className="workspace-billing-history-item">
                        <strong>{month.label}</strong>
                        <span>Usage {month.workspaceUsageUsd}</span>
                        <span>Paid {month.paidUsd}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="model-note">No completed workspace billing months yet.</div>
                )}
                {workspaceBillingOverview?.scan.workspaceChargesTruncated ||
                workspaceBillingOverview?.scan.usageCollectionsTruncated ||
                workspaceBillingOverview?.scan.topupsTruncated ? (
                  <div className="model-note">Some older billing history may be omitted.</div>
                ) : null}
              </div>
            </>
          )}

          {workspaceCreditBalanceError && <div className="auth-error">{workspaceCreditBalanceError}</div>}
          {workspaceBillingOverviewError && <div className="auth-error">{workspaceBillingOverviewError}</div>}
          {workspaceCreditTopupError && <div className="auth-error">{workspaceCreditTopupError}</div>}
          {workspaceCardOnFileError && <div className="auth-error">{workspaceCardOnFileError}</div>}
          {workspaceCardSetupError && <div className="auth-error">{workspaceCardSetupError}</div>}
        </div>
      </div>
    </>
  );
}
