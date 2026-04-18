type StandalonePublicRouteKind = "checkout_success" | "claim";

type CheckoutStatus = "idle" | "loading" | "pending" | "succeeded" | "error";
type MagicLinkStatus = "idle" | "sending" | "sent";

export type WebStandalonePublicRouteViewProps = {
  publicRouteKind: StandalonePublicRouteKind;
  showSignIn: boolean;
  onOpenAuthGate: () => void;
  onSignOut: () => void;
  checkoutStatus: CheckoutStatus;
  onRetryCheckoutFinalize: () => void;
  onContinueCheckout: () => void;
  onContinueClaim: () => void;
  onSendMagicLink: () => void;

  checkoutError: string | null;
  magicLinkEmail: string;
  onChangeMagicLinkEmail: (value: string) => void;
  magicLinkStatus: MagicLinkStatus;
  magicLinkError: string | null;

  pendingToken: string;
  manualClaimToken: string;
  onChangeManualClaimToken: (value: string) => void;
  isRedeemingClaim: boolean;
  redeemClaimError: string | null;
  authError: string | null;
};

export function WebStandalonePublicRouteView(props: WebStandalonePublicRouteViewProps) {
  const {
    publicRouteKind,
    showSignIn,
    checkoutStatus,
    onRetryCheckoutFinalize,
    onContinueCheckout,
    onContinueClaim,
    onSendMagicLink,
    checkoutError,
    magicLinkEmail,
    onChangeMagicLinkEmail,
    magicLinkStatus,
    magicLinkError,
    pendingToken,
    manualClaimToken,
    onChangeManualClaimToken,
    isRedeemingClaim,
    redeemClaimError,
    authError,
    onOpenAuthGate,
  } = props;

  return (
    <div className="app-root public-root">
      <main className="workspace community-mode public-route-workspace">
        {publicRouteKind === "checkout_success" && (
          <div className="public-funnel-page">
            <div className="public-funnel-shell public-funnel-shell-narrow">
              <section className="public-funnel-state-card">
                <div className="public-funnel-state-kicker">Checkout</div>
                <h1 className="public-funnel-state-title">
                  {checkoutStatus === "loading"
                    ? "Setting up your access…"
                    : checkoutStatus === "pending"
                      ? "Payment pending"
                      : checkoutStatus === "succeeded"
                        ? "You&apos;re in"
                        : "Checkout error"}
                </h1>
                <p className="public-funnel-state-copy">
                  {checkoutStatus === "pending"
                    ? "It can take a moment. We'll keep checking in the background."
                    : checkoutStatus === "succeeded"
                      ? "Continue to unlock the community workspace."
                      : checkoutError ?? "There was a problem finalizing checkout."}
                </p>
                <div className="public-funnel-state-actions">
                  <button
                    className="public-funnel-primary platform-save-button"
                    type="button"
                    disabled={!pendingToken || isRedeemingClaim || checkoutStatus === "loading"}
                    onClick={onContinueCheckout}
                  >
                    Continue
                  </button>
                  {(checkoutStatus === "pending" || checkoutStatus === "error") && (
                    <button className="public-funnel-secondary" type="button" onClick={onRetryCheckoutFinalize}>
                      {checkoutStatus === "pending" ? "Check again" : "Retry"}
                    </button>
                  )}
                </div>
                {showSignIn ? (
                  <div className="public-funnel-state-actions">
                    <button className="public-funnel-secondary" type="button" onClick={onOpenAuthGate}>
                      Continue with Google
                    </button>
                  </div>
                ) : null}
                {redeemClaimError && <div className="auth-error">{redeemClaimError}</div>}
                {isRedeemingClaim && <div className="public-funnel-status">Claiming access…</div>}
              </section>

              {showSignIn && (
                <section className="public-funnel-support-card">
                  <div className="public-funnel-support-copy">
                    <div className="public-funnel-support-title">Need a magic link?</div>
                    <p className="public-funnel-support-body">
                      We&apos;ll email a sign-in link so you can finish checkout from the right account.
                    </p>
                  </div>
                  {authError && <div className="auth-error">{authError}</div>}
                  <div className="public-funnel-support-form">
                    <input
                      className="public-funnel-input"
                      type="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      value={magicLinkEmail}
                      onChange={(event) => onChangeMagicLinkEmail(event.target.value)}
                    />
                    <button
                      className="public-funnel-secondary"
                      type="button"
                      disabled={magicLinkStatus === "sending"}
                      onClick={onSendMagicLink}
                    >
                      {magicLinkStatus === "sending" ? "Sending…" : "Email link"}
                    </button>
                  </div>
                  {magicLinkStatus === "sent" && <div className="auth-success">Check your email for a sign-in link.</div>}
                  {magicLinkError && <div className="auth-error">{magicLinkError}</div>}
                </section>
              )}
            </div>
          </div>
        )
        }

        {
          publicRouteKind === "claim" && (
            <div className="public-funnel-page">
              <div className="public-funnel-shell public-funnel-shell-narrow">
                <section className="public-funnel-state-card">
                  <div className="public-funnel-state-kicker">Claim access</div>
                  <h1 className="public-funnel-state-title">Unlock your community</h1>
                  <p className="public-funnel-state-copy">
                    Continue with your claim token to finish access to the community.
                  </p>

                  {!pendingToken && (
                    <div className="public-funnel-manual-claim">
                      <label className="public-funnel-input-label" htmlFor="public-claim-token">
                        Claim token
                      </label>
                      <input
                        id="public-claim-token"
                        className="public-funnel-input"
                        type="text"
                        placeholder="Paste token"
                        value={manualClaimToken}
                        onChange={(event) => onChangeManualClaimToken(event.target.value)}
                      />
                    </div>
                  )}

                  <div className="public-funnel-state-actions">
                    <button
                      className="public-funnel-primary platform-save-button"
                      type="button"
                      disabled={!(pendingToken || manualClaimToken.trim()) || isRedeemingClaim}
                      onClick={onContinueClaim}
                    >
                      Continue
                    </button>
                  </div>
                  {showSignIn ? (
                    <div className="public-funnel-state-actions">
                      <button className="public-funnel-secondary" type="button" onClick={onOpenAuthGate}>
                        Continue with Google
                      </button>
                    </div>
                  ) : null}

                  {redeemClaimError && <div className="auth-error">{redeemClaimError}</div>}
                  {isRedeemingClaim && <div className="public-funnel-status">Claiming access…</div>}
                </section>

                {showSignIn && (
                  <section className="public-funnel-support-card">
                    <div className="public-funnel-support-copy">
                      <div className="public-funnel-support-title">Need a magic link?</div>
                      <p className="public-funnel-support-body">
                        We&apos;ll email a sign-in link so you can continue with the correct account.
                      </p>
                    </div>
                    {authError && <div className="auth-error">{authError}</div>}
                    <div className="public-funnel-support-form">
                      <input
                        className="public-funnel-input"
                        type="email"
                        inputMode="email"
                        placeholder="you@example.com"
                        value={magicLinkEmail}
                        onChange={(event) => onChangeMagicLinkEmail(event.target.value)}
                      />
                      <button
                        className="public-funnel-secondary"
                        type="button"
                        disabled={magicLinkStatus === "sending"}
                        onClick={onSendMagicLink}
                      >
                        {magicLinkStatus === "sending" ? "Sending…" : "Email link"}
                      </button>
                    </div>
                    {magicLinkStatus === "sent" && <div className="auth-success">Check your email for a sign-in link.</div>}
                    {magicLinkError && <div className="auth-error">{magicLinkError}</div>}
                  </section>
                )}
              </div>
            </div>
          )
        }
      </main >
    </div >
  );
}
