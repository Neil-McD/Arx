import { useEffect, useState } from "react";
import { formatAccountTierLabel, isAccountTierFree } from "../../../../shared/accountCommerce";
import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { formatStripeConnectCountry } from "../../../../shared/stripeConnectCountries";
import { buildStripeConnectPresentation } from "../controllers/buildStripeConnectPresentation";
import { StripeConnectCountrySelect } from "./StripeConnectCountrySelect";
import { StripeSetupButton } from "./StripeSetupButton";
import { WebSignOutConfirmModal } from "./WebSignOutConfirmModal";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type PendingPurchaseClaim = {
  community_id: string;
  community_name?: string | null;
  community_slug?: string | null;
  expires_at: string;
};

type ChatgptConnection = {
  connected: boolean;
  email?: string | null;
  updated_at?: string | null;
};

type OpenAiConnection = {
  connected: boolean;
  key_last_four?: string | null;
  updated_at?: string | null;
};

type OwnedCommunity = {
  id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

type WebAccountSettingsSectionProps = {
  session: SessionLike;
  authError: string | null;
  requireSignIn: () => void;
  handleSignOut: () => Promise<void> | void;
  deleteAccount: () => Promise<void> | void;
  isLoadingChatgptConnection: boolean;
  chatgptConnection: ChatgptConnection;
  isConnectingChatgpt: boolean;
  isPollingChatgptConnection: boolean;
  hasPendingChatgptAuth: boolean;
  handleConnectChatgpt: () => Promise<void> | void;
  handleDisconnectChatgpt: () => Promise<void> | void;
  chatgptDeviceUserCode: string | null;
  chatgptConnectionError: string | null;
  chatgptConnectionSuccess: string | null;
  isLoadingOpenAiConnection: boolean;
  openAiConnection: OpenAiConnection;
  openAiApiKeyDraft: string;
  setOpenAiApiKeyDraft: (value: string) => void;
  isSavingOpenAiConnection: boolean;
  openAiConnectionError: string | null;
  openAiConnectionSuccess: string | null;
  handleConnectOpenAi: () => Promise<void> | void;
  handleDisconnectOpenAi: () => Promise<void> | void;
  formatRelativeTime: (value: string) => string;
  accountCommerceStatus: AccountCommerceStatus | null;
  communities: OwnedCommunity[];
  communityRoleById: Record<string, string>;
  openOwnedCommunitySettings: (communityId: string) => void;
  communityInitials: (value: string) => string;
  startStripeConnectOnboarding: (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
    country?: string | null;
  }) => Promise<void> | void;
  accountCommerceError: string | null;
  isStartingStripeConnectOnboarding: boolean;
  canUseDevTierOverride: boolean;
  isSettingDevAccountTier: boolean;
  setDevAccountTier: (tier: "free" | "architect") => Promise<void> | void;
  devAccountTierError: string | null;
  pendingPurchaseClaims: PendingPurchaseClaim[];
  isLoadingPendingPurchases: boolean;
  isRedeemingPendingPurchases: boolean;
  redeemPendingPurchases: () => Promise<void> | void;
  refreshPendingPurchases: () => Promise<void> | void;
  pendingPurchasesError: string | null;
  pendingPurchasesSuccess: string | null;
};

const deleteAccountErrorMessages: Record<string, string> = {
  account_delete_owned_communities_blocked: "Delete or transfer owned communities before deleting your account.",
  account_delete_active_community_subscription_blocked: "Cancel active community memberships before deleting your account.",
  account_delete_active_payout_account_blocked: "Resolve active payout setup before deleting your account.",
  account_delete_partner_finance_pending_blocked: "Resolve pending Builder Partner commissions or payouts before deleting your account.",
  account_delete_mounted_apps_blocked: "Remove your apps from communities before deleting your account.",
  account_delete_attached_skills_blocked: "Remove your skills from communities before deleting your account.",
};

function readDeleteAccountErrorCode(value: unknown): string | null {
  if (value && typeof value === "object") {
    const data = (value as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const code = (data as { code?: unknown }).code;
      if (typeof code === "string" && code in deleteAccountErrorMessages) return code;
      const reason = (data as { reason?: unknown }).reason;
      if (typeof reason === "string" && reason in deleteAccountErrorMessages) return reason;
    }

    const code = (value as { code?: unknown }).code;
    if (typeof code === "string" && code in deleteAccountErrorMessages) return code;
  }

  const message = value instanceof Error ? value.message : String(value ?? "");
  for (const code of Object.keys(deleteAccountErrorMessages)) {
    if (message.includes(code)) return code;
  }
  return null;
}

