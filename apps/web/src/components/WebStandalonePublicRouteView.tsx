type StandalonePublicRouteKind = "checkout_success" | "claim";

type CheckoutStatus = "idle" | "loading" | "pending" | "succeeded" | "error";

export type WebStandalonePublicRouteViewProps = {
  publicRouteKind: StandalonePublicRouteKind;
  showSignIn: boolean;
  onRequireSignIn: () => void;
  onSignOut: () => void;
  checkoutStatus: CheckoutStatus;
  onRetryCheckoutFinalize: () => void;
  onContinueCheckout: () => void;
  onContinueClaim: () => void;

  checkoutError: string | null;

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
    checkoutError,
    pendingToken,
    manualClaimToken,
    onChangeManualClaimToken,
    isRedeemingClaim,
    redeemClaimError,
    authError,
    onRequireSignIn,
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
                    <button className="public-funnel-secondary" type="button" onClick={onRequireSignIn}>
                      Continue with Google
                    </button>
                  </div>
                ) : null}
                {redeemClaimError && <div className="auth-error">{redeemClaimError}</div>}
                {isRedeemingClaim && <div className="public-funnel-status">Claiming access…</div>}
              </section>

              {authError && showSignIn ? <div className="auth-error">{authError}</div> : null}
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
                      <button className="public-funnel-secondary" type="button" onClick={onRequireSignIn}>
                        Continue with Google
                      </button>
                    </div>
                  ) : null}

                  {redeemClaimError && <div className="auth-error">{redeemClaimError}</div>}
                  {isRedeemingClaim && <div className="public-funnel-status">Claiming access…</div>}
                </section>
                {authError && showSignIn ? <div className="auth-error">{authError}</div> : null}
              </div>
            </div>
          )
        }
      </main >
    </div >
  );
}
