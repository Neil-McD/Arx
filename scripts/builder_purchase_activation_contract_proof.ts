import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string): string => readFileSync(path, "utf8");

const app = read("apps/web/src/App.tsx");
const landing = read("apps/web/src/components/WebLandingPage.tsx");
const activation = read("apps/web/src/controllers/useWebBuilderPurchaseActivationController.ts");
const onboarding = read("apps/web/src/components/WebOnboardingPage.tsx");
const bridge = read("apps/web/src/components/WebCommunityBridgeCard.tsx");
const accountSetup = read("shared/accountSetup.ts");
const accountSetupCore = read("convex/accountSetupCore.ts");
const createController = read("shared/useCommunityCreateController.ts");
const browserState = read("shared/founderCheckoutBrowserState.ts");
const authResume = read("shared/authResumeState.ts");
const billingController = read("apps/web/src/controllers/useWebFounderBillingController.ts");

assert.match(browserState, /polynet_pending_founder_checkout_v1/);
assert.match(browserState, /PENDING_FOUNDER_CHECKOUT_TTL_MS/);
assert.match(browserState, /founder_checkout=success&session_id=\{CHECKOUT_SESSION_ID\}/);
assert.match(browserState, /founder_checkout=canceled&session_id=\{CHECKOUT_SESSION_ID\}/);
assert.match(browserState, /pendingFounderCheckoutMatchesSession/);
assert.match(browserState, /runWithFounderCheckoutStartLock/);
assert.doesNotMatch(browserState, /arx_pending_purchase_claim_token/);

for (const marker of [
  "startCloudPublicBuilderCheckout",
  "loadCloudFounderCheckoutReceiptStatus",
  "claimCloudFounderCheckoutReceipt",
  "claimCloudFounderCheckoutReceiptByVerifiedEmail",
  "loadCloudFounderBillingOverview",
]) {
  assert.ok(activation.includes(marker), `activation controller missing ${marker}`);
}
assert.match(activation, /receipt\.status === "pending_payment"[\s\S]*scheduleReceiptPoll\(\)/);
assert.match(activation, /community\.subscription_id === founderSubscriptionId/);
assert.match(activation, /subscription\.subscription_id === founderSubscriptionId[\s\S]*subscription\.grants_setup/);
assert.doesNotMatch(activation, /candidates\[0\]|unassigned_subscriptions\[0\]/);
assert.match(activation, /params\.accountSetupStatus\.completed/);
assert.match(
  activation,
  /if \(!params\.isAuthBootstrapComplete\) return;[\s\S]*if \(!params\.session\)/,
);
assert.match(app, /useWebBuilderPurchaseActivationController\(\{[\s\S]*isAuthBootstrapComplete,/);
assert.match(activation, /reason: "activate_builder_purchase"/);
assert.match(activation, /runWithFounderCheckoutStartLock[\s\S]*readPendingFounderCheckout\(\)[\s\S]*resolveFounderCheckoutStartReceipt\(existing\)/);
assert.match(activation, /checkoutReturn\.kind === "canceled"[\s\S]*pendingFounderCheckoutMatchesSession/);
assert.match(authResume, /reason: "activate_builder_purchase"/);

assert.match(landing, /onStartBuilderPurchase/);
assert.match(app, /onStartBuilderPurchase:[\s\S]*builderPurchaseActivation\.startPurchase\(\)/);
assert.match(
  app,
  /const openNewCommunityPurchaseFlow\s*=\s*builderPurchaseActivation\.openCommunityPurchaseFlow/,
);
assert.match(app, /onOpenCreateCommunity: \(\) => openNewCommunityPurchaseFlow\(\)/);
assert.match(app, /openCommunityCreateFlow: openNewCommunityPurchaseFlow/);
assert.doesNotMatch(app, /createBlockingFundingCommunity/);
assert.match(app, /resumeBuilderPurchase: builderPurchaseActivation\.resumePendingPurchase/);
assert.match(app, /getFounderSubscriptionId: \(\) => pendingBuilderSubscriptionIdRef\.current/);
assert.match(createController, /founderSubscriptionId: current\.getFounderSubscriptionId\?\.\(\) \?\? null/);
assert.doesNotMatch(app, /startCheckoutAfterCommunityCreated/);
assert.doesNotMatch(billingController, /startCheckoutAfterCommunityCreated/);

assert.match(accountSetup, /AccountSetupStep = "identity" \| "complete"/);
assert.doesNotMatch(accountSetup, /inference_provider|AccountSetupStep = [^\n]*inference/);
assert.doesNotMatch(accountSetupCore, /userProviderConnections|hasManagedInference/);
assert.doesNotMatch(onboarding, /Connect ChatGPT|OpenAI API key|step === "inference"/);
assert.doesNotMatch(bridge, /Connect ChatGPT|OpenAI API key|missing\.push\("AI"\)/);

console.log("PASS: Builder purchase activation uses verified payment before identity and community creation.");
