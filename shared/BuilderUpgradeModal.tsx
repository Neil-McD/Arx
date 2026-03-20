import type { RefObject } from "react";
import {
  isBuilderTierBuilder,
  isBuilderTierFree,
  type BuilderCheckoutTier,
} from "./builderBilling";

type BuilderUpgradeContext = "builder" | "create_community";

type BuilderUpgradeModalProps = {
  isOpen: boolean;
  builderUpgradeContext: BuilderUpgradeContext;
  builderTier: string | null | undefined;
  isStartingBuilderCheckout: boolean;
  builderBillingError: string | null;
  showBuilderUpgradeScrollHint: boolean;
  builderUpgradeModalBodyRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onModalBodyScroll: () => void;
  onStartBuilderPlanCheckout: (tier: BuilderCheckoutTier) => void;
};

export function BuilderUpgradeModal({
  isOpen,
  builderUpgradeContext,
  builderTier,
  isStartingBuilderCheckout,
  builderBillingError,
  showBuilderUpgradeScrollHint,
  builderUpgradeModalBodyRef,
  onClose,
  onModalBodyScroll,
  onStartBuilderPlanCheckout,
}: BuilderUpgradeModalProps) {
  if (!isOpen) return null;

  void builderUpgradeContext;
  const freeIsCurrent = isBuilderTierFree(builderTier);
  const builderIsCurrent = isBuilderTierBuilder(builderTier) || builderTier === "architect" || builderTier === "pro";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-upgrade" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Become a Builder</div>
          <button className="modal-close" type="button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body" ref={builderUpgradeModalBodyRef} onScroll={onModalBodyScroll}>
          <div className="upgrade-copy">
            <div className="upgrade-kicker">Alpha access</div>
            <div className="upgrade-lead">
              Free lets you tap into Polynet&apos;s community intelligence. Builder puts that
              intelligence to work inside your own private AI workspace.
            </div>
            <div className="upgrade-footnote">
              During alpha, community creation stays internal while we harden the platform.
              Builder is the paid path we&apos;re opening first.
            </div>
          </div>
          {builderBillingError && <div className="auth-error">{builderBillingError}</div>}
          <div className="plan-grid">
            <div className={`plan-card free${freeIsCurrent ? " current" : ""}`}>
              <div className="plan-card-header">
                <div className="plan-name">Free</div>
                {freeIsCurrent && <div className="plan-badge">Current</div>}
              </div>
              <div className="plan-price">
                <span className="plan-price-amount">$0</span>
                <span className="plan-price-period">/mo</span>
              </div>
              <div className="plan-subtitle">For members using Polynet&apos;s collective intelligence.</div>
              <ul className="plan-points">
                <li>Tap into community intelligence as it compounds.</li>
                <li>Research, ask, and learn across the network.</li>
                <li>Keep your threads and context in sync.</li>
              </ul>
            </div>

            <div className={`plan-card builder${builderIsCurrent ? " current" : ""}`}>
              <div className="plan-card-header">
                <div className="plan-name">Builder</div>
                {builderIsCurrent && <div className="plan-badge">Current</div>}
              </div>
              <div className="plan-price">
                <span className="plan-price-amount">$20</span>
                <span className="plan-price-period">/mo</span>
              </div>
              <div className="plan-subtitle">
                For turning community intelligence into real execution.
              </div>
              <ul className="plan-points">
                <li>Bring compounding community intelligence into your own build loop.</li>
                <li>Work inside a private AI workspace and cloud computer.</li>
                <li>Move faster with deeper context, continuity, and execution.</li>
                <li>Start building with Polynet during alpha.</li>
              </ul>
              {!builderIsCurrent ? (
                <button
                  type="button"
                  className="plan-cta"
                  onClick={() => onStartBuilderPlanCheckout("builder")}
                  disabled={isStartingBuilderCheckout}
                >
                  {isStartingBuilderCheckout ? "Starting…" : "Upgrade to Builder"}
                </button>
              ) : null}
            </div>
          </div>
          <div className={`modal-scroll-hint${showBuilderUpgradeScrollHint ? " show" : ""}`} aria-hidden="true">
            <div className="modal-scroll-hint-icon">
              <svg viewBox="0 0 24 24">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
