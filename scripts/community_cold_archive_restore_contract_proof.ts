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
  /restoreCommunityWithoutPaymentHandler[\s\S]*community_restore_forbidden[\s\S]*community_restore_lifecycle_generation_conflict[\s\S]*requireCompletedCommunityArchiveBillingCleanup[\s\S]*restoreCommunityLifecycle\(community\)[\s\S]*eventType: "community_restored"/,
  "restoration is free: owner-only, generation-bound, cleanup-gated, and audited",
);
assert.match(
  archive,
  /restoreCommunityWithoutPayment = mutation[\s\S]*handler: restoreCommunityWithoutPaymentHandler/,
  "the canonical restoration entrypoint must use the one authority handler",
);
assert.doesNotMatch(archive, /restoreOperatorCommunity/);
assert.match(
  founderBilling,
  /requireFounderCheckoutLifecycle[\s\S]*lifecycle\.status === "archived"\) throw new Error\("community_restore_payment_not_required"\)/,
  "a plan is never bought for an archived community; restoring it is free",
);
assert.doesNotMatch(founderBilling, /restoreCommunityLifecycle|restoresArchivedCommunity/, "billing never restores a community");
assert.match(
  criticalAudit,
  /"community_restored"[\s\S]*community_restored: \["lifecycleGeneration"\]/,
  "successful restoration must leave one bounded critical audit receipt",
);
assert.match(
  founderBilling,
  /allowed_actions: lifecycle\.status === "active" \? fundingProjection\.allowedActions : \[\]/,
  "the server billing projection offers no plan action for an archived community",
);
assert.match(
  settingsUi,
  /CommunityDangerSettingsSection[\s\S]*Archive freezes this community[\s\S]*handleArchiveCommunity/,
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
  "restoration must use one authenticated community gateway command",
);
assert.match(
  archivedUi,
  /cleanupStatus === "blocked"[\s\S]*Retry cleanup[\s\S]*cleanupStatus !== "complete"[\s\S]*restoreCommunityWithoutPayment/,
  "Account archive management: retry a blocked cleanup, wait for a pending one, then restore for free",
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
