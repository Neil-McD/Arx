import type { RefObject } from "react";
import {
  hasBuilderTierPaidAccess,
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
  void showBuilderUpgradeScrollHint;
  void onModalBodyScroll;
  const freeIsCurrent = isBuilderTierFree(builderTier);
  const builderIsCurrent = hasBuilderTierPaidAccess(builderTier);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-upgrade" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Become a Builder</div>
          <button className="modal-close" type="button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body" ref={builderUpgradeModalBodyRef}>
          <div className="upgrade-copy">
            <div className="upgrade-kicker">Alpha access</div>
            <div className="upgrade-lead">
              Unlock the private Polynet workbench and bring your own inference into it.
            </div>
            <div className="upgrade-footnote">
              Builder is the single paid creator plan. It unlocks the private workbench and community creation on Polynet.
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
                <li>Tap into intelligence that compounds with the community.</li>
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
                <span className="plan-price-amount">$24</span>
                <span className="plan-price-period">/mo</span>
              </div>
              <div className="plan-subtitle">
                For private AI workbenches built for longer-running, multi-step work.
              </div>
              <ul className="plan-points">
                <li>Run agents that carry out multi-step tasks over longer time horizons, not just one-off chats.</li>
                <li>Give the agent a private, sandboxed environment to work safely and independently.</li>
                <li>Includes monthly execution credits for running real agent workflows inside your workbench.</li>
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
        </div>
      </div>
    </div>
  );
}
