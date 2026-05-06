import { useEffect, useState } from "react";
import { formatBuilderTierLabel, isBuilderTierFree } from "../../../../shared/builderBilling";
import type { BuilderBillingStatus } from "../../../../shared/builderBillingStatusGateway";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { buildStripeConnectPresentation } from "../controllers/buildStripeConnectPresentation";
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
  formatRelativeTime: (value: string) => string;
  builderBillingStatus: BuilderBillingStatus | null;
  communities: OwnedCommunity[];
  communityRoleById: Record<string, string>;
  openOwnedCommunitySettings: (communityId: string) => void;
  communityInitials: (value: string) => string;
  openBuilderUpgrade: (context: "builder") => void;
  openBuilderBillingPortal: () => Promise<void> | void;
  startBuilderConnectOnboarding: (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
  }) => Promise<void> | void;
  builderBillingError: string | null;
  isOpeningBuilderBillingPortal: boolean;
  isStartingBuilderConnectOnboarding: boolean;
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

function formatDeleteAccountError(message: string): string {
  if (message.includes("account_delete_owned_communities_blocked")) {
    return "Delete or transfer owned communities before deleting your account.";
  }
  if (message.includes("account_delete_active_builder_subscription_blocked")) {
    return "Cancel your active legacy Builder plan before deleting your account.";
  }
  if (message.includes("account_delete_active_community_subscription_blocked")) {
    return "Cancel active community memberships before deleting your account.";
  }
  if (message.includes("account_delete_active_payout_account_blocked")) {
    return "Resolve active payout setup before deleting your account.";
  }
  if (message.includes("account_delete_mounted_apps_blocked")) {
    return "Remove your apps from communities before deleting your account.";
  }
  if (message.includes("account_delete_attached_skills_blocked")) {
    return "Remove your skills from communities before deleting your account.";
  }
  return "Account could not be deleted. Please try again.";
}

export function WebAccountSettingsSection(props: WebAccountSettingsSectionProps) {
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [isSubmittingSignOut, setIsSubmittingSignOut] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
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
    formatRelativeTime,
    builderBillingStatus,
    communities,
    communityRoleById,
    openOwnedCommunitySettings,
    communityInitials,
    openBuilderBillingPortal,
    startBuilderConnectOnboarding,
    builderBillingError,
    isOpeningBuilderBillingPortal,
    isStartingBuilderConnectOnboarding,
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
      const message = error instanceof Error ? error.message : String(error ?? "");
      setDeleteAccountError(formatDeleteAccountError(message));
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
          ChatGPT connection
        </div>
        <div className="settings-section-desc">
          Connect ChatGPT for personal inference. Builder unlocks the private workbench and workspace tools.
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
            const builderStatusLabel = isBuilderTierFree(tier) ? "Free builder" : `${tierLabel} (legacy)`;
            const canManagePlan = status?.can_manage_plan === true;
            const canMonetizeCommunities = Number(status?.platform_fee_bps ?? 0) > 0;
            const stripeConnectPresentation = buildStripeConnectPresentation({
              builderBillingStatus: status,
              surface: "account",
            });
            return (
              <>
                <div className="account-row">
                  <div className="account-identity">
                    <span>Builder status</span>
                    <strong>
                      {builderStatusLabel} · {communitiesLabel}
                    </strong>
                  </div>
                  <div className="auth-actions">
                    <span className="auth-status">Credits cover paid tools like Daytona workspaces, web research, and voice input. Connect ChatGPT or add an OpenAI API key in Agent settings to bring your own inference.</span>
                    {canManagePlan ? (
                      <>
                        <span className="auth-status">Legacy Builder billing is still manageable here.</span>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void openBuilderBillingPortal()}
                          disabled={isOpeningBuilderBillingPortal}
                        >
                          {isOpeningBuilderBillingPortal ? "Opening…" : "Manage legacy plan"}
                        </button>
                      </>
                    ) : null}
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
                      <StripeSetupButton
                        label={
                          isStartingBuilderConnectOnboarding
                            ? "Opening…"
                            : stripeConnectPresentation.connectCtaLabel
                        }
                        onClick={() => void startBuilderConnectOnboarding({ context: "account" })}
                        disabled={isStartingBuilderConnectOnboarding}
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
