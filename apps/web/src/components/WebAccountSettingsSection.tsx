import { formatBuilderTierLabel, isBuilderTierFree } from "../../../../shared/builderBilling";

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

type OpenRouterConnection = {
  connected: boolean;
  key_last_four?: string | null;
  updated_at?: string | null;
};

type BuilderBillingStatus = {
  builder_tier: "free" | "builder" | "architect";
  max_communities: number;
} | null;

type OwnedCommunity = {
  id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
};

type WebAccountSettingsSectionProps = {
  session: SessionLike;
  authError: string | null;
  openAuthGate: () => void;
  handleSignOut: () => Promise<void> | void;
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
  isLoadingOpenRouterConnection: boolean;
  openRouterConnection: OpenRouterConnection;
  openRouterApiKeyDraft: string;
  setOpenRouterApiKeyDraft: (value: string) => void;
  isSavingOpenRouterConnection: boolean;
  handleConnectOpenRouter: () => Promise<void> | void;
  handleDisconnectOpenRouter: () => Promise<void> | void;
  openRouterConnectionError: string | null;
  openRouterConnectionSuccess: string | null;
  formatRelativeTime: (value: string) => string;
  builderBillingStatus: BuilderBillingStatus;
  communities: OwnedCommunity[];
  communityRoleById: Record<string, string>;
  openOwnedCommunitySettings: (communityId: string) => void;
  communityInitials: (value: string) => string;
  openBuilderUpgrade: (context: "builder") => void;
  openBuilderBillingPortal: () => Promise<void> | void;
  builderBillingError: string | null;
  isOpeningBuilderBillingPortal: boolean;
  canUseDevTierOverride: boolean;
  isSettingDevBuilderTier: boolean;
  setDevBuilderTier: (tier: "free" | "builder" | "architect") => Promise<void> | void;
  devBuilderTierError: string | null;
  pendingPurchaseClaims: PendingPurchaseClaim[];
  isLoadingPendingPurchases: boolean;
  isRedeemingPendingPurchases: boolean;
  redeemPendingPurchases: () => Promise<void> | void;
  refreshPendingPurchases: () => Promise<void> | void;
  pendingPurchasesError: string | null;
  pendingPurchasesSuccess: string | null;
};

