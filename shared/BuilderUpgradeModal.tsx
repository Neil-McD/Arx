import type { RefObject } from "react";
import { isBuilderTierBuilder, isBuilderTierFree } from "./builderBilling";

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
  onStartBuilderPlanCheckout: (tier: "builder") => void;
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
            {builderUpgradeContext === "create_community"
              ? "Choose a builder plan to create your community."
              : "Choose a builder plan to create communities and start earning."}
          </div>
          {builderUpgradeContext === "create_community" && (
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
              <div className="plan-subtitle">For trying the platform</div>
              <ul className="plan-features plan-features-checks">
                {feature(true, "Free public chat model")}
                {feature(true, "Use your own ChatGPT or OpenRouter connection")}
                {feature(true, "Cloud sync")}
                {feature(true, "Join communities as a member")}
                {feature(false, "Platform-funded premium models")}
                {feature(false, "Daytona cloud tools")}
                {feature(false, "Agent memory")}
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
                <span className="plan-price-amount">$60</span>
                <span className="plan-price-period">/mo</span>
              </div>
              <div className="plan-subtitle">Premium build tier</div>
              <ul className="plan-features plan-features-checks">
                {feature(true, "Platform-funded premium models")}
                {feature(true, "Daytona cloud tools")}
                {feature(true, "Project-bound build runtime")}
                {feature(true, "Personal memory")}
                {feature(true, "Create up to 3 communities")}
                {feature(true, "Stripe payouts")}
                {feature(true, "Community AI agent customization")}
                {feature(true, "Analytics and automations")}
              </ul>
              <button
                type="button"
                className="plan-cta"
                onClick={() => onStartBuilderPlanCheckout("builder")}
                disabled={isStartingBuilderCheckout || builderIsCurrent}
              >
                {builderIsCurrent ? "Current plan" : isStartingBuilderCheckout ? "Starting…" : "Get Builder"}
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
