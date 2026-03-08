import { WebAuthGateModal } from "./WebAuthGateModal";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";

type PublicRouteKind = "community_landing" | "checkout_success" | "claim";

type PublicCommunityLike = {
  slug: string;
  name: string;
  description: string | null;
};

type PublicCommunityPlanLike = {
  billing_period: string;
};

type CheckoutStatus = "idle" | "loading" | "pending" | "succeeded" | "error";
type MagicLinkStatus = "idle" | "sending" | "sent";

type WebPublicRouteViewProps = {
  publicRouteKind: PublicRouteKind;
  publicRouteSlug: string;
  showSignIn: boolean;
  onBackToApp: () => void;
  onOpenAuthGate: () => void;
  onSignOut: () => void;

  publicCommunity: PublicCommunityLike | null;
  selectedPublicCommunityPlanLabel: string | null;
  publicVisibilityLabel: string;
  publicVisibilityHint: string;
  publicCommunityPlans: PublicCommunityPlanLike[];
  selectedPublicCommunityBillingPeriod: string | null;
  selectedPublicCommunityPlanBillingPeriod: string | null;
  onSelectPublicCommunityBillingPeriod: (period: string) => void;
  hasSelectedPublicCommunityPlan: boolean;

  isLoadingPublicCommunity: boolean;
  canJoinForFree: boolean;
  canRequestAccessForFree: boolean;
  canJoinWithCheckout: boolean;
  checkoutStatus: CheckoutStatus;
  isJoiningPublicCommunity: boolean;
  isRequestingPublicCommunityAccess: boolean;
  isLoadingMyPublicCommunityJoinRequest: boolean;
  requestPending: boolean;
  requestCooldownActive: boolean;
  requestDeniedDateLabel: string;

  onPrimaryJoinAction: () => void;
  onSendLandingMagicLink: () => void;
  onRetryCheckoutFinalize: () => void;
  onContinueCheckout: () => void;
  onContinueClaim: () => void;
  onNavigateToClaim: () => void;
  onSendMagicLink: () => void;

  checkoutError: string | null;
  publicCommunityError: string | null;
  publicJoinError: string | null;
  publicRequestAccessError: string | null;
  magicLinkEmail: string;
  onChangeMagicLinkEmail: (value: string) => void;
  magicLinkStatus: MagicLinkStatus;
  magicLinkError: string | null;

  pendingToken: string;
  manualClaimToken: string;
  onChangeManualClaimToken: (value: string) => void;
  isRedeemingClaim: boolean;
  redeemClaimError: string | null;

  isAuthGateOpen: boolean;
  authError: string | null;
  onCloseAuthGate: () => void;
  onSignIn: () => void;
};

