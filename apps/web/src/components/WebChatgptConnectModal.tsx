import { useEffect, useState } from "react";

type WebChatgptConnectModalProps = {
  isOpen: boolean;
  isStarting: boolean;
  verificationUrl: string | null;
  userCode: string | null;
  isPolling: boolean;
  securitySettingsUrl: string;
  manualAuthorizeUrl: string | null;
  manualCallbackInput: string;
  isCompletingManual: boolean;
  error: string | null;
  onStartDeviceFlow: () => void;
  onOpenVerificationPage: () => void;
  onStartManualFlow: () => void;
  onOpenManualAuthPage: () => void;
  onChangeManualCallbackInput: (value: string) => void;
  onCompleteManual: () => void;
  onClose: () => void;
};

export function WebChatgptConnectModal(props: WebChatgptConnectModalProps) {
  const {
    isOpen,
    isStarting,
    verificationUrl,
    userCode,
    isPolling,
    securitySettingsUrl,
    manualAuthorizeUrl,
    manualCallbackInput,
    isCompletingManual,
    error,
    onStartDeviceFlow,
    onOpenVerificationPage,
    onStartManualFlow,
    onOpenManualAuthPage,
    onChangeManualCallbackInput,
    onCompleteManual,
    onClose,
  } = props;
  const [showRecovery, setShowRecovery] = useState(false);

  const hasDeviceCode = Boolean(verificationUrl && userCode);

  useEffect(() => {
    if (!isOpen || !hasDeviceCode) {
      setShowRecovery(false);
    }
  }, [hasDeviceCode, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-chatgpt-connect" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Connect ChatGPT</div>
          <button className="modal-close" type="button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="chatgpt-connect-stack">
            {!hasDeviceCode ? (
              <>
                <div className="chatgpt-connect-stage">
                  <div className="chatgpt-connect-stage-eyebrow">Before you connect</div>
                  <div className="chatgpt-connect-stage-title">Enable device code authorization</div>
                  <ul className="chatgpt-connect-bullets">
                    <li>Open your ChatGPT Security settings.</li>
                    <li>Turn on <strong>Enable device code authorization</strong>.</li>
                    <li>Come back here and click <strong>Authenticate</strong>.</li>
                  </ul>
                </div>
                <div className="chatgpt-connect-actions">
                  <a
                    className="chatgpt-connect-settings-link"
                    href={securitySettingsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open ChatGPT Security settings
                  </a>
                  <button
                    className="platform-save-button"
                    type="button"
                    onClick={onStartDeviceFlow}
                    disabled={isStarting}
                  >
                    {isStarting ? "Starting..." : "Authenticate"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="chatgpt-connect-stage">
                  <div className="chatgpt-connect-stage-eyebrow">Step 2</div>
                  <div className="chatgpt-connect-stage-title">Enter this code in OpenAI</div>
                  <p className="chatgpt-connect-copy">
                    Open the verification page, paste in the one-time code below, and approve the connection. The app
                    will keep checking automatically.
                  </p>
                </div>
                <div className="chatgpt-connect-field chatgpt-connect-device-field">
                  <span>One-time code</span>
                  <code className="chatgpt-connect-code">{userCode}</code>
                </div>
                <div className="chatgpt-connect-actions">
                  <button className="platform-save-button" type="button" onClick={onOpenVerificationPage}>
                    Open verification page
                  </button>
                </div>
                <div className="chatgpt-connect-status" aria-live="polite">
                  {isPolling ? "Waiting for approval..." : "Ready to verify."}
                </div>
                <div className="chatgpt-connect-inline-actions">
                  <button
                    className="chatgpt-connect-inline-link"
                    type="button"
                    onClick={() => setShowRecovery((value) => !value)}
                  >
                    {showRecovery ? "Hide recovery options" : "Having trouble?"}
                  </button>
                </div>
                {showRecovery ? (
                  <div className="chatgpt-connect-callout">
                    <div className="chatgpt-connect-callout-title">Browser fallback</div>
                    <div className="chatgpt-connect-copy">
                      If device-code approval does not work, use browser login and paste the localhost callback URL
                      back here to finish manually.
                    </div>
                    <div className="auth-actions">
                      {manualAuthorizeUrl ? (
                        <button className="secondary" type="button" onClick={onOpenManualAuthPage}>
                          Open browser login
                        </button>
                      ) : (
                        <button className="secondary" type="button" onClick={onStartManualFlow}>
                          Start browser fallback
                        </button>
                      )}
                      <button
                        className="secondary"
                        type="button"
                        onClick={onStartDeviceFlow}
                        disabled={isStarting}
                      >
                        {isStarting ? "Starting..." : "Get a new code"}
                      </button>
                    </div>
                    {manualAuthorizeUrl ? (
                      <>
                        <textarea
                          className="system-prompt-input"
                          placeholder="Paste the full localhost callback URL here"
                          value={manualCallbackInput}
                          onChange={(event) => onChangeManualCallbackInput(event.target.value)}
                          rows={4}
                        />
                        <div className="auth-actions">
                          <button
                            className="secondary"
                            type="button"
                            onClick={onCompleteManual}
                            disabled={isCompletingManual}
                          >
                            {isCompletingManual ? "Finishing..." : "Finish browser login"}
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
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
