import type { RefObject } from "react";
import {
  isBuilderTierArchitect,
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

  const freeIsCurrent = isBuilderTierFree(builderTier);
  const builderIsCurrent = isBuilderTierBuilder(builderTier);
  const architectIsCurrent = isBuilderTierArchitect(builderTier);
  const createCommunityContext = builderUpgradeContext === "create_community";
  const feature = (included: boolean, label: string) => (
    <li className={`plan-feature${included ? " on" : " off"}`}>
      <span className={`plan-feature-icon ${included ? "check" : "x"}`} aria-hidden="true">
        {included ? "✓" : "×"}
      </span>
      <span className="plan-feature-text">{label}</span>
    </li>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-upgrade" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Upgrade plan</div>
          <button className="modal-close" type="button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body" ref={builderUpgradeModalBodyRef} onScroll={onModalBodyScroll}>
          <div className="model-note" style={{ marginBottom: 12 }}>
            {createCommunityContext
              ? "Choose an Architect plan to create and run your community."
              : "Choose a plan that matches how you want to use Polynet."}
          </div>
          {createCommunityContext && (
            <div className="model-note" style={{ marginBottom: 12 }}>
              After checkout, we'll create your community automatically.
            </div>
          )}
          {builderBillingError && <div className="auth-error">{builderBillingError}</div>}
          <div className="plan-grid">
            <div className={`plan-card${freeIsCurrent ? " current" : ""}`}>
              <div className="plan-card-header">
                <div className="plan-name">Free</div>
                {freeIsCurrent && <div className="plan-badge">Current</div>}
              </div>
              <div className="plan-price">
                <span className="plan-price-amount">$0</span>
                <span className="plan-price-period">/mo</span>
              </div>
              <div className="plan-subtitle">For using communities, apps, and agents</div>
              <ul className="plan-features plan-features-checks">
                {feature(true, "OpenRouter free models")}
                {feature(true, "Use your own ChatGPT or OpenRouter connection")}
                {feature(true, "Cloud threads and community sync")}
                {feature(true, "Join communities as a member")}
                {feature(false, "Polynet inference")}
                {feature(false, "Daytona workbench")}
                {feature(false, "Personal memory")}
                {feature(false, "Create communities")}
              </ul>
              <button type="button" className="plan-cta" disabled>
                {freeIsCurrent ? "Current plan" : "Free"}
              </button>
            </div>

            <div className={`plan-card${builderIsCurrent ? " current" : ""}`}>
              <div className="plan-card-header">
                <div className="plan-name">Builder</div>
                {builderIsCurrent && <div className="plan-badge">Current</div>}
              </div>
              <div className="plan-price">
                <span className="plan-price-amount">$20</span>
                <span className="plan-price-period">/mo</span>
              </div>
              <div className="plan-subtitle">Private build and test workbench</div>
              <ul className="plan-features plan-features-checks">
                {feature(true, "Some Polynet inference")}
                {feature(true, "Daytona workbench")}
                {feature(true, "Project-bound build runtime")}
                {feature(true, "Personal memory")}
                {feature(false, "Create communities")}
                {feature(false, "Community pricing and payouts")}
                {feature(false, "Community AI agent customization")}
                {feature(false, "Community operations")}
              </ul>
              <button
                type="button"
                className="plan-cta"
                onClick={() => onStartBuilderPlanCheckout("builder")}
                disabled={isStartingBuilderCheckout || builderIsCurrent || createCommunityContext}
              >
                {builderIsCurrent
                  ? "Current plan"
                  : createCommunityContext
                    ? "No community creation"
                    : isStartingBuilderCheckout
                      ? "Starting…"
                      : "Get Builder"}
              </button>
            </div>

            <div className={`plan-card${architectIsCurrent ? " current" : ""}`}>
              <div className="plan-card-header">
                <div className="plan-name">Architect</div>
                {architectIsCurrent && <div className="plan-badge">Current</div>}
              </div>
              <div className="plan-price">
                <span className="plan-price-amount">$60</span>
                <span className="plan-price-period">/mo</span>
              </div>
              <div className="plan-subtitle">Run communities, pricing, and agent systems</div>
              <ul className="plan-features plan-features-checks">
                {feature(true, "Everything in Builder")}
                {feature(true, "Create up to 3 communities")}
                {feature(true, "Community pricing and subscriptions")}
                {feature(true, "Stripe payouts")}
                {feature(true, "Community AI agent customization")}
                {feature(true, "Community operations")}
                {feature(false, "Default hosted member inference")}
              </ul>
              <button
                type="button"
                className="plan-cta"
                onClick={() => onStartBuilderPlanCheckout("architect")}
                disabled={isStartingBuilderCheckout || architectIsCurrent}
              >
                {architectIsCurrent
                  ? "Current plan"
                  : isStartingBuilderCheckout
                    ? "Starting…"
                    : createCommunityContext
                      ? "Get Architect"
                      : "Get Architect"}
              </button>
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
