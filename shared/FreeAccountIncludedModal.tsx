type FreeAccountIncludedModalProps = {
  isOpen: boolean;
  accountAccessError: string | null;
  onClose: () => void;
};

export function FreeAccountIncludedModal({
  isOpen,
  accountAccessError,
  onClose,
}: FreeAccountIncludedModalProps) {
  if (!isOpen) return null;

  const accountInfoLead = "Free accounts can create two communities. Tool balance covers workspace tools, web research, and voice input.";

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
                <li>Create two communities.</li>
                <li>Join and use communities.</li>
                <li>Connect Stripe to monetize access.</li>
              </ul>
            </div>

            <div className="plan-card tool-balance">
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
