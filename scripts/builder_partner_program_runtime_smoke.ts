import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { BUILDER_PARTNER_TERMS_VERSION } from "../shared/builderPartnerProgram.ts";

const targetArgs = buildTargetArgs();
const runId = `partner-smoke-${Date.now().toString(36)}`;
const nowMs = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;
const SMOKE_PAYOUT_CYCLE_BASE_YEAR = 2200;
const SMOKE_PAYOUT_CYCLE_MAX_YEAR = 9999;
const SMOKE_PAYOUT_CYCLE_ATTEMPT_COUNT = 36;
const purchaseNowMs = nowMs - 46 * DAY_MS;
const partnerSubject = `smoke:${runId}:partner`;
const referredSubject = `smoke:${runId}:referred`;
const partnerEmail = `${runId}.partner@example.test`;
const referredEmail = `${runId}.referred@example.test`;

type ConvexRunOptions = {
  identity?: Record<string, unknown>;
};

function buildTargetArgs(): string[] {
  if (process.env.POLYNET_PARTNER_RUNTIME_SMOKE_PROD === "1") {
    if (process.env.POLYNET_PARTNER_RUNTIME_SMOKE_ALLOW_PROD !== "1") {
      throw new Error("Refusing production partner smoke without POLYNET_PARTNER_RUNTIME_SMOKE_ALLOW_PROD=1.");
    }
    return ["--prod"];
  }
  const deploymentName = String(process.env.POLYNET_PARTNER_RUNTIME_SMOKE_DEPLOYMENT_NAME ?? "").trim();
  if (deploymentName) return ["--deployment-name", deploymentName];
  const previewName = String(process.env.POLYNET_PARTNER_RUNTIME_SMOKE_PREVIEW_NAME ?? "").trim();
  if (previewName) return ["--preview-name", previewName];
  return [];
}

function firstJsonOffset(output: string): number {
  const offsets = ["{", "[", "\"", "null", "true", "false"]
    .map((marker) => output.indexOf(marker))
    .filter((offset) => offset >= 0);
  return offsets.length > 0 ? Math.min(...offsets) : -1;
}

function runConvex(functionName: string, args: Record<string, unknown>, options: ConvexRunOptions = {}) {
  const command = [
    "convex",
    "run",
    "--typecheck",
    "disable",
    "--codegen",
    "disable",
    ...targetArgs,
  ];
  if (options.identity) {
    command.push("--identity", JSON.stringify(options.identity));
  }
  command.push(functionName, JSON.stringify(args));

  const result = spawnSync("npx", command, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    throw new Error(`convex_run_failed:${functionName}`);
  }
  const output = result.stdout.trim();
  if (!output) return null;
  const jsonOffset = firstJsonOffset(output);
  assert.ok(jsonOffset >= 0, `expected ${functionName} to return JSON, got: ${output}`);
  return JSON.parse(output.slice(jsonOffset));
}

function hashStringToPositiveInteger(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
}

