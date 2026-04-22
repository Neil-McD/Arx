import {
  hasBuilderTierPaidAccess,
  isBuilderTierFree,
  type BuilderCheckoutTier,
} from "./builderBilling";

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
  builderTier,
  isStartingBuilderCheckout,
  builderBillingError,
  onClose,
  onStartBuilderPlanCheckout,
}: BuilderUpgradeModalProps) {
  if (!isOpen) return null;

  const freeIsCurrent = isBuilderTierFree(builderTier);
  const builderIsCurrent = hasBuilderTierPaidAccess(builderTier);
  const upgradeLead =
    "Build, deploy, and monetize AI-driven communities and apps on Polynet.";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-upgrade" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Become a Builder</div>
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
            <div className={`plan-card free${freeIsCurrent ? " current" : ""}`}>
              <div className="plan-card-header">
                <div className="plan-name">Free</div>
                {freeIsCurrent && <div className="plan-badge">Current</div>}
              </div>
              <div className="plan-price">
                <span className="plan-price-amount">$0</span>
                <span className="plan-price-period">/mo</span>
              </div>
              <ul className="plan-points">
                <li>Join communities and use Polynet&apos;s collective intelligence.</li>
                <li>Research, ask, and learn across the network.</li>
                <li>Keep your threads and context in sync.</li>
              </ul>
            </div>

            <div className={`plan-card builder${builderIsCurrent ? " current" : ""}`}>
              <div className="plan-card-header">
                <div className="plan-name">Builder</div>
                {builderIsCurrent && <div className="plan-badge">Current</div>}
              </div>
              <div className="plan-price">
                <span className="plan-price-amount">$24</span>
                <span className="plan-price-period">/mo</span>
              </div>
              <ul className="plan-points">
                <li>Create and launch communities on Polynet.</li>
                <li>Build and run private agents and longer-running work.</li>
                <li>Bring your own inference and execution environment.</li>
                <li>Monetize the agents, communities, and apps you build.</li>
              </ul>
              {!builderIsCurrent ? (
                <button
                  type="button"
                  className="plan-cta"
                  onClick={() => onStartBuilderPlanCheckout("builder")}
                  disabled={isStartingBuilderCheckout}
                >
                  {isStartingBuilderCheckout ? "Starting…" : "Upgrade to Builder"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
