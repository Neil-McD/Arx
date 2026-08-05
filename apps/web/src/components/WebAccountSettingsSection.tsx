import { useEffect, useState } from "react";

import { WebSignOutConfirmModal } from "./WebSignOutConfirmModal";
import type { CloudFounderInferenceStatus } from "../../../../shared/cloudFounderInferenceGateway";
import type {
  CloudFounderBillingCommunity,
  CloudFounderBillingOverview,
} from "../../../../shared/cloudFounderBillingGateway";
import {
  builderFundingActionLabel,
  formatBuilderOfferPrice,
  resolveBuilderOfferPrimaryAction,
} from "../../../../shared/builderOffer";
import { WebInactiveCommunityInventory } from "./WebInactiveCommunityInventory";

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
  founderInferenceStatus: CloudFounderInferenceStatus;
  isLoadingFounderInference: boolean;
  isSavingFounderInference: boolean;
  founderInferenceError: string | null;
  founderInferenceSuccess: string | null;
  handleActivateFounderInference: (acceptedTerms: boolean) => Promise<void> | void;
  handleSuspendFounderInference: () => Promise<void> | void;
  founderBillingOverview: CloudFounderBillingOverview;
  isLoadingFounderBilling: boolean;
  onOpenBuilderOffer: (community: CloudFounderBillingCommunity) => void;
  onOpenCommunityBilling: () => void;
  onOpenCreateCommunity: () => void;
  onOpenInactiveCommunity: (slug: string) => void;
  formatRelativeTime: (value: string) => string;
};

