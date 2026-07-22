type CheckoutStatus = "idle" | "loading" | "pending" | "succeeded" | "error";

export type WebStandalonePublicRouteViewProps = {
  showSignIn: boolean;
  onRequireSignIn: () => void;
  checkoutStatus: CheckoutStatus;
  onRetryCheckoutFinalize: () => void;
  checkoutError: string | null;
  authError: string | null;
};

export function WebStandalonePublicRouteView(
  props: WebStandalonePublicRouteViewProps,
) {
  const {
    showSignIn,
    checkoutStatus,
    onRetryCheckoutFinalize,
    checkoutError,
    authError,
    onRequireSignIn,
  } = props;

  return (
    <div className="app-root public-root">
      <main className="workspace community-mode public-route-workspace">
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
                      ? "You’re in"
                      : "Checkout error"}
              </h1>
              <p className="public-funnel-state-copy">
                {checkoutStatus === "pending"
                  ? "It can take a moment. We’ll keep checking in the background."
                  : checkoutStatus === "succeeded"
                    ? "Opening your community workspace…"
                    : checkoutError ?? "There was a problem finalizing checkout."}
              </p>
              {(checkoutStatus === "pending" || checkoutStatus === "error") && (
                <div className="public-funnel-state-actions">
                  <button
                    className="public-funnel-secondary"
                    type="button"
                    onClick={onRetryCheckoutFinalize}
                  >
                    {checkoutStatus === "pending" ? "Check again" : "Retry"}
                  </button>
                </div>
              )}
              {showSignIn ? (
                <div className="public-funnel-state-actions">
                  <button
                    className="public-funnel-secondary"
                    type="button"
                    onClick={onRequireSignIn}
                  >
                    Continue to sign in
                  </button>
                </div>
              ) : null}
            </section>
            {authError && showSignIn ? (
              <div className="auth-error">{authError}</div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
