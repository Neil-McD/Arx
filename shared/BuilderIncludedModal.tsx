type BuilderIncludedModalProps = {
  isOpen: boolean;
  builderBillingError: string | null;
  onClose: () => void;
};

export function BuilderIncludedModal({
  isOpen,
  builderBillingError,
  onClose,
}: BuilderIncludedModalProps) {
  if (!isOpen) return null;

  const builderInfoLead = "Free accounts can create one community. Tool balance covers workspace tools, web research, and voice input.";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-builder-info" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Free account</div>
          <button className="modal-close" type="button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="builder-info-copy">
            <div className="builder-info-lead">{builderInfoLead}</div>
          </div>
          {builderBillingError && <div className="auth-error">{builderBillingError}</div>}
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
                <li>Use workspace tools.</li>
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
