import type { BuilderCheckoutTier } from "./builderBilling";

type BuilderUpgradeModalProps = {
  isOpen: boolean;
  builderTier: string | null | undefined;
  isStartingBuilderCheckout: boolean;
  builderBillingError: string | null;
  onClose: () => void;
  onStartBuilderPlanCheckout: (tier: BuilderCheckoutTier) => void;
};

export function BuilderUpgradeModal({
  isOpen,
  builderBillingError,
  onClose,
}: BuilderUpgradeModalProps) {
  if (!isOpen) return null;

  const upgradeLead = "Builder is included. Free accounts can build one community; tool balance covers premium tools.";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-upgrade" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Builder is included</div>
          <button className="modal-close" type="button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="upgrade-copy">
            <div className="upgrade-lead">{upgradeLead}</div>
          </div>
          {builderBillingError && <div className="auth-error">{builderBillingError}</div>}
          <div className="plan-grid">
            <div className="plan-card free current">
              <div className="plan-card-header">
                <div className="plan-name">Free builder</div>
                <div className="plan-badge">Current</div>
              </div>
              <div className="plan-price">
                <span className="plan-price-amount">$0</span>
                <span className="plan-price-period">/mo</span>
              </div>
              <ul className="plan-points">
                <li>Create one community.</li>
                <li>Join and use communities.</li>
                <li>Connect Stripe to monetize access.</li>
              </ul>
            </div>

            <div className="plan-card builder">
              <div className="plan-card-header">
                <div className="plan-name">Tool balance</div>
              </div>
              <div className="plan-price">
                <span className="plan-price-amount">$5</span>
                <span className="plan-price-period">to start</span>
              </div>
              <ul className="plan-points">
                <li>Use Daytona workspaces.</li>
                <li>Run web research.</li>
                <li>Use voice input.</li>
                <li>Bring your own ChatGPT or OpenAI inference.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
