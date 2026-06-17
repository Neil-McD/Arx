import { useEffect, useState, type FormEvent } from "react";
import type { CloudWorkspaceAutoRechargeSettings } from "../../../../shared/cloudAccountCommerceGateway";
import {
  formatWorkspaceToolBalanceUsdFromCredits,
  getOutstandingWorkspaceToolUsageCredits,
  getSpendableWorkspaceToolBalanceCredits,
  WORKSPACE_CREDITS_PER_USD,
  WORKSPACE_TOOL_BALANCE_TOPUP_PACKS,
  type WorkspaceCreditTopupSurface,
  type WorkspaceToolBalanceTopupPackId,
} from "../../../../shared/workspaceCredits";
import {
  buildDefaultWorkspaceAutoRechargeSettings,
  validateWorkspaceAutoRechargeSettingsInput,
  WORKSPACE_AUTO_RECHARGE_DEFAULT_MONTHLY_LIMIT_CREDITS,
  WORKSPACE_AUTO_RECHARGE_DEFAULT_RESTORE_TO_CREDITS,
  WORKSPACE_AUTO_RECHARGE_DEFAULT_THRESHOLD_CREDITS,
} from "../../../../shared/workspaceAutoRecharge";
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

type WorkspacePayAsYouGoPanelProps = {
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
  workspaceAutoRechargeSettings: CloudWorkspaceAutoRechargeSettings | null;
  isLoadingWorkspaceAutoRechargeSettings: boolean;
  workspaceAutoRechargeSettingsError: string | null;
  isSavingWorkspaceAutoRechargeSettings: boolean;
  startWorkspaceCreditTopupCheckout: (
    packId?: WorkspaceToolBalanceTopupPackId,
    surface?: WorkspaceCreditTopupSurface,
  ) => Promise<void> | void;
  startWorkspaceCardSetupCheckout: () => Promise<void> | void;
  saveWorkspaceAutoRechargeSettings: (next: {
    thresholdCredits: number;
    restoreToCredits: number;
    monthlyLimitCredits: number | null;
  }) => Promise<void> | void;
  disableWorkspaceAutoRechargeSettings: () => Promise<void> | void;
};

type AutoRechargeSettingsModalProps = {
  settings: CloudWorkspaceAutoRechargeSettings | null;
  hasCardOnFile: boolean;
  isLoadingSettings: boolean;
  isSavingSettings: boolean;
  settingsError: string | null;
  isStartingWorkspaceCardSetupCheckout: boolean;
  onClose: () => void;
  onSave: (next: {
    thresholdCredits: number;
    restoreToCredits: number;
    monthlyLimitCredits: number | null;
  }) => Promise<void> | void;
  onDisable: () => Promise<void> | void;
  onStartWorkspaceCardSetupCheckout: () => Promise<void> | void;
};

function roundCredits(value: number): number {
  return Math.round(value * 100) / 100;
}

function usdInputFromCredits(value: number | null | undefined): string {
  const credits = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const usd = credits / WORKSPACE_CREDITS_PER_USD;
  return Number.isInteger(usd) ? String(usd) : usd.toFixed(2);
}

function creditsFromUsdInput(value: string): number | null {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return roundCredits(parsed * WORKSPACE_CREDITS_PER_USD);
}

function formatAutoRechargeSummary(settings: CloudWorkspaceAutoRechargeSettings | null): string {
  const defaults = buildDefaultWorkspaceAutoRechargeSettings();
  const thresholdCredits = settings?.thresholdCredits ?? defaults.thresholdCredits;
  const restoreToCredits = settings?.restoreToCredits ?? defaults.restoreToCredits;
  const monthlyLimitCredits = settings?.monthlyLimitCredits ?? defaults.monthlyLimitCredits;
  const monthlyLimit = monthlyLimitCredits === null
    ? "No monthly limit"
    : `${formatWorkspaceToolBalanceUsdFromCredits(monthlyLimitCredits)} monthly limit`;
  return `Balance ${formatWorkspaceToolBalanceUsdFromCredits(thresholdCredits)} -> ${formatWorkspaceToolBalanceUsdFromCredits(restoreToCredits)}. ${monthlyLimit}.`;
}