export function WebAccountSettingsSection(
  props: WebAccountSettingsSectionProps,
) {
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [isSubmittingSignOut, setIsSubmittingSignOut] = useState(false);
  const [hasAcceptedFounderInferenceTerms, setHasAcceptedFounderInferenceTerms] = useState(false);

  useEffect(() => {
    if (props.session) return;
    setIsSignOutConfirmOpen(false);
    setIsSubmittingSignOut(false);
  }, [props.session]);

  useEffect(() => {
    if (props.founderInferenceStatus.status === "active") {
      setHasAcceptedFounderInferenceTerms(false);
    }
  }, [props.founderInferenceStatus.status]);

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
  const activeOwnedCommunities = props.founderBillingOverview.communities.filter(
    (community) => community.lifecycle_status === "active",
  );
  const builderAttentionCommunity = activeOwnedCommunities.find((community) =>
    [
      "builder_required",
      "checkout_pending",
      "builder_inactive",
      "builder_past_due",
      "builder_ended",
    ].includes(community.funding_state),
  ) ?? null;
  const activeBuilderCount = activeOwnedCommunities.filter(
    (community) =>
      community.operational_funding &&
      ["builder_active", "builder_canceling", "builder_included"].includes(
        community.funding_state,
      ),
  ).length;
  const legacyApiCount = activeOwnedCommunities.filter(
    (community) =>
      community.operational_funding &&
      community.funding_state === "legacy_api_active",
  ).length;
  const builderAttentionAction = builderAttentionCommunity
    ? resolveBuilderOfferPrimaryAction({
        state: builderAttentionCommunity.funding_state,
        allowedActions: builderAttentionCommunity.allowed_actions,
      })
    : null;

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

      {props.session ? (
        <WebInactiveCommunityInventory
          session={props.session}
          onOpenCommunity={props.onOpenInactiveCommunity}
        />
      ) : null}

      {props.session ? (
        <div className="settings-section builder-account-section">
          <div className="settings-section-title">Builder communities</div>
          <div className="settings-section-desc">
            Builder is attached to communities, not your account. Each Builder community is {formatBuilderOfferPrice()}.
          </div>
          {props.isLoadingFounderBilling && props.founderBillingOverview.communities.length === 0 ? (
            <div className="chat-loading">
              <div className="loading-spinner" />
              <span>Checking Builder…</span>
            </div>
          ) : (
            <div className="builder-account-summary">
              <div>
                {props.founderBillingOverview.communities.length === 0 ? (
                  <>
                    <strong>No Builder community yet</strong>
                    <span>Create your first community to continue.</span>
                  </>
                ) : activeOwnedCommunities.length === 0 ? (
                  <>
                    <strong>No active Builder community</strong>
                    <span>Archived communities are dormant and do not count as active.</span>
                  </>
                ) : builderAttentionCommunity ? (
                  <>
                    <strong>{builderAttentionCommunity.community_name} needs attention</strong>
                    <span>Complete Builder funding before creating another community.</span>
                  </>
                ) : (
                  <>
                    <strong>
                      {activeBuilderCount > 0
                        ? `Builder active for ${activeBuilderCount} ${activeBuilderCount === 1 ? "community" : "communities"}`
                        : "Community AI funded"}
                    </strong>
                    <span>
                      {legacyApiCount > 0
                        ? `${legacyApiCount} ${legacyApiCount === 1 ? "community uses" : "communities use"} legacy API funding.`
                        : "All owned communities are current."}
                    </span>
                  </>
                )}
              </div>
              {props.founderBillingOverview.communities.length === 0 ? (
                <button type="button" onClick={props.onOpenCreateCommunity}>Create community</button>
              ) : builderAttentionCommunity && builderAttentionAction ? (
                <button type="button" onClick={() => props.onOpenBuilderOffer(builderAttentionCommunity)}>
                  {builderFundingActionLabel({
                    action: builderAttentionAction,
                    state: builderAttentionCommunity.funding_state,
                    includePrice: builderAttentionAction === "buy_builder",
                  })}
                </button>
              ) : (
                <button className="secondary" type="button" onClick={props.onOpenCommunityBilling}>
                  Manage billing
                </button>
              )}
            </div>
          )}
        </div>
      ) : null}

      <WebSignOutConfirmModal
        isOpen={Boolean(props.session) && isSignOutConfirmOpen}
        isSubmitting={isSubmittingSignOut}
        onClose={() => {
          if (!isSubmittingSignOut) setIsSignOutConfirmOpen(false);
        }}
        onConfirm={handleConfirmSignOut}
      />

      {props.session && props.founderInferenceStatus.eligible ? (
        <div className="settings-section">
          <div className="settings-section-title">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 12h16" />
              <path d="M12 4v16" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            Legacy API funding
          </div>
          <div className="settings-section-desc">
            Exact legacy-eligible communities may use your OpenAI API key instead of Builder.
          </div>
          <div className={`account-provider-card${
            props.founderInferenceStatus.status === "active" && props.founderInferenceStatus.key_connected
              ? " connected"
              : ""
          }`}>
            <div className="account-provider-card-kicker">
              <span>Legacy community access</span>
              <span className={`account-provider-status${
                props.founderInferenceStatus.status === "active" && props.founderInferenceStatus.key_connected
                  ? " connected"
                  : ""
              }`}>
                {props.isLoadingFounderInference
                  ? "Checking"
                  : props.founderInferenceStatus.status === "active" && props.founderInferenceStatus.key_connected
                    ? "Active"
                    : props.founderInferenceStatus.status === "suspended"
                      ? "Suspended"
                      : props.founderInferenceStatus.status === "active"
                        ? "Action required"
                        : "Ready to activate"}
              </span>
            </div>
            <div className="account-provider-card-title">OpenAI API funding for eligible communities</div>
            <div className="account-provider-card-desc">
              Members keep their own permissions. Your key pays only for supported community inference and is never shared with members.
            </div>
            <div className="account-provider-card-body">
              <div className="auth-status">
                {props.founderInferenceStatus.communities.length > 0
                  ? `Covers ${props.founderInferenceStatus.communities.map((community) => community.name).join(", ")}.`
                  : "No legacy-eligible communities."}
              </div>
              {props.founderInferenceStatus.status !== "active" ? (
                <label className="auth-status">
                  <input
                    type="checkbox"
                    checked={hasAcceptedFounderInferenceTerms}
                    onChange={(event) => setHasAcceptedFounderInferenceTerms(event.target.checked)}
                    disabled={props.isSavingFounderInference}
                  />{" "}
                  I authorize Polynet to use my connected OpenAI API key for bounded inference across the eligible legacy communities listed here. OpenAI bills my account directly, and I can suspend access at any time.
                </label>
              ) : null}
              {!props.founderInferenceStatus.key_connected ? (
                <div className="auth-error">Connect an OpenAI API key below before activation.</div>
              ) : null}
              {props.founderInferenceError ? (
                <div className="auth-error">{props.founderInferenceError}</div>
              ) : null}
              {props.founderInferenceSuccess ? (
                <div className="auth-success">{props.founderInferenceSuccess}</div>
              ) : null}
            </div>
            <div className="account-provider-card-actions">
              {props.founderInferenceStatus.status === "active" ? (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void props.handleSuspendFounderInference()}
                  disabled={props.isSavingFounderInference}
                >
                  {props.isSavingFounderInference ? "Suspending…" : "Suspend community inference"}
                </button>
              ) : (
                <button
                  className="platform-save-button platform-save-button--compact provider-connection-submit-button"
                  type="button"
                  onClick={() => void props.handleActivateFounderInference(hasAcceptedFounderInferenceTerms)}
                  disabled={
                    props.isSavingFounderInference ||
                    !props.founderInferenceStatus.key_connected ||
                    !hasAcceptedFounderInferenceTerms
                  }
                >
                  {props.isSavingFounderInference ? "Testing API access…" : "Activate for eligible communities"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          Personal AI connection
        </div>
        <div className="settings-section-desc">
          Connect ChatGPT or an OpenAI API key for your personal Polynet agent. This does not activate Builder for a community.
        </div>
        {!props.session ? (
          <div className="model-note">
            Sign in to connect an inference provider.
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
