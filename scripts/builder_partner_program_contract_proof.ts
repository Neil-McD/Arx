import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS,
  BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
  BUILDER_PARTNER_COMMISSION_HOLD_MS,
  BUILDER_PARTNER_PAYOUT_BUFFER_MS,
  BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS,
  BUILDER_PARTNER_PROGRAM_VERSION,
  BUILDER_PARTNER_TERMS_VERSION,
  BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS,
  calculateBuilderPartnerCommunityRevenueCommission,
  calculateBuilderPartnerToolGrossMarginCommission,
} from "../shared/builderPartnerProgram.ts";
import { buildAttributionRouteLabel } from "../shared/routePrivacy.ts";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function proveConstants() {
  assert.equal(BUILDER_PARTNER_PROGRAM_VERSION, "builder_partner_v1");
  assert.equal(BUILDER_PARTNER_TERMS_VERSION, "builder_partner_terms_v1");
  assert.equal(BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS, 1500);
  assert.equal(BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS, 4000);
  assert.equal(BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS, 2000);
  assert.equal(BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(BUILDER_PARTNER_COMMISSION_HOLD_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(BUILDER_PARTNER_PAYOUT_BUFFER_MS, 14 * 24 * 60 * 60 * 1000);
}

function proveCommunityCommissionMath() {
  const result = calculateBuilderPartnerCommunityRevenueCommission({
    communityRevenueUsd: 100,
    platformFeeBps: 1500,
  });
  assert.deepEqual(result, {
    platformFeeUsd: 15,
    commissionAmountUsd: 6,
    effectiveCommunityRevenueShareBps: 600,
  });
}

function proveToolCommissionMath() {
  const result = calculateBuilderPartnerToolGrossMarginCommission({
    polynetPriceUsd: 10,
    rawVendorCostUsd: 4,
  });
  assert.deepEqual(result, {
    grossMarginUsd: 6,
    commissionAmountUsd: 1.2,
    grossMarginBps: 6000,
  });

  const underwater = calculateBuilderPartnerToolGrossMarginCommission({
    polynetPriceUsd: 4,
    rawVendorCostUsd: 10,
  });
  assert.equal(underwater.grossMarginUsd, 0);
  assert.equal(underwater.commissionAmountUsd, 0);
}

function proveSchemaContract(schemaSource: string) {
  const commissionSchemaStart = schemaSource.indexOf("partnerCommissionLedger: defineTable");
  const commissionSchemaEnd = schemaSource.indexOf("partnerCommissionAdjustments: defineTable");
  const commissionSchemaSource = schemaSource.slice(commissionSchemaStart, commissionSchemaEnd);
  assertIncludes(schemaSource, "builderPartners: defineTable", "schema");
  assertIncludes(schemaSource, "partnerAttributions: defineTable", "schema");
  assertIncludes(schemaSource, "partnerCommissionLedger: defineTable", "schema");
  assertIncludes(schemaSource, "partnerCommissionAdjustments: defineTable", "schema");
  assertIncludes(schemaSource, "partnerPayoutBatches: defineTable", "schema");
  assertIncludes(schemaSource, "partnerPayoutTransfers: defineTable", "schema");
  assertIncludes(schemaSource, "partnerPayoutItems: defineTable", "schema");
  assert.match(
    schemaSource,
    /builderPartners:[\s\S]*userId:\s*v\.id\("users"\)[\s\S]*acceptedTermsAt:\s*v\.optional\(v\.number\(\)\)[\s\S]*acceptedTermsVersion:\s*v\.optional\(v\.string\(\)\)/,
    "expected partner records to bind a partner user to versioned accepted terms",
  );
  assert.doesNotMatch(
    schemaSource,
    /sourceCommunityId|by_sourceCommunity|pending_review/,
    "platform-level partners should not keep community-source fields or unused manual-review states",
  );
  assert.match(
    schemaSource,
    /partnerAttributions:[\s\S]*attributionKey:\s*v\.string\(\)[\s\S]*referralCode:\s*v\.string\(\)[\s\S]*anonymousVisitorKeyHash:\s*v\.optional\(v\.string\(\)\)[\s\S]*referredUserId:\s*v\.optional\(v\.id\("users"\)\)[\s\S]*referredUserHadOwnedCommunityAtBind:\s*v\.optional\(v\.boolean\(\)\)[\s\S]*eligibleForCommunityRevenue:\s*v\.optional\(v\.boolean\(\)\)[\s\S]*expiresAt:\s*v\.number\(\)/,
    "expected attribution records to support anonymous first-touch, auth binding, expiry, and creator eligibility snapshots",
  );
  assert.match(
    schemaSource,
    /partnerCommissionLedger:[\s\S]*commissionKey:\s*v\.string\(\)[\s\S]*basisType:\s*v\.union\([\s\S]*v\.literal\("community_platform_fee"\)[\s\S]*v\.literal\("tool_gross_margin"\)[\s\S]*basisAmountUsd:\s*v\.number\(\)[\s\S]*commissionRateBps:\s*v\.number\(\)[\s\S]*commissionAmountUsd:\s*v\.number\(\)/,
    "expected commission ledger to be idempotent and basis-explicit",
  );
  assert.match(
    schemaSource,
    /partnerCommissionLedger:[\s\S]*sourceCheckoutSessionId:\s*v\.optional\(v\.string\(\)\)[\s\S]*sourceProviderInvoiceId:\s*v\.optional\(v\.string\(\)\)[\s\S]*sourceProviderPaymentIntentId:\s*v\.optional\(v\.string\(\)\)[\s\S]*sourceProviderChargeId:\s*v\.optional\(v\.string\(\)\)[\s\S]*sourceCreditLedgerEntryId:\s*v\.optional\(v\.id\("creditLedgerEntries"\)\)/,
    "expected commission rows to point at checkout, invoice, payment, charge, and paid-tool evidence",
  );
  assert.match(
    schemaSource,
    /partnerCommissionLedger:[\s\S]*v\.literal\("risk_hold"\)/,
    "expected commission rows to support refund and dispute risk holds",
  );
  assert.doesNotMatch(
    commissionSchemaSource,
    /v\.literal\("pending"\)|v\.literal\("paid"\)|paidAt/,
    "commission rows should not keep unused pending or paid states; payout items are settlement truth",
  );
  assert.match(
    schemaSource,
    /\.index\("by_commissionKey",\s*\["commissionKey"\]\)/,
    "expected commission idempotency key index",
  );
  assert.match(
    schemaSource,
    /\.index\("by_referredUser",\s*\["referredUserId"\]\)/,
    "expected commission ledger rows to be cleanup-addressable by referred user",
  );
  assert.match(
    schemaSource,
    /\.index\("by_provider_invoice",\s*\["sourceProviderInvoiceId"\]\)/,
    "expected commission ledger rows to be searchable by Stripe invoice evidence",
  );
  assert.match(
    schemaSource,
    /\.index\("by_payment_intent",\s*\["sourceProviderPaymentIntentId"\]\)[\s\S]*\.index\("by_charge",\s*\["sourceProviderChargeId"\]\)/,
    "expected commission ledger rows to be searchable by Stripe payment and charge evidence",
  );
  assert.match(
    schemaSource,
    /partnerCommissionAdjustments:[\s\S]*adjustmentKey:\s*v\.string\(\)[\s\S]*adjustmentType:\s*v\.union\([\s\S]*v\.literal\("refund"\)[\s\S]*v\.literal\("dispute_opened"\)[\s\S]*v\.literal\("dispute_won"\)[\s\S]*v\.literal\("dispute_lost"\)[\s\S]*amountUsd:\s*v\.number\(\)/,
    "expected partner adjustment ledger to record refunds and disputes as signed money events",
  );
  assert.match(
    schemaSource,
    /partnerPayoutBatches:[\s\S]*status:\s*v\.union\([\s\S]*v\.literal\("draft"\)[\s\S]*v\.literal\("approved"\)[\s\S]*v\.literal\("processing"\)[\s\S]*v\.literal\("completed"\)[\s\S]*v\.literal\("failed"\)[\s\S]*v\.literal\("voided"\)[\s\S]*payableCutoffAt:\s*v\.optional\(v\.number\(\)\)[\s\S]*payoutBufferMs:\s*v\.optional\(v\.number\(\)\)[\s\S]*createdByUserId:\s*v\.id\("users"\)/,
    "expected partner payout batches to be manual-review settlement objects with an auditable payout cutoff",
  );
  assert.match(
    schemaSource,
    /partnerPayoutTransfers:[\s\S]*batchId:\s*v\.id\("partnerPayoutBatches"\)[\s\S]*stripeAccountId:\s*v\.string\(\)[\s\S]*stripeTransferId:\s*v\.optional\(v\.string\(\)\)[\s\S]*idempotencyKey:\s*v\.string\(\)/,
    "expected partner payout transfers to target Stripe Connect accounts idempotently",
  );
  assert.match(
    schemaSource,
    /partnerPayoutItems:[\s\S]*commissionId:\s*v\.id\("partnerCommissionLedger"\)[\s\S]*status:\s*v\.union\([\s\S]*v\.literal\("reserved"\)[\s\S]*v\.literal\("settled"\)[\s\S]*v\.literal\("voided"\)/,
    "expected partner payout items to reserve and settle payable commission rows",
  );
}

function proveUiContract(uiSource: string) {
  assertIncludes(
    uiSource,
    "BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "calculateBuilderPartnerCommunityRevenueCommission",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "BUILDER_PARTNER_PAYOUT_BUFFER_MS",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "CheckCircle2",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "XCircle",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "Earn {formatBps(effectiveCommunityRevenueShareBps)} of referred creators'",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "Earn {formatBps(toolUsageShareBps)} of referred creators' tool usage",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "Accept and unlock",
    "partner settings UI",
  );
  assertIncludes(uiSource, "Copy link", "partner settings UI");
  assertIncludes(uiSource, "Referred builders", "partner settings UI");
  assertIncludes(uiSource, "Partner payouts", "partner settings UI");
  assertIncludes(uiSource, "Ready for next payout", "partner settings UI");
  assertIncludes(uiSource, "Payable soon", "partner settings UI");
  assertIncludes(uiSource, "Pending hold", "partner settings UI");
  assertIncludes(uiSource, "Payout history", "partner settings UI");
  assertIncludes(uiSource, "Manual settlements appear here after operator review.", "partner settings UI");
  assertIncludes(uiSource, "Appears after referred revenue is processed.", "partner settings UI");
  assertIncludes(uiSource, "Complete the requirements to unlock your partner link and dashboard.", "partner settings UI");
  assert.doesNotMatch(
    uiSource,
    /Minimum payout|minimum payout threshold|BUILDER_PARTNER_MIN_PAYOUT_USD/,
    "partner settings UI should not expose an arbitrary minimum payout threshold",
  );
  assert.doesNotMatch(
    uiSource,
    /Builder Partners must be actively building|invite-list|CommunityAvatar/,
    "partner settings UI should not render a separate eligibility section",
  );
  assert.doesNotMatch(
    uiSource,
    /Open settings/,
    "partner settings UI should not list owned communities with settings shortcuts",
  );
  assert.doesNotMatch(
    uiSource,
    /platform take rate/i,
    "partner settings UI should not overexplain the 6% community revenue copy",
  );
  assert.doesNotMatch(
    uiSource,
    /20% of gross margin/i,
    "partner settings UI should not describe tool usage as gross margin",
  );
  assert.doesNotMatch(
    uiSource,
    /Request enrollment|your-code|Available after enrollment|enrollment opens/i,
    "partner settings UI should not retain placeholder enrollment copy",
  );
  assert.doesNotMatch(
    uiSource,
    /backend ledger ships/i,
    "partner settings UI must not expose implementation phrasing",
  );
  assert.doesNotMatch(
    uiSource,
    /Ledger-backed|commission rows|ready for payout/i,
    "partner settings UI should not imply commission ledger production exists before revenue processing is wired",
  );
}

function proveAutomaticUnlockContract(convexSource: string, gatewaySource: string, appSource: string) {
  assertIncludes(
    convexSource,
    "getMyBuilderPartnerProgram",
    "Builder Partner Convex module",
  );
  assertIncludes(
    convexSource,
    "acceptBuilderPartnerTermsAndEnsure",
    "Builder Partner Convex module",
  );
  assertIncludes(
    convexSource,
    "recordBuilderPartnerAttribution",
    "Builder Partner Convex module",
  );
  assertIncludes(
    convexSource,
    "findOptionalAuthenticatedActorState",
    "Builder Partner Convex module",
  );
  assertIncludes(
    convexSource,
    ".withIndex(\"by_owner\", (q: any) => q.eq(\"ownerId\", userId))",
    "Builder Partner Convex module",
  );
  assertIncludes(
    convexSource,
    "status: \"active\"",
    "Builder Partner Convex module",
  );
  assertIncludes(
    convexSource,
    "self_referral_ignored",
    "Builder Partner Convex module",
  );
  assertIncludes(
    convexSource,
    "superseded_by_new_referral",
    "Builder Partner Convex module",
  );
  assertIncludes(
    convexSource,
    "resolveBuilderPartnerProgramState",
    "Builder Partner Convex module",
  );
  assertIncludes(
    convexSource,
    "partnerProgramState.state !== \"active\"",
    "Builder Partner Convex module",
  );
  assertIncludes(
    convexSource,
    "acceptedTermsVersion: BUILDER_PARTNER_TERMS_VERSION",
    "Builder Partner Convex module",
  );
  assertIncludes(
    convexSource,
    "expireClosedAttributions(ctx, candidateRows, nowMs)",
    "Builder Partner Convex module",
  );
  assertIncludes(
    convexSource,
    "isOpenAttribution(row, nowMs)",
    "Builder Partner Convex module",
  );
  assertIncludes(
    convexSource,
    "referredUserHadOwnedCommunityAtBind",
    "Builder Partner Convex module",
  );
  assertIncludes(
    convexSource,
    "eligibleForCommunityRevenue",
    "Builder Partner Convex module",
  );
  assertIncludes(
    gatewaySource,
    "polynet-builder-partner-referral",
    "Builder Partner gateway",
  );
  assertIncludes(
    gatewaySource,
    "captureBuilderPartnerAttributionFromCurrentUrl",
    "Builder Partner gateway",
  );
  assertIncludes(
    gatewaySource,
    "buildAttributionRouteLabel",
    "Builder Partner gateway",
  );
  assert.doesNotMatch(
    gatewaySource,
    /window\.location\.href/,
    "Builder Partner gateway must not persist raw browser hrefs for attribution",
  );
  assertIncludes(
    gatewaySource,
    "builderPartners:getMyBuilderPartnerProgram",
    "Builder Partner gateway",
  );
  assert.doesNotMatch(
    gatewaySource,
    /pending_review|params\.get\("affiliate"\)/,
    "Builder Partner gateway should stay on the branded platform-partner contract",
  );
  assertIncludes(
    appSource,
    "captureBuilderPartnerAttributionFromCurrentUrl({",
    "App shell",
  );
  assertIncludes(
    appSource,
    "settingsGroup !== \"partners\"",
    "App shell",
  );
}

function proveReductionAndCleanupContract(accountSource: string, docsSource: string) {
  assertIncludes(
    accountSource,
    "\"partnerAttributions\", \"by_referredUser\", \"referredUserId\"",
    "account deletion cleanup",
  );
  assertIncludes(
    accountSource,
    "\"partnerCommissionLedger\", \"by_referredUser\", \"referredUserId\"",
    "account deletion cleanup",
  );
  assertIncludes(
    accountSource,
    "\"partnerCommissionAdjustments\", \"by_commission\", \"commissionId\"",
    "account deletion cleanup",
  );
  assertIncludes(
    accountSource,
    "\"partnerCommissionAdjustments\", \"by_partner_createdAt\", \"partnerId\"",
    "account deletion cleanup",
  );
  assertIncludes(
    accountSource,
    "\"builderPartners\"",
    "account deletion cleanup",
  );
  assertIncludes(
    accountSource,
    "\"partnerAttributions\", \"by_partner_status\", \"partnerId\"",
    "account deletion cleanup",
  );
  assertIncludes(
    accountSource,
    "\"partnerCommissionLedger\", \"by_partner_status\", \"partnerId\"",
    "account deletion cleanup",
  );
  assertIncludes(
    docsSource,
    "A narrow platform-level Builder Partner Program can exist only when it directly helps builders bring new communities to Polynet",
    "product doctrine",
  );
}

function proveAttributionRoutePrivacy() {
  assert.equal(
    buildAttributionRouteLabel({
      href: "https://www.polynet.ai/claim?token=secret&partner=bob&ok=1#access_token=bad",
    }),
    "/claim?ok=1",
  );
  assert.equal(
    buildAttributionRouteLabel({
      pathname: "/checkout/success",
      search: "?session_id=cs_secret&ref=bob&plan=builder",
    }),
    "/checkout/success?plan=builder",
  );
  assert.equal(
    buildAttributionRouteLabel({
      href: "/settings/integrations?app_oauth_finalize_token=secret&state=state&tab=apps",
    }),
    "/settings/integrations?tab=apps",
  );
}

function provePricingFoundation(authSource: string, workspaceCreditsSource: string) {
  assert.match(
    authSource,
    /platformFeeBps:\s*1500/,
    "expected partner economics to sit on the 15% community platform fee",
  );
  assert.match(
    workspaceCreditsSource,
    /PAID_TOOL_TARGET_GROSS_MARGIN_BPS\s*=\s*6000/,
    "expected partner tool economics to sit on the 60% paid-tool gross margin target",
  );
}

function proveCommissionProducerContract(
  builderPartnersSource: string,
  communityCommerceSource: string,
  workspaceCreditsSource: string,
) {
  assertIncludes(
    builderPartnersSource,
    "recordCommunityRevenuePartnerCommission",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "community_platform_fee:${sourceCheckoutSessionId}",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "community_platform_fee:invoice:${sourceProviderInvoiceId}",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "const referredUserId = community.ownerId",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "requireCommunityRevenueEligibility: true",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "recordToolUsagePartnerCommission",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "tool_gross_margin:${String(args.creditLedgerEntryId)}",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "status: \"locked\"",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "holdUntil: args.nowMs + BUILDER_PARTNER_COMMISSION_HOLD_MS",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "advancePartnerCommissionsToPayableInternal",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "recordCommunitySubscriptionInvoicePartnerCommissionInternal",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "patchCommissionSourceEvidence",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "sourceProviderChargeId",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "status: \"payable\"",
    "Builder Partner commission producer",
  );
  assertIncludes(
    communityCommerceSource,
    "recordCommunityRevenuePartnerCommission(ctx,",
    "community checkout settlement",
  );
  assertIncludes(
    communityCommerceSource,
    "sourceCheckoutSessionId: row.sessionId",
    "community checkout settlement",
  );
  assertIncludes(
    communityCommerceSource,
    "sourceProviderInvoiceId:",
    "community checkout settlement",
  );
  assertIncludes(
    communityCommerceSource,
    "communitySubscriptionStatusGrantsAccess(communitySubscriptionStatus)",
    "community checkout settlement",
  );
  assert.match(
    workspaceCreditsSource,
    /recordToolUsagePartnerCommission\(ctx,[\s\S]*creditLedgerEntryId:\s*(reservation|entry)\._id[\s\S]*paidUsageRatio/,
    "expected paid tool usage settlement to emit partner commissions from credit ledger evidence",
  );
  const toolCommissionCalls = workspaceCreditsSource.match(/recordToolUsagePartnerCommission\(ctx,/g)?.length ?? 0;
  assert.ok(
    toolCommissionCalls >= 2,
    "expected both generic credit settlement and workspace compute reservation settlement to emit partner commissions",
  );
  assertIncludes(
    workspaceCreditsSource,
    "split.purchasedSettled / Number(entry.creditsReserved ?? 0)",
    "paid tool usage settlement",
  );
}

function proveRecurringInvoiceContract(httpBillingSource: string) {
  assertIncludes(
    httpBillingSource,
    "event.type === \"invoice.paid\"",
    "Stripe recurring invoice webhook",
  );
  assertIncludes(
    httpBillingSource,
    "event.type === \"invoice.payment_succeeded\"",
    "Stripe recurring invoice webhook",
  );
  assertIncludes(
    httpBillingSource,
    "billingReason !== \"subscription_cycle\"",
    "Stripe recurring invoice webhook",
  );
  assertIncludes(
    httpBillingSource,
    "readStripeInvoiceSubscriptionId(invoice)",
    "Stripe recurring invoice webhook",
  );
  assertIncludes(
    httpBillingSource,
    "recordCommunitySubscriptionInvoicePartnerCommissionInternal",
    "Stripe recurring invoice webhook",
  );
  assert.doesNotMatch(
    httpBillingSource,
    /billingReason\s*!==\s*"subscription_create"[\s\S]*recordCommunitySubscriptionInvoicePartnerCommissionInternal/,
    "recurring invoice hook should not double count initial subscription_create invoices",
  );
}

function proveRefundDisputeContract(
  builderPartnersSource: string,
  httpBillingSource: string,
) {
  assertIncludes(
    builderPartnersSource,
    "recordPartnerCommissionRefundAdjustmentInternal",
    "Builder Partner reversal ledger",
  );
  assertIncludes(
    builderPartnersSource,
    "recordPartnerCommissionDisputeOpenedInternal",
    "Builder Partner reversal ledger",
  );
  assertIncludes(
    builderPartnersSource,
    "recordPartnerCommissionDisputeClosedInternal",
    "Builder Partner reversal ledger",
  );
  assertIncludes(
    builderPartnersSource,
    "partnerCommissionAdjustments",
    "Builder Partner reversal ledger",
  );
  assertIncludes(
    builderPartnersSource,
    "status: \"risk_hold\"",
    "Builder Partner reversal ledger",
  );
  assertIncludes(
    builderPartnersSource,
    "voidReason: `stripe_refund:${refundId}`",
    "Builder Partner reversal ledger",
  );
  assertIncludes(
    builderPartnersSource,
    "capNegativeCommissionAdjustmentUsd",
    "Builder Partner reversal ledger",
  );
  assertIncludes(
    builderPartnersSource,
    "readAppliedCommissionAdjustmentTotalUsd",
    "Builder Partner reversal ledger",
  );
  assertIncludes(
    builderPartnersSource,
    "getDisputeAdjustmentState",
    "Builder Partner dispute reducer",
  );
  assertIncludes(
    builderPartnersSource,
    "readCommissionSettledPayoutTotalUsd",
    "Builder Partner reversal ledger should use payout items as settlement truth",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /row\.status\s*===\s*"paid"|row\.status\s*!==\s*"paid"/,
    "Builder Partner reversal ledger must not rely on legacy paid commission status",
  );
  assertIncludes(
    builderPartnersSource,
    "hasTerminalAdjustment",
    "Builder Partner dispute reducer",
  );
  assertIncludes(
    builderPartnersSource,
    "targetDisputeImpactUsd - disputeState.currentImpactUsd",
    "Builder Partner dispute reducer",
  );
  assertIncludes(
    httpBillingSource,
    "event.type === \"refund.created\"",
    "Stripe reversal webhook",
  );
  assertIncludes(
    httpBillingSource,
    "event.type === \"charge.refunded\"",
    "Stripe reversal webhook",
  );
  assertIncludes(
    httpBillingSource,
    "charge_refunded_refunds_missing",
    "Stripe reversal webhook",
  );
  assert.doesNotMatch(
    httpBillingSource,
    /charge_refunded:\$\{charge\.id\}/,
    "charge.refunded must not create pseudo refund IDs that can double-adjust when refund.created arrives",
  );
  assertIncludes(
    httpBillingSource,
    "event.type === \"charge.dispute.created\"",
    "Stripe dispute webhook",
  );
  assertIncludes(
    httpBillingSource,
    "event.type === \"charge.dispute.closed\"",
    "Stripe dispute webhook",
  );
  assertIncludes(
    httpBillingSource,
    "readStripeInvoiceEvidence",
    "Stripe source evidence capture",
  );
  assertIncludes(
    httpBillingSource,
    "retrieveStripeInvoiceForEvidence",
    "Stripe initial checkout evidence capture",
  );
}

function provePartnerPayoutSettlementContract(
  schemaSource: string,
  builderPartnersSource: string,
  criticalAuditSource: string,
  gatewaySource: string,
  uiSource: string,
  cronsSource: string,
  docsSource: string,
) {
  assertIncludes(
    builderPartnersSource,
    "previewPartnerPayoutBatch",
    "Builder Partner payout settlement",
  );
  assertIncludes(
    builderPartnersSource,
    "createPartnerPayoutBatch",
    "Builder Partner payout settlement",
  );
  assertIncludes(
    builderPartnersSource,
    "approvePartnerPayoutBatch",
    "Builder Partner payout settlement",
  );
  assertIncludes(
    builderPartnersSource,
    "executePartnerPayoutBatch",
    "Builder Partner payout settlement",
  );
  assertIncludes(
    builderPartnersSource,
    "voidPartnerPayoutBatch",
    "Builder Partner payout settlement",
  );
  assertIncludes(
    builderPartnersSource,
    "requireOperatorRole(ctx, args.authSubject, \"operator\")",
    "Builder Partner payout settlement must be operator gated",
  );
  assertIncludes(
    builderPartnersSource,
    "stripe.transfers.create",
    "Builder Partner payout settlement must use Stripe Connect transfers",
  );
  assertIncludes(
    builderPartnersSource,
    "validatePartnerPayoutBatchStillPayable",
    "Builder Partner payout settlement must revalidate stale payable balances",
  );
  assertIncludes(
    builderPartnersSource,
    "BUILDER_PARTNER_PAYOUT_BUFFER_MS",
    "Builder Partner payout settlement must use the payout review buffer",
  );
  assertIncludes(
    builderPartnersSource,
    "normalizePayableCutoffAt",
    "Builder Partner payout settlement must derive an auditable payable cutoff",
  );
  assertIncludes(
    builderPartnersSource,
    "Math.min(cutoffAt, latestAllowedCutoffAt)",
    "Builder Partner payout settlement must not allow operator arguments to bypass the payout buffer",
  );
  assertIncludes(
    builderPartnersSource,
    "row.payableAt > args.payableCutoffAt",
    "Builder Partner payout planner must exclude commissions still inside the payout buffer",
  );
  assertIncludes(
    builderPartnersSource,
    "commission.payableAt > batchPayableCutoffAt",
    "Builder Partner payout validation must re-check the batch payout buffer cutoff",
  );
  assertIncludes(
    builderPartnersSource,
    "partner_payout_commission_inside_payout_buffer",
    "Builder Partner payout validation must fail stale buffered commissions before Stripe",
  );
  assertIncludes(
    cronsSource,
    "advance builder partner commissions to payable",
    "Builder Partner commission maturity must be scheduled",
  );
  assertIncludes(
    cronsSource,
    "builderPartners.advancePartnerCommissionsToPayableInternal",
    "Builder Partner commission maturity cron must call the canonical internal mutation",
  );
  assertIncludes(
    builderPartnersSource,
    "const validation = await validatePartnerPayoutBatchStillPayable(ctx, args.batchId);",
    "Builder Partner payout approval and execution must call validation",
  );
  assertIncludes(
    builderPartnersSource,
    "markPartnerPayoutBatchStale",
    "Builder Partner payout execution must fail stale batches before Stripe",
  );
  assertIncludes(
    builderPartnersSource,
    "if (begin?.blocked)",
    "Builder Partner payout action must return before Stripe on stale batches",
  );
  assertIncludes(
    builderPartnersSource,
    "excludeBatchId",
    "Builder Partner payout validation must exclude current batch items from reserved math",
  );
  assertIncludes(
    builderPartnersSource,
    "usdToSettlementCents",
    "Builder Partner payout settlement must normalize settlement amounts to cents",
  );
  assertIncludes(
    builderPartnersSource,
    "settlementCentsToUsd",
    "Builder Partner payout settlement must store cent-normalized USD amounts",
  );
  assertIncludes(
    builderPartnersSource,
    "idempotencyKey: String(transfer.idempotencyKey ?? \"\").trim()",
    "Builder Partner payout settlement must use transfer idempotency keys",
  );
  assertIncludes(
    builderPartnersSource,
    "readCommissionPayoutItemTotalUsd",
    "Builder Partner payout settlement must subtract reserved and settled payout items",
  );
  assertIncludes(
    builderPartnersSource,
    "status: \"reserved\"",
    "Builder Partner payout settlement must reserve commission rows before execution",
  );
  assertIncludes(
    builderPartnersSource,
    "status: \"settled\"",
    "Builder Partner payout settlement must mark items settled only after transfer success",
  );
  assertIncludes(
    builderPartnersSource,
    "recordPartnerPayoutTransferSucceededInternal",
    "Builder Partner payout settlement must separate transfer result recording",
  );
  assertIncludes(
    builderPartnersSource,
    "recordPartnerPayoutAudit",
    "Builder Partner payout settlement must write critical audit events",
  );
  assertIncludes(
    criticalAuditSource,
    "builder_partner_payout_transfer_succeeded",
    "Builder Partner payout critical audit event registry",
  );
  assertIncludes(
    criticalAuditSource,
    "builder_partner_payout_transfer_failed",
    "Builder Partner payout critical audit event registry",
  );
  assertIncludes(
    gatewaySource,
    "payoutHistory",
    "Builder Partner gateway",
  );
  assertIncludes(
    gatewaySource,
    "readyUsd",
    "Builder Partner gateway must expose payout-ready balance separately from payable balance",
  );
  assertIncludes(
    gatewaySource,
    "bufferedUsd",
    "Builder Partner gateway must expose payable balance still inside the payout buffer",
  );
  assertIncludes(
    builderPartnersSource,
    "row.status === \"processing\" || row.status === \"succeeded\" || row.status === \"failed\"",
    "Builder Partner payout history must hide draft transfer rows",
  );
  assertIncludes(
    uiSource,
    "No partner payouts have been settled yet.",
    "Builder Partner payout history UI",
  );
  assert.doesNotMatch(
    uiSource,
    /normalized === "draft"/,
    "partner-facing UI should not render draft transfer status copy",
  );
  assertIncludes(
    docsSource,
    "Partner payout settlement runs through manual operator-reviewed batches",
    "Builder Partner payout docs",
  );
  assertIncludes(
    docsSource,
    "settlement amounts are normalized to cents",
    "Builder Partner payout docs",
  );
  assertIncludes(
    docsSource,
    "30-day risk hold",
    "Builder Partner payout docs",
  );
  assertIncludes(
    docsSource,
    "14-day payout review buffer",
    "Builder Partner payout docs",
  );
  assertIncludes(
    docsSource,
    "There is no public minimum payout threshold",
    "Builder Partner payout docs",
  );
  assertIncludes(
    schemaSource,
    ".index(\"by_commission\", [\"commissionId\"])",
    "Builder Partner payout schema",
  );
  assert.doesNotMatch(
    uiSource,
    /executePartnerPayoutBatch|approvePartnerPayoutBatch|createPartnerPayoutBatch/,
    "partner-facing UI must not expose operator settlement controls",
  );
}

function main() {
  const schemaSource = readText(new URL("../convex/schema.ts", import.meta.url));
  const uiSource = readText(
    new URL("../apps/web/src/components/WebBuilderPartnerSettingsSection.tsx", import.meta.url),
  );
  const builderPartnersSource = readText(new URL("../convex/builderPartners.ts", import.meta.url));
  const gatewaySource = readText(new URL("../shared/builderPartnerProgramGateway.ts", import.meta.url));
  const appSource = readText(new URL("../apps/web/src/App.tsx", import.meta.url));
  const accountSource = readText(new URL("../convex/account.ts", import.meta.url));
  const docsSource = readText(new URL("../docs/product/primitives/polynet.md", import.meta.url));
  const billingDocsSource = readText(new URL("../docs/product/reference/billing-entitlements.md", import.meta.url));
  const authSource = readText(new URL("../convex/auth.ts", import.meta.url));
  const sharedWorkspaceCreditsSource = readText(new URL("../shared/workspaceCredits.ts", import.meta.url));
  const communityCommerceSource = readText(new URL("../convex/communityCommerce.ts", import.meta.url));
  const workspaceCreditsSource = readText(new URL("../convex/workspaceCredits.ts", import.meta.url));
  const httpBillingSource = readText(new URL("../convex/httpBilling.ts", import.meta.url));
  const criticalAuditSource = readText(new URL("../convex/criticalAudit.ts", import.meta.url));
  const cronsSource = readText(new URL("../convex/crons.ts", import.meta.url));

  proveConstants();
  proveCommunityCommissionMath();
  proveToolCommissionMath();
  proveAttributionRoutePrivacy();
  proveSchemaContract(schemaSource);
  proveUiContract(uiSource);
  proveAutomaticUnlockContract(builderPartnersSource, gatewaySource, appSource);
  proveReductionAndCleanupContract(accountSource, docsSource);
  provePricingFoundation(authSource, sharedWorkspaceCreditsSource);
  proveCommissionProducerContract(builderPartnersSource, communityCommerceSource, workspaceCreditsSource);
  proveRecurringInvoiceContract(httpBillingSource);
  proveRefundDisputeContract(builderPartnersSource, httpBillingSource);
  provePartnerPayoutSettlementContract(
    schemaSource,
    builderPartnersSource,
    criticalAuditSource,
    gatewaySource,
    uiSource,
    cronsSource,
    billingDocsSource,
  );
  console.log("PASS: builder partner program contract proof passed");
}

main();
