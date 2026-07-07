import {
  POLYNET_FREE_MAX_COMMUNITIES,
  POLYNET_PREMIUM_MAX_COMMUNITIES,
  POLYNET_PREMIUM_MONTHLY_PRICE_LABEL,
  POLYNET_PREMIUM_PLAN_NAME,
} from "./accountCommerce";

type FreeAccountIncludedModalProps = {
  isOpen: boolean;
  accountAccessError: string | null;
  onClose: () => void;
  onOpenBilling: () => void;
};

export function FreeAccountIncludedModal({
  isOpen,
  accountAccessError,
  onClose,
  onOpenBilling,
}: FreeAccountIncludedModalProps) {
  if (!isOpen) return null;

  const accountInfoLead =
    "Free accounts can create one community. Premium unlocks a second community, hosted tools, web research, and premium runtimes.";

  const handleOpenBilling = () => {
    onClose();
    onOpenBilling();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-account-info" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Free account</div>
          <button className="modal-close" type="button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="account-info-copy">
            <div className="account-info-lead">{accountInfoLead}</div>
          </div>
          {accountAccessError && <div className="auth-error">{accountAccessError}</div>}
          <div className="plan-grid">
            <div className="plan-card free current">
              <div className="plan-card-header">
                <div className="plan-name">Community creation</div>
                <div className="plan-badge">Current</div>
              </div>
              <div className="plan-price">
                <span className="plan-price-amount">$0</span>
                <span className="plan-price-period">/mo</span>
              </div>
              <ul className="plan-points">
                <li>Create {POLYNET_FREE_MAX_COMMUNITIES} community.</li>
                <li>Join and use communities.</li>
                <li>Connect Stripe to monetize access.</li>
              </ul>
            </div>

            <div className="plan-card premium recommended">
              <div className="plan-card-header">
                <div className="plan-name">{POLYNET_PREMIUM_PLAN_NAME}</div>
              </div>
              <div className="plan-price">
                <span className="plan-price-amount">{POLYNET_PREMIUM_MONTHLY_PRICE_LABEL}</span>
              </div>
              <ul className="plan-points">
                <li>Create {POLYNET_PREMIUM_MAX_COMMUNITIES} communities.</li>
                <li>Use premium hosted tools.</li>
                <li>Run web research.</li>
                <li>Use Codex and future premium runtimes.</li>
              </ul>
              <button className="plan-cta" type="button" onClick={handleOpenBilling}>
                Open Billing
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
