type WebAuthGateModalProps = {
  hasSession: boolean;
  isOpen: boolean;
  authError: string | null;
  onClose: () => void;
  onSignIn: () => void;
};

export function WebAuthGateModal(props: WebAuthGateModalProps) {
  const { hasSession, isOpen, authError, onClose, onSignIn } = props;

  if (hasSession || !isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-auth-gate" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Sign in</div>
          <button
            className="modal-close"
            type="button"
            onClick={onClose}
            title="Close"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <ul className="auth-gate-bullets">
            <li>Save chats and continue across devices</li>
            <li>Unlock more models and higher limits</li>
            <li>Use your ChatGPT Plus / Pro or OpenRouter access</li>
          </ul>
          {authError && <div className="auth-error">{authError}</div>}
        </div>
        <div className="modal-footer">
          <div className="auth-actions">
            <button className="auth-gate-google-button" type="button" onClick={onSignIn}>
              <svg
                className="auth-gate-google-icon"
                width="18"
                height="18"
                viewBox="0 0 46 46"
                aria-hidden="true"
              >
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.72 1.22 9.22 3.22l6.84-6.84C35.82 2.12 30.22 0 24 0 14.62 0 6.4 5.38 2.44 13.22l7.94 6.16C12.22 13.22 17.62 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46 24.5c0-1.64-.14-2.86-.42-4.08H24v7.72h12.52c-.26 2.08-1.64 5.22-4.68 7.32l7.2 5.6C43.74 36.5 46 30.96 46 24.5z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.38 27.38c-.5-1.5-.8-3.1-.8-4.76s.3-3.26.78-4.76l-7.94-6.16C.88 14.9 0 19.34 0 23.62c0 4.28.88 8.72 2.44 12.92l7.94-6.16z"
                />
                <path
                  fill="#34A853"
                  d="M24 46c6.22 0 11.46-2.04 15.28-5.58l-7.2-5.6c-1.92 1.34-4.5 2.28-8.08 2.28-6.38 0-11.78-3.72-13.62-8.88l-7.94 6.16C6.4 40.62 14.62 46 24 46z"
                />
                <path fill="none" d="M0 0h46v46H0z" />
              </svg>
              Continue with Google
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
