import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  POLYNET_BUILDER_OFFER,
  builderFundingActionLabel,
  builderFundingStateLabel,
  resolveBuilderOfferPrimaryAction,
} from "../shared/builderOffer.ts";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const app = read("apps/web/src/App.tsx");
const offer = read("shared/builderOffer.ts");
const createModal = read("apps/web/src/components/WebCreateCommunityModal.tsx");
const createController = read("shared/useCommunityCreateController.ts");
const billing = read("apps/web/src/components/WebBillingSettingsSection.tsx");
const account = read("apps/web/src/components/WebAccountSettingsSection.tsx");
const offerModal = read("apps/web/src/components/WebBuilderOfferModal.tsx");
const offerSummary = read("apps/web/src/components/WebBuilderOfferSummary.tsx");
const offerController = read("apps/web/src/controllers/useWebBuilderOfferController.ts");
const purchaseActivationController = read(
  "apps/web/src/controllers/useWebBuilderPurchaseActivationController.ts",
);
const founderBillingController = read("apps/web/src/controllers/useWebFounderBillingController.ts");
const globalOverlay = read("apps/web/src/components/WebGlobalOverlayHost.tsx");

assert.equal(POLYNET_BUILDER_OFFER.name, "Builder");
assert.equal(POLYNET_BUILDER_OFFER.priceBaseUnits, 7_900);
assert.equal(POLYNET_BUILDER_OFFER.platformFeeBps, 290);
assert.equal(POLYNET_BUILDER_OFFER.benefits.length, 3);
assert.match(POLYNET_BUILDER_OFFER.headline, /community/i);

assert.equal(builderFundingStateLabel("builder_required"), "Builder not active");
assert.equal(builderFundingStateLabel("builder_past_due"), "Payment needs attention");
assert.equal(builderFundingStateLabel("builder_included"), "Builder included");
assert.equal(
  resolveBuilderOfferPrimaryAction({
    state: "builder_required",
    allowedActions: ["buy_builder"],
  }),
  "buy_builder",
);
assert.equal(
  builderFundingActionLabel({
    action: "buy_builder",
    state: "builder_required",
    includePrice: true,
  }),
  "Get Builder — $79/month",
);

for (const forbidden of [/GPT 5\.6/i, /\bLuna\b/i, /\$20\b/, /credits?/i, /tokens?/i]) {
  assert.doesNotMatch(offer, forbidden, "customer Builder offer must hide internal cost controls");
}

assert.match(createModal, /WebBuilderOfferSummary/);
assert.match(createModal, /Community name/);
assert.match(createModal, /Customize community URL/);
assert.match(createModal, /Create community/);
assert.doesNotMatch(createModal, /banner|avatar|one-liner|Upload/i);
assert.match(
  createController,
  /visibility: "unlisted"[\s\S]*avatarStorageId: null[\s\S]*oneLiner: null[\s\S]*bannerStorageId: null/,
);

for (const surface of [billing, account]) {
  assert.match(surface, /shared\/builderOffer/);
  assert.match(surface, /onOpenBuilderOffer/);
  assert.doesNotMatch(surface, /startCloudFounderSubscriptionCheckout/);
}
assert.match(billing, /Member purchase recovery/);
assert.doesNotMatch(billing, /Switch to managed|Managed plan|required managed/i);
assert.match(account, /Builder is attached to communities, not your account/);
assert.doesNotMatch(account, /Legacy API funding|Personal AI connection|API key/i);
assert.doesNotMatch(account, /Free account|Paid account|account tier/i);

assert.match(offerModal, /WebBuilderOfferSummary/);
assert.match(offerModal, /resolveBuilderOfferPrimaryAction/);
assert.match(globalOverlay, /<WebBuilderOfferModal/);
assert.equal((globalOverlay.match(/<WebBuilderOfferModal/g) ?? []).length, 1);
assert.match(offerSummary, /POLYNET_BUILDER_OFFER\.benefits\.map/);

assert.match(offerController, /startCheckout\(community\.community_id\)/);
assert.match(offerController, /openPortal\(community\.community_id\)/);
assert.match(app, /useWebBuilderOfferController\(\{[\s\S]*startCheckout: founderBilling\.startCheckout/);
assert.doesNotMatch(app, /startCheckoutAfterCommunityCreated/);
assert.match(app, /builderPurchaseActivation\.startPurchase\(\)/);
assert.match(createController, /founderSubscriptionId: current\.getFounderSubscriptionId\?\.\(\) \?\? null/);
assert.match(app, /openFundedCreateCommunityModal[\s\S]*pendingBuilderSubscriptionIdRef\.current/);
assert.match(
  app,
  /openNewCommunityPurchaseFlow\s*=\s*builderPurchaseActivation\.openCommunityPurchaseFlow/,
);
assert.match(
  purchaseActivationController,
  /openCommunityPurchaseFlow[\s\S]*operatorComplimentaryAccess[\s\S]*loadAccountCommerceStatus[\s\S]*startPurchase\(\)/,
);
assert.doesNotMatch(app, /createBlockingFundingCommunity/);
assert.equal(
  (app.match(/builderOffer\.open\(\{ community/g) ?? []).length,
  2,
  "Billing and Account must call the same existing-community Builder offer controller",
);
assert.doesNotMatch(offerController, /entrySurface|setEntrySurface/);

assert.match(founderBillingController, /fundingAttentionCommunities:[\s\S]*community\.funding_state/);
assert.doesNotMatch(
  `${offer}\n${offerController}\n${founderBillingController}`,
  /thomas|thomison|@[a-z0-9.-]+\.[a-z]{2,}/i,
  "Builder eligibility must derive from canonical data, never a named identity branch",
);

console.log("PASS: canonical Builder offer projects through Create, Billing, and Account");