function formatSmokePayoutCyclePeriod(monthOffset: number): string {
  const normalizedOffset = Math.max(0, Math.floor(monthOffset));
  const year = SMOKE_PAYOUT_CYCLE_BASE_YEAR + Math.floor(normalizedOffset / 12);
  const month = String((normalizedOffset % 12) + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function buildSmokePayoutCyclePeriodCandidates(smokeRunId: string): string[] {
  const maxMonthOffset =
    ((SMOKE_PAYOUT_CYCLE_MAX_YEAR - SMOKE_PAYOUT_CYCLE_BASE_YEAR + 1) * 12) -
    SMOKE_PAYOUT_CYCLE_ATTEMPT_COUNT;
  const startOffset = hashStringToPositiveInteger(smokeRunId) % Math.max(1, maxMonthOffset);
  return Array.from({ length: SMOKE_PAYOUT_CYCLE_ATTEMPT_COUNT }, (_, index) =>
    formatSmokePayoutCyclePeriod(startOffset + index),
  );
}

function createSmokePayoutCycle(input: {
  runId: string;
  limit: number;
  payableCutoffAt: number;
  nowMs: number;
}) {
  const skippedActiveCycles: Array<{ cyclePeriod: string; cycleKey: string }> = [];
  for (const cyclePeriod of buildSmokePayoutCyclePeriodCandidates(input.runId)) {
    const result = runConvex("builderPartners:createPartnerPayoutCycleInternal", {
      batchKey: `partner_payout_smoke:${input.runId}:${cyclePeriod}`,
      cyclePeriod,
      limit: input.limit,
      payableCutoffAt: input.payableCutoffAt,
      nowMs: input.nowMs,
    });
    assert.equal(result?.ok, true, JSON.stringify(result));
    if (result.created === true) {
      return {
        cyclePeriod,
        payoutCycle: result,
        skippedActiveCycles,
      };
    }
    if (result.reason === "partner_payout_cycle_active") {
      const cycleKey = String(result.cycle?.cycleKey ?? "");
      assert.ok(
        cycleKey.startsWith("partner_payout_smoke:"),
        `active non-smoke payout cycle blocked smoke period ${cyclePeriod}: ${JSON.stringify(result)}`,
      );
      skippedActiveCycles.push({ cyclePeriod, cycleKey });
      continue;
    }
    assert.fail(`unexpected payout cycle smoke result for ${cyclePeriod}: ${JSON.stringify(result)}`);
  }
  assert.fail(
    `exhausted smoke payout cycle periods after ${SMOKE_PAYOUT_CYCLE_ATTEMPT_COUNT} attempts: ${
      JSON.stringify(skippedActiveCycles)
    }`,
  );
}

function identity(subject: string, email: string) {
  return {
    subject,
    email,
    email_verified: true,
    name: subject,
  };
}

function setupUser(input: {
  subject: string;
  email: string;
  handle: string;
  displayName: string;
  stripeAccountId: string;
}) {
  const userIdentity = identity(input.subject, input.email);
  const actor = runConvex(
    "auth:bootstrapActor",
    {
      authState: "authenticated",
      authSubject: input.subject,
      email: input.email,
      nowMs,
    },
    { identity: userIdentity },
  );
  const userId = String(actor.dbUserId ?? "");
  assert.ok(userId, `expected ${input.subject} bootstrap to return dbUserId`);

  runConvex(
    "profiles:upsertProfileDetail",
    {
      authSubject: input.subject,
      displayName: input.displayName,
      handle: input.handle,
      avatarUrl: `https://example.test/${input.handle}.png`,
      bio: "Partner runtime smoke identity.",
      onboardingDirection: "build_community",
      markOnboardingDismissed: true,
      completeOnboarding: true,
      nowMs,
    },
    { identity: userIdentity },
  );
  runConvex(
    "settings:saveUserMemorySettings",
    {
      authSubject: input.subject,
      memoryMode: "auto",
      rememberIntentEnabled: true,
      agentName: `${input.displayName} Agent`,
      agentSoul: "Runtime smoke agent setup.",
      nowMs,
    },
    { identity: userIdentity },
  );
  runConvex("providerConnections:upsertOpenAiConnectionInternal", {
    userId,
    encryptedSecretHex: "00",
    secretIvHex: "00",
    secretVersion: 1,
    keyLastFour: "test",
    keyFingerprint: `smoke-${input.handle}`,
    validatedAt: nowMs,
    nowMs,
  });
  runConvex("creatorCommerce:syncUserStripeConnectAccountInternal", {
    userId,
    stripeAccountId: input.stripeAccountId,
    accountType: "express",
    status: "ready",
    detailsSubmitted: true,
    chargesEnabled: true,
    payoutsEnabled: true,
    requirementsCurrentlyDue: [],
    requirementsEventuallyDue: [],
    requirementsDisabledReason: null,
    onboardingCompleteAt: nowMs,
    nowMs,
  });
  return { userId, identity: userIdentity };
}

function createSmokeCommunity(input: {
  subject: string;
  identity: Record<string, unknown>;
  slug: string;
  name: string;
}) {
  const row = runConvex(
    "communityLifecycle:createCommunity",
    {
      authSubject: input.subject,
      name: input.name,
      slug: input.slug,
      visibility: "unlisted",
      entryPolicy: "approval",
      avatarUrl: `https://example.test/${input.slug}-avatar.png`,
      bannerUrl: `https://example.test/${input.slug}-banner.png`,
      oneLiner: "Runtime smoke community.",
    },
    { identity: input.identity },
  );
  const communityId = String(row.community_id ?? row.id ?? "");
  assert.ok(communityId, `expected ${input.slug} community id`);
  return { communityId, row };
}

const partner = setupUser({
  subject: partnerSubject,
  email: partnerEmail,
  handle: `partner${runId.replace(/[^a-z0-9]/g, "").slice(-12)}`,
  displayName: "Partner Smoke",
  stripeAccountId: `acct_${runId.replace(/[^a-zA-Z0-9]/g, "_")}_partner`,
});
createSmokeCommunity({
  subject: partnerSubject,
  identity: partner.identity,
  slug: `${runId}-partner`,
  name: "Partner Smoke Community",
});

const partnerProgram = runConvex(
  "builderPartners:acceptBuilderPartnerTermsAndEnsure",
  { authSubject: partnerSubject, termsVersion: BUILDER_PARTNER_TERMS_VERSION },
  { identity: partner.identity },
);
const referralCode = String(partnerProgram.partner?.code ?? "");
assert.ok(referralCode, "expected accepted partner program to return referral code");

const visitorKey = `${runId}:visitor`;
const anonymousAttribution = runConvex("builderPartners:recordBuilderPartnerAttribution", {
  referralCode,
  visitorKey,
  currentUrl: `/smoke?partner=${referralCode}&token=redacted`,
});
assert.equal(anonymousAttribution.ok, true);
assert.equal(anonymousAttribution.status, "active");

const selfReferral = runConvex(
  "builderPartners:recordBuilderPartnerAttribution",
  {
    referralCode,
    visitorKey: `${runId}:self`,
    currentUrl: `/smoke?partner=${referralCode}`,
    authSubject: partnerSubject,
  },
  { identity: partner.identity },
);
assert.equal(selfReferral.ok, false);
assert.equal(selfReferral.reason, "self_referral_ignored");

const missingSubject = runConvex("builderPartners:recordBuilderPartnerAttribution", {
  referralCode,
  currentUrl: `/smoke?partner=${referralCode}`,
});
assert.equal(missingSubject.ok, false);
assert.equal(missingSubject.reason, "missing_attribution_subject");

const referred = setupUser({
  subject: referredSubject,
  email: referredEmail,
  handle: `referred${runId.replace(/[^a-z0-9]/g, "").slice(-12)}`,
  displayName: "Referred Smoke",
  stripeAccountId: `acct_${runId.replace(/[^a-zA-Z0-9]/g, "_")}_referred`,
});
const boundAttribution = runConvex(
  "builderPartners:recordBuilderPartnerAttribution",
  {
    referralCode,
    visitorKey,
    currentUrl: `/smoke?partner=${referralCode}`,
    authSubject: referredSubject,
  },
  { identity: referred.identity },
);
assert.equal(boundAttribution.ok, true);
assert.equal(boundAttribution.status, "bound");

const referredCommunitySlug = `${runId}-referred`;
const referredCommunity = createSmokeCommunity({
  subject: referredSubject,
  identity: referred.identity,
  slug: referredCommunitySlug,
  name: "Referred Smoke Community",
});
runConvex(
  "communityLifecycle:saveCommunitySettings",
  {
    authSubject: referredSubject,
    communityId: referredCommunity.communityId,
    name: "Referred Smoke Community",
    slug: referredCommunitySlug,
    oneLiner: "Runtime smoke paid community.",
    about: "Runtime smoke paid community.",
    avatarUrl: `https://example.test/${referredCommunitySlug}-avatar.png`,
    bannerUrl: `https://example.test/${referredCommunitySlug}-banner.png`,
    visibility: "unlisted",
    monthlyAmountBaseUnits: 10000,
    annualAmountBaseUnits: null,
    currency: "usd",
    currencyDecimals: 2,
  },
  { identity: referred.identity },
);

let checkoutConfig = runConvex("communityCommerce:resolvePublicCommunityCheckoutConfigInternal", {
  communitySlug: referredCommunitySlug,
  billingPeriod: "monthly",
  nowMs,
});
if (!checkoutConfig.providerPriceId) {
  runConvex("communityCommerce:attachCommunityPricePointProviderPriceInternal", {
    pricePointId: checkoutConfig.pricePointId,
    providerPriceId: `price_${runId.replace(/[^a-zA-Z0-9]/g, "_")}`,
    nowMs,
  });
  checkoutConfig = runConvex("communityCommerce:resolvePublicCommunityCheckoutConfigInternal", {
    communitySlug: referredCommunitySlug,
    billingPeriod: "monthly",
    nowMs,
  });
}
assert.equal(Number(checkoutConfig.amountBaseUnits), 10000);
assert.equal(String(checkoutConfig.currency).toLowerCase(), "usd");

const sessionId = `partner_smoke_${runId}`;
runConvex("communityCommerce:createPendingPublicCommunityCheckoutSessionInternal", {
  sessionId,
  communityId: checkoutConfig.communityId,
  billingPeriod: "monthly",
  pricePointId: checkoutConfig.pricePointId,
  amountBaseUnits: checkoutConfig.amountBaseUnits,
  currency: checkoutConfig.currency,
  currencyDecimals: checkoutConfig.currencyDecimals,
  providerPriceId: checkoutConfig.providerPriceId,
  ownerUserId: referred.userId,
  claimToken: `claim_${runId}`,
  expiresAt: nowMs + 60 * 60 * 1000,
  nowMs: purchaseNowMs,
});
runConvex("communityCommerce:syncPendingCommunityCheckoutSubscriptionInternal", {
  sessionId,
  providerCheckoutSessionId: `cs_${runId}`,
  providerCustomerId: `cus_${runId.replace(/[^a-zA-Z0-9]/g, "_")}`,
  providerSubscriptionId: `sub_${runId}`,
  sourceProviderInvoiceId: `in_${runId}`,
  sourceProviderPaymentIntentId: `pi_${runId}`,
  sourceProviderChargeId: `ch_${runId}`,
  providerPriceId: checkoutConfig.providerPriceId,
  subscriptionStatus: "active",
  currentPeriodStartAt: purchaseNowMs,
  currentPeriodEndAt: purchaseNowMs + 30 * DAY_MS,
  cancelAtPeriodEnd: false,
  markComplete: true,
  nowMs: purchaseNowMs,
});
runConvex("communityCommerce:syncPendingCommunityCheckoutSubscriptionInternal", {
  sessionId,
  providerCheckoutSessionId: `cs_${runId}`,
  providerCustomerId: `cus_${runId.replace(/[^a-zA-Z0-9]/g, "_")}`,
  providerSubscriptionId: `sub_${runId}`,
  sourceProviderInvoiceId: `in_${runId}`,
  sourceProviderPaymentIntentId: `pi_${runId}`,
  sourceProviderChargeId: `ch_${runId}`,
  providerPriceId: checkoutConfig.providerPriceId,
  subscriptionStatus: "active",
  currentPeriodStartAt: purchaseNowMs,
  currentPeriodEndAt: purchaseNowMs + 30 * DAY_MS,
  cancelAtPeriodEnd: false,
  markComplete: true,
  nowMs: purchaseNowMs,
});

const afterCheckout = runConvex(
  "builderPartners:getMyBuilderPartnerProgram",
  { authSubject: partnerSubject },
  { identity: partner.identity },
);
assert.equal(Number(afterCheckout.commissionSummary.pendingUsd), 6);
assert.equal(Number(afterCheckout.commissionSummary.totalUsd), 6);
assert.equal(Number(afterCheckout.attributionSummary.boundCount), 1);

const holdClearedAt = purchaseNowMs + 30 * DAY_MS + 1;
const maturity = runConvex("builderPartners:advancePartnerCommissionsToPayableInternal", {
  nowMs: holdClearedAt,
  limit: 10,
});
assert.equal(maturity.ok, true);
assert.ok(Number(maturity.advanced) >= 1, "expected at least one partner commission to mature");
const beforePayoutReservation = runConvex(
  "builderPartners:getMyBuilderPartnerProgram",
  { authSubject: partnerSubject },
  { identity: partner.identity },
);
assert.equal(Number(beforePayoutReservation.commissionSummary.readyUsd), 6);
assert.equal(Number(beforePayoutReservation.commissionSummary.readyCount), 1);

const payoutNowMs = nowMs;
const smokePayoutCycle = createSmokePayoutCycle({
  runId,
  limit: 250,
  payableCutoffAt: holdClearedAt,
  nowMs: payoutNowMs,
});
const payoutCycle = smokePayoutCycle.payoutCycle;
assert.equal(payoutCycle.ok, true);
assert.equal(payoutCycle.created, true, JSON.stringify(payoutCycle));
assert.equal(payoutCycle.cycle?.cycleKey, `partner_payout_smoke:${runId}:${smokePayoutCycle.cyclePeriod}`);
assert.ok(Number(payoutCycle.cycle?.totalAmountUsd) >= 6, JSON.stringify(payoutCycle));
assert.ok(Number(payoutCycle.cycle?.partnerCount) >= 1, JSON.stringify(payoutCycle));
assert.ok(Number(payoutCycle.cycle?.itemCount) >= 1, JSON.stringify(payoutCycle));
const afterPayoutReservation = runConvex(
  "builderPartners:getMyBuilderPartnerProgram",
  { authSubject: partnerSubject },
  { identity: partner.identity },
);
assert.equal(Number(afterPayoutReservation.commissionSummary.readyUsd), 0);
assert.equal(Number(afterPayoutReservation.commissionSummary.readyCount), 0);

console.log(JSON.stringify({
  ok: true,
  target: targetArgs.length > 0 ? targetArgs.join(" ") : "default dev deployment",
  runId,
  partnerUserId: partner.userId,
  referredUserId: referred.userId,
  referralCode,
  checkoutCommissionUsd: afterCheckout.commissionSummary.pendingUsd,
  maturity,
  beforePayoutReservation: beforePayoutReservation.commissionSummary,
  afterPayoutReservation: afterPayoutReservation.commissionSummary,
  payoutCyclePeriod: smokePayoutCycle.cyclePeriod,
  payoutCycle: payoutCycle.cycle,
  skippedActivePayoutCycles: smokePayoutCycle.skippedActiveCycles,
}, null, 2));
console.log("PASS: builder partner runtime smoke passed");
