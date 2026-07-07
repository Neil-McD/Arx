import { useState } from "react";
import { Check, CreditCard, Lock, Minus, Receipt } from "lucide-react";
import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";
import {
  POLYNET_FREE_MAX_COMMUNITIES,
  POLYNET_PREMIUM_ACCOUNT_TIER,
  POLYNET_PREMIUM_MAX_COMMUNITIES,
  POLYNET_PREMIUM_MONTHLY_PRICE_LABEL,
  POLYNET_PREMIUM_PLAN_NAME,
} from "../../../../shared/accountCommerce";

const FREE_MONTHLY_PRICE_LABEL = "$0/mo";

// Free vs Premium comparison rows. A boolean renders a check/dash; a string
// renders inline copy for compact plan-specific values.
const BILLING_PLAN_FEATURES: {
  label: string;
  free: boolean | string;
  premium: boolean | string;
}[] = [
  {
    label: "Communities",
    free: `${POLYNET_FREE_MAX_COMMUNITIES} community`,
    premium: `${POLYNET_PREMIUM_MAX_COMMUNITIES} communities`,
  },
  { label: "Polynet runtime", free: true, premium: true },
  { label: "Codex + future premium runtimes", free: false, premium: true },
  { label: "Premium tool usage", free: false, premium: "Included" },
  { label: "Hosted workspace tools", free: false, premium: true },
];

function splitPriceLabel(label: string): { amount: string; period: string } {
  const slash = label.indexOf("/");
  if (slash === -1) return { amount: label, period: "" };
  return { amount: label.slice(0, slash), period: label.slice(slash) };
}

function BillingPlanCellValue({ value }: { value: boolean | string }) {
  if (value === true) return <Check size={16} strokeWidth={2.4} aria-label="Included" />;
  if (value === false)
    return (
      <Minus size={15} strokeWidth={2.2} className="billing-plan-dash" aria-label="Not included" />
    );
  return <span className="billing-plan-value-note">{value}</span>;
}

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WebBillingSettingsSectionProps = {
  session: SessionLike;
  accountCommerceStatus: AccountCommerceStatus | null;
  isLoadingAccountCommerce: boolean;
  accountCommerceError: string | null;
  startPremiumSubscriptionCheckout: () => Promise<void> | void;
};

export function WebBillingSettingsSection({
  session,
  accountCommerceStatus,
  isLoadingAccountCommerce,
  accountCommerceError,
  startPremiumSubscriptionCheckout,
}: WebBillingSettingsSectionProps) {
  const [isStartingPremiumCheckout, setIsStartingPremiumCheckout] = useState(false);
  const [premiumCheckoutError, setPremiumCheckoutError] = useState<string | null>(null);
  const isPremium = accountCommerceStatus?.account_tier === POLYNET_PREMIUM_ACCOUNT_TIER;
  const isSignedIn = Boolean(session);
  const actionLabel = !isSignedIn
    ? "Sign in to upgrade"
    : isPremium
      ? "Premium active"
      : isStartingPremiumCheckout
        ? "Opening checkout..."
        : "Upgrade to Premium";
  const canStartPremiumCheckout = isSignedIn && !isPremium && !isStartingPremiumCheckout;

  const handleStartPremiumCheckout = async () => {
    if (!canStartPremiumCheckout) return;
    setPremiumCheckoutError(null);
    setIsStartingPremiumCheckout(true);
    try {
      await startPremiumSubscriptionCheckout();
    } catch (error) {
      setPremiumCheckoutError(
        error instanceof Error ? error.message : "Premium checkout is temporarily unavailable.",
      );
    } finally {
      setIsStartingPremiumCheckout(false);
    }
  };

  const freePrice = splitPriceLabel(FREE_MONTHLY_PRICE_LABEL);
  const premiumPrice = splitPriceLabel(POLYNET_PREMIUM_MONTHLY_PRICE_LABEL);

  return (
    <>
      <div className="panel-title">Billing</div>
      <div className="memory-panel">
        <div className="settings-section billing-page">
          <p className="billing-page-sub">
            You're on the <strong>{isPremium ? "Premium" : "Free"}</strong> plan — manage your
            subscription and payment details.
          </p>

          <div className="billing-plan-scroll">
            <div className="billing-plan-table" aria-label="Compare Free and Premium plans">
              <div className="billing-plan-col billing-plan-col--features">
                <div className="billing-plan-head billing-plan-head--intro">
                  <div className="billing-plan-intro-title">Compare plans</div>
                  <div className="billing-plan-intro-sub">
                    Free runs on the Polynet runtime. Premium unlocks everything else.
                  </div>
                </div>
                {BILLING_PLAN_FEATURES.map((feature) => (
                  <div className="billing-plan-featrow" key={feature.label}>
                    {feature.label}
                  </div>
                ))}
              </div>

              <div className="billing-plan-col billing-plan-col--free">
                <div className="billing-plan-head">
                  <div className="billing-tier-name">Free</div>
                  <div className="billing-tier-price">
                    {freePrice.amount}
                    <span>{freePrice.period}</span>
                  </div>
                  <div className="billing-tier-foot">
                    {isPremium ? (
                      <span className="billing-tier-note">Downgrade available</span>
                    ) : (
                      <span className="billing-tier-current">Current plan</span>
                    )}
                  </div>
                </div>
                {BILLING_PLAN_FEATURES.map((feature) => (
                  <div className="billing-plan-valrow" key={feature.label}>
                    <BillingPlanCellValue value={feature.free} />
                  </div>
                ))}
              </div>

              <div className="billing-plan-col billing-plan-col--premium">
                <div className="billing-plan-head">
                  <div className="billing-tier-name">
                    {POLYNET_PREMIUM_PLAN_NAME}
                    <span className="billing-tier-badge">Popular</span>
                  </div>
                  <div className="billing-tier-price">
                    {premiumPrice.amount}
                    <span>{premiumPrice.period}</span>
                  </div>
                  <div className="billing-tier-foot">
                    <button
                      type="button"
                      className="platform-save-button platform-save-button--compact billing-tier-cta"
                      onClick={() => void handleStartPremiumCheckout()}
                      disabled={!canStartPremiumCheckout}
                    >
                      {actionLabel}
                    </button>
                    <div className="billing-tier-trust">
                      <Lock size={11} strokeWidth={2} aria-hidden="true" />
                      Cancel anytime · secured by Stripe
                    </div>
                  </div>
                </div>
                {BILLING_PLAN_FEATURES.map((feature) => (
                  <div className="billing-plan-valrow" key={feature.label}>
                    <BillingPlanCellValue value={feature.premium} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="billing-account-grid">
            <div className="billing-account-card">
              <div className="billing-account-card-head">
                <span>Payment method</span>
              </div>
              <div className="billing-account-empty">
                <CreditCard size={17} strokeWidth={1.9} aria-hidden="true" />
                No card on file — added at checkout.
              </div>
            </div>
            <div className="billing-account-card">
              <div className="billing-account-card-head">
                <span>Billing history</span>
              </div>
              <div className="billing-account-empty">
                <Receipt size={17} strokeWidth={1.9} aria-hidden="true" />
                No invoices yet.
              </div>
            </div>
          </div>

          {accountCommerceError ? <div className="workspace-billing-error">{accountCommerceError}</div> : null}
          {premiumCheckoutError ? <div className="workspace-billing-error">{premiumCheckoutError}</div> : null}
        </div>
      </div>
    </>
  );
}
