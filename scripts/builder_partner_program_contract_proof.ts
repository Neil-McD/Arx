import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS,
  BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
  BUILDER_PARTNER_COMMISSION_HOLD_MS,
  BUILDER_PARTNER_MIN_PAYOUT_USD,
  BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS,
  BUILDER_PARTNER_PROGRAM_VERSION,
  BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS,
  calculateBuilderPartnerCommunityRevenueCommission,
  calculateBuilderPartnerToolGrossMarginCommission,
} from "../shared/builderPartnerProgram.ts";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function proveConstants() {
  assert.equal(BUILDER_PARTNER_PROGRAM_VERSION, "builder_partner_v1");
  assert.equal(BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS, 1500);
  assert.equal(BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS, 4000);
  assert.equal(BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS, 2000);
  assert.equal(BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(BUILDER_PARTNER_COMMISSION_HOLD_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(BUILDER_PARTNER_MIN_PAYOUT_USD, 50);
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
  assertIncludes(schemaSource, "builderPartners: defineTable", "schema");
  assertIncludes(schemaSource, "partnerAttributions: defineTable", "schema");
  assertIncludes(schemaSource, "partnerCommissionLedger: defineTable", "schema");
  assert.match(
    schemaSource,
    /builderPartners:[\s\S]*sourceCommunityId:\s*v\.optional\(v\.id\("communities"\)\)[\s\S]*acceptedTermsAt:\s*v\.optional\(v\.number\(\)\)/,
    "expected partner records to bind a partner user to an optional source community and accepted terms",
  );
  assert.match(
    schemaSource,
    /partnerAttributions:[\s\S]*attributionKey:\s*v\.string\(\)[\s\S]*referralCode:\s*v\.string\(\)[\s\S]*anonymousVisitorKeyHash:\s*v\.optional\(v\.string\(\)\)[\s\S]*referredUserId:\s*v\.optional\(v\.id\("users"\)\)[\s\S]*expiresAt:\s*v\.number\(\)/,
    "expected attribution records to support anonymous first-touch, auth binding, and expiry",
  );
  assert.match(
    schemaSource,
    /partnerCommissionLedger:[\s\S]*commissionKey:\s*v\.string\(\)[\s\S]*basisType:\s*v\.union\([\s\S]*v\.literal\("community_platform_fee"\)[\s\S]*v\.literal\("tool_gross_margin"\)[\s\S]*basisAmountUsd:\s*v\.number\(\)[\s\S]*commissionRateBps:\s*v\.number\(\)[\s\S]*commissionAmountUsd:\s*v\.number\(\)/,
    "expected commission ledger to be idempotent and basis-explicit",
  );
  assert.match(
    schemaSource,
    /partnerCommissionLedger:[\s\S]*sourceCheckoutSessionId:\s*v\.optional\(v\.string\(\)\)[\s\S]*sourceCreditLedgerEntryId:\s*v\.optional\(v\.id\("creditLedgerEntries"\)\)/,
    "expected commission rows to point at checkout and paid-tool evidence",
  );
  assert.match(
    schemaSource,
    /\.index\("by_commissionKey",\s*\["commissionKey"\]\)/,
    "expected commission idempotency key index",
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
    "Earn {formatBps(toolGrossMarginShareBps)} of referred creators' tool usage",
    "partner settings UI",
  );
  assertIncludes(
    uiSource,
    "Attribution and commission reporting will appear here once enrollment opens.",
    "partner settings UI",
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
    /Request enrollment|Copy link|your-code/,
    "partner settings UI should not ship enrollment mechanics before the flow is planned",
  );
  assert.doesNotMatch(
    uiSource,
    /backend ledger ships/i,
    "partner settings UI must not expose implementation phrasing",
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

function main() {
  const schemaSource = readText(new URL("../convex/schema.ts", import.meta.url));
  const uiSource = readText(
    new URL("../apps/web/src/components/WebBuilderPartnerSettingsSection.tsx", import.meta.url),
  );
  const authSource = readText(new URL("../convex/auth.ts", import.meta.url));
  const workspaceCreditsSource = readText(new URL("../shared/workspaceCredits.ts", import.meta.url));

  proveConstants();
  proveCommunityCommissionMath();
  proveToolCommissionMath();
  proveSchemaContract(schemaSource);
  proveUiContract(uiSource);
  provePricingFoundation(authSource, workspaceCreditsSource);
  console.log("PASS: builder partner program contract proof passed");
}

main();
