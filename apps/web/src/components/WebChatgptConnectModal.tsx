type WebChatgptConnectModalProps = {
  isOpen: boolean;
  verificationUrl: string | null;
  userCode: string | null;
  isPolling: boolean;
  manualAuthorizeUrl: string | null;
  manualCallbackInput: string;
  isCompletingManual: boolean;
  error: string | null;
  onOpenVerificationPage: () => void;
  onStartManualFlow: () => void;
  onOpenManualAuthPage: () => void;
  onChangeManualCallbackInput: (value: string) => void;
  onCompleteManual: () => void;
  onClose: () => void;
  onPollNow: () => void;
};

export function WebChatgptConnectModal(props: WebChatgptConnectModalProps) {
  const {
    isOpen,
    verificationUrl,
    userCode,
    isPolling,
    manualAuthorizeUrl,
    manualCallbackInput,
    isCompletingManual,
    error,
    onOpenVerificationPage,
    onStartManualFlow,
    onOpenManualAuthPage,
    onChangeManualCallbackInput,
    onCompleteManual,
    onClose,
    onPollNow,
  } = props;

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-chatgpt-connect" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Connect ChatGPT / Codex</div>
          <button className="modal-close" type="button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="chatgpt-connect-stack">
            {verificationUrl && userCode ? (
              <>
                <p className="chatgpt-connect-copy">
                  Preferred method: OpenAI device-code login. Open the verification page, enter the one-time code
                  below, then come back while the app checks for completion.
                </p>
                <ol className="chatgpt-connect-steps">
                  <li>Open the OpenAI verification page.</li>
                  <li>Enter the one-time code shown below.</li>
                  <li>Finish login and approval in OpenAI.</li>
                  <li>Return here. The app will keep checking automatically.</li>
                </ol>
                <div className="chatgpt-connect-field">
                  <span>One-time code</span>
                  <code className="chatgpt-connect-code">{userCode}</code>
                </div>
                <div className="auth-actions">
                  <button className="secondary" type="button" onClick={onOpenVerificationPage}>
                    Open verification page
                  </button>
                  <button className="secondary" type="button" onClick={onPollNow} disabled={isPolling}>
                    {isPolling ? "Checking…" : "Check again"}
                  </button>
                </div>
                <div className="chatgpt-connect-hint">
                  Verification URL: <code>{verificationUrl}</code>
                </div>
              </>
            ) : (
              <p className="chatgpt-connect-copy">Start a ChatGPT / Codex connection method below.</p>
            )}

            <div className="chatgpt-connect-divider" />
            <div className="chatgpt-connect-field">
              <span>Fallback: browser login + paste callback URL</span>
              <div className="chatgpt-connect-hint">
                This uses the localhost callback URL. If your browser cannot reach it, paste the final callback URL
                back here to complete the connection.
              </div>
            </div>
            <div className="auth-actions">
              {manualAuthorizeUrl ? (
                <button className="secondary" type="button" onClick={onOpenManualAuthPage}>
                  Open browser login
                </button>
              ) : (
                <button className="secondary" type="button" onClick={onStartManualFlow}>
                  Start browser login fallback
                </button>
              )}
            </div>
            {manualAuthorizeUrl ? (
              <>
                <div className="chatgpt-connect-hint">
                  If OpenAI redirects to `http://localhost:1455/auth/callback` and the page fails to load, copy the
                  full URL from the address bar and paste it below.
                </div>
                <textarea
                  className="system-prompt-input"
                  placeholder="Paste the full localhost callback URL here"
                  value={manualCallbackInput}
                  onChange={(event) => onChangeManualCallbackInput(event.target.value)}
                  rows={4}
                />
                <div className="auth-actions">
                  <button className="secondary" type="button" onClick={onCompleteManual} disabled={isCompletingManual}>
                    {isCompletingManual ? "Finishing…" : "Finish browser login"}
                  </button>
                </div>
              </>
            ) : null}
            {error && <div className="auth-error">{error}</div>}
          </div>
        </div>
        <div className="modal-footer">
          <div className="auth-actions">
            <button className="secondary" type="button" onClick={onClose} disabled={isPolling || isCompletingManual}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
