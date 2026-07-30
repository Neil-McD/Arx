import { useEffect, useState } from "react";

import { WebSignOutConfirmModal } from "./WebSignOutConfirmModal";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type ProviderConnection = {
  connected: boolean;
  updated_at?: string | null;
};

export type WebAccountSettingsSectionProps = {
  session: SessionLike;
  authError: string | null;
  requireSignIn: () => void;
  handleSignOut: () => Promise<void> | void;
  isLoadingChatgptConnection: boolean;
  chatgptConnection: ProviderConnection & {
    email?: string | null;
  };
  isConnectingChatgpt: boolean;
  isPollingChatgptConnection: boolean;
  hasPendingChatgptAuth: boolean;
  handleConnectChatgpt: () => Promise<void> | void;
  handleDisconnectChatgpt: () => Promise<void> | void;
  chatgptDeviceUserCode: string | null;
  chatgptConnectionError: string | null;
  chatgptConnectionSuccess: string | null;
  isLoadingOpenAiConnection: boolean;
  openAiConnection: ProviderConnection & {
    key_last_four?: string | null;
  };
  openAiApiKeyDraft: string;
  setOpenAiApiKeyDraft: (value: string) => void;
  isSavingOpenAiConnection: boolean;
  openAiConnectionError: string | null;
  openAiConnectionSuccess: string | null;
  handleConnectOpenAi: () => Promise<void> | void;
  handleDisconnectOpenAi: () => Promise<void> | void;
  formatRelativeTime: (value: string) => string;
};

