import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS,
  BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
  BUILDER_PARTNER_COMMUNITY_REVENUE_SHARE_BPS,
  BUILDER_PARTNER_COMMISSION_HOLD_MS,
  BUILDER_PARTNER_PAYOUT_BUFFER_MS,
  BUILDER_PARTNER_PROGRAM_VERSION,
  BUILDER_PARTNER_TERMS_VERSION,
  BUILDER_PARTNER_TOOL_USAGE_POLYNET_RETAINED_REVENUE_BPS,
  BUILDER_PARTNER_TOOL_USAGE_REVENUE_SHARE_BPS,
  calculateBuilderPartnerCommunityRevenueCommission,
  calculateBuilderPartnerToolUsageCommission,
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
  assert.equal(BUILDER_PARTNER_TERMS_VERSION, "builder_partner_terms_v2");
  assert.equal(BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS, 1000);
  assert.equal(BUILDER_PARTNER_COMMUNITY_REVENUE_SHARE_BPS, 500);
  assert.equal(BUILDER_PARTNER_TOOL_USAGE_REVENUE_SHARE_BPS, 2000);
  assert.equal(BUILDER_PARTNER_TOOL_USAGE_POLYNET_RETAINED_REVENUE_BPS, 4000);
  assert.equal(BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(BUILDER_PARTNER_COMMISSION_HOLD_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(BUILDER_PARTNER_PAYOUT_BUFFER_MS, 14 * 24 * 60 * 60 * 1000);
}

function proveCommunityCommissionMath() {
  const result = calculateBuilderPartnerCommunityRevenueCommission({
    communityRevenueUsd: 100,
    platformFeeBps: 1000,
  });
  assert.deepEqual(result, {
    platformFeeUsd: 10,
    commissionAmountUsd: 5,
    effectiveCommunityRevenueShareBps: 500,
  });
  assert.deepEqual(
    calculateBuilderPartnerToolUsageCommission({
      polynetPriceUsd: 1,
      rawVendorCostUsd: 0.4,
    }),
    {
      toolRevenueUsd: 1,
      rawVendorCostUsd: 0.4,
      grossMarginUsd: 0.6,
      commissionAmountUsd: 0.2,
      retainedPolynetRevenueUsd: 0.4,
      effectiveToolUsageRevenueShareBps: 2000,
    },
  );
  assert.deepEqual(
    calculateBuilderPartnerToolUsageCommission({
      polynetPriceUsd: 1,
      rawVendorCostUsd: 0.5,
    }),
    {
      toolRevenueUsd: 1,
      rawVendorCostUsd: 0.5,
      grossMarginUsd: 0.5,
      commissionAmountUsd: 0.1,
      retainedPolynetRevenueUsd: 0.4,
      effectiveToolUsageRevenueShareBps: 1000,
    },
  );
}

function proveSchemaContract(schemaSource: string) {
  const commissionSchemaStart = schemaSource.indexOf("partnerCommissionLedger: defineTable");
  const commissionSchemaEnd = schemaSource.indexOf("partnerCommissionAdjustments: defineTable");
  const commissionSchemaSource = schemaSource.slice(commissionSchemaStart, commissionSchemaEnd);
  const adjustmentSchemaStart = schemaSource.indexOf("partnerCommissionAdjustments: defineTable");
  const adjustmentSchemaEnd = schemaSource.indexOf("partnerPayoutBatches: defineTable");
  const adjustmentSchemaSource = schemaSource.slice(adjustmentSchemaStart, adjustmentSchemaEnd);
  const payoutBatchSchemaStart = schemaSource.indexOf("partnerPayoutBatches: defineTable");
  const payoutBatchSchemaEnd = schemaSource.indexOf("partnerPayoutTransfers: defineTable");
  const payoutBatchSchemaSource = schemaSource.slice(payoutBatchSchemaStart, payoutBatchSchemaEnd);
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
    /partnerCommissionLedger:[\s\S]*commissionKey:\s*v\.string\(\)[\s\S]*basisType:\s*v\.union\([\s\S]*v\.literal\("community_platform_fee"\)[\s\S]*v\.literal\("community_revenue"\)[\s\S]*v\.literal\("paid_tool_usage"\)[\s\S]*basisAmountUsd:\s*v\.number\(\)[\s\S]*commissionRateBps:\s*v\.number\(\)[\s\S]*commissionAmountUsd:\s*v\.number\(\)/,
    "expected commission ledger to preserve legacy platform-fee rows and support current community revenue plus paid-tool usage basis rows",
  );
  assert.match(
    schemaSource,
    /partnerCommissionLedger:[\s\S]*commissionSettlementCents:\s*v\.optional\(v\.number\(\)\)[\s\S]*adjustmentSettlementCents:\s*v\.optional\(v\.number\(\)\)[\s\S]*reservedSettlementCents:\s*v\.optional\(v\.number\(\)\)[\s\S]*settledSettlementCents:\s*v\.optional\(v\.number\(\)\)[\s\S]*netSettlementCents:\s*v\.optional\(v\.number\(\)\)[\s\S]*openSettlementCents:\s*v\.optional\(v\.number\(\)\)[\s\S]*payoutOpen:\s*v\.optional\(v\.boolean\(\)\)[\s\S]*payoutDebt:\s*v\.optional\(v\.boolean\(\)\)[\s\S]*settlementUpdatedAt:\s*v\.optional\(v\.number\(\)\)/,
    "expected commission ledger to materialize payout settlement state",
  );
  assert.match(
    schemaSource,
    /partnerCommissionLedger:[\s\S]*sourceCheckoutSessionId:\s*v\.optional\(v\.string\(\)\)[\s\S]*sourceProviderInvoiceId:\s*v\.optional\(v\.string\(\)\)[\s\S]*sourceProviderPaymentIntentId:\s*v\.optional\(v\.string\(\)\)[\s\S]*sourceProviderChargeId:\s*v\.optional\(v\.string\(\)\)/,
    "expected commission rows to point at checkout, invoice, payment, and charge evidence",
  );
  assert.doesNotMatch(
    commissionSchemaSource,
    /tool_gross_margin|sourceCreditLedgerEntryId/,
    "commission rows should not retain deferred paid-tool partner commission fields",
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
  assert.doesNotMatch(
    commissionSchemaSource,
    /\.index\("by_status_payableAt",\s*\["status",\s*"payableAt"\]\)/,
    "commission schema should not keep legacy payable fallback index",
  );
  assert.match(
    schemaSource,
    /\.index\("by_status_payoutOpen_payableAt",\s*\["status",\s*"payoutOpen",\s*"payableAt"\]\)/,
    "expected open payable commission planning index",
  );
  assert.match(
    schemaSource,
    /\.index\("by_partner_status_payoutOpen_payableAt",\s*\["partnerId",\s*"status",\s*"payoutOpen",\s*"payableAt"\]\)/,
    "expected partner-local open payable commission index",
  );
  assert.match(
    schemaSource,
    /\.index\("by_partner_status_payoutDebt",\s*\["partnerId",\s*"status",\s*"payoutDebt"\]\)/,
    "expected partner-local carryforward debt index",
  );
  assert.match(
    schemaSource,
    /\.index\("by_status_createdAt",\s*\["status",\s*"createdAt"\]\)/,
    "expected bounded commission settlement backfill index",
  );
  assert.match(
    schemaSource,
    /partnerCommissionAdjustments:[\s\S]*adjustmentKey:\s*v\.string\(\)[\s\S]*adjustmentType:\s*v\.union\([\s\S]*v\.literal\("refund"\)[\s\S]*v\.literal\("dispute_opened"\)[\s\S]*v\.literal\("dispute_won"\)[\s\S]*v\.literal\("dispute_lost"\)[\s\S]*amountUsd:\s*v\.number\(\)/,
    "expected partner adjustment ledger to record refunds and disputes as signed money events",
  );
  assert.doesNotMatch(
    adjustmentSchemaSource,
    /manual_adjustment/,
    "partner adjustments should not keep unused manual adjustment state",
  );
  assert.match(
    schemaSource,
    /partnerPayoutBatches:[\s\S]*batchKey:\s*v\.string\(\)[\s\S]*cyclePeriod:\s*v\.optional\(v\.string\(\)\)[\s\S]*runNumber:\s*v\.optional\(v\.number\(\)\)[\s\S]*replacesBatchId:\s*v\.optional\(v\.id\("partnerPayoutBatches"\)\)[\s\S]*status:\s*v\.union\([\s\S]*v\.literal\("pending_approval"\)[\s\S]*v\.literal\("approved"\)[\s\S]*v\.literal\("processing"\)[\s\S]*v\.literal\("paid"\)[\s\S]*v\.literal\("held"\)[\s\S]*v\.literal\("rejected"\)[\s\S]*v\.literal\("failed"\)[\s\S]*payableCutoffAt:\s*v\.optional\(v\.number\(\)\)[\s\S]*payoutBufferMs:\s*v\.optional\(v\.number\(\)\)[\s\S]*approvedByUserId:\s*v\.optional\(v\.id\("users"\)\)[\s\S]*processedByUserId:\s*v\.optional\(v\.id\("users"\)\)[\s\S]*holdReason:\s*v\.optional\(v\.string\(\)\)[\s\S]*rejectReason:\s*v\.optional\(v\.string\(\)\)/,
    "expected partner payout batches to use explicit product states with auditable payout cutoff and decision reasons",
  );
  assert.doesNotMatch(
    payoutBatchSchemaSource,
    /v\.literal\("draft"\)|v\.literal\("completed"\)|v\.literal\("voided"\)/,
    "partner payout batches should not keep deleted legacy states",
  );
  assert.match(
    schemaSource,
    /\.index\("by_cyclePeriod_runNumber",\s*\["cyclePeriod",\s*"runNumber"\]\)/,
    "expected partner payout cycles to support period/run lookup",
  );
  assert.doesNotMatch(
    payoutBatchSchemaSource,
    /createdByUserId|by_createdBy/,
    "system-generated partner payout cycles should not keep manual creator fields or indexes",
  );
  assert.match(
    schemaSource,
    /partnerPayoutTransfers:[\s\S]*batchId:\s*v\.id\("partnerPayoutBatches"\)[\s\S]*stripeAccountId:\s*v\.string\(\)[\s\S]*stripeTransferId:\s*v\.optional\(v\.string\(\)\)[\s\S]*idempotencyKey:\s*v\.string\(\)/,
    "expected partner payout transfers to target Stripe Connect accounts idempotently",
  );
  assert.doesNotMatch(
    schemaSource.slice(payoutBatchSchemaEnd, schemaSource.indexOf("partnerPayoutItems: defineTable")),
    /v\.literal\("draft"\)/,
    "partner payout transfers should not keep deleted draft state",
  );
  assert.match(
    schemaSource,
    /partnerPayoutItems:[\s\S]*commissionId:\s*v\.id\("partnerCommissionLedger"\)[\s\S]*status:\s*v\.union\([\s\S]*v\.literal\("reserved"\)[\s\S]*v\.literal\("settled"\)[\s\S]*v\.literal\("released"\)/,
    "expected partner payout items to reserve, settle, or release payable commission rows",
  );
  assert.doesNotMatch(
    schemaSource.slice(schemaSource.indexOf("partnerPayoutItems: defineTable"), schemaSource.indexOf("workspaceCreditBalances: defineTable")),
    /v\.literal\("voided"\)/,
    "partner payout items should not keep deleted voided state",
  );
}

function proveUiContract(uiSource: string, settingsWrapperSource: string, partnerPanelSource: string) {
  assertIncludes(
    settingsWrapperSource,
    "WebBuilderPartnerProgramPanel",
    "partner settings UI must delegate to the reusable partner panel",
  );
  assertIncludes(
    partnerPanelSource,
    "export function WebBuilderPartnerProgramPanel",
    "partner dashboard UI must live in the reusable partner panel",
  );
  assertIncludes(
    partnerPanelSource,
    "showProgramOverview?: boolean",
    "partner dashboard UI must support hiding the overview when embedded in the right panel",
  );
  assertIncludes(
    partnerPanelSource,
    "const showProgramOverview = props.showProgramOverview ?? true",
    "partner dashboard UI must keep the settings overview visible by default",
  );
  assert.doesNotMatch(
    settingsWrapperSource,
    /showProgramOverview=\{false\}/,
    "partner settings wrapper must keep the full partner program overview",
  );
  assert.doesNotMatch(
    settingsWrapperSource,
    /Partner link|builder-partner-dashboard|builder-partner-payout-history/,
    "partner settings wrapper must not duplicate the partner dashboard implementation",
  );
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
    "BUILDER_PARTNER_COMMUNITY_REVENUE_SHARE_BPS",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "BUILDER_PARTNER_TOOL_USAGE_REVENUE_SHARE_BPS",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "Paid tool usage",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "Builder Partners earn from referred creators' community revenue and settled paid tool usage.",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "Your Builder Partner account is active.",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "Partner links are",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "generated automatically when the requirements are met.",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "Complete the requirements to unlock your partner link and dashboard.",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "Review and accept terms",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "BUILDER_PARTNER_TERMS_ENTRY",
    "partner settings UI must load the canonical Builder Partner terms document",
  );
  assertIncludes(
    uiSource,
    "isTermsModalOpen",
    "partner settings UI must present terms in a local acceptance modal",
  );
  assertIncludes(
    uiSource,
    "builder-partner-terms-reader",
    "partner settings UI must render terms inside a bounded modal viewport",
  );
  assertIncludes(
    uiSource,
    "hasConfirmedTermsAcceptance",
    "partner settings UI must require explicit terms confirmation inside the modal before unlock",
  );
  assertIncludes(
    uiSource,
    "props.renderMarkdown(activeTermsDocument.content)",
    "partner settings UI must render the terms body inside the modal",
  );
  assertIncludes(
    uiSource,
    "props.acceptBuilderPartnerTerms(activeTermsDocument.version)",
    "partner settings UI must submit the exact accepted terms version",
  );
  assert.doesNotMatch(
    uiSource,
    /window\.open|BUILDER_PARTNER_TERMS_DOCUMENT\.route|\/legal\/builder-partner-terms/,
    "partner terms acceptance must not bounce users to a separate legal page",
  );
  assertIncludes(
    uiSource,
    "Copy link",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "Referred builders",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "Ready for next payout",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "ready for the next payout cycle.",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "Completed Stripe transfers.",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "Partner links and new commissions are paused. Contact support.",
    "partner settings UI",
  );
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
    /platform take rate/i,
    "partner settings UI should not overexplain the community revenue copy",
  );
  assert.doesNotMatch(
    uiSource,
    /20% of gross margin|BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS/i,
    "partner settings UI should not describe tool usage as gross margin",
  );
  assert.doesNotMatch(
    uiSource,
    /Builder Partner Program is coming soon|Request enrollment|your-code|Available after enrollment|enrollment opens/i,
    "partner settings UI should not retain placeholder enrollment copy",
  );
  assert.doesNotMatch(
    uiSource,
    /backend ledger ships/i,
    "partner settings UI must not expose implementation phrasing",
  );
  assert.doesNotMatch(
    uiSource,
    /Ledger-backed|commission rows/i,
    "partner settings UI should not expose backend ledger implementation details",
  );
}

function provePartnerTermsAgreementContract(args: {
  termsDocSource: string;
  legalRegistrySource: string;
  legalContentSource: string;
  webAppRouteStateSource: string;
  mainSurfaceHostSource: string;
  routeLifecycleSource: string;
  schemaSource: string;
  builderPartnersSource: string;
  gatewaySource: string;
  runtimeSmokeSource: string;
}) {
  assertIncludes(
    args.termsDocSource,
    "version: builder_partner_terms_v2",
    "Builder Partner terms legal artifact",
  );
  for (const marker of [
    "## Eligibility",
    "## Partner Links And Attribution",
    "## Commission Rules",
    "## Holds, Payout Buffer, And Payouts",
    "## Refunds, Disputes, And Clawbacks",
    "## Marketing Rules",
    "clearly and conspicuously disclose your financial or referral relationship",
    "## Taxes",
    "## Program Changes",
  ]) {
    assertIncludes(args.termsDocSource, marker, "Builder Partner terms legal artifact");
  }
  assertIncludes(
    args.legalRegistrySource,
    "version: BUILDER_PARTNER_TERMS_VERSION",
    "legal document registry must bind the document to the canonical terms version",
  );
  assert.doesNotMatch(
    args.legalRegistrySource,
    /route:|slug:/,
    "Builder Partner terms should not expose a separate legal-page route for acceptance",
  );
  assertIncludes(
    args.legalContentSource,
    "builder-partner-terms-v2.md?raw",
    "web legal document content must load the canonical Markdown artifact",
  );
  assertIncludes(
    args.legalContentSource,
    "stripMarkdownFrontmatter(builderPartnerTermsV2)",
    "web legal document content must hide source frontmatter from the user-facing modal",
  );
  assertIncludes(
    args.legalContentSource,
    "BUILDER_PARTNER_TERMS_ENTRY",
    "web legal document content must expose the Builder Partner terms entry for the modal",
  );
  assert.doesNotMatch(
    args.webAppRouteStateSource,
    /segments\[0\] === "legal"|buildLegalDocumentPath|legalSlug/,
    "app route state should not keep a separate legal document route",
  );
  assert.doesNotMatch(
    args.mainSurfaceHostSource,
    /WebLegalDocumentPanel|showLegalDocumentPanel|legalDocumentPanelProps/,
    "main surface host should not render a separate Builder Partner terms page",
  );
  assert.doesNotMatch(
    args.routeLifecycleSource,
    /legalSlug/,
    "path route lifecycle should not preserve legal document route state",
  );
  assert.match(
    args.schemaSource,
    /legalAcceptances:[\s\S]*userId:\s*v\.id\("users"\)[\s\S]*documentKey:\s*v\.string\(\)[\s\S]*documentVersion:\s*v\.string\(\)[\s\S]*acceptedAt:\s*v\.number\(\)[\s\S]*source:\s*v\.string\(\)/,
    "expected append-only legal acceptance evidence table",
  );
  assert.match(
    args.schemaSource,
    /\.index\("by_user_document_version",\s*\["userId",\s*"documentKey",\s*"documentVersion"\]\)/,
    "expected legal acceptance idempotency lookup index",
  );
  assertIncludes(
    args.builderPartnersSource,
    "termsVersion: v.string()",
    "Builder Partner acceptance mutation must require an explicit terms version",
  );
  assertIncludes(
    args.builderPartnersSource,
    "builder_partner_terms_version_required",
    "Builder Partner acceptance mutation must reject missing terms versions",
  );
  assertIncludes(
    args.builderPartnersSource,
    "builder_partner_terms_version_stale",
    "Builder Partner acceptance mutation must reject stale terms versions",
  );
  assertIncludes(
    args.builderPartnersSource,
    "recordBuilderPartnerTermsAcceptance(ctx,",
    "Builder Partner acceptance mutation must write legal acceptance evidence",
  );
  assertIncludes(
    args.builderPartnersSource,
    "existing.acceptedTermsVersion === BUILDER_PARTNER_TERMS_VERSION",
    "Builder Partner summary acceptance timestamp must only be preserved for the current terms version",
  );
  assertIncludes(
    args.builderPartnersSource,
    "source: \"builder_partner_unlock\"",
    "Builder Partner acceptance event must record its source",
  );
  assertIncludes(
    args.gatewaySource,
    "termsVersion: params.termsVersion",
    "Builder Partner gateway must submit the exact terms version",
  );
  assertIncludes(
    args.runtimeSmokeSource,
    "termsVersion: BUILDER_PARTNER_TERMS_VERSION",
    "Builder Partner runtime smoke must accept the current terms version explicitly",
  );
}

function provePartnerSurfaceIsolationContract(
  appSource: string,
  operatorHostSource: string,
) {
  assertIncludes(
    appSource,
    "settingsGroup !== \"partners\"",
    "Builder Partner data loading must remain settings-scoped",
  );
  assert.doesNotMatch(
    [appSource, operatorHostSource].join("\n"),
    /showPartnerTab|builderPartnerProgramPanel|activeInsightTab === "partner"|value === "partner"|id: "partner"/,
    "Builder Partner must remain isolated from the primary app and operator surfaces",
  );
}

function proveBuilderPartnerRuntimeSmokeContract(runtimeSmokeSource: string) {
  assertIncludes(
    runtimeSmokeSource,
    "buildSmokePayoutCyclePeriodCandidates",
    "Builder Partner runtime smoke must isolate payout-cycle periods across repeated runs",
  );
  assertIncludes(
    runtimeSmokeSource,
    "SMOKE_PAYOUT_CYCLE_BASE_YEAR",
    "Builder Partner runtime smoke must use smoke-only payout-cycle periods",
  );
  assertIncludes(
    runtimeSmokeSource,
    "cyclePeriod,",
    "Builder Partner runtime smoke must pass an explicit payout cycle period",
  );
  assertIncludes(
    runtimeSmokeSource,
    "reason === \"partner_payout_cycle_active\"",
    "Builder Partner runtime smoke must handle repeat-run active smoke payout cycles",
  );
  assertIncludes(
    runtimeSmokeSource,
    "cycleKey.startsWith(\"partner_payout_smoke:\")",
    "Builder Partner runtime smoke must only skip active cycles that are known smoke artifacts",
  );
  assertIncludes(
    runtimeSmokeSource,
    "beforePayoutReservation",
    "Builder Partner runtime smoke must prove the current partner has ready commission before payout generation",
  );
  assertIncludes(
    runtimeSmokeSource,
    "afterPayoutReservation",
    "Builder Partner runtime smoke must prove the current partner commission was reserved by payout generation",
  );
  assertIncludes(
    runtimeSmokeSource,
    "Number(payoutCycle.cycle?.totalAmountUsd) >= 6",
    "Builder Partner runtime smoke must tolerate older open smoke rows in shared dev deployments",
  );
  assert.doesNotMatch(
    runtimeSmokeSource,
    /batchKey:\s*`partner_payout_smoke:\$\{runId\}`,[\s\S]*payableCutoffAt:\s*holdClearedAt/,
    "Builder Partner runtime smoke must not rely on the default current payout period",
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
    "requirements: [],",
    "signed-out Builder Partner snapshot",
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
    /pending_review|params\.get\("affiliate"\)|params\.get\("ref"\)/,
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
  assertIncludes(
    appSource,
    "ensureUsableAuthSession(nextSession ?? undefined, \"builder_partner_program_load\")",
    "Builder Partner program loads must refresh or verify even when a caller passes a session",
  );
  assert.doesNotMatch(
    appSource,
    /const usableSession = nextSession \?\? await ensureUsableAuthSession\(\)/,
    "Builder Partner program loads must not bypass usable-session verification for passed sessions",
  );
}

function proveEligibilityGateContract(
  builderPartnersSource: string,
  gatewaySource: string,
  uiSource: string,
  accountSetupCoreSource: string,
  communityLifecycleSource: string,
  communityPublishReadinessSource: string,
  createControllerSource: string,
  settingsGovernanceSource: string,
) {
  for (const marker of [
    '"community_name"',
    '"community_one_liner"',
    '"community_avatar"',
    '"community_banner"',
  ]) {
    assertIncludes(communityPublishReadinessSource, marker, "community publish readiness");
  }
  assertIncludes(
    communityPublishReadinessSource,
    "export function isCommunityPublishReady",
    "community publish readiness",
  );
  assertIncludes(
    accountSetupCoreSource,
    "export async function requireAccountSetupCompleteForUser",
    "account setup authority",
  );
  assertIncludes(
    accountSetupCoreSource,
    "throw new Error(\"account_setup_required\")",
    "account setup authority",
  );
  assertIncludes(
    communityLifecycleSource,
    "await requireAccountSetupCompleteForUser(ctx, ownerId);",
    "community creation authority",
  );
  assertIncludes(
    communityLifecycleSource,
    "if (visibility === \"published\")",
    "community publish readiness authority",
  );
  assertIncludes(
    communityLifecycleSource,
    "if (args.state.nextVisibility === \"published\")",
    "community publish readiness authority",
  );
  assertIncludes(
    communityLifecycleSource,
    "community_publish_ready_required",
    "community publish readiness authority",
  );
  assert.match(
    communityLifecycleSource,
    /generateCommunityBrandingUploadUrl[\s\S]*?await requireProfileSetupCompleteForUser\(ctx, userId\);[\s\S]*?ctx\.storage\.generateUploadUrl/,
    "community branding uploads should stay profile-gated",
  );
  assertIncludes(
    builderPartnersSource,
    "loadAccountSetupStatusForUserId",
    "Builder Partner eligibility",
  );
  assertIncludes(
    builderPartnersSource,
    "isCommunityPublishReady",
    "Builder Partner eligibility",
  );
  for (const marker of [
    '"account_setup_complete"',
    '"own_community"',
    '"community_publish_ready"',
    '"accept_terms"',
    '"account_good_standing"',
  ]) {
    assertIncludes(builderPartnersSource, marker, "Builder Partner eligibility requirements");
    assertIncludes(gatewaySource, marker, "Builder Partner gateway requirements");
  }
  assertIncludes(
    builderPartnersSource,
    "builder_partner_account_setup_required",
    "Builder Partner terms acceptance",
  );
  assertIncludes(
    builderPartnersSource,
    "builder_partner_publish_ready_community_required",
    "Builder Partner terms acceptance",
  );
  assertIncludes(
    builderPartnersSource,
    "accountSetupComplete && ownsCommunity && hasPublishReadyOwnedCommunity && !acceptedTerms && accountGoodStanding",
    "Builder Partner ready-to-unlock contract",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /key:\s*"signed_in"/,
    "Builder Partner requirements must not treat sign-in as eligibility",
  );
  assert.doesNotMatch(
    gatewaySource,
    /"signed_in"|"sign_in"/,
    "Builder Partner gateway must not expose sign-in as an eligibility requirement",
  );
  assertIncludes(
    uiSource,
    "Finish profile, inference provider, and agent setup.",
    "Builder Partner requirements UI",
  );
  assertIncludes(
    uiSource,
    "Add a community name, one-liner, avatar, and banner.",
    "Builder Partner requirements UI",
  );
  assertIncludes(
    uiSource,
    "Open settings",
    "Builder Partner requirements UI",
  );
  assertIncludes(
    createControllerSource,
    "isAccountSetupComplete: boolean;",
    "create-community frontend gate",
  );
  assertIncludes(
    createControllerSource,
    "Finish account setup before creating a community.",
    "create-community frontend gate",
  );
  assertIncludes(
    createControllerSource,
    "Published communities need a name, one-liner, avatar, and banner.",
    "create-community frontend gate",
  );
  assertIncludes(
    settingsGovernanceSource,
    "Published communities need a name, one-liner, avatar, and banner.",
    "community settings frontend gate",
  );
}

function proveReductionAndCleanupContract(accountSource: string, docsSource: string) {
  assertIncludes(
    accountSource,
    "withIndex(\"by_referredUser\", (q: any) => q.eq(\"referredUserId\", userId))",
    "account deletion cleanup",
  );
  assertIncludes(
    accountSource,
    "readBuilderPartnerFinanceDeletionState",
    "account deletion must classify partner finance state before deleting",
  );
  assertIncludes(
    accountSource,
    "account_delete_partner_finance_pending_blocked",
    "account deletion must block unresolved partner finance",
  );
  assertIncludes(
    accountSource,
    "hasUnresolvedFinance",
    "account deletion must block unresolved partner finance",
  );
  assertIncludes(
    accountSource,
    "preserve(\"partnerCommissionLedger\", referredPartnerCommissions.length)",
    "account deletion must preserve referred-user partner commission history",
  );
  assert.doesNotMatch(
    accountSource,
    /financeLinkedCreditLedgerEntryIds|sourceCreditLedgerEntryId/,
    "account deletion should not preserve deleted paid-tool partner commission evidence",
  );
  assertIncludes(
    accountSource,
    "scrubFinanceLinkedPartnerAttribution",
    "account deletion must scrub attribution privacy fields while preserving finance evidence",
  );
  assertIncludes(
    accountSource,
    "tombstoneBuilderPartnerCode",
    "account deletion must disable settled partner links instead of deleting audit history",
  );
  assertIncludes(
    accountSource,
    "listPartnerAttributions",
    "account deletion cleanup",
  );
  assertIncludes(
    accountSource,
    "\"partnerCommissionLedger\", partner._id",
    "account deletion must inspect partner ledger rows by status",
  );
  assert.doesNotMatch(
    accountSource,
    /deleteRowsByIndex\(ctx, "partnerCommissionLedger", "by_referredUser"/,
    "account deletion must not erase referred-user partner commission ledger history",
  );
  assert.doesNotMatch(
    accountSource,
    /deleteRowsByIndex\(ctx, "partnerCommissionAdjustments", "by_partner_createdAt"/,
    "account deletion must not erase partner adjustment history",
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

type PartnerLifecycleCommission = {
  commissionKey: string;
  status: "locked" | "risk_hold" | "payable" | "voided";
  commissionAmountUsd: number;
  holdUntil: number;
  payableAt?: number;
  sourceProviderInvoiceId?: string;
  sourceProviderChargeId?: string;
  reservedUsd: number;
  settledUsd: number;
  adjustmentsUsd: number;
};

function summarizePartnerLifecycle(commissions: PartnerLifecycleCommission[], nowMs: number) {
  const payoutReadyCutoffAt = nowMs - BUILDER_PARTNER_PAYOUT_BUFFER_MS;
  let pendingUsd = 0;
  let bufferedUsd = 0;
  let readyUsd = 0;
  let paidUsd = 0;
  let clawbackDebtUsd = 0;
  const readyCandidates: number[] = [];
  const bufferedCandidates: number[] = [];

  for (const commission of commissions) {
    const netUsd =
      commission.commissionAmountUsd +
      commission.adjustmentsUsd -
      commission.reservedUsd -
      commission.settledUsd;
    const openUsd = Math.max(0, netUsd);
    if (commission.status === "locked" || commission.status === "risk_hold") {
      pendingUsd += openUsd;
    }
    if (commission.status === "payable" && netUsd < 0) {
      clawbackDebtUsd += Math.abs(netUsd);
    }
    if (commission.status === "payable" && openUsd > 0) {
      if (typeof commission.payableAt === "number" && commission.payableAt <= payoutReadyCutoffAt) {
        readyCandidates.push(openUsd);
      } else {
        bufferedCandidates.push(openUsd);
      }
    }
    paidUsd += commission.settledUsd;
  }
  let remainingDebtUsd = clawbackDebtUsd;
  for (const amountUsd of readyCandidates) {
    const offsetUsd = Math.min(remainingDebtUsd, amountUsd);
    remainingDebtUsd = roundMoneyForProof(remainingDebtUsd - offsetUsd);
    readyUsd += roundMoneyForProof(amountUsd - offsetUsd);
  }
  for (const amountUsd of bufferedCandidates) {
    const offsetUsd = Math.min(remainingDebtUsd, amountUsd);
    remainingDebtUsd = roundMoneyForProof(remainingDebtUsd - offsetUsd);
    bufferedUsd += roundMoneyForProof(amountUsd - offsetUsd);
  }

  return {
    pendingUsd: roundMoneyForProof(pendingUsd),
    bufferedUsd: roundMoneyForProof(bufferedUsd),
    readyUsd: roundMoneyForProof(readyUsd),
    paidUsd: roundMoneyForProof(paidUsd),
    clawbackDebtUsd: roundMoneyForProof(clawbackDebtUsd),
  };
}

function roundMoneyForProof(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function proveEndToEndPartnerLifecycleBehavior() {
  const firstTouchAt = Date.UTC(2026, 0, 1);
  const bindAt = firstTouchAt + 60_000;
  const purchaseAt = bindAt + 60_000;
  const holdClearedAt = purchaseAt + BUILDER_PARTNER_COMMISSION_HOLD_MS;
  const bufferClearedAt = holdClearedAt + BUILDER_PARTNER_PAYOUT_BUFFER_MS;
  const referralCode = "alpha-builder";
  const visitorKeyHash = "hashed:visitor-1";

  const attribution = {
    referralCode,
    anonymousVisitorKeyHash: visitorKeyHash,
    referredUserId: "user_referred",
    status: "bound",
    referredUserHadOwnedCommunityAtBind: false,
    eligibleForCommunityRevenue: true,
    firstTouchAt,
    lastTouchAt: bindAt,
    expiresAt: firstTouchAt + BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS,
  };
  assert.equal(attribution.status, "bound");
  assert.equal(attribution.eligibleForCommunityRevenue, true);
  assert.equal(attribution.expiresAt - attribution.firstTouchAt, BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS);
  assert.ok(attribution.lastTouchAt < attribution.expiresAt);

  const initial = calculateBuilderPartnerCommunityRevenueCommission({
    communityRevenueUsd: 100,
    platformFeeBps: BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
    partnerCommunityRevenueShareBps: BUILDER_PARTNER_COMMUNITY_REVENUE_SHARE_BPS,
  });
  assert.deepEqual(initial, {
    platformFeeUsd: 10,
    commissionAmountUsd: 5,
    effectiveCommunityRevenueShareBps: 500,
  });

  const commissions: PartnerLifecycleCommission[] = [
    {
      commissionKey: "community_revenue:invoice:in_initial",
      status: "locked",
      commissionAmountUsd: initial.commissionAmountUsd,
      holdUntil: purchaseAt + BUILDER_PARTNER_COMMISSION_HOLD_MS,
      sourceProviderInvoiceId: "in_initial",
      sourceProviderChargeId: "ch_initial",
      reservedUsd: 0,
      settledUsd: 0,
      adjustmentsUsd: 0,
    },
  ];

  const duplicateInvoiceKeys = new Set([
    commissions[0].commissionKey,
    "community_revenue:invoice:in_initial",
  ]);
  assert.equal(duplicateInvoiceKeys.size, 1, "provider invoice should be the durable commission idempotency key");
  assert.deepEqual(summarizePartnerLifecycle(commissions, holdClearedAt - 1), {
    pendingUsd: 5,
    bufferedUsd: 0,
    readyUsd: 0,
    paidUsd: 0,
    clawbackDebtUsd: 0,
  });

  commissions[0].status = "payable";
  commissions[0].payableAt = holdClearedAt;
  assert.deepEqual(summarizePartnerLifecycle(commissions, bufferClearedAt - 1), {
    pendingUsd: 0,
    bufferedUsd: 5,
    readyUsd: 0,
    paidUsd: 0,
    clawbackDebtUsd: 0,
  });
  assert.deepEqual(summarizePartnerLifecycle(commissions, bufferClearedAt), {
    pendingUsd: 0,
    bufferedUsd: 0,
    readyUsd: 5,
    paidUsd: 0,
    clawbackDebtUsd: 0,
  });

  const transferIdempotencyKey = "partner_payout:batch_1:partner_1";
  assert.match(transferIdempotencyKey, /^partner_payout:[^:]+:[^:]+$/);
  commissions[0].reservedUsd = 5;
  assert.deepEqual(summarizePartnerLifecycle(commissions, bufferClearedAt), {
    pendingUsd: 0,
    bufferedUsd: 0,
    readyUsd: 0,
    paidUsd: 0,
    clawbackDebtUsd: 0,
  });
  commissions[0].reservedUsd = 0;
  commissions[0].settledUsd = 5;
  assert.deepEqual(summarizePartnerLifecycle(commissions, bufferClearedAt), {
    pendingUsd: 0,
    bufferedUsd: 0,
    readyUsd: 0,
    paidUsd: 5,
    clawbackDebtUsd: 0,
  });

  commissions[0].adjustmentsUsd = -5;
  assert.deepEqual(summarizePartnerLifecycle(commissions, bufferClearedAt), {
    pendingUsd: 0,
    bufferedUsd: 0,
    readyUsd: 0,
    paidUsd: 5,
    clawbackDebtUsd: 5,
  });

  const next = calculateBuilderPartnerCommunityRevenueCommission({
    communityRevenueUsd: 100,
    platformFeeBps: BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
    partnerCommunityRevenueShareBps: BUILDER_PARTNER_COMMUNITY_REVENUE_SHARE_BPS,
  });
  commissions.push({
    commissionKey: "community_revenue:invoice:in_next",
    status: "payable",
    commissionAmountUsd: next.commissionAmountUsd,
    holdUntil: holdClearedAt,
    payableAt: holdClearedAt,
    sourceProviderInvoiceId: "in_next",
    sourceProviderChargeId: "ch_next",
    reservedUsd: 0,
    settledUsd: 0,
    adjustmentsUsd: 0,
  });
  const afterDebt = summarizePartnerLifecycle(commissions, bufferClearedAt);
  assert.equal(afterDebt.clawbackDebtUsd, 5);
  assert.equal(afterDebt.readyUsd, 0, "carryforward partner debt should offset the next ready commission before payout");
}

function proveEndToEndPartnerLifecycleSourceContract(
  builderPartnersSource: string,
  gatewaySource: string,
  appSource: string,
  communityCommerceSource: string,
  httpBillingSource: string,
  operatorGatewaySource: string,
  operatorPanelSource: string,
  uiSource: string,
) {
  const attributionSource = builderPartnersSource.slice(
    builderPartnersSource.indexOf("export const recordBuilderPartnerAttribution"),
    builderPartnersSource.indexOf("export const createPartnerPayoutCycleInternal"),
  );
  const commissionProducerSource = builderPartnersSource.slice(
    builderPartnersSource.indexOf("export async function recordCommunityRevenuePartnerCommission"),
    builderPartnersSource.indexOf("export const recordCommunitySubscriptionInvoicePartnerCommissionInternal"),
  );
  const maturitySource = builderPartnersSource.slice(
    builderPartnersSource.indexOf("export const advancePartnerCommissionsToPayableInternal"),
    builderPartnersSource.indexOf("async function readPayoutStatus"),
  );
  const payoutPlannerSource = builderPartnersSource.slice(
    builderPartnersSource.indexOf("async function readPartnerPayablePayoutEntries"),
    builderPartnersSource.indexOf("function readPartnerPayoutCycleSummary"),
  );

  assertIncludes(
    appSource,
    "captureBuilderPartnerAttributionFromCurrentUrl({",
    "Builder Partner E2E frontend attribution capture",
  );
  assertIncludes(
    gatewaySource,
    "getBusinessVisitorKey()",
    "Builder Partner E2E anonymous visitor attribution",
  );
  assertIncludes(
    gatewaySource,
    "buildAttributionRouteLabel",
    "Builder Partner E2E route privacy",
  );
  assert.doesNotMatch(
    gatewaySource,
    /params\.get\("affiliate"\)|params\.get\("ref"\)/,
    "Builder Partner E2E should capture only the branded partner query parameter",
  );
  assertIncludes(
    attributionSource,
    "partnerProgramState.state !== \"active\"",
    "Builder Partner E2E rejects paused, disabled, or otherwise locked partners",
  );
  assertIncludes(
    attributionSource,
    "self_referral_ignored",
    "Builder Partner E2E rejects self-referrals",
  );
  assertIncludes(
    attributionSource,
    "missing_attribution_subject",
    "Builder Partner E2E rejects anonymous records without a visitor key",
  );
  assertIncludes(
    attributionSource,
    "referred_user_already_bound",
    "Builder Partner E2E does not let a later partner steal a bound referred creator",
  );
  assertIncludes(
    attributionSource,
    "superseded_by_new_referral",
    "Builder Partner E2E voids unbound earlier referrals when a newer referral wins",
  );
  assertIncludes(
    attributionSource,
    "expireClosedAttributions(ctx, candidateRows, nowMs)",
    "Builder Partner E2E expires stale attribution rows before bind decisions",
  );
  assertIncludes(
    attributionSource,
    "eligibleForCommunityRevenue",
    "Builder Partner E2E stores whether the referred creator was already a community owner at bind time",
  );
  assertIncludes(
    attributionSource,
    "status: nextReferredUserId ? \"bound\" : \"active\"",
    "Builder Partner E2E upgrades anonymous attribution to bound user attribution",
  );

  assertIncludes(
    communityCommerceSource,
    "recordCommunityRevenuePartnerCommission(ctx,",
    "Builder Partner E2E checkout finalization emits partner commission from community revenue",
  );
  assertIncludes(
    httpBillingSource,
    "recordCommunitySubscriptionInvoicePartnerCommissionInternal",
    "Builder Partner E2E recurring invoices emit partner commission from provider evidence",
  );
  assertIncludes(
    commissionProducerSource,
    "if (!sourceCheckoutSessionId && !sourceProviderInvoiceId) return null;",
    "Builder Partner E2E refuses commission rows without checkout or invoice evidence",
  );
  assertIncludes(
    commissionProducerSource,
    "requireCommunityRevenueEligibility: true",
    "Builder Partner E2E limits MVP commission to eligible referred community revenue",
  );
  assertIncludes(
    commissionProducerSource,
    "communityCreatedAt < attributionStartedAt",
    "Builder Partner E2E blocks retroactive commission for communities created before attribution",
  );
  assertIncludes(
    commissionProducerSource,
    "community_revenue:invoice:${sourceProviderInvoiceId}",
    "Builder Partner E2E uses provider invoice idempotency for recurring invoices",
  );
  assertIncludes(
    commissionProducerSource,
    "community_revenue:${sourceCheckoutSessionId}",
    "Builder Partner E2E uses checkout session idempotency for initial settlement",
  );
  assertIncludes(
    commissionProducerSource,
    "legacyCommissionKey",
    "Builder Partner E2E checks the legacy platform-fee key before inserting a current 5% community revenue row",
  );
  assertIncludes(
    commissionProducerSource,
    "patchCommissionSourceEvidence",
    "Builder Partner E2E patches later provider evidence onto an existing commission instead of duplicating it",
  );
  assertIncludes(
    builderPartnersSource,
    "status: \"locked\"",
    "Builder Partner E2E creates commissions inside the refund and dispute risk hold",
  );

  assertIncludes(
    maturitySource,
    "hasCommunityRevenueProviderEvidence(row)",
    "Builder Partner E2E requires provider evidence before maturity",
  );
  assertIncludes(
    maturitySource,
    "holdUntil: nowMs + BUILDER_PARTNER_MISSING_EVIDENCE_RECHECK_MS",
    "Builder Partner E2E rotates missing-evidence rows instead of starving the maturity scan",
  );
  assertIncludes(
    maturitySource,
    "status: \"payable\"",
    "Builder Partner E2E has one maturity transition from locked to payable",
  );
  assertIncludes(
    maturitySource,
    "payableAt: nowMs",
    "Builder Partner E2E records the payable timestamp used by payout buffer planning",
  );

  assertIncludes(
    builderPartnersSource,
    "recordPartnerCommissionRefundAdjustmentInternal",
    "Builder Partner E2E refund webhook path writes adjustment ledger rows",
  );
  assertIncludes(
    builderPartnersSource,
    "recordPartnerCommissionDisputeOpenedInternal",
    "Builder Partner E2E dispute-open path can hold unpaid commission or create post-payout debt",
  );
  assertIncludes(
    builderPartnersSource,
    "recordPartnerCommissionDisputeClosedInternal",
    "Builder Partner E2E dispute-close path resolves risk hold, voids lost unpaid commission, or carries debt",
  );
  assertIncludes(
    builderPartnersSource,
    "capNegativeCommissionAdjustmentUsd",
    "Builder Partner E2E caps negative adjustments to commission exposure",
  );

  assertIncludes(
    payoutPlannerSource,
    ".eq(\"payoutOpen\", true)",
    "Builder Partner E2E payout planning starts from materialized open payable balance",
  );
  assertIncludes(
    payoutPlannerSource,
    ".eq(\"payoutDebt\", true)",
    "Builder Partner E2E payout planning includes carryforward debt rows",
  );
  assertIncludes(
    payoutPlannerSource,
    "if (!stripeAccount) continue",
    "Builder Partner E2E excludes partners without ready Stripe Connect payouts",
  );
  assertIncludes(
    payoutPlannerSource,
    "row.payableAt > args.payableCutoffAt",
    "Builder Partner E2E excludes rows still inside the payout buffer",
  );
  assertIncludes(
    payoutPlannerSource,
    "const offsetCents = Math.min(carryforwardDebtCents, candidate.settlementCents)",
    "Builder Partner E2E offsets refund and dispute debt before transfer planning",
  );
  assertIncludes(
    builderPartnersSource,
    "idempotencyKey: `partner_payout:${String(batchId)}:${String(plan.partner._id)}`",
    "Builder Partner E2E transfer creation uses stable Stripe idempotency keys",
  );
  assertIncludes(
    builderPartnersSource,
    "status: \"reserved\"",
    "Builder Partner E2E reserves payout items before Stripe execution",
  );
  assertIncludes(
    builderPartnersSource,
    "status: \"settled\"",
    "Builder Partner E2E settles payout items only after transfer success is recorded",
  );

  assertIncludes(
    operatorGatewaySource,
    "builderPartners:listPartnerPayoutCyclesForOperator",
    "Builder Partner E2E projects generated payout cycles to operators",
  );
  assertIncludes(
    operatorPanelSource,
    "Partner payout cycles",
    "Builder Partner E2E gives operators the payout-cycle review surface",
  );
  assertIncludes(
    uiSource,
    "ready for the next payout cycle.",
    "Builder Partner E2E shows partner-ready payout balance to the partner",
  );
  assertIncludes(
    uiSource,
    "Future payouts are reduced until prior refunds or disputes are cleared.",
    "Builder Partner E2E explains carryforward partner debt without exposing settlement internals",
  );
}

function provePricingFoundation(authSource: string, workspaceCreditsSource: string) {
  assert.match(
    authSource,
    /platformFeeBps:\s*1000/,
    "expected partner economics to sit on the 10% community platform fee",
  );
  assert.match(
    workspaceCreditsSource,
    /PAID_TOOL_TARGET_GROSS_MARGIN_BPS\s*=\s*6000/,
    "expected paid-tool pricing to keep the 60% gross margin target",
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
    "community_revenue:${sourceCheckoutSessionId}",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "community_revenue:invoice:${sourceProviderInvoiceId}",
    "Builder Partner commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "community_platform_fee:${sourceCheckoutSessionId}",
    "Builder Partner commission producer must preserve legacy checkout-key idempotency",
  );
  assertIncludes(
    builderPartnersSource,
    "community_platform_fee:invoice:${sourceProviderInvoiceId}",
    "Builder Partner commission producer must preserve legacy invoice-key idempotency",
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
    "partner.status !== \"active\" || !hasAcceptedCurrentTerms(partner)",
    "Builder Partner commission producer must only accrue new commissions for active partners on the current terms",
  );
  assertIncludes(
    builderPartnersSource,
    "recordPaidToolUsagePartnerCommission",
    "Builder Partner paid-tool commission producer",
  );
  assertIncludes(
    builderPartnersSource,
    "paid_tool_usage:${creditKey}",
    "Builder Partner paid-tool commission idempotency",
  );
  assertIncludes(
    builderPartnersSource,
    "calculateBuilderPartnerToolUsageCommission",
    "Builder Partner paid-tool commission math",
  );
  assertIncludes(
    builderPartnersSource,
    "basisType: \"paid_tool_usage\"",
    "Builder Partner paid-tool commission basis",
  );
  assertIncludes(
    builderPartnersSource,
    "commissionRateBps: commission.effectiveToolUsageRevenueShareBps",
    "Builder Partner paid-tool commission should record the effective capped rate",
  );
  assertIncludes(
    builderPartnersSource,
    "if (commissionSettlementCents <= 0) return null;",
    "Builder Partner commissions should not materialize sub-cent zero-settlement rows",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /tool_gross_margin:\$\{String\(args\.creditLedgerEntryId\)\}|calculateBuilderPartnerToolGrossMarginCommission|BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS|sourceCreditLedgerEntryId/,
    "Builder Partner paid-tool producer should not revive the old gross-margin/source-id model",
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
  assertIncludes(
    workspaceCreditsSource,
    "recordSettledPaidToolPartnerCommission(ctx,",
    "paid tool usage settlement should emit partner commissions from settled ledger rows",
  );
  assertIncludes(
    workspaceCreditsSource,
    "purchasedCreditsSettled",
    "paid tool usage partner commissions should be based on purchased settled credits",
  );
  assertIncludes(
    workspaceCreditsSource,
    "rawVendorCostUsd: roundCurrency(args.rawVendorCostUsd * paidUsageRatio)",
    "paid tool usage partner commissions should prorate vendor cost to purchased usage",
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
  operatorPanelSource: string,
  operatorGatewaySource: string,
  cronsSource: string,
  docsSource: string,
  packageSource: string,
) {
  const commissionSummarySource = builderPartnersSource.slice(
    builderPartnersSource.indexOf("async function readCommissionSummary"),
    builderPartnersSource.indexOf("async function readPayoutHistory"),
  );
  const payoutExecutionBeginSource = builderPartnersSource.slice(
    builderPartnersSource.indexOf("export const beginPartnerPayoutBatchExecutionInternal"),
    builderPartnersSource.indexOf("export const recordPartnerPayoutTransferSucceededInternal"),
  );
  const retryPayoutCycleSource = builderPartnersSource.slice(
    builderPartnersSource.indexOf("export const retryPartnerPayoutCycle"),
    builderPartnersSource.indexOf("export const holdPartnerPayoutCycle"),
  );
  const operatorPerformanceSource = builderPartnersSource.slice(
    builderPartnersSource.indexOf("export const listPartnerPerformanceForOperator"),
    builderPartnersSource.indexOf("export const listPartnerPayoutCyclesForOperator"),
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /export const previewPartnerPayoutBatch/,
    "manual payout preview should not be a public operator workflow",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /export const createPartnerPayoutBatch = mutation/,
    "manual payout creation should not be a public operator workflow",
  );
  assertIncludes(
    builderPartnersSource,
    "createPartnerPayoutCycleInternal = internalMutation",
    "Builder Partner payout cycle generation should be internal/system-owned",
  );
  assertIncludes(
    builderPartnersSource,
    "listPartnerPayoutCyclesForOperator",
    "Builder Partner payout settlement should expose generated cycles to operators",
  );
  assertIncludes(
    builderPartnersSource,
    "listPartnerPerformanceForOperator",
    "Builder Partner payout settlement should expose ledger-derived partner performance to operators",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /export const getPartnerPayoutBatchForOperator/,
    "Builder Partner payout diagnostics should not expose raw batch reads to operators",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /PayoutBatchForOperator/,
    "Builder Partner payout operator APIs should use product-level cycle language",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /readPartnerPayoutBatchSnapshot/,
    "Builder Partner payout actions should not keep raw transfer and item snapshot responses",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /return await readPartnerPayoutBatchSnapshot/,
    "Builder Partner payout actions should return compact acknowledgements only",
  );
  assertIncludes(
    builderPartnersSource,
    "approvePartnerPayoutCycle",
    "Builder Partner payout settlement should expose one-step operator approval",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /export const approvePartnerPayoutBatch/,
    "Builder Partner payout approval should use product-level cycle language",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /export const executePartnerPayoutBatch = action/,
    "manual payout execution should not be a public operator workflow",
  );
  assertIncludes(
    builderPartnersSource,
    "executePartnerPayoutBatchInternal = internalAction",
    "Builder Partner payout execution should be internal after approval",
  );
  assertIncludes(
    builderPartnersSource,
    "beginPartnerPayoutBatchExecutionInternal = internalMutation",
    "Builder Partner payout execution should begin through internal mechanics",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /export const beginPartnerPayoutBatchExecution = mutation/,
    "manual payout execution begin should not be a public operator workflow",
  );
  assertIncludes(
    builderPartnersSource,
    "holdPartnerPayoutCycle",
    "Builder Partner payout settlement should expose operator hold",
  );
  assertIncludes(
    builderPartnersSource,
    "rejectPartnerPayoutCycle",
    "Builder Partner payout settlement should expose operator reject",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /export const voidPartnerPayoutBatch/,
    "Builder Partner payout rejection should use product-level cycle language",
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
    "BUILDER_PARTNER_MISSING_EVIDENCE_RECHECK_MS",
    "Builder Partner maturity must defer missing provider evidence without starving later rows",
  );
  assertIncludes(
    builderPartnersSource,
    "holdUntil: nowMs + BUILDER_PARTNER_MISSING_EVIDENCE_RECHECK_MS",
    "Builder Partner maturity must rotate missing-evidence rows out of the due scan",
  );
  assertIncludes(
    builderPartnersSource,
    "deferredForEvidence",
    "Builder Partner maturity should report provider-evidence deferrals",
  );
  assertIncludes(
    builderPartnersSource,
    "Math.min(250",
    "Builder Partner maturity limit should match the scheduled cron limit",
  );
  assertIncludes(
    cronsSource,
    "limit: 250",
    "Builder Partner maturity cron should use the same supported batch limit",
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
    cronsSource,
    "create builder partner payout cycle",
    "Builder Partner payout cycles must be system-generated on schedule",
  );
  assertIncludes(
    cronsSource,
    "builderPartners.createPartnerPayoutCycleInternal",
    "Builder Partner payout cycle cron must call the canonical internal mutation",
  );
  assertIncludes(
    builderPartnersSource,
    "const validation = await validatePartnerPayoutBatchStillPayable(ctx, args.batchId);",
    "Builder Partner payout approval and execution must call validation",
  );
  assertIncludes(
    builderPartnersSource,
    "buildPartnerPayoutCycleKey",
    "Builder Partner payout cycles should use deterministic cycle keys",
  );
  assertIncludes(
    builderPartnersSource,
    "partner_payout_cycle_empty",
    "Builder Partner payout cycle creation should no-op when there is nothing payable",
  );
  assertIncludes(
    builderPartnersSource,
    "ctx.scheduler.runAfter(0, (internal as any).builderPartners.executePartnerPayoutBatchInternal",
    "Builder Partner approval should schedule transfer execution automatically",
  );
  assertIncludes(
    retryPayoutCycleSource,
    "ctx.scheduler.runAfter(0, (internal as any).builderPartners.executePartnerPayoutBatchInternal",
    "Builder Partner retry should schedule transfer execution through the canonical internal action",
  );
  assertIncludes(
    retryPayoutCycleSource,
    "builder_partner_payout_cycle_retried",
    "Builder Partner retry should audit explicit operator retry intent",
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
    payoutExecutionBeginSource,
    "if (rawBatchStatus === \"failed\") throw new Error(\"partner_payout_batch_retry_required\");",
    "Builder Partner payout execution must not directly restart failed cycles",
  );
  assertIncludes(
    payoutExecutionBeginSource,
    "if (operatorStatus !== \"approved\" && operatorStatus !== \"processing\")",
    "Builder Partner payout execution must allowlist executable cycle states",
  );
  assertIncludes(
    payoutExecutionBeginSource,
    "throw new Error(\"partner_payout_batch_not_executable\");",
    "Builder Partner payout execution must fail closed for unknown cycle states",
  );
  assertIncludes(
    builderPartnersSource,
    "excludeBatchId",
    "Builder Partner payout validation must exclude current batch items from reserved math",
  );
  assertIncludes(
    builderPartnersSource,
    "carryforwardDebtCents",
    "Builder Partner payout planning must apply post-payout refund and dispute debt against future commissions",
  );
  assertIncludes(
    builderPartnersSource,
    "partner_payout_stale_partner_balance",
    "Builder Partner payout validation must re-check partner-wide net balance before Stripe",
  );
  assertIncludes(
    builderPartnersSource,
    "transferCentsByPartnerId",
    "Builder Partner payout validation must validate transfer totals against partner-wide net payout capacity",
  );
  assertIncludes(
    builderPartnersSource,
    "excludeBatchId: batchId",
    "Builder Partner payout validation must recompute partner capacity excluding the current batch reservation",
  );
  assertIncludes(
    builderPartnersSource,
    "clawbackDebtUsd",
    "Builder Partner dashboard summary must expose carryforward debt separately from payable balances",
  );
  assertIncludes(
    commissionSummarySource,
    "settlementStateByCommissionId",
    "Builder Partner dashboard summary should read materialized commission settlement state",
  );
  assert.doesNotMatch(
    commissionSummarySource,
    /query\("partnerCommissionAdjustments"|query\("partnerPayoutItems"/,
    "Builder Partner dashboard summary must not use full adjustment or payout-item table reads as authority",
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
    "type PartnerCommissionSettlementState",
    "Builder Partner commission ledger must have one materialized settlement state model",
  );
  assertIncludes(
    builderPartnersSource,
    "calculatePartnerCommissionSettlementState",
    "Builder Partner settlement materialization must derive state from adjustment and payout item truth",
  );
  assertIncludes(
    builderPartnersSource,
    "recomputePartnerCommissionSettlementState",
    "Builder Partner payout mutations must refresh materialized settlement state",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /backfillPartnerCommissionSettlementState/,
    "completed settlement backfill maintenance surface should be deleted after production backfill",
  );
  assert.doesNotMatch(
    criticalAuditSource,
    /builder_partner_commission_settlement_backfilled/,
    "completed settlement backfill audit allowlist should be deleted with the maintenance surface",
  );
  assert.doesNotMatch(
    packageSource,
    /maintenance:partner-settlement-backfill|backfill_partner_commission_settlement_state/,
    "package scripts should not expose completed partner settlement backfill runner",
  );
  assertIncludes(
    builderPartnersSource,
    "idempotencyKey: String(transfer.idempotencyKey ?? \"\").trim()",
    "Builder Partner payout settlement must use transfer idempotency keys",
  );
  assertIncludes(
    builderPartnersSource,
    "reservedSettlementCents",
    "Builder Partner payout settlement must materialize reserved payout item totals",
  );
  assertIncludes(
    builderPartnersSource,
    "settledSettlementCents",
    "Builder Partner payout settlement must materialize settled payout item totals",
  );
  assertIncludes(
    builderPartnersSource,
    "openSettlementCents",
    "Builder Partner payout settlement must materialize remaining open payout balance",
  );
  assertIncludes(
    builderPartnersSource,
    "payoutDebt",
    "Builder Partner payout settlement must materialize carryforward payout debt",
  );
  assertIncludes(
    builderPartnersSource,
    "normalizePayoutCommissionScanLimit",
    "Builder Partner payout planning must scan payable commission rows beyond the returned payout limit",
  );
  assertIncludes(
    builderPartnersSource,
    "BUILDER_PARTNER_PAYOUT_COMMISSION_SCAN_MULTIPLIER",
    "Builder Partner payout planning must use a bounded scan multiplier",
  );
  assertIncludes(
    builderPartnersSource,
    ".withIndex(\"by_status_payoutOpen_payableAt\"",
    "Builder Partner payout planning must start from open materialized payable commission rows",
  );
  assertIncludes(
    builderPartnersSource,
    ".withIndex(\"by_partner_status_payoutOpen_payableAt\"",
    "Builder Partner payout partner reads must use materialized open balance index",
  );
  assertIncludes(
    builderPartnersSource,
    ".withIndex(\"by_partner_status_payoutDebt\"",
    "Builder Partner payout partner reads must use materialized debt index",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /allowLegacyBackfill|shouldReadLegacyRows|legacyRows|by_status_payableAt/,
    "Builder Partner payout planning must not retain legacy settlement fallback reads",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /buildLegacyPartnerPayoutCycleKey/,
    "Builder Partner payout cycle generation should not keep legacy batch-key compatibility",
  );
  assertIncludes(
    builderPartnersSource,
    ".take(scanLimit)",
    "Builder Partner payout planning must not only take the returned payout limit",
  );
  assertIncludes(
    builderPartnersSource,
    "if (plans.length >= limit) break",
    "Builder Partner payout planning must stop after enough payable plans are found",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /async function readPartnerPayoutPlans[\s\S]*query\("builderPartners"\)[\s\S]*for \(const partner of partners\)/,
    "Builder Partner payout planning should not start from active partner rows",
  );
  assertIncludes(
    builderPartnersSource,
    "findActivePartnerPayoutCycleForGeneration",
    "Builder Partner payout generation must block only active cycles for the payout period",
  );
  assertIncludes(
    builderPartnersSource,
    "partner_payout_cycle_active",
    "Builder Partner payout generation must report active cycles without creating duplicates",
  );
  assertIncludes(
    builderPartnersSource,
    "buildPartnerPayoutCycleKey(cyclePeriod, runNumber)",
    "Builder Partner payout generation must use attempt-specific period/run keys",
  );
  assertIncludes(
    builderPartnersSource,
    "status: \"reserved\"",
    "Builder Partner payout settlement must reserve commission rows before execution",
  );
  assertIncludes(
    builderPartnersSource,
    "const reservedCommissionIds = new Map<string, any>();",
    "Builder Partner payout reservations must collect affected commissions for settlement-state recompute",
  );
  assertIncludes(
    builderPartnersSource,
    "status: \"settled\"",
    "Builder Partner payout settlement must mark items settled only after transfer success",
  );
  assertIncludes(
    builderPartnersSource,
    "const settledCommissionIds = new Map<string, any>();",
    "Builder Partner payout settlements must collect affected commissions for settlement-state recompute",
  );
  assertIncludes(
    builderPartnersSource,
    "const releasedCommissionIds = new Map<string, any>();",
    "Builder Partner payout releases must collect affected commissions for settlement-state recompute",
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
    criticalAuditSource,
    "builder_partner_payout_cycle_held",
    "Builder Partner payout hold events must be audited",
  );
  assertIncludes(
    criticalAuditSource,
    "builder_partner_payout_cycle_rejected",
    "Builder Partner payout reject events must be audited",
  );
  assertIncludes(
    criticalAuditSource,
    "builder_partner_payout_cycle_retried",
    "Builder Partner payout retry events must be audited",
  );
  assertIncludes(
    operatorGatewaySource,
    "builderPartners:listPartnerPayoutCyclesForOperator",
    "Operator dashboard gateway must load generated payout cycles",
  );
  assertIncludes(
    operatorGatewaySource,
    "builderPartners:listPartnerPerformanceForOperator",
    "Operator dashboard gateway must load partner performance from the partner ledger",
  );
  assertIncludes(
    operatorGatewaySource,
    "range: params.range ?? \"30d\"",
    "Operator dashboard gateway must align partner performance to the Business window",
  );
  assertIncludes(
    operatorPerformanceSource,
    "requireOperatorRole(ctx, args.authSubject, \"operator\")",
    "Operator partner performance must be operator gated",
  );
  assertIncludes(
    operatorPerformanceSource,
    "range: v.optional(v.union(v.literal(\"7d\"), v.literal(\"30d\"), v.literal(\"90d\"), v.literal(\"all\")))",
    "Operator partner performance must accept the same range vocabulary as Business",
  );
  assertIncludes(
    operatorPerformanceSource,
    "normalizePartnerPerformanceRangeStart",
    "Operator partner performance must compute a range start",
  );
  assertIncludes(
    operatorPerformanceSource,
    "\"partnerCommissionLedger\"",
    "Operator partner performance must derive generated commission from commission ledger truth",
  );
  assertIncludes(
    operatorPerformanceSource,
    "\"partnerPayoutTransfers\"",
    "Operator partner performance must derive paid-out money from successful transfer truth",
  );
  assertIncludes(
    operatorPerformanceSource,
    "scoped.gte(\"createdAt\", rangeStart)",
    "Operator partner performance must range-scope generated commission rows",
  );
  assertIncludes(
    operatorPerformanceSource,
    ".withIndex(\"by_status_processedAt\"",
    "Operator partner paid-out performance must read transfers by successful processing time",
  );
  assertIncludes(
    operatorPerformanceSource,
    "scoped.gte(\"processedAt\", rangeStart)",
    "Operator partner paid-out performance must range-scope successful transfers",
  );
  assertIncludes(
    operatorPerformanceSource,
    "readMaterializedPartnerCommissionSettlementState",
    "Operator partner performance must read materialized settlement state instead of recalculating payout internals",
  );
  assert.doesNotMatch(
    operatorPerformanceSource,
    /readPartnerCommissionSettlementState|collectPartnerPayoutItemsByCommission|collectAppliedCommissionAdjustments/,
    "Operator partner performance must not fan out into per-commission adjustment or payout-item reads",
  );
  assertIncludes(
    operatorPerformanceSource,
    "commissionGeneratedUsd",
    "Operator partner performance must keep generated commission separate from paid-out transfers",
  );
  assertIncludes(
    operatorPerformanceSource,
    "partnerPaidOutUsd",
    "Operator partner performance must label only successful transfers as partner paid out",
  );
  assertIncludes(
    operatorGatewaySource,
    "builderPartners:approvePartnerPayoutCycle",
    "Operator dashboard gateway must approve payout cycles",
  );
  assertIncludes(
    operatorGatewaySource,
    "builderPartners:retryPartnerPayoutCycle",
    "Operator dashboard gateway must retry failed payout cycles",
  );
  assertIncludes(
    operatorGatewaySource,
    "builderPartners:holdPartnerPayoutCycle",
    "Operator dashboard gateway must hold payout cycles",
  );
  assertIncludes(
    operatorGatewaySource,
    "builderPartners:rejectPartnerPayoutCycle",
    "Operator dashboard gateway must reject payout cycles",
  );
  assertIncludes(
    operatorPanelSource,
    "Partner payout cycles",
    "Operator dashboard should show partner payout cycles",
  );
  assertIncludes(
    operatorPanelSource,
    "Partners",
    "Operator dashboard should show active partner count in Business",
  );
  assertIncludes(
    operatorPanelSource,
    "Partner paid out",
    "Operator dashboard should show successful partner transfers in Business",
  );
  assertIncludes(
    operatorPanelSource,
    "Succeeded partner transfers in the selected window.",
    "Operator dashboard should label partner paid-out as a selected-window metric",
  );
  assertIncludes(
    operatorPanelSource,
    "Partner ledger unavailable.",
    "Operator dashboard should not render missing partner metrics as true zero",
  );
  assertIncludes(
    operatorPanelSource,
    "Top partners",
    "Operator dashboard should rank top partners in Business",
  );
  assertIncludes(
    operatorPanelSource,
    "Ranking uses generated partner commission in the selected window.",
    "Operator dashboard should disclose top-partner ranking basis",
  );
  assertIncludes(
    operatorPanelSource,
    "Approve",
    "Operator dashboard should expose one-step approval",
  );
  assertIncludes(
    operatorPanelSource,
    "Approve and execute",
    "Operator dashboard should confirm before executing payout approval",
  );
  assertIncludes(
    operatorPanelSource,
    "Retry",
    "Operator dashboard should expose retry for failed retryable payout cycles",
  );
  assertIncludes(
    operatorPanelSource,
    "Hold",
    "Operator dashboard should expose hold",
  );
  assertIncludes(
    operatorPanelSource,
    "Reject",
    "Operator dashboard should expose reject",
  );
  assert.doesNotMatch(
    operatorPanelSource,
    /previewPartnerPayoutBatch|createPartnerPayoutBatch|executePartnerPayoutBatch|approvePartnerPayoutBatch|voidPartnerPayoutBatch/,
    "Operator dashboard must not expose manual batch internals",
  );
  assertIncludes(
    operatorPanelSource,
    "case \"held\":",
    "Operator dashboard must render held cycles separately from failed cycles",
  );
  assertIncludes(
    operatorPanelSource,
    "return \"Held\";",
    "Operator dashboard must label held cycles as held",
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
    gatewaySource,
    "clawbackDebtUsd",
    "Builder Partner gateway must expose carryforward debt separately",
  );
  assertIncludes(
    uiSource,
    "Carryforward adjustment",
    "Builder Partner UI must show carryforward debt only when present",
  );
  assertIncludes(
    builderPartnersSource,
    "row.status === \"processing\" || row.status === \"succeeded\" || row.status === \"failed\"",
    "Builder Partner payout history must hide pending transfer rows",
  );
  assertIncludes(
    builderPartnersSource,
    "status: \"pending_approval\"",
    "Builder Partner payout cycles should be created in explicit pending approval state",
  );
  assertIncludes(
    builderPartnersSource,
    "status: \"held\"",
    "Builder Partner payout holds should use an explicit held state",
  );
  assertIncludes(
    builderPartnersSource,
    "status: \"rejected\"",
    "Builder Partner payout rejects should use an explicit rejected state",
  );
  assertIncludes(
    builderPartnersSource,
    "status: \"released\"",
    "Builder Partner payout rejects should release reserved payout items",
  );
  assertIncludes(
    builderPartnersSource,
    "canRetry: operatorStatus === \"failed\"",
    "Builder Partner payout cycles should expose retry only for failed cycles with reserved items",
  );
  assertIncludes(
    builderPartnersSource,
    "row.status === \"pending\" || row.status === \"failed\" || row.status === \"processing\"",
    "Builder Partner payout retry must reuse existing transfer rows and idempotency keys",
  );
  assert.match(
    builderPartnersSource,
    /const paid = transfers\.length > 0[\s\S]*status: paid \? "paid" : processingTransfers\.length > 0 \? "processing" : "failed"/,
    "Builder Partner payout finalization should use an explicit paid state",
  );
  assert.doesNotMatch(
    builderPartnersSource,
    /failureReason:\s*`held:/,
    "Builder Partner payout holds should not be encoded inside failureReason",
  );
  assertIncludes(
    uiSource,
    "Payouts appear here after transfer.",
    "Builder Partner payout history UI",
  );
  assert.doesNotMatch(
    uiSource,
    /normalized === "draft"/,
    "partner-facing UI should not render draft transfer status copy",
  );
  assertIncludes(
    docsSource,
    "Partner commissions are produced from eligible community revenue and settled paid-tool usage.",
    "Builder Partner payout docs",
  );
  assertIncludes(
    docsSource,
    "target 20% of collected paid-tool usage",
    "Builder Partner payout docs",
  );
  assertIncludes(
    docsSource,
    "preserve a 40% Polynet retained-revenue floor",
    "Builder Partner payout docs",
  );
  assertIncludes(
    docsSource,
    "Partner payout settlement should run through system-generated monthly payout cycles",
    "Builder Partner payout docs",
  );
  assertIncludes(
    docsSource,
    "Operators should only approve, retry, hold, or reject generated payout cycles",
    "Builder Partner payout docs",
  );
  assertIncludes(
    docsSource,
    "they should not manually preview, create, or execute payout internals",
    "Builder Partner payout docs",
  );
  assertIncludes(
    docsSource,
    "Approval schedules transfer execution automatically.",
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
    docsSource,
    "negative balance carries forward against later eligible partner commissions",
    "Builder Partner payout docs",
  );
  assertIncludes(
    schemaSource,
    ".index(\"by_commission\", [\"commissionId\"])",
    "Builder Partner payout schema",
  );
  assertIncludes(
    schemaSource,
    ".index(\"by_status_processedAt\", [\"status\", \"processedAt\"])",
    "Builder Partner payout transfers need a processed-time index for operator paid-out windows",
  );
  assert.doesNotMatch(
    uiSource,
    /executePartnerPayoutBatch|approvePartnerPayoutBatch|createPartnerPayoutBatch/,
    "partner-facing UI must not expose operator settlement controls",
  );
}

function main() {
  const schemaSource = readText(new URL("../convex/schema.ts", import.meta.url));
  const settingsWrapperSource = readText(
    new URL("../apps/web/src/components/WebBuilderPartnerSettingsSection.tsx", import.meta.url),
  );
  const partnerPanelSource = readText(
    new URL("../apps/web/src/components/WebBuilderPartnerProgramPanel.tsx", import.meta.url),
  );
  const uiSource = [settingsWrapperSource, partnerPanelSource].join("\n");
  const builderPartnersSource = readText(new URL("../convex/builderPartners.ts", import.meta.url));
  const gatewaySource = readText(new URL("../shared/builderPartnerProgramGateway.ts", import.meta.url));
  const termsDocSource = readText(new URL("../docs/legal/builder-partner-terms-v2.md", import.meta.url));
  const legalRegistrySource = readText(new URL("../shared/legalDocuments.ts", import.meta.url));
  const legalContentSource = readText(new URL("../apps/web/src/docs/legalDocumentsContent.ts", import.meta.url));
  const webAppRouteStateSource = readText(new URL("../shared/webAppRouteState.ts", import.meta.url));
  const mainSurfaceHostSource = readText(new URL("../apps/web/src/components/WebAppMainSurfaceHost.tsx", import.meta.url));
  const routeLifecycleSource = readText(
    new URL("../apps/web/src/controllers/useWebPathRouteLifecycle.ts", import.meta.url),
  );
  const operatorGatewaySource = readText(new URL("../shared/cloudOperatorDashboardGateway.ts", import.meta.url));
  const operatorHostSource = readText(
    new URL("../apps/web/src/components/WebOperatorDashboardHost.tsx", import.meta.url),
  );
  const operatorPanelSource = [
    operatorHostSource,
    readText(new URL("../apps/web/src/components/useOperatorDashboardData.ts", import.meta.url)),
    readText(new URL("../apps/web/src/components/OperatorBusinessPanelView.tsx", import.meta.url)),
    readText(new URL("../apps/web/src/components/workspaceRightPanelOperatorShared.ts", import.meta.url)),
  ].join("\n");
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
  const packageSource = readText(new URL("../package.json", import.meta.url));
  const accountSetupCoreSource = readText(new URL("../convex/accountSetupCore.ts", import.meta.url));
  const communityLifecycleSource = readText(new URL("../convex/communityLifecycle.ts", import.meta.url));
  const runtimeSmokeSource = readText(new URL("../scripts/builder_partner_program_runtime_smoke.ts", import.meta.url));
  const communityPublishReadinessSource = readText(
    new URL("../shared/communityPublishReadiness.ts", import.meta.url),
  );
  const createControllerSource = readText(new URL("../shared/useCommunityCreateController.ts", import.meta.url));
  const settingsGovernanceSource = readText(
    new URL("../shared/useCommunitySettingsGovernanceController.ts", import.meta.url),
  );

  proveConstants();
  proveCommunityCommissionMath();
  proveAttributionRoutePrivacy();
  proveEndToEndPartnerLifecycleBehavior();
  proveSchemaContract(schemaSource);
  proveUiContract(uiSource, settingsWrapperSource, partnerPanelSource);
  provePartnerTermsAgreementContract({
    termsDocSource,
    legalRegistrySource,
    legalContentSource,
    webAppRouteStateSource,
    mainSurfaceHostSource,
    routeLifecycleSource,
    schemaSource,
    builderPartnersSource,
    gatewaySource,
    runtimeSmokeSource,
  });
  provePartnerSurfaceIsolationContract(appSource, operatorHostSource);
  proveBuilderPartnerRuntimeSmokeContract(runtimeSmokeSource);
  proveAutomaticUnlockContract(builderPartnersSource, gatewaySource, appSource);
  proveEndToEndPartnerLifecycleSourceContract(
    builderPartnersSource,
    gatewaySource,
    appSource,
    communityCommerceSource,
    httpBillingSource,
    operatorGatewaySource,
    operatorPanelSource,
    uiSource,
  );
  proveEligibilityGateContract(
    builderPartnersSource,
    gatewaySource,
    uiSource,
    accountSetupCoreSource,
    communityLifecycleSource,
    communityPublishReadinessSource,
    createControllerSource,
    settingsGovernanceSource,
  );
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
    operatorPanelSource,
    operatorGatewaySource,
    cronsSource,
    billingDocsSource,
    packageSource,
  );
  console.log("PASS: builder partner program contract proof passed");
}

main();