export function WebAccountSettingsSection(props: WebAccountSettingsSectionProps) {
  const {
    session,
    authError,
    openAuthGate,
    handleSignOut,
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
    isLoadingOpenRouterConnection,
    openRouterConnection,
    openRouterApiKeyDraft,
    setOpenRouterApiKeyDraft,
    isSavingOpenRouterConnection,
    handleConnectOpenRouter,
    handleDisconnectOpenRouter,
    openRouterConnectionError,
    openRouterConnectionSuccess,
    formatRelativeTime,
    builderBillingStatus,
    communities,
    communityRoleById,
    openOwnedCommunitySettings,
    communityInitials,
    openBuilderUpgrade,
    openBuilderBillingPortal,
    builderBillingError,
    isOpeningBuilderBillingPortal,
    canUseDevTierOverride,
    isSettingDevBuilderTier,
    setDevBuilderTier,
    devBuilderTierError,
    pendingPurchaseClaims,
    isLoadingPendingPurchases,
    isRedeemingPendingPurchases,
    redeemPendingPurchases,
    refreshPendingPurchases,
    pendingPurchasesError,
    pendingPurchasesSuccess,
  } = props;

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
            <button className="secondary" type="button" onClick={() => void handleSignOut()}>
              Sign out
            </button>
          </div>
        ) : (
          <div className="account-row">
            <button className="google-sign-in" type="button" onClick={openAuthGate}>
              <svg className="google-logo" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Sign in with Google
            </button>
          </div>
        )}
        {authError && <div className="key-error">{authError}</div>}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M12 5v14" /><circle cx="12" cy="12" r="9" /></svg>
          Inference connections
        </div>
        <div className="settings-section-desc">
          Bring your own inference with ChatGPT auth or an OpenRouter key. Builder and Architect unlock the private workbench and workspace tools.
        </div>
        {!session ? (
          <div className="model-note">Sign in to connect a personal provider.</div>
        ) : (
          <>
            <div className="account-row">
              <div className="account-identity">
                <span>ChatGPT</span>
                <strong>
                  {isLoadingChatgptConnection
                    ? "Checking…"
                    : chatgptConnection.connected
                      ? `Connected${chatgptConnection.email ? ` · ${chatgptConnection.email}` : ""}`
                      : "Not connected"}
                </strong>
              </div>
              {chatgptConnection.connected ? (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void handleDisconnectChatgpt()}
                  disabled={isConnectingChatgpt || isPollingChatgptConnection}
                >
                  {isConnectingChatgpt ? "Disconnecting…" : isPollingChatgptConnection ? "Waiting…" : "Disconnect"}
                </button>
              ) : (
                <button
                  className="secondary"
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
            {!chatgptConnection.connected && chatgptDeviceUserCode && (
              <div className="auth-status">Waiting for OpenAI verification code {chatgptDeviceUserCode}.</div>
            )}
            {chatgptConnection.connected && (
              <div className="auth-status">
                {chatgptConnection.updated_at
                  ? `Last validated ${formatRelativeTime(chatgptConnection.updated_at)}.`
                  : "Ready for GPT-family models on the ChatGPT lane."}
              </div>
            )}
            {chatgptConnectionError && <div className="auth-error">{chatgptConnectionError}</div>}
            {chatgptConnectionSuccess && <div className="auth-success">{chatgptConnectionSuccess}</div>}

            <div className="account-row">
              <div className="account-identity">
                <span>OpenRouter</span>
                <strong>
                  {isLoadingOpenRouterConnection
                    ? "Checking…"
                    : openRouterConnection.connected
                      ? `Connected${openRouterConnection.key_last_four ? ` ·••••${openRouterConnection.key_last_four}` : ""}`
                      : "Not connected"}
                </strong>
              </div>
            </div>
            <div className="provider-connection-stack">
              <input
                className="provider-connection-input"
                type="password"
                placeholder="Paste OpenRouter API key"
                value={openRouterApiKeyDraft}
                onChange={(event) => setOpenRouterApiKeyDraft(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <div className="provider-connection-actions">
                <button
                  className="platform-save-button"
                  type="button"
                  onClick={() => void handleConnectOpenRouter()}
                  disabled={isSavingOpenRouterConnection || openRouterApiKeyDraft.trim().length === 0}
                >
                  {isSavingOpenRouterConnection
                    ? (openRouterConnection.connected ? "Updating…" : "Connecting…")
                    : (openRouterConnection.connected ? "Update key" : "Connect key")}
                </button>
                {openRouterConnection.connected && (
                  <button
                    className="secondary provider-disconnect-btn"
                    type="button"
                    onClick={() => void handleDisconnectOpenRouter()}
                    disabled={isSavingOpenRouterConnection}
                  >
                    {isSavingOpenRouterConnection ? "Disconnecting…" : "Disconnect"}
                  </button>
                )}
              </div>
            </div>
            {openRouterConnection.connected && openRouterConnection.updated_at && (
              <div className="auth-status">
                Last validated {formatRelativeTime(openRouterConnection.updated_at)}.
              </div>
            )}
            {openRouterConnectionError && <div className="auth-error">{openRouterConnectionError}</div>}
            {openRouterConnectionSuccess && <div className="auth-success">{openRouterConnectionSuccess}</div>}
          </>
        )}
      </div>

      {session && (
        <div className="settings-section">
          {(() => {
            const status = builderBillingStatus;
            const tier = status?.builder_tier ?? "free";
            const ownedCount = communities.reduce(
              (acc, community) => acc + (communityRoleById[community.id] === "owner" ? 1 : 0),
              0,
            );
            const max = status?.max_communities ?? 0;
            const communityWord = (max > 0 ? max : ownedCount) === 1 ? "community" : "communities";
            const communitiesLabel =
              max > 0 ? `${ownedCount}/${max} owned ${communityWord}` : `${ownedCount} owned ${communityWord}`;
            const tierLabel = formatBuilderTierLabel(tier);
            return (
              <>
                <div className="account-row">
                  <div className="account-identity">
                    <span>Plan</span>
                    <strong>
                      {tierLabel} · {communitiesLabel}
                    </strong>
                  </div>
                  <div className="auth-actions">
                    {isBuilderTierFree(tier) ? (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => openBuilderUpgrade("builder")}
                      >
                        Upgrade to Builder ($24/mo)
                      </button>
                    ) : (
                      <>
                        <span className="auth-status">Builder includes 500 monthly workspace credits. Connect ChatGPT or OpenRouter to bring your own inference.</span>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void openBuilderBillingPortal()}
                          disabled={isOpeningBuilderBillingPortal}
                        >
                          {isOpeningBuilderBillingPortal ? "Opening…" : "Manage plan"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
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
                          className={isBuilderTierFree(tier) ? "" : "secondary"}
                          onClick={() => void setDevBuilderTier("free")}
                          disabled={isSettingDevBuilderTier || isBuilderTierFree(tier)}
                        >
                          Free
                        </button>
                        <button
                          type="button"
                          className={tier === "builder" ? "" : "secondary"}
                          onClick={() => void setDevBuilderTier("builder")}
                          disabled={isSettingDevBuilderTier || tier === "builder"}
                        >
                          Builder
                        </button>
                        <button
                          type="button"
                          className={tier === "architect" ? "" : "secondary"}
                          onClick={() => void setDevBuilderTier("architect")}
                          disabled={isSettingDevBuilderTier || tier === "architect"}
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
          {builderBillingError && <div className="auth-error">{builderBillingError}</div>}
          {devBuilderTierError && <div className="auth-error">{devBuilderTierError}</div>}
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
                      <div className="invite-avatar" aria-hidden="true">
                        {community.avatar_url ? (
                          <img
                            className="invite-avatar-img"
                            src={community.avatar_url}
                            alt=""
                            loading="lazy"
                          />
                        ) : (
                          <span className="invite-avatar-fallback">{communityInitials(community.name)}</span>
                        )}
                      </div>
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
    </>
  );
}