function AutoRechargeSettingsModal({
  settings,
  hasCardOnFile,
  isLoadingSettings,
  isSavingSettings,
  settingsError,
  isStartingWorkspaceCardSetupCheckout,
  onClose,
  onSave,
  onDisable,
  onStartWorkspaceCardSetupCheckout,
}: AutoRechargeSettingsModalProps) {
  const defaults = buildDefaultWorkspaceAutoRechargeSettings({
    enabled: true,
    thresholdCredits: WORKSPACE_AUTO_RECHARGE_DEFAULT_THRESHOLD_CREDITS,
    restoreToCredits: WORKSPACE_AUTO_RECHARGE_DEFAULT_RESTORE_TO_CREDITS,
    monthlyLimitCredits: WORKSPACE_AUTO_RECHARGE_DEFAULT_MONTHLY_LIMIT_CREDITS,
  });
  const [thresholdUsd, setThresholdUsd] = useState(usdInputFromCredits(defaults.thresholdCredits));
  const [restoreToUsd, setRestoreToUsd] = useState(usdInputFromCredits(defaults.restoreToCredits));
  const [monthlyLimitEnabled, setMonthlyLimitEnabled] = useState(defaults.monthlyLimitCredits !== null);
  const [monthlyLimitUsd, setMonthlyLimitUsd] = useState(
    usdInputFromCredits(defaults.monthlyLimitCredits),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const next = settings ?? {
      thresholdCredits: defaults.thresholdCredits,
      restoreToCredits: defaults.restoreToCredits,
      monthlyLimitCredits: defaults.monthlyLimitCredits,
    };
    setThresholdUsd(usdInputFromCredits(next.thresholdCredits));
    setRestoreToUsd(usdInputFromCredits(next.restoreToCredits));
    setMonthlyLimitEnabled(next.monthlyLimitCredits !== null);
    setMonthlyLimitUsd(usdInputFromCredits(next.monthlyLimitCredits ?? defaults.monthlyLimitCredits));
    setLocalError(null);
  }, [
    defaults.monthlyLimitCredits,
    defaults.restoreToCredits,
    defaults.thresholdCredits,
    settings,
  ]);

  const rechargeAmountLabel = (() => {
    const thresholdCredits = creditsFromUsdInput(thresholdUsd);
    const restoreToCredits = creditsFromUsdInput(restoreToUsd);
    if (thresholdCredits === null || restoreToCredits === null || restoreToCredits <= thresholdCredits) {
      return "$0";
    }
    return formatWorkspaceToolBalanceUsdFromCredits(restoreToCredits - thresholdCredits);
  })();

  const isEnabled = settings?.enabled === true && settings.status === "active";
  const isBlocked = settings?.blocked === true;
  const combinedError =
    localError ??
    settingsError ??
    (isBlocked ? "Auto recharge settings need repair before they can be edited." : null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if (!hasCardOnFile) {
      setLocalError("Add a card before enabling auto recharge.");
      return;
    }
    const thresholdCredits = creditsFromUsdInput(thresholdUsd);
    const restoreToCredits = creditsFromUsdInput(restoreToUsd);
    const monthlyLimitCredits = monthlyLimitEnabled
      ? creditsFromUsdInput(monthlyLimitUsd)
      : null;
    if (thresholdCredits === null || restoreToCredits === null) {
      setLocalError("Enter valid credit balance amounts.");
      return;
    }
    if (monthlyLimitEnabled && monthlyLimitCredits === null) {
      setLocalError("Enter a valid monthly recharge limit.");
      return;
    }
    const validation = validateWorkspaceAutoRechargeSettingsInput({
      enabled: true,
      thresholdCredits,
      restoreToCredits,
      monthlyLimitCredits,
    });
    if (!validation.ok) {
      setLocalError("Restore balance must be higher than the trigger, and the monthly limit must cover at least one recharge.");
      return;
    }
    await onSave({
      thresholdCredits,
      restoreToCredits,
      monthlyLimitCredits,
    });
    onClose();
  }

  async function handleDisable() {
    setLocalError(null);
    await onDisable();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal workspace-auto-recharge-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-auto-recharge-title"
        onClick={(event) => event.stopPropagation()}
      >
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="modal-header">
            <div>
              <div className="modal-title" id="workspace-auto-recharge-title">Auto recharge</div>
              <div className="workspace-auto-recharge-subtitle">
                Automatically add credits when your balance runs low.
              </div>
            </div>
            <button className="modal-close" type="button" onClick={onClose} title="Close">
              x
            </button>
          </div>
          <div className="modal-body">
            <div className="workspace-auto-recharge-form">
              <label className="workspace-auto-recharge-field">
                <span>When balance drops to:</span>
                <span className="workspace-auto-recharge-money-input">
                  <span>$</span>
                  <input
                    value={thresholdUsd}
                    onChange={(event) => setThresholdUsd(event.target.value)}
                    inputMode="decimal"
                    disabled={isLoadingSettings || isSavingSettings}
                  />
                </span>
              </label>
              <label className="workspace-auto-recharge-field">
                <span>Restore balance to:</span>
                <span className="workspace-auto-recharge-money-input">
                  <span>$</span>
                  <input
                    value={restoreToUsd}
                    onChange={(event) => setRestoreToUsd(event.target.value)}
                    inputMode="decimal"
                    disabled={isLoadingSettings || isSavingSettings}
                  />
                </span>
              </label>
              <div className="workspace-auto-recharge-calculation">
                <span>Estimated recharge amount:</span>
                <strong>{rechargeAmountLabel}</strong>
              </div>
              <label className="workspace-auto-recharge-limit-toggle">
                <input
                  type="checkbox"
                  checked={monthlyLimitEnabled}
                  onChange={(event) => setMonthlyLimitEnabled(event.target.checked)}
                  disabled={isLoadingSettings || isSavingSettings}
                />
                <span>Monthly recharge limit</span>
              </label>
              {monthlyLimitEnabled ? (
                <label className="workspace-auto-recharge-field">
                  <span>Stop recharging after:</span>
                  <span className="workspace-auto-recharge-money-input">
                    <span>$</span>
                    <input
                      value={monthlyLimitUsd}
                      onChange={(event) => setMonthlyLimitUsd(event.target.value)}
                      inputMode="decimal"
                      disabled={isLoadingSettings || isSavingSettings}
                    />
                  </span>
                </label>
              ) : null}
            </div>
            <div className="workspace-billing-trust-panel">
              <div className="workspace-billing-trust-title">
                {hasCardOnFile ? "Card on file" : "Card required"}
              </div>
              <div className="workspace-billing-trust-copy">
                {hasCardOnFile
                  ? "Saving settings does not charge your card."
                  : "Add a card before auto recharge can be enabled."}
              </div>
            </div>
            {combinedError ? <div className="auth-error">{combinedError}</div> : null}
          </div>
          <div className="modal-footer workspace-auto-recharge-footer">
            {isEnabled || isBlocked ? (
              <button
                type="button"
                className="workspace-payg-secondary-button"
                onClick={() => void handleDisable()}
                disabled={isSavingSettings}
              >
                {isSavingSettings ? "Saving..." : "Disable"}
              </button>
            ) : null}
            <button type="button" className="workspace-payg-secondary-button" onClick={onClose}>
              Cancel
            </button>
            {!hasCardOnFile ? (
              <button
                type="button"
                className="platform-save-button platform-save-button--compact"
                onClick={() => void onStartWorkspaceCardSetupCheckout()}
                disabled={isStartingWorkspaceCardSetupCheckout}
              >
                {isStartingWorkspaceCardSetupCheckout ? "Opening..." : "Add card"}
              </button>
            ) : (
              <button
                type="submit"
                className="platform-save-button platform-save-button--compact"
                disabled={isLoadingSettings || isSavingSettings}
              >
                {isSavingSettings ? "Saving..." : "Save"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export function WorkspacePayAsYouGoPanel({
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
  workspaceAutoRechargeSettings,
  isLoadingWorkspaceAutoRechargeSettings,
  workspaceAutoRechargeSettingsError,
  isSavingWorkspaceAutoRechargeSettings,
  startWorkspaceCreditTopupCheckout,
  startWorkspaceCardSetupCheckout,
  saveWorkspaceAutoRechargeSettings,
  disableWorkspaceAutoRechargeSettings,
}: WorkspacePayAsYouGoPanelProps) {
  const [showCreditBalancePacks, setShowCreditBalancePacks] = useState(false);
  const [showAutoRechargeSettings, setShowAutoRechargeSettings] = useState(false);
  const totalCredits = getSpendableWorkspaceToolBalanceCredits(workspaceCreditBalance);
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
  const needsPaymentMethod = !hasCardOnFile && (hasCurrentUsageCredits || prepaidBalanceCredits <= 0);
  const autoRechargeEnabled =
    workspaceAutoRechargeSettings?.enabled === true &&
    workspaceAutoRechargeSettings.status === "active";
  const autoRechargePaused = workspaceAutoRechargeSettings?.status === "paused_payment_failed";
  const autoRechargeBlocked = workspaceAutoRechargeSettings?.blocked === true;
  const autoRechargeActionLabel =
    autoRechargeBlocked
      ? "Review auto recharge"
      : autoRechargeEnabled || autoRechargePaused || workspaceAutoRechargeSettings?.configured
      ? "Edit auto recharge"
      : "Set up auto recharge";
  const autoRechargeTitle = isLoadingWorkspaceAutoRechargeSettings
    ? "Checking auto recharge..."
    : autoRechargeBlocked
      ? "Auto recharge needs review"
      : autoRechargeEnabled
      ? "Auto recharge is set up"
      : autoRechargePaused
        ? "Auto recharge is paused"
        : "Auto recharge is off";
  const autoRechargeCopy = autoRechargeEnabled
    ? formatAutoRechargeSummary(workspaceAutoRechargeSettings)
    : autoRechargeBlocked
      ? "Auto recharge is safely disabled because duplicate settings were found."
      : autoRechargePaused
      ? "Update your card or settings to resume automatic credit top-ups."
      : "When your credit balance runs low, paid tool requests may stop until you add credits.";
  const autoRechargeCardClassName = [
    "workspace-payg-status-card",
    "workspace-payg-auto-recharge-card",
    autoRechargeBlocked ? "is-blocked" : "",
    autoRechargeEnabled ? "is-enabled" : "",
    autoRechargePaused ? "is-paused" : "",
  ].filter(Boolean).join(" ");
  const currentUsageStatusCopy = hasCurrentUsageCredits
    ? hasCardOnFile
      ? `${currentUsageUsd} pending - will be collected from ${paymentMethodLabel}.`
      : `${currentUsageUsd} pending - add a card or credits to keep workspace tools available.`
    : `No pending usage - ${currentPeriodLabel}.`;
  const currentUsageDetailCopy = `Usage this month ${workspaceUsageThisMonthUsd} - Paid this month ${paidThisMonthUsd}.`;

  return (
    <>
      <div className="settings-section">
        <div className="workspace-payg-header">
          <div className="workspace-payg-copy">
            <div className="workspace-payg-kicker">Pay as you go</div>
            <div className="workspace-payg-title">Credit balance</div>
            <div className="workspace-payg-balance">{prepaidBalanceUsd}</div>
            <div className="workspace-payg-description">
              Add credits for workspace tools and premium provider calls. Usage only applies when paid tools run.
            </div>
          </div>
          <div className="workspace-payg-actions">
            <button
              type="button"
              className="platform-save-button platform-save-button--compact workspace-payg-primary-button"
              onClick={() => setShowCreditBalancePacks((value) => !value)}
              disabled={!session || isStartingWorkspaceCreditTopupCheckout}
            >
              Add to credit balance
            </button>
            <button
              type="button"
              className="workspace-payg-secondary-button"
              onClick={() => setShowAutoRechargeSettings(true)}
              disabled={!session || isLoadingWorkspaceAutoRechargeSettings}
            >
              {autoRechargeActionLabel}
            </button>
          </div>
        </div>

        {!session ? (
          <div className="model-note">Sign in to manage workspace billing.</div>
        ) : isLoadingBilling && !workspaceCreditBalance && !workspaceBillingOverview ? (
          <div className="model-note">Checking workspace billing...</div>
        ) : (
          <>
            {showCreditBalancePacks ? (
              <div className="workspace-payg-pack-section" aria-label="Add to credit balance">
                <div className="workspace-payg-pack-heading">
                  <strong>Add to credit balance</strong>
                  <span>Manual credit balance is non-refundable and only works inside Polynet.</span>
                </div>
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
                      <span>{pack.recommended ? "Recommended" : "Add credits"}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {needsPaymentMethod ? (
              <div className="workspace-payg-alert is-warning" role="status">
                <div className="workspace-payg-status-copy">
                  <strong>
                    {hasCurrentUsageCredits && !hasCardOnFile
                      ? "Payment method needed"
                      : "Add credits or a card"}
                  </strong>
                  <span>
                    {hasCurrentUsageCredits && !hasCardOnFile
                      ? "Add a card or credit balance to keep workspace tools available."
                      : "Paid workspace tools need credit balance or a saved card before they run."}
                  </span>
                </div>
                <button
                  type="button"
                  className="workspace-payg-alert-action"
                  onClick={() => void startWorkspaceCardSetupCheckout()}
                  disabled={isStartingWorkspaceCardSetupCheckout}
                >
                  {isStartingWorkspaceCardSetupCheckout ? "Opening..." : "Add card"}
                </button>
              </div>
            ) : null}

            <div className="workspace-payg-details-grid">
              <div className="workspace-payg-status-card">
                <div className="workspace-payg-status-copy">
                  <span>Payment method</span>
                  <strong>{paymentMethodLabel}</strong>
                </div>
                <button
                  className="workspace-payg-alert-action"
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
              <div className={autoRechargeCardClassName}>
                <div className="workspace-payg-status-copy">
                  <span>Auto recharge</span>
                  <strong>{autoRechargeTitle.replace("Auto recharge ", "")}</strong>
                  <small>{autoRechargeCopy}</small>
                </div>
                <button
                  type="button"
                  className="workspace-payg-alert-action"
                  onClick={() => setShowAutoRechargeSettings(true)}
                  disabled={isLoadingWorkspaceAutoRechargeSettings}
                >
                  {autoRechargeActionLabel}
                </button>
              </div>
            </div>

            <div className="workspace-payg-usage-row" role="status">
              <div className="workspace-payg-status-copy">
                <span>Current usage</span>
                <strong>{currentUsageStatusCopy}</strong>
              </div>
              <span>{currentUsageDetailCopy}</span>
            </div>

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
        {workspaceAutoRechargeSettingsError && (
          <div className="auth-error">{workspaceAutoRechargeSettingsError}</div>
        )}
      </div>

      {showAutoRechargeSettings ? (
        <AutoRechargeSettingsModal
          settings={workspaceAutoRechargeSettings}
          hasCardOnFile={hasCardOnFile}
          isLoadingSettings={isLoadingWorkspaceAutoRechargeSettings}
          isSavingSettings={isSavingWorkspaceAutoRechargeSettings}
          settingsError={workspaceAutoRechargeSettingsError}
          isStartingWorkspaceCardSetupCheckout={isStartingWorkspaceCardSetupCheckout}
          onClose={() => setShowAutoRechargeSettings(false)}
          onSave={saveWorkspaceAutoRechargeSettings}
          onDisable={disableWorkspaceAutoRechargeSettings}
          onStartWorkspaceCardSetupCheckout={startWorkspaceCardSetupCheckout}
        />
      ) : null}
    </>
  );
}