function formatDeleteAccountError(error: unknown): string {
  const code = readDeleteAccountErrorCode(error);
  if (code) return deleteAccountErrorMessages[code];
  return "Account could not be deleted. Please try again.";
}

export function WebAccountSettingsSection(props: WebAccountSettingsSectionProps) {
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [isSubmittingSignOut, setIsSubmittingSignOut] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [stripeConnectCountry, setStripeConnectCountry] = useState("");
  const {
    session,
    authError,
    requireSignIn,
    handleSignOut,
    deleteAccount,
    isLoadingChatgptConnection,
    chatgptConnection,
    isConnectingChatgpt,
    isPollingChatgptConnection,
    hasPendingChatgptAuth,
    handleConnectChatgpt,
    handleDisconnectChatgpt,
    chatgptDeviceUserCode,
    chatgptConnectionError,
    chatgptConnectionSuccess,
    isLoadingOpenAiConnection,
    openAiConnection,
    openAiApiKeyDraft,
    setOpenAiApiKeyDraft,
    isSavingOpenAiConnection,
    openAiConnectionError,
    openAiConnectionSuccess,
    handleConnectOpenAi,
    handleDisconnectOpenAi,
    formatRelativeTime,
    accountCommerceStatus,
    communities,
    communityRoleById,
    openOwnedCommunitySettings,
    communityInitials,
    startStripeConnectOnboarding,
    accountCommerceError,
    isStartingStripeConnectOnboarding,
    canUseDevTierOverride,
    isSettingDevAccountTier,
    setDevAccountTier,
    devAccountTierError,
    pendingPurchaseClaims,
    isLoadingPendingPurchases,
    isRedeemingPendingPurchases,
    redeemPendingPurchases,
    refreshPendingPurchases,
    pendingPurchasesError,
    pendingPurchasesSuccess,
  } = props;
  const storedStripeConnectCountry = accountCommerceStatus?.stripe_connect.country ?? null;

  useEffect(() => {
    if (storedStripeConnectCountry) {
      setStripeConnectCountry(storedStripeConnectCountry);
    }
  }, [storedStripeConnectCountry]);

  useEffect(() => {
    if (session) return;
    setIsSignOutConfirmOpen(false);
    setIsSubmittingSignOut(false);
    setDeleteConfirmation("");
    setIsDeletingAccount(false);
    setDeleteAccountError(null);
  }, [session]);

  const handleConfirmSignOut = async (): Promise<void> => {
    if (isSubmittingSignOut) return;
    setIsSubmittingSignOut(true);
    try {
      await handleSignOut();
      setIsSignOutConfirmOpen(false);
    } finally {
      setIsSubmittingSignOut(false);
    }
  };

  const handleDeleteAccount = async (): Promise<void> => {
    if (!session || isDeletingAccount || deleteConfirmation !== "DELETE") return;
    setIsDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      await deleteAccount();
    } catch (error) {
      setDeleteAccountError(formatDeleteAccountError(error));
      setIsDeletingAccount(false);
    }
  };

  return (
    <>
      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          Account
        </div>
        <div className="settings-section-desc">
          Sign in to join communities and sync your profile.
        </div>
        {session ? (
          <div className="account-row">
            <div className="account-identity">
              <span>Signed in as</span>
              <strong>{session.user.email ?? session.user.id}</strong>
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
            <button className="google-sign-in" type="button" onClick={requireSignIn}>
              Continue to sign in
            </button>
          </div>
        )}
        {authError && <div className="key-error">{authError}</div>}
      </div>

      <WebSignOutConfirmModal
        isOpen={Boolean(session) && isSignOutConfirmOpen}
        isSubmitting={isSubmittingSignOut}
        onClose={() => {
          if (isSubmittingSignOut) return;
          setIsSignOutConfirmOpen(false);
        }}
        onConfirm={handleConfirmSignOut}
      />

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M12 5v14" /><circle cx="12" cy="12" r="9" /></svg>
          Inference provider
        </div>
        <div className="settings-section-desc">
          Personal agent runs need one provider. Connect ChatGPT or add an OpenAI API key; you do not need both.
        </div>
        {!session ? (
          <div className="model-note">Sign in to connect a personal provider.</div>
        ) : (
          <>
            <div className="account-provider-grid">
              <div className={`account-provider-card${chatgptConnection.connected ? " connected" : ""}`}>
                <div className="account-provider-card-kicker">
                  <span>ChatGPT Plus/Pro</span>
                  <span className={`account-provider-status${chatgptConnection.connected ? " connected" : ""}`}>
                    {isLoadingChatgptConnection
                      ? "Checking"
                      : chatgptConnection.connected
                        ? "Connected"
                        : "Not connected"}
                  </span>
                </div>
                <div className="account-provider-card-title">Use ChatGPT</div>
                <div className="account-provider-card-desc">
                  Use your Plus or Pro plan limits through your connected ChatGPT account.
                </div>
                <div className="account-provider-card-body">
                  {chatgptConnection.connected ? (
                    <div className="auth-status">
                      {chatgptConnection.email ? `Connected as ${chatgptConnection.email}. ` : ""}
                      {chatgptConnection.updated_at
                        ? `Last validated ${formatRelativeTime(chatgptConnection.updated_at)}.`
                        : "Ready for GPT-family models."}
                    </div>
                  ) : (
                    <div className="auth-status">
                      Best if you already pay for ChatGPT and want Polynet to use that account.
                    </div>
                  )}
                  {!chatgptConnection.connected && chatgptDeviceUserCode ? (
                    <div className="auth-status">
                      Waiting for OpenAI verification code {chatgptDeviceUserCode}.
                    </div>
                  ) : null}
                  {chatgptConnectionError && <div className="auth-error">{chatgptConnectionError}</div>}
                  {chatgptConnectionSuccess && <div className="auth-success">{chatgptConnectionSuccess}</div>}
                </div>
                <div className="account-provider-card-actions">
                  {chatgptConnection.connected ? (
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void handleDisconnectChatgpt()}
                      disabled={isConnectingChatgpt || isPollingChatgptConnection}
                    >
                      {isConnectingChatgpt
                        ? "Disconnecting…"
                        : isPollingChatgptConnection
                          ? "Waiting…"
                          : "Disconnect"}
                    </button>
                  ) : (
                    <button
                      className="platform-save-button platform-save-button--compact provider-connection-submit-button"
                      type="button"
                      onClick={() => void handleConnectChatgpt()}
                      disabled={isConnectingChatgpt}
                    >
                      {isConnectingChatgpt
                        ? "Starting…"
                        : hasPendingChatgptAuth || isPollingChatgptConnection
                          ? "Continue auth"
                          : "Connect ChatGPT"}
                    </button>
                  )}
                </div>
              </div>

              <div className={`account-provider-card${openAiConnection.connected ? " connected" : ""}`}>
                <div className="account-provider-card-kicker">
                  <span>OpenAI API</span>
                  <span className={`account-provider-status${openAiConnection.connected ? " connected" : ""}`}>
                    {isLoadingOpenAiConnection
                      ? "Checking"
                      : openAiConnection.connected
                        ? "Connected"
                        : "Not connected"}
                  </span>
                </div>
                <div className="account-provider-card-title">Use an API key</div>
                <div className="account-provider-card-desc">
                  Add a key from your OpenAI account and bill model usage directly through OpenAI.
                </div>
                <div className="account-provider-card-body">
                  {openAiConnection.connected ? (
                    <div className="auth-status">
                      {openAiConnection.key_last_four ? `Key ending ${openAiConnection.key_last_four}. ` : ""}
                      {openAiConnection.updated_at
                        ? `Last validated ${formatRelativeTime(openAiConnection.updated_at)}.`
                        : "Ready for OpenAI API inference."}
                    </div>
                  ) : (
                    <div className="auth-status">
                      Best if you want a dedicated API key and direct OpenAI billing.
                    </div>
                  )}
                  <input
                    className="provider-connection-input account-provider-key-input"
                    type="password"
                    value={openAiApiKeyDraft}
                    onChange={(event) => setOpenAiApiKeyDraft(event.target.value)}
                    placeholder={openAiConnection.connected ? "Paste replacement API key" : "Paste OpenAI API key"}
                    autoComplete="off"
                    disabled={isSavingOpenAiConnection}
                  />
                  {openAiConnectionError && <div className="auth-error">{openAiConnectionError}</div>}
                  {openAiConnectionSuccess && <div className="auth-success">{openAiConnectionSuccess}</div>}
                </div>
                <div className="account-provider-card-actions">
                  <button
                    className="platform-save-button platform-save-button--compact provider-connection-submit-button"
                    type="button"
                    onClick={() => void handleConnectOpenAi()}
                    disabled={isSavingOpenAiConnection || openAiApiKeyDraft.trim().length === 0}
                  >
                    {isSavingOpenAiConnection
                      ? "Saving…"
                      : openAiConnection.connected
                        ? "Update key"
                        : "Use API key"}
                  </button>
                  {openAiConnection.connected ? (
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void handleDisconnectOpenAi()}
                      disabled={isSavingOpenAiConnection}
                    >
                      {isSavingOpenAiConnection ? "Disconnecting…" : "Disconnect"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {session && (
        <div className="settings-section">
          {(() => {
            const status = accountCommerceStatus;
            const tier = status?.account_tier ?? "free";
            const ownedCount = communities.reduce(
              (acc, community) => acc + (communityRoleById[community.id] === "owner" ? 1 : 0),
              0,
            );
            const max = status?.max_communities ?? 0;
            const communityWord = (max > 0 ? max : ownedCount) === 1 ? "community" : "communities";
            const communitiesLabel =
              max > 0 ? `${ownedCount}/${max} owned ${communityWord}` : `${ownedCount} owned ${communityWord}`;
            const tierLabel = formatAccountTierLabel(tier);
            const accountStatusLabel = isAccountTierFree(tier) ? "Free account" : `${tierLabel} (internal)`;
            const canMonetizeCommunities = Number(status?.platform_fee_bps ?? 0) > 0;
            const stripeConnectPresentation = buildStripeConnectPresentation({
              accountCommerceStatus: status,
              surface: "account",
            });
            const selectedStripeConnectCountry =
              stripeConnectCountry || storedStripeConnectCountry || "";
            const stripeConnectCountryLabel = formatStripeConnectCountry(selectedStripeConnectCountry);
            const needsStripeConnectCountry =
              !stripeConnectPresentation.isReady && !selectedStripeConnectCountry;
            return (
              <>
                <div className="account-row">
                  <div className="account-identity">
                    <span>Account status</span>
                    <strong>
                      {accountStatusLabel} · {communitiesLabel}
                    </strong>
                  </div>
                  <div className="auth-actions">
                    <span className="auth-status">Tool balance covers premium tools like workspace tools, web research, and voice input. Connect ChatGPT or add an OpenAI API key here to bring your own inference.</span>
                  </div>
                </div>
                {canMonetizeCommunities ? (
                  <div className="account-row">
                    <div className="account-identity">
                      <span>Stripe monetization</span>
                      <strong>{stripeConnectPresentation.statusTitle}</strong>
                    </div>
                    <div className="auth-actions">
                      <span className="auth-status">{stripeConnectPresentation.statusMessage}</span>
                      {stripeConnectPresentation.isReady && stripeConnectCountryLabel ? (
                        <span className="auth-status">Country: {stripeConnectCountryLabel}</span>
                      ) : (
                        <StripeConnectCountrySelect
                          value={selectedStripeConnectCountry}
                          disabled={isStartingStripeConnectOnboarding}
                          onChange={setStripeConnectCountry}
                          style={{ margin: 0, minWidth: 220 }}
                        />
                      )}
                      <StripeSetupButton
                        label={
                          isStartingStripeConnectOnboarding
                            ? "Opening…"
                            : stripeConnectPresentation.connectCtaLabel
                        }
                        onClick={() =>
                          void startStripeConnectOnboarding({
                            context: "account",
                            country: selectedStripeConnectCountry || null,
                          })
                        }
                        disabled={isStartingStripeConnectOnboarding || needsStripeConnectCountry}
                      />
                    </div>
                  </div>
                ) : null}
                {canMonetizeCommunities &&
                  !stripeConnectPresentation.isReady &&
                  stripeConnectPresentation.requirementsPreview.length > 0 && (
                    <div className="auth-status">
                      Stripe still needs: {stripeConnectPresentation.requirementsPreview.join(", ")}.
                    </div>
                  )}
                {canUseDevTierOverride && (
                  <>
                    <div className="account-row">
                      <div className="account-identity">
                        <span>Internal tier override (dev)</span>
                        <strong>Creator-only testing control</strong>
                      </div>
                      <div className="auth-actions">
                        <button
                          type="button"
                          className={isAccountTierFree(tier) ? "" : "secondary"}
                          onClick={() => void setDevAccountTier("free")}
                          disabled={isSettingDevAccountTier || isAccountTierFree(tier)}
                        >
                          Free
                        </button>
                        <button
                          type="button"
                          className={tier === "architect" ? "" : "secondary"}
                          onClick={() => void setDevAccountTier("architect")}
                          disabled={isSettingDevAccountTier || tier === "architect"}
                        >
                          Architect
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            );
          })()}
          {accountCommerceError && <div className="auth-error">{accountCommerceError}</div>}
          {devAccountTierError && <div className="auth-error">{devAccountTierError}</div>}
        </div>
      )}

      {session && (
        <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          Your communities
        </div>
          <div className="settings-section-desc">Open a community to manage pricing and paid access.</div>
          {(() => {
            const owned = communities
              .filter((community) => communityRoleById[community.id] === "owner")
              .sort((a, b) => a.name.localeCompare(b.name));
            if (owned.length === 0) {
              return <div className="model-note">No owned communities yet.</div>;
            }
            return (
              <div className="invite-list">
                {owned.map((community) => (
                  <div key={community.id} className="invite-row">
                    <div className="invite-main with-avatar">
                      <CommunityAvatar
                        className="invite-avatar"
                        imageClassName="invite-avatar-img"
                        fallbackClassName="invite-avatar-fallback"
                        imageUrl={community.avatar_url}
                        focusX={community.avatar_focus_x}
                        focusY={community.avatar_focus_y}
                        zoom={community.avatar_zoom}
                        name={community.name}
                        alt=""
                        fallback={communityInitials(community.name)}
                        aria-hidden
                      />
                      <div className="invite-text">
                        <div className="invite-code">{community.name}</div>
                        <div className="invite-status">{`/c/${community.slug}`}</div>
                      </div>
                    </div>
                    <div className="invite-actions">
                      <button type="button" onClick={() => openOwnedCommunitySettings(community.id)}>
                        Open settings
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {session &&
        (isLoadingPendingPurchases ||
          pendingPurchaseClaims.length > 0 ||
          pendingPurchasesError ||
          pendingPurchasesSuccess) && (
          <div className="settings-section">
            <div className="settings-section-title">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              Pending purchases
            </div>
            <div className="settings-section-desc">
              Recover access if you paid but didn&apos;t finish the join flow.
            </div>
            {isLoadingPendingPurchases && (
              <div className="chat-loading">
                <div className="loading-spinner" />
                <span>Checking…</span>
              </div>
            )}
            {!isLoadingPendingPurchases && pendingPurchaseClaims.length > 0 && (
              <div className="model-list">
                {pendingPurchaseClaims.map((claim) => (
                  <div key={`${claim.community_id}:${claim.expires_at}`} className="model-toggle">
                    <span>{claim.community_name || claim.community_slug || claim.community_id}</span>
                  </div>
                ))}
              </div>
            )}
            {!isLoadingPendingPurchases && pendingPurchaseClaims.length === 0 && pendingPurchasesSuccess && (
              <div className="auth-status">{pendingPurchasesSuccess}</div>
            )}
            <div className="auth-actions">
              <button
                type="button"
                onClick={() => void redeemPendingPurchases()}
                disabled={
                  isRedeemingPendingPurchases ||
                  isLoadingPendingPurchases ||
                  pendingPurchaseClaims.length === 0
                }
              >
                {isRedeemingPendingPurchases ? "Claiming…" : "Claim access"}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => void refreshPendingPurchases()}
                disabled={isRedeemingPendingPurchases || isLoadingPendingPurchases}
              >
                Refresh
              </button>
            </div>
            {pendingPurchasesError && <div className="auth-error">{pendingPurchasesError}</div>}
          </div>
        )}

      {session && (
        <div className="settings-section">
          <div className="settings-section-title">
            <svg viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5" /><path d="M14 11v5" /></svg>
            Delete account
          </div>
          <div className="settings-section-desc">
            Delete your Polynet account data, including your profile, sessions, provider connections, personal memory, workspace threads, and personal workspace data. Active subscriptions, payout setup, owned communities, and community app grants or skills must be resolved first.
          </div>
          <div className="provider-connection-stack">
            <input
              className="provider-connection-input"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder="Type DELETE to confirm"
              autoComplete="off"
              spellCheck={false}
              disabled={isDeletingAccount}
            />
            <div className="auth-actions">
              <button
                className="danger"
                type="button"
                onClick={() => void handleDeleteAccount()}
                disabled={isDeletingAccount || deleteConfirmation !== "DELETE"}
              >
                {isDeletingAccount ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </div>
          {deleteAccountError ? <div className="auth-error">{deleteAccountError}</div> : null}
        </div>
      )}
    </>
  );
}
