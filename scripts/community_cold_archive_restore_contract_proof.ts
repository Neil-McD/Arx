import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const schema = read("convex/schema.ts");
const lifecycle = read("shared/communityLifecycle.ts");
const archive = read("convex/communityColdArchive.ts");
const founderBilling = read("convex/founderBilling.ts");
const httpBilling = read("convex/httpBilling.ts");
const criticalAudit = read("convex/criticalAudit.ts");
const settingsUi = read("apps/web/src/components/WebCommunitySettingsSection.tsx");
const billingUi = read("apps/web/src/components/WebBillingSettingsSection.tsx");
const archivedUi = read("apps/web/src/components/WebArchivedCommunityList.tsx");
const billingController = read("apps/web/src/controllers/useWebFounderBillingController.ts");
const communityGateway = read("shared/cloudCommunityAdminGateway.ts");
const accountUi = read("apps/web/src/components/WebAccountSettingsSection.tsx");
const app = read("apps/web/src/App.tsx");

assert.match(
  lifecycle,
  /restoreCommunityLifecycle\([\s\S]*status: "active"[\s\S]*nextCommunityLifecycleGeneration\(previous\.generation\)/,
  "restoration must be one canonical archived-to-active generation transition",
);
assert.match(
  archive,
  /requireCompletedCommunityArchiveBillingCleanup\([\s\S]*job\.status !== "complete"[\s\S]*community_restore_billing_cleanup_incomplete/,
  "restoration eligibility must require the exact archive generation cleanup receipt",
);
assert.match(
  archive,
  /restoreCommunityWithoutPaymentHandler[\s\S]*community_restore_forbidden[\s\S]*parseCommunityBuilderAccessMode[\s\S]*communityRunsFree\(builderAccessMode\)[\s\S]*community_restore_payment_required[\s\S]*community_restore_lifecycle_generation_conflict[\s\S]*requireCompletedCommunityArchiveBillingCleanup[\s\S]*restoreCommunityLifecycle\(community\)[\s\S]*eventType: "community_restored"/,
  "non-payment restoration must be owner-only, grandfather-or-operator authorized, generation-bound, cleanup-gated, and audited",
);
assert.match(
  archive,
  /restoreCommunityWithoutPayment = mutation[\s\S]*handler: restoreCommunityWithoutPaymentHandler/,
  "the canonical restoration entrypoint must use the one authority handler",
);
assert.doesNotMatch(archive, /restoreOperatorCommunity/);
assert.match(
  founderBilling,
  /createPendingFounderSubscriptionCheckoutInternal[\s\S]*requireFounderCheckoutLifecycle\(ctx, community\)[\s\S]*mode: "founder_subscription"[\s\S]*communityLifecycleGeneration: lifecycle\.generation/,
  "archived restoration must reuse the existing generation-bound founder subscription checkout",
);
assert.match(
  founderBilling,
  /communityLifecycleGenerationMatches\([\s\S]*checkout\.communityLifecycleGeneration[\s\S]*verifiedCheckoutPayment !== true[\s\S]*requireCompletedCommunityArchiveBillingCleanup/,
  "only a verified paid checkout for the exact archived generation may gain restoration authority",
);
assert.match(
  founderBilling,
  /community_restore_subscription_inactive[\s\S]*restoreCommunityLifecycle\(community\)[\s\S]*eventType: "community_restored"/,
  "inactive billing must fail before the atomic lifecycle transition and critical audit",
);
assert.match(
  criticalAudit,
  /"community_restored"[\s\S]*community_restored: \["lifecycleGeneration"\]/,
  "successful restoration must leave one bounded critical audit receipt",
);
assert.match(
  founderBilling,
  /allowed_actions:[\s\S]*lifecycle\.status === "active"[\s\S]*archiveJob\?\.status === "complete"[\s\S]*pendingCheckout \? "resume_checkout" as const : "buy_builder" as const/,
  "the server billing projection must expose restoration only after cleanup completes",
);
assert.match(
  settingsUi,
  /CommunityArchiveCard[\s\S]*Freezes the community, removes member access[\s\S]*handleArchiveCommunity/,
  "active owners must receive one explicit archive confirmation surface",
);
assert.match(
  communityGateway,
  /archiveCloudCommunity[\s\S]*communityColdArchive:archiveCommunity/,
  "archive and blocked-cleanup retry must reuse the canonical archive command",
);
assert.match(
  communityGateway,
  /restoreCloudCommunityWithoutPayment[\s\S]*communityColdArchive:restoreCommunityWithoutPayment[\s\S]*lifecycleGeneration/,
  "grandfathered and operator restoration must use one authenticated community gateway command",
);
assert.match(
  archivedUi,
  /canRestoreWithoutPayment[\s\S]*funding_mode === "operator_comp"[\s\S]*builder_access_mode === "grandfathered"[\s\S]*cleanupStatus === "blocked"[\s\S]*Retry cleanup[\s\S]*cleanupStatus !== "complete"[\s\S]*restoreCommunityWithoutPayment[\s\S]*canRestoreWithPayment[\s\S]*onOpenBuilderOffer[\s\S]*Restore unavailable/,
  "Account archive management must separate free, paid, pending, blocked, and invalid restoration",
);
assert.match(
  billingUi,
  /const activeCommunities[\s\S]*community\.lifecycle_status === "active"[\s\S]*activeCommunities\.map/,
  "Billing must project active subscriptions only",
);
assert.doesNotMatch(
  billingUi,
  /restoreCommunityWithoutPayment|Retry cleanup|Finishing archive/,
  "Billing must not retain duplicate archive management",
);
assert.match(
  billingController,
  /restoreCommunityWithoutPayment = useCallback[\s\S]*restoreCloudCommunityWithoutPayment[\s\S]*refresh\(usableSession\)[\s\S]*onCommunityReadyRef/,
  "non-payment restoration must refresh both billing and the active community projection",
);
assert.match(
  billingController,
  /row\?\.lifecycle_status === "archived"[\s\S]*row\?\.lifecycle_status === "active"[\s\S]*onCommunityReady/,
  "checkout return polling must keep archived communities frozen until the server restores them",
);
assert.match(
  billingController,
  /if \(!next\) \{[\s\S]*window\.setTimeout\(\(\) => void poll\(\), 1_500\);[\s\S]*return;/,
  "transient billing refresh failures must retry rather than falsely completing restoration",
);
assert.match(
  billingController,
  /fundingAttentionCommunities:[\s\S]*community\.lifecycle_status === "active"[\s\S]*community\.funding_mode === "managed"/,
  "archived communities must not block active Builder admission or creation",
);
assert.match(
  accountUi,
  /const activeCommunities[\s\S]*const archivedCommunities[\s\S]*WebArchivedCommunityList/,
  "Account must own archived community management without calling it active funding debt",
);
assert.match(
  app,
  /onCommunityArchived:[\s\S]*filter\(\(community\) => community\.id !== archivedId\)[\s\S]*openGlobalSettings\("account"\)[\s\S]*watchArchiveCleanup/,
  "successful archive must leave the active shell and converge on Account archives",
);

const verifiedAuthorityUses = [
  ...httpBilling.matchAll(/verifiedCheckoutPayment:\s*true/g),
];
assert.equal(
  verifiedAuthorityUses.length,
  1,
  "exactly one Stripe webhook path may assert verified restoration payment",
);
assert.match(
  httpBilling,
  /event\.type === "checkout\.session\.completed"[\s\S]*event\.type === "checkout\.session\.async_payment_succeeded"[\s\S]*readStripePaymentReady\(session\.payment_status\)[\s\S]*verifiedCheckoutPayment: true/,
  "verified restoration payment must originate only from a signed payment-ready checkout event",
);
assert.doesNotMatch(
  httpBilling,
  /syncFounderSubscriptionFromStripeSubscription[\s\S]{0,1800}verifiedCheckoutPayment/,
  "ordinary subscription lifecycle webhooks must never acquire restoration authority",
);

for (const forbidden of [
  "community_restore_checkout",
  "communityRestoreCheckout",
  "communityLifecycleOperations",
  "restoreCheckoutGeneration",
  "restoreCommunity = mutation",
]) {
  assert.equal(
    [schema, archive, founderBilling, httpBilling].some((source) =>
      source.includes(forbidden),
    ),
    false,
    `restoration must not introduce duplicate surface ${forbidden}`,
  );
}

console.log("community cold archive restore contract proof passed");
