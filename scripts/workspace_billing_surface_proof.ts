import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const workspaceCreditsSource = read("convex/workspaceCredits.ts");
const gatewaySource = read("shared/workspaceCreditsGateway.ts");
const accountCommerceSource = read("shared/accountCommerce.ts");
const premiumBillingSource = read("convex/premiumBilling.ts");
const cloudAccountCommerceGatewaySource = read("shared/cloudAccountCommerceGateway.ts");
const billingSettingsSource = read("apps/web/src/components/WebBillingSettingsSection.tsx");
const settingsPanelsSource = read("apps/web/src/components/WebSettingsPanels.tsx");
const appSource = read("apps/web/src/App.tsx");
const accountPlanControllerSource = read(
  "apps/web/src/controllers/useWebAccountPlanController.ts",
);
const httpBillingSource = read("convex/httpBilling.ts");

assert.match(
  packageJson,
  /"check:workspace-billing-surface-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_billing_surface_proof\.ts"/,
  "package script must expose the workspace billing surface proof",
);

assert.match(
  workspaceCreditsSource,
  /export const getWorkspaceBillingOverview = query/,
  "Convex must expose one canonical workspace billing overview query",
);
assert.match(
  workspaceCreditsSource,
  /workspaceComputeCharges/,
  "billing overview must include workspace compute charge evidence",
);
assert.match(
  workspaceCreditsSource,
  /workspaceUsageCollections/,
  "billing overview must include card collection evidence",
);
assert.match(
  workspaceCreditsSource,
  /workspace_credit_topup/,
  "billing overview may retain historic manual prepaid top-up evidence for ledger compatibility",
);
assert.doesNotMatch(
  workspaceCreditsSource,
  /export const startWorkspaceCreditTopupCheckout = action/,
  "backend must not expose a public manual credit top-up checkout starter",
);
assert.equal(
  existsSync(new URL("../convex/billing.ts", import.meta.url)),
  false,
  "the duplicate billing facade must stay deleted",
);

assert.match(
  accountCommerceSource,
  /POLYNET_PREMIUM_PLAN_NAME = "Polynet Premium"[\s\S]*POLYNET_FREE_MAX_COMMUNITIES = 1[\s\S]*POLYNET_PREMIUM_MAX_COMMUNITIES = 2[\s\S]*POLYNET_PREMIUM_MONTHLY_PRICE_LABEL = "\$20\/mo"/,
  "shared account commerce must expose one canonical Polynet Premium product and community-cap truth",
);
assert.match(
  accountCommerceSource,
  /POLYNET_PREMIUM_DESCRIPTION =[\s\S]*Grants access to Codex and future premium runtimes, web research, hosted workspace tools, premium tool usage, and a second community\./,
  "shared account commerce must describe Premium as access, not as an included-dollar usage allowance",
);
assert.doesNotMatch(
  accountCommerceSource,
  /\$4\/month|\$10\/month[^"\n]*included|included[^"\n]*\$[0-9]/,
  "shared Premium account-commerce copy must not mention a dollar amount included for premium tools",
);

assert.match(
  premiumBillingSource,
  /readPremiumStripePriceId[\s\S]*POLYNET_PREMIUM_STRIPE_PRICE_ID/,
  "backend Premium checkout must read the configured Stripe price id",
);
assert.match(
  premiumBillingSource,
  /source: "premium_subscription"[\s\S]*completePremiumSubscriptionCheckoutSessionInternal[\s\S]*startPremiumSubscriptionCheckout[\s\S]*resolveAuthenticatedActorInternal[\s\S]*mode: "subscription"[\s\S]*price: premiumPriceId[\s\S]*providerPriceId: premiumPriceId/,
  "backend must create Premium subscription checkout from the configured Stripe price and write Premium entitlement truth",
);
assert.match(
  premiumBillingSource,
  /if \(!grantsAccess\) return;[\s\S]*tier: "architect"[\s\S]*source: "premium_subscription"/,
  "Premium cancellation must expire subscription grants without creating a newer free entitlement that overrides manual/admin grants",
);
assert.match(
  cloudAccountCommerceGatewaySource,
  /startCloudPremiumSubscriptionCheckout[\s\S]*premiumBilling:startPremiumSubscriptionCheckout/,
  "web gateway must expose the account Premium checkout action",
);
assert.match(
  accountPlanControllerSource,
  /startCloudPremiumSubscriptionCheckout[\s\S]*buildPremiumSubscriptionReturnUrl[\s\S]*premium subscription checkout started/,
  "the account plan controller must route Billing upgrades through the Premium subscription checkout",
);
assert.match(
  httpBillingSource,
  /getPremiumSubscriptionCheckoutSessionInternal[\s\S]*completePremiumSubscriptionCheckoutSessionInternal[\s\S]*syncPremiumSubscriptionFromStripeInternal/,
  "Stripe webhook must complete Premium checkouts and sync ongoing subscription status",
);

assert.doesNotMatch(
  billingSettingsSource,
  /WorkspacePayAsYouGoPanel|Pay as you go|Credit balance|Add to credit balance|Set up auto recharge|Add credits or a card/,
  "Billing settings must not render the legacy wallet path as the primary upgrade surface",
);

const publicWalletSurfacePattern =
  /WorkspacePayAsYouGoPanel|Pay as you go|Add to credit balance|Set up auto recharge|Add credits or a card|startCloudWorkspaceCreditTopupCheckout|loadCloudWorkspaceAutoRechargeSettings|saveCloudWorkspaceAutoRechargeSettings|disableCloudWorkspaceAutoRechargeSettings|startWorkspaceCreditTopupCheckout|workspaceAutoRechargeSettings|workspaceCreditTopupError|workspace_credit_topup|manual_balance/;
for (const [label, source] of [
  ["Billing settings", billingSettingsSource],
  ["Settings props", settingsPanelsSource],
  ["App shell", appSource],
  ["Cloud commerce gateway", cloudAccountCommerceGatewaySource],
] as const) {
  assert.doesNotMatch(
    source,
    publicWalletSurfacePattern,
    `${label} must not expose the deleted wallet/top-up/autorecharge browser surface`,
  );
}
assert.doesNotMatch(
  gatewaySource,
  /loadWorkspaceBillingOverviewCanonical|WorkspaceBillingOverview|WorkspaceBillingMonthSummary/,
  "browser workspace credits gateway must not expose the legacy billing overview panel contract",
);

for (const requiredBillingLabel of [
  "POLYNET_FREE_MAX_COMMUNITIES",
  "POLYNET_PREMIUM_MAX_COMMUNITIES",
  "POLYNET_PREMIUM_PLAN_NAME",
  "POLYNET_PREMIUM_MONTHLY_PRICE_LABEL",
  "Upgrade to Premium",
  "Premium tool usage",
  "Included",
  "Codex + future premium runtimes",
]) {
  assert.ok(
    billingSettingsSource.includes(requiredBillingLabel),
    `Billing settings must render ${requiredBillingLabel}`,
  );
}

console.log("workspace_billing_surface_proof: ok");