export function WebPublicRouteView(props: WebPublicRouteViewProps) {
  const {
    publicRouteKind,
    publicRouteSlug,
    showSignIn,
    onBackToApp,
    onOpenAuthGate,
    onSignOut,
    publicCommunity,
    selectedPublicCommunityPlanLabel,
    publicVisibilityLabel,
    publicVisibilityHint,
    publicCommunityPlans,
    selectedPublicCommunityBillingPeriod,
    selectedPublicCommunityPlanBillingPeriod,
    onSelectPublicCommunityBillingPeriod,
    hasSelectedPublicCommunityPlan,
    isLoadingPublicCommunity,
    canJoinForFree,
    canRequestAccessForFree,
    canJoinWithCheckout,
    checkoutStatus,
    isJoiningPublicCommunity,
    isRequestingPublicCommunityAccess,
    isLoadingMyPublicCommunityJoinRequest,
    requestPending,
    requestCooldownActive,
    requestDeniedDateLabel,
    onPrimaryJoinAction,
    onSendLandingMagicLink,
    onRetryCheckoutFinalize,
    onContinueCheckout,
    onContinueClaim,
    onNavigateToClaim,
    onSendMagicLink,
    checkoutError,
    publicCommunityError,
    publicJoinError,
    publicRequestAccessError,
    magicLinkEmail,
    onChangeMagicLinkEmail,
    magicLinkStatus,
    magicLinkError,
    pendingToken,
    manualClaimToken,
    onChangeManualClaimToken,
    isRedeemingClaim,
    redeemClaimError,
    isAuthGateOpen,
    authError,
    onCloseAuthGate,
    onSignIn,
  } = props;
  const billingPeriodOptions = [
    ...publicCommunityPlans.slice().sort((a, b) => {
      const ar = a.billing_period === "monthly" ? 0 : 1;
      const br = b.billing_period === "monthly" ? 0 : 1;
      return ar - br;
    }),
  ];
  const selectedBillingPeriod =
    selectedPublicCommunityBillingPeriod ?? selectedPublicCommunityPlanBillingPeriod;
  const billingPeriodSwitcherStyle = buildPlatformSwitcherStyle(
    billingPeriodOptions.length,
    billingPeriodOptions.findIndex((plan) => plan.billing_period === selectedBillingPeriod),
  );

  return (
    <div className="app-root public-root">
      <header className="app-topbar">
        <div className="topbar-left">
          <button className="back-to-workspace" type="button" onClick={onBackToApp}>
            <svg viewBox="0 0 24 24" className="back-icon" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="back-path">Polynet</span>
          </button>
        </div>
        <div className="topbar-right">
          {showSignIn ? (
            <button className="secondary" type="button" onClick={onOpenAuthGate}>
              Sign in
            </button>
          ) : (
            <button className="secondary" type="button" onClick={onSignOut}>
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="workspace community-mode">
        {publicRouteKind === "community_landing" && (
          <div className="community-panel discover-panel">
            <div className="discover-hero">
              <div className="discover-hero-copy">
                <div className="discover-title">{publicCommunity?.name ?? publicRouteSlug}</div>
                <div className="discover-subtitle">
                  {publicCommunity?.description ?? "Join this community on Polynet."}
                </div>
                <div className="discover-subtitle">
                  {selectedPublicCommunityPlanLabel ?? "Free"} · {publicVisibilityLabel}
                </div>
                {publicCommunity && <div className="discover-empty-text">{publicVisibilityHint}</div>}
              </div>
              <div className="discover-controls">
                {publicCommunityPlans.length > 1 && (
                  <div
                    className="platform-switcher platform-switcher-compact"
                    role="tablist"
                    aria-label="Billing period"
                    style={billingPeriodSwitcherStyle}
                  >
                    {billingPeriodOptions.map((plan) => (
                      <button
                        key={plan.billing_period}
                        type="button"
                        className={
                          plan.billing_period ===
                          selectedBillingPeriod
                            ? "platform-switcher-btn active"
                            : "platform-switcher-btn"
                        }
                        aria-pressed={
                          plan.billing_period === selectedBillingPeriod
                        }
                        onClick={() => onSelectPublicCommunityBillingPeriod(plan.billing_period)}
                      >
                        {plan.billing_period === "monthly" ? "Monthly" : "Annual"}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  className="discover-refresh"
                  type="button"
                  disabled={
                    isLoadingPublicCommunity ||
                    !publicCommunity ||
                    checkoutStatus === "loading" ||
                    isJoiningPublicCommunity ||
                    isRequestingPublicCommunityAccess ||
                    isLoadingMyPublicCommunityJoinRequest ||
                    (canJoinWithCheckout && !hasSelectedPublicCommunityPlan) ||
                    (!canJoinWithCheckout && !canJoinForFree && !canRequestAccessForFree) ||
                    (canRequestAccessForFree && (requestPending || requestCooldownActive))
                  }
                  onClick={onPrimaryJoinAction}
                >
                  {canJoinWithCheckout
                    ? "Join now"
                    : canRequestAccessForFree
                      ? isRequestingPublicCommunityAccess
                        ? "Requesting…"
                        : requestPending
                          ? "Request pending"
                          : requestCooldownActive
                            ? "Request denied"
                            : "Request access"
                      : isJoiningPublicCommunity
                        ? "Joining…"
                        : canJoinForFree
                          ? "Join free"
                          : "Invite only"}
                </button>
                {canRequestAccessForFree && !showSignIn && requestPending && (
                  <div className="model-note" style={{ marginTop: 8 }}>
                    Awaiting approval by the community admins.
                  </div>
                )}
                {canRequestAccessForFree && !showSignIn && requestCooldownActive && (
                  <div className="auth-error" style={{ marginTop: 8 }}>
                    Request denied. Try again on {requestDeniedDateLabel}.
                  </div>
                )}
              </div>
            </div>
            {isLoadingPublicCommunity && <div className="chat-empty">Loading…</div>}
            {!isLoadingPublicCommunity && publicCommunityError && (
              <div className="auth-error">{publicCommunityError}</div>
            )}
            {publicJoinError && <div className="auth-error">{publicJoinError}</div>}
            {publicRequestAccessError && <div className="auth-error">{publicRequestAccessError}</div>}
            {checkoutError && <div className="auth-error">{checkoutError}</div>}
            {showSignIn && publicCommunity && (canJoinForFree || canRequestAccessForFree) && (
              <div className="chat-empty">
                <div className="discover-empty-text">
                  Or {canRequestAccessForFree ? "request access" : "join"} with a magic link:
                </div>
                <div className="discover-controls">
                  <input
                    className="discover-search"
                    type="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    value={magicLinkEmail}
                    onChange={(event) => onChangeMagicLinkEmail(event.target.value)}
                  />
                  <button
                    className="discover-refresh"
                    type="button"
                    disabled={magicLinkStatus === "sending"}
                    onClick={onSendLandingMagicLink}
                  >
                    {magicLinkStatus === "sending" ? "Sending…" : "Email link"}
                  </button>
                </div>
                {magicLinkStatus === "sent" && (
                  <div className="chat-empty">Check your email for a sign-in link.</div>
                )}
                {magicLinkError && <div className="auth-error">{magicLinkError}</div>}
              </div>
            )}
            <div className="chat-messages">
              <div className="discover-empty">
                <div className="discover-empty-title">Powered by Polynet</div>
                <div className="discover-empty-text">
                  {publicCommunity
                    ? canJoinWithCheckout
                      ? "Preview this community, then choose a plan to join."
                      : canRequestAccessForFree
                        ? "This community is gated. Request access to enter."
                        : "Join to participate in chat, resources, and voice."
                    : "Join to access chat, resources, and the community copilot."}
                </div>
                <button className="secondary" type="button" onClick={onNavigateToClaim}>
                  Paid but can&apos;t access? Recover
                </button>
              </div>
            </div>
          </div>
        )}

        {publicRouteKind === "checkout_success" && (
          <div className="community-panel discover-panel">
            <div className="discover-hero">
              <div className="discover-hero-copy">
                <div className="discover-title">
                  {checkoutStatus === "loading"
                    ? "Setting up your access…"
                    : checkoutStatus === "pending"
                      ? "Payment pending"
                      : checkoutStatus === "succeeded"
                        ? "You're in!"
                        : "Checkout error"}
                </div>
                <div className="discover-subtitle">
                  {checkoutStatus === "pending"
                    ? "It can take a moment. We'll keep checking."
                    : checkoutStatus === "succeeded"
                      ? "Continue to access the community."
                      : checkoutError ?? ""}
                </div>
              </div>
              <div className="discover-controls">
                <button
                  className="discover-refresh"
                  type="button"
                  disabled={!pendingToken || isRedeemingClaim || checkoutStatus === "loading"}
                  onClick={onContinueCheckout}
                >
                  Continue
                </button>
                {(checkoutStatus === "pending" || checkoutStatus === "error") && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={onRetryCheckoutFinalize}
                  >
                    {checkoutStatus === "pending" ? "Check again" : "Retry"}
                  </button>
                )}
              </div>
            </div>
            {showSignIn && (
              <div className="chat-empty">
                <div className="discover-empty-text">Or get a magic link:</div>
                <div className="discover-controls">
                  <input
                    className="discover-search"
                    type="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    value={magicLinkEmail}
                    onChange={(event) => onChangeMagicLinkEmail(event.target.value)}
                  />
                  <button
                    className="discover-refresh"
                    type="button"
                    disabled={magicLinkStatus === "sending"}
                    onClick={onSendMagicLink}
                  >
                    {magicLinkStatus === "sending" ? "Sending…" : "Email link"}
                  </button>
                </div>
                {magicLinkStatus === "sent" && (
                  <div className="chat-empty">Check your email for a sign-in link.</div>
                )}
                {magicLinkError && <div className="auth-error">{magicLinkError}</div>}
              </div>
            )}
            {redeemClaimError && <div className="auth-error">{redeemClaimError}</div>}
            {isRedeemingClaim && <div className="chat-empty">Claiming access…</div>}
          </div>
        )}

        {publicRouteKind === "claim" && (
          <div className="community-panel discover-panel">
            <div className="discover-hero">
              <div className="discover-hero-copy">
                <div className="discover-title">Claim access</div>
                <div className="discover-subtitle">Continue to unlock your community.</div>
              </div>
              <div className="discover-controls">
                <button
                  className="discover-refresh"
                  type="button"
                  disabled={!(pendingToken || manualClaimToken.trim()) || isRedeemingClaim}
                  onClick={onContinueClaim}
                >
                  Continue
                </button>
              </div>
            </div>
            {!pendingToken && (
              <div className="chat-empty">
                <div className="discover-empty-text">Paste your claim token:</div>
                <div className="discover-controls">
                  <input
                    className="discover-search"
                    type="text"
                    placeholder="Paste token"
                    value={manualClaimToken}
                    onChange={(event) => onChangeManualClaimToken(event.target.value)}
                  />
                </div>
              </div>
            )}
            {showSignIn && (
              <div className="chat-empty">
                <div className="discover-empty-text">Or get a magic link:</div>
                <div className="discover-controls">
                  <input
                    className="discover-search"
                    type="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    value={magicLinkEmail}
                    onChange={(event) => onChangeMagicLinkEmail(event.target.value)}
                  />
                  <button
                    className="discover-refresh"
                    type="button"
                    disabled={magicLinkStatus === "sending"}
                    onClick={onSendMagicLink}
                  >
                    {magicLinkStatus === "sending" ? "Sending…" : "Email link"}
                  </button>
                </div>
                {magicLinkStatus === "sent" && (
                  <div className="chat-empty">Check your email for a sign-in link.</div>
                )}
                {magicLinkError && <div className="auth-error">{magicLinkError}</div>}
              </div>
            )}
            {redeemClaimError && <div className="auth-error">{redeemClaimError}</div>}
            {isRedeemingClaim && <div className="chat-empty">Claiming access…</div>}
          </div>
        )}
      </main>

      <WebAuthGateModal
        hasSession={!showSignIn}
        isOpen={isAuthGateOpen}
        authError={authError}
        onClose={onCloseAuthGate}
        onSignIn={onSignIn}
      />
    </div>
  );
}
