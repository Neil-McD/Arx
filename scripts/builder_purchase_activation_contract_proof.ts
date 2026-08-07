import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string): string => readFileSync(path, "utf8");

const app = read("apps/web/src/App.tsx");
const landing = read("apps/web/src/components/WebLandingPage.tsx");
const conversionLanding = read("apps/web/src/components/polynetLanding/ConversionLanding.tsx");
const conversionLandingCss = read("apps/web/src/components/polynetLanding/ConversionLanding.css");
const activation = read("apps/web/src/controllers/useWebBuilderPurchaseActivationController.ts");
const onboarding = read("apps/web/src/components/WebOnboardingPage.tsx");
const bridge = read("apps/web/src/components/WebCommunityBridgeCard.tsx");
const bridgeCss = read("apps/web/src/components/CommunityVisitorChrome.css");
const accountSetup = read("shared/accountSetup.ts");
const accountSetupCore = read("convex/accountSetupCore.ts");
const createController = read("shared/useCommunityCreateController.ts");
const browserState = read("shared/founderCheckoutBrowserState.ts");
const authResume = read("shared/authResumeState.ts");
const billingController = read("apps/web/src/controllers/useWebFounderBillingController.ts");

assert.match(browserState, /polynet_pending_founder_checkout_v1/);
assert.match(browserState, /PENDING_FOUNDER_CHECKOUT_TTL_MS/);
assert.match(browserState, /\/settings\/billing\?founder_checkout=success&session_id=\{CHECKOUT_SESSION_ID\}/);
assert.match(browserState, /\/settings\/billing\?founder_checkout=canceled&session_id=\{CHECKOUT_SESSION_ID\}/);
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
assert.match(
  activation,
  /founder_checkout_receipt_not_found[\s\S]*clearPendingFounderCheckout\(\)[\s\S]*setHasPendingPurchase\(false\)/,
  "an invalid recovery receipt must be discarded instead of retrying forever",
);
assert.match(
  activation,
  /We could not find this Builder checkout\. Use the recovery link sent to your payment email\./,
  "missing receipt errors must be actionable rather than exposing backend internals",
);
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
assert.match(
  activation,
  /initialCheckoutReturnRef = useRef\([\s\S]*parseFounderCheckoutReturn\([\s\S]*window\.location\.search[\s\S]*const checkoutReturn = initialCheckoutReturnRef\.current/,
);
assert.match(activation, /runWithFounderCheckoutStartLock[\s\S]*readPendingFounderCheckout\(\)[\s\S]*resolveFounderCheckoutStartReceipt\(existing\)/);
assert.match(activation, /checkoutReturn\.kind === "canceled"[\s\S]*pendingFounderCheckoutMatchesSession/);
assert.match(authResume, /reason: "activate_builder_purchase"/);

assert.match(landing, /onStartBuilderPurchase/);
assert.match(app, /onStartBuilderPurchase:[\s\S]*builderPurchaseActivation\.startPurchase\(\)/);
for (const approvedFunnelMarker of [
  "Build a community that gets smarter every day.",
  "How Polynet works",
  "Build your community",
  "Train your AI",
  "Serve at scale",
  "Your community should get easier to run as it grows.",
  "Your AI gets smarter as your community grows",
  "Build your community. Train your AI. Serve at scale.",
  "$79/month per community",
  "Polynet-hosted AI included",
  "2.9% Polynet platform fee",
  "Stripe processing fees are separate.",
]) {
  assert.ok(
    conversionLanding.includes(approvedFunnelMarker),
    `approved public funnel missing: ${approvedFunnelMarker}`,
  );
}
assert.equal(
  (conversionLanding.match(/onClick=\{onJoin\}/g) ?? []).length,
  2,
  "the approved funnel must have exactly two canonical purchase CTAs",
);
assert.doesNotMatch(conversionLanding, /purchase-dialog|data-purchase|FAQ_ITEMS|Comparison|PricingOffer/);
assert.match(conversionLanding, /WebPlatformLegalReaderModal/);
assert.match(conversionLanding, /PRIVACY_AI_DATA_POLICY_ENTRY/);
assert.match(conversionLanding, /TERMS_OF_SERVICE_ENTRY/);
assert.doesNotMatch(conversionLanding, /href="\/(?:privacy|terms)"/);
assert.match(conversionLandingCss, /\.pn-landing \.page/);
assert.match(conversionLandingCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(
  conversionLandingCss,
  /^(?:\.page|\.brand|main|h1|\.cta|\.mechanism|\.problems|\.closing|\.footer)\s*\{/m,
);
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
assert.match(bridge, /const isReadyToEnter = missing\.length === 0 && !submission\.isSaving/);
assert.match(bridge, /cvs-bridge-enter-ready/);
assert.match(bridgeCss, /\.cvs-bridge-card \.cfg-join\.cvs-bridge-enter-ready[\s\S]*background: #ffffff/);

console.log("PASS: Builder purchase activation uses verified payment before identity and community creation.");
