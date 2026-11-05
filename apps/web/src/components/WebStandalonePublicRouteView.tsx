type StandalonePublicRouteKind = "checkout_success";

type CheckoutStatus = "idle" | "loading" | "pending" | "succeeded" | "error";

export type WebStandalonePublicRouteViewProps = {
  publicRouteKind: StandalonePublicRouteKind;
  showSignIn: boolean;
  onRequireSignIn: () => void;
  checkoutStatus: CheckoutStatus;
  onRetryCheckoutFinalize: () => void;
  // Set once the payment is in: into the community.
  onContinueCheckout: (() => void) | null;

  checkoutError: string | null;
  authError: string | null;
};

export function WebStandalonePublicRouteView(props: WebStandalonePublicRouteViewProps) {
  const {
    publicRouteKind,
    showSignIn,
    checkoutStatus,
    onRetryCheckoutFinalize,
    onContinueCheckout,
    checkoutError,
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
                        ? "You're in"
                        : "Checkout error"}
                </h1>
                <p className="public-funnel-state-copy">
                  {checkoutStatus === "pending"
                    ? "It can take a moment. We'll keep checking in the background."
                    : checkoutStatus === "succeeded"
                      ? "Taking you into the community."
                      : checkoutError ?? "There was a problem finalizing checkout."}
                </p>
                <div className="public-funnel-state-actions">
                  <button
                    className="public-funnel-primary platform-save-button"
                    type="button"
                    disabled={!onContinueCheckout}
                    onClick={() => onContinueCheckout?.()}
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
                      Continue to sign in
                    </button>
                  </div>
                ) : null}
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