export function WebAccountSettingsSection(
  props: WebAccountSettingsSectionProps,
) {
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [isSubmittingSignOut, setIsSubmittingSignOut] = useState(false);

  useEffect(() => {
    if (props.session) return;
    setIsSignOutConfirmOpen(false);
    setIsSubmittingSignOut(false);
  }, [props.session]);

  const handleConfirmSignOut = async (): Promise<void> => {
    if (isSubmittingSignOut) return;
    setIsSubmittingSignOut(true);
    try {
      await props.handleSignOut();
      setIsSignOutConfirmOpen(false);
    } finally {
      setIsSubmittingSignOut(false);
    }
  };

  return (
    <>
      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Account
        </div>
        <div className="settings-section-desc">
          Manage your sign-in identity and private account connections.
        </div>
        {props.session ? (
          <div className="account-row">
            <div className="account-identity">
              <span>Signed in as</span>
              <strong>
                {props.session.user.email ?? props.session.user.id}
              </strong>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => setIsSignOutConfirmOpen(true)}
              disabled={isSubmittingSignOut}
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="account-row">
            <button
              className="google-sign-in"
              type="button"
              onClick={props.requireSignIn}
            >
              Continue to sign in
            </button>
          </div>
        )}
        {props.authError ? (
          <div className="key-error">{props.authError}</div>
        ) : null}
      </div>

      <WebSignOutConfirmModal
        isOpen={Boolean(props.session) && isSignOutConfirmOpen}
        isSubmitting={isSubmittingSignOut}
        onClose={() => {
          if (!isSubmittingSignOut) setIsSignOutConfirmOpen(false);
        }}
        onConfirm={handleConfirmSignOut}
      />

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          Inference provider
        </div>
        <div className="settings-section-desc">
          Connect ChatGPT or an OpenAI API key for personal-agent inference. You
          do not need both.
        </div>
        {!props.session ? (
          <div className="model-note">
            Sign in to connect a personal provider.
          </div>
        ) : (
          <div className="account-provider-grid">
            <div
              className={`account-provider-card${
                props.chatgptConnection.connected ? " connected" : ""
              }`}
            >
              <div className="account-provider-card-kicker">
                <span>ChatGPT Plus/Pro</span>
                <span
                  className={`account-provider-status${
                    props.chatgptConnection.connected ? " connected" : ""
                  }`}
                >
                  {props.isLoadingChatgptConnection
                    ? "Checking"
                    : props.chatgptConnection.connected
                      ? "Connected"
                      : "Not connected"}
                </span>
              </div>
              <div className="account-provider-card-title">Use ChatGPT</div>
              <div className="account-provider-card-desc">
                Use your connected ChatGPT account for GPT-family models.
              </div>
              <div className="account-provider-card-body">
                <div className="auth-status">
                  {props.chatgptConnection.connected
                    ? `${
                        props.chatgptConnection.email
                          ? `Connected as ${props.chatgptConnection.email}. `
                          : ""
                      }${
                        props.chatgptConnection.updated_at
                          ? `Last validated ${props.formatRelativeTime(
                              props.chatgptConnection.updated_at,
                            )}.`
                          : "Ready for GPT-family models."
                      }`
                    : "Best if you already pay for ChatGPT."}
                </div>
                {!props.chatgptConnection.connected &&
                props.chatgptDeviceUserCode ? (
                  <div className="auth-status">
                    Waiting for OpenAI verification code{" "}
                    {props.chatgptDeviceUserCode}.
                  </div>
                ) : null}
                {props.chatgptConnectionError ? (
                  <div className="auth-error">
                    {props.chatgptConnectionError}
                  </div>
                ) : null}
                {props.chatgptConnectionSuccess ? (
                  <div className="auth-success">
                    {props.chatgptConnectionSuccess}
                  </div>
                ) : null}
              </div>
              <div className="account-provider-card-actions">
                {props.chatgptConnection.connected ? (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => void props.handleDisconnectChatgpt()}
                    disabled={
                      props.isConnectingChatgpt ||
                      props.isPollingChatgptConnection
                    }
                  >
                    {props.isConnectingChatgpt
                      ? "Disconnecting…"
                      : props.isPollingChatgptConnection
                        ? "Waiting…"
                        : "Disconnect"}
                  </button>
                ) : (
                  <button
                    className="platform-save-button platform-save-button--compact provider-connection-submit-button"
                    type="button"
                    onClick={() => void props.handleConnectChatgpt()}
                    disabled={props.isConnectingChatgpt}
                  >
                    {props.isConnectingChatgpt
                      ? "Starting…"
                      : props.hasPendingChatgptAuth ||
                          props.isPollingChatgptConnection
                        ? "Continue auth"
                        : "Connect ChatGPT"}
                  </button>
                )}
              </div>
            </div>

            <div
              className={`account-provider-card${
                props.openAiConnection.connected ? " connected" : ""
              }`}
            >
              <div className="account-provider-card-kicker">
                <span>OpenAI API</span>
                <span
                  className={`account-provider-status${
                    props.openAiConnection.connected ? " connected" : ""
                  }`}
                >
                  {props.isLoadingOpenAiConnection
                    ? "Checking"
                    : props.openAiConnection.connected
                      ? "Connected"
                      : "Not connected"}
                </span>
              </div>
              <div className="account-provider-card-title">Use an API key</div>
              <div className="account-provider-card-desc">
                Add a key from your OpenAI account and bill usage directly
                through OpenAI.
              </div>
              <div className="account-provider-card-body">
                <div className="auth-status">
                  {props.openAiConnection.connected
                    ? `${
                        props.openAiConnection.key_last_four
                          ? `Key ending ${props.openAiConnection.key_last_four}. `
                          : ""
                      }${
                        props.openAiConnection.updated_at
                          ? `Last validated ${props.formatRelativeTime(
                              props.openAiConnection.updated_at,
                            )}.`
                          : "Ready for OpenAI API inference."
                      }`
                    : "Best if you want dedicated API billing."}
                </div>
                <input
                  className="provider-connection-input account-provider-key-input"
                  type="password"
                  value={props.openAiApiKeyDraft}
                  onChange={(event) =>
                    props.setOpenAiApiKeyDraft(event.target.value)
                  }
                  placeholder={
                    props.openAiConnection.connected
                      ? "Paste replacement API key"
                      : "Paste OpenAI API key"
                  }
                  autoComplete="off"
                  disabled={props.isSavingOpenAiConnection}
                />
                {props.openAiConnectionError ? (
                  <div className="auth-error">
                    {props.openAiConnectionError}
                  </div>
                ) : null}
                {props.openAiConnectionSuccess ? (
                  <div className="auth-success">
                    {props.openAiConnectionSuccess}
                  </div>
                ) : null}
              </div>
              <div className="account-provider-card-actions">
                <button
                  className="platform-save-button platform-save-button--compact provider-connection-submit-button"
                  type="button"
                  onClick={() => void props.handleConnectOpenAi()}
                  disabled={
                    props.isSavingOpenAiConnection ||
                    props.openAiApiKeyDraft.trim().length === 0
                  }
                >
                  {props.isSavingOpenAiConnection
                    ? "Saving…"
                    : props.openAiConnection.connected
                      ? "Update key"
                      : "Use API key"}
                </button>
                {props.openAiConnection.connected ? (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => void props.handleDisconnectOpenAi()}
                    disabled={props.isSavingOpenAiConnection}
                  >
                    {props.isSavingOpenAiConnection
                      ? "Disconnecting…"
                      : "Disconnect"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
