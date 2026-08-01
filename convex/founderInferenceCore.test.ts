/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  getExistingFounderInferenceGrant,
  requireExistingFounderCommunityCreationEligibility,
  resolveCommunityInferenceFundingAdmission,
  settleAuthorizedFounderInferenceReceipt,
  suspendActiveFounderInferenceGrantForCredentialChange,
} from "./founderInferenceCore";
import {
  getFounderSubscriptionByCommunity,
  syncFounderUsageCycle,
} from "./founderPlanCore";
import { EXISTING_FOUNDER_INFERENCE_COHORT_KEY } from "../shared/founderInference";
import { POLYNET_FOUNDER_PLAN_PRICING_VERSION } from "../shared/founderPlan";
import { buildAccountSetupStatusForRows } from "./accountSetupCore";

const modules = import.meta.glob([
  "./founderInference.ts",
  "./founderInferenceMigration.ts",
  "./founderBilling.ts",
  "./providerConnections.ts",
  "./_generated/**/*.*s",
]);

async function insertUser(ctx: any, suffix: string, nowMs = 1_000) {
  return await ctx.db.insert("users", {
    authSubject: `founder-inference-${suffix}`,
    displayName: `Founder ${suffix}`,
    handle: `founder-${suffix}`,
    normalizedHandle: `founder-${suffix}`,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

async function insertCommunity(ctx: any, ownerId: any, suffix: string, nowMs = 1_000) {
  return await ctx.db.insert("communities", {
    ownerId,
    slug: `founder-inference-${suffix}`,
    name: `Community ${suffix}`,
    visibility: "unlisted",
    entryPolicy: "approval",
    activeMemberCount: 1,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

async function insertOpenAiConnection(
  ctx: any,
  userId: any,
  fingerprint: string,
  nowMs = 1_000,
) {
  return await ctx.db.insert("userProviderConnections", {
    userId,
    provider: "openai",
    authKind: "api_key",
    encryptedSecretHex: `encrypted-${fingerprint}`,
    secretIvHex: `iv-${fingerprint}`,
    secretVersion: 1,
    keyLastFour: fingerprint.slice(-4),
    keyFingerprint: fingerprint,
    validatedAt: nowMs,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

async function createActiveFundingFixture(
  t: ReturnType<typeof convexTest>,
  suffix: string,
  nowMs = 100_000,
) {
  return await t.run(async (ctx) => {
    const ownerId = await insertUser(ctx, `${suffix}-owner`, nowMs);
    const memberId = await insertUser(ctx, `${suffix}-member`, nowMs);
    const communityId = await insertCommunity(ctx, ownerId, suffix, nowMs);
    const grantId = await ctx.db.insert("founderInferenceGrants", {
      userId: ownerId,
      cohortKey: EXISTING_FOUNDER_INFERENCE_COHORT_KEY,
      status: "active",
      approvedAt: nowMs,
      activatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const connectionId = await insertOpenAiConnection(
      ctx,
      ownerId,
      `${suffix}-fingerprint`,
      nowMs,
    );
    return { communityId, connectionId, grantId, memberId, ownerId };
  });
}

function claimArgs(
  fixture: Awaited<ReturnType<typeof createActiveFundingFixture>>,
  receiptKey: string,
  claimToken: string,
  nowMs: number,
) {
  return {
    receiptKey,
    sourceRunId: `community-agent-serve:${receiptKey}`,
    communityId: fixture.communityId,
    actorUserId: fixture.memberId,
    expectedPayerUserId: fixture.ownerId,
    expectedFundingMode: "owner_api_key" as const,
    expectedFounderGrantId: fixture.grantId,
    claimToken,
    nowMs,
  };
}

test("funding cutover is founder-level and fails closed without changing member authority", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const ownerId = await insertUser(ctx, "owner");
    const memberId = await insertUser(ctx, "member");
    const futureOwnerId = await insertUser(ctx, "future-owner");
    const communityId = await insertCommunity(ctx, ownerId, "community");

    await expect(resolveCommunityInferenceFundingAdmission(ctx, communityId)).resolves.toMatchObject({
      ok: true,
      mode: "legacy_requester_chatgpt",
    });
    await expect(
      requireExistingFounderCommunityCreationEligibility(ctx, futureOwnerId),
    ).resolves.toBeUndefined();

    const grantId = await ctx.db.insert("founderInferenceGrants", {
      userId: ownerId,
      cohortKey: EXISTING_FOUNDER_INFERENCE_COHORT_KEY,
      status: "approved",
      approvedAt: 2_000,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    await expect(
      requireExistingFounderCommunityCreationEligibility(ctx, futureOwnerId),
    ).rejects.toThrow("founder_plan_required");
    await expect(
      requireExistingFounderCommunityCreationEligibility(ctx, ownerId),
    ).resolves.toBeUndefined();
    await expect(resolveCommunityInferenceFundingAdmission(ctx, communityId)).resolves.toMatchObject({
      ok: true,
      mode: "legacy_requester_chatgpt",
    });

    await ctx.db.patch(grantId, { status: "active", activatedAt: 3_000, updatedAt: 3_000 });
    await expect(resolveCommunityInferenceFundingAdmission(ctx, communityId)).resolves.toEqual({
      ok: false,
      code: "owner_credential_missing",
    });
    await ctx.db.insert("userProviderConnections", {
      userId: ownerId,
      provider: "openai",
      authKind: "api_key",
      encryptedSecretHex: "encrypted",
      secretIvHex: "iv",
      secretVersion: 1,
      keyLastFour: "test",
      keyFingerprint: "fingerprint",
      validatedAt: 3_000,
      createdAt: 3_000,
      updatedAt: 3_000,
    });
    await expect(resolveCommunityInferenceFundingAdmission(ctx, communityId)).resolves.toEqual({
      ok: true,
      mode: "owner_api_key",
      transitional: false,
      payerUserId: ownerId,
      grantId,
      modelId: "gpt-5.6-luna",
    });

    const receiptKey = "community_agent_mention:test";
    await ctx.db.insert("communityInferenceReceipts", {
      receiptKey,
      sourceRunId: "community-agent-serve:test",
      communityId,
      actorUserId: memberId,
      payerUserId: ownerId,
      fundingMode: "owner_api_key",
      founderGrantId: grantId,
      surface: "community_agent_mention",
      provider: "openai",
      modelId: "gpt-5.6-luna",
      status: "authorized",
      claimToken: "claim",
      leaseExpiresAt: 20_000,
      providerStartedAt: 4_000,
      authorizedAt: 4_000,
      createdAt: 4_000,
      updatedAt: 4_000,
    });
    await settleAuthorizedFounderInferenceReceipt({
      ctx,
      receiptKey,
      claimToken: "claim",
      promptTokens: 123,
      completionTokens: 45,
      outcomeCode: "completed",
      nowMs: 5_000,
    });
    const receipt = await ctx.db
      .query("communityInferenceReceipts")
      .withIndex("by_receipt_key", (q: any) => q.eq("receiptKey", receiptKey))
      .first();
    expect(receipt).toMatchObject({
      actorUserId: memberId,
      payerUserId: ownerId,
      status: "settled",
      promptTokens: 123,
      completionTokens: 45,
    });

    await expect(suspendActiveFounderInferenceGrantForCredentialChange({
      ctx,
      userId: ownerId,
      nowMs: 6_000,
    })).resolves.toBe(true);
    expect((await getExistingFounderInferenceGrant(ctx, ownerId))?.status).toBe("suspended");
    await expect(resolveCommunityInferenceFundingAdmission(ctx, communityId)).resolves.toEqual({
      ok: false,
      code: "owner_funding_suspended",
    });
  });
});

test("an active managed founder plan satisfies setup inference without BYOK", () => {
  const status = buildAccountSetupStatusForRows({
    user: {
      _id: "managed-founder",
      authSubject: "managed-founder",
      createdAt: 1,
      updatedAt: 1,
    },
    detail: null,
    providerConnections: [],
    legalAcceptances: [],
    hasManagedInference: true,
  });
  expect(status.missing).not.toContain("inference_provider");
  expect(status.steps.find((step) => step.step === "inference")?.completed).toBe(true);
});

test("cohort migration requires exactly nine real owners and deletes only eight bounded legacy policies", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const ownerUserIds: any[] = [];
    const communityIds: any[] = [];
    for (let index = 0; index < 9; index += 1) {
      const ownerId = await insertUser(ctx, `migration-${index}`, 10_000 + index);
      ownerUserIds.push(ownerId);
      communityIds.push(await insertCommunity(ctx, ownerId, `migration-${index}`, 10_000 + index));
    }
    for (let index = 0; index < 8; index += 1) {
      await ctx.db.insert("communityInferencePolicies", {
        communityId: communityIds[index],
        payerUserId: ownerUserIds[index],
        fundingMode: "owner_api_key",
        status: "pending_credential",
        contractVersion: "builder_partner_v1",
        sourceGrantKey: "future_partner_grandfather_v1",
        sourceProgram: "builder_partner_v1",
        sourcePartnerRecordId: `legacy-${index}`,
        createdAt: 20_000 + index,
        updatedAt: 20_000 + index,
      });
    }
    return { ownerUserIds };
  });

  const result = await t.mutation(
    (internal as any).founderInferenceMigration.initializeExistingFounderInferenceCohortInternal,
    {
      ownerUserIds: fixture.ownerUserIds,
      deleteLegacyPartnerPolicies: true,
      nowMs: 30_000,
    },
  );
  expect(result).toMatchObject({
    ok: true,
    expected_founders: 9,
    grants_to_create: 9,
    legacy_policies_inspected: 8,
    legacy_policies_to_delete: 8,
  });
  await t.run(async (ctx) => {
    expect(await ctx.db.query("communityInferencePolicies").collect()).toHaveLength(0);
    expect(await ctx.db
      .query("founderInferenceGrants")
      .withIndex("by_cohort", (q: any) => q.eq("cohortKey", EXISTING_FOUNDER_INFERENCE_COHORT_KEY))
      .collect()).toHaveLength(9);
  });
});

test("activation requires current terms and binds completion to the accepted key fingerprint", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.action((api as any).founderInference.activateFounderInference, {
      acceptedTerms: false,
      acceptedTermsVersion: "community_owner_inference_funding_v2",
    }),
  ).rejects.toThrow("founder_inference_terms_acceptance_required");
  await expect(
    t.action((api as any).founderInference.activateFounderInference, {
      acceptedTerms: true,
      acceptedTermsVersion: "stale_terms",
    }),
  ).rejects.toThrow("founder_inference_terms_acceptance_required");

  const fixture = await t.run(async (ctx) => {
    const ownerId = await insertUser(ctx, "activation-owner", 40_000);
    const noGrantUserId = await insertUser(ctx, "activation-no-grant", 40_000);
    return { noGrantUserId, ownerId };
  });
  await expect(
    t.mutation(
      (internal as any).founderInference.prepareFounderInferenceActivationInternal,
      { userId: fixture.noGrantUserId, nowMs: 41_000 },
    ),
  ).rejects.toThrow("founder_inference_grant_required");

  const activation = await t.run(async (ctx) => {
    const grantId = await ctx.db.insert("founderInferenceGrants", {
      userId: fixture.ownerId,
      cohortKey: EXISTING_FOUNDER_INFERENCE_COHORT_KEY,
      status: "approved",
      approvedAt: 41_000,
      createdAt: 41_000,
      updatedAt: 41_000,
    });
    return { grantId };
  });
  await expect(
    t.mutation(
      (internal as any).founderInference.prepareFounderInferenceActivationInternal,
      { userId: fixture.ownerId, nowMs: 42_000 },
    ),
  ).rejects.toThrow("owner_credential_missing");

  const connectionId = await t.run(async (ctx) =>
    await insertOpenAiConnection(ctx, fixture.ownerId, "fingerprint-one", 43_000),
  );
  const prepared = await t.mutation(
    (internal as any).founderInference.prepareFounderInferenceActivationInternal,
    { userId: fixture.ownerId, nowMs: 44_000 },
  );
  expect(prepared).toMatchObject({
    acceptanceId: expect.anything(),
    connection: { keyFingerprint: "fingerprint-one" },
  });
  await t.run(async (ctx) => {
    expect(await ctx.db.query("legalAcceptances").collect()).toHaveLength(1);
    await ctx.db.patch(connectionId, {
      keyFingerprint: "fingerprint-two",
      updatedAt: 45_000,
    });
  });
  await expect(
    t.mutation(
      (internal as any).founderInference.completeFounderInferenceActivationInternal,
      {
        userId: fixture.ownerId,
        expectedKeyFingerprint: "fingerprint-one",
        nowMs: 46_000,
      },
    ),
  ).rejects.toThrow("owner_credential_changed_during_activation");
  await t.run(async (ctx) => {
    expect((await ctx.db.get(activation.grantId))?.status).toBe("approved");
    await ctx.db.patch(connectionId, {
      keyFingerprint: "fingerprint-one",
      updatedAt: 47_000,
    });
  });
  await expect(
    t.mutation(
      (internal as any).founderInference.completeFounderInferenceActivationInternal,
      {
        userId: fixture.ownerId,
        expectedKeyFingerprint: "fingerprint-one",
        nowMs: 48_000,
      },
    ),
  ).resolves.toMatchObject({ ok: true, status: "active", model_id: "gpt-5.6-luna" });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(activation.grantId)).toMatchObject({
      status: "active",
      activationAcceptanceId: prepared.acceptanceId,
      activatedAt: 48_000,
    });
  });
});

test("receipt claims preserve member actor and owner payer across safe and ambiguous retries", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "receipt-retry", 100_000);
  const receiptKey = "community_agent_mention:receipt-retry";
  const first = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, "claim-one", 101_000),
  );
  expect(first).toMatchObject({ ok: true, reclaimed: false });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(first.receiptId)).toMatchObject({
      actorUserId: fixture.memberId,
      payerUserId: fixture.ownerId,
      claimToken: "claim-one",
      status: "authorized",
    });
  });

  await expect(
    t.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      claimArgs(fixture, receiptKey, "claim-two", 101_001),
    ),
  ).resolves.toMatchObject({ ok: false, errorCode: "inference_receipt_in_progress" });
  await t.run(async (ctx) => {
    await ctx.db.patch(first.receiptId, { leaseExpiresAt: 101_001, updatedAt: 101_001 });
  });
  await expect(
    t.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      claimArgs(fixture, receiptKey, "claim-three", 101_002),
    ),
  ).resolves.toMatchObject({ ok: true, receiptId: first.receiptId, reclaimed: true });
  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken: "claim-three", nowMs: 101_003 },
    ),
  ).resolves.toEqual({ ok: true });
  await expect(
    t.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      claimArgs(fixture, receiptKey, "claim-four", 101_004),
    ),
  ).resolves.toMatchObject({ ok: false, errorCode: "inference_receipt_indeterminate" });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(first.receiptId)).toMatchObject({
      status: "indeterminate",
      failureCode: "ambiguous_provider_retry_blocked",
    });
  });
});

test("receipt authorization rate limits both an actor and the whole community", async () => {
  const actorTest = convexTest(schema, modules);
  const actorFixture = await createActiveFundingFixture(actorTest, "actor-rate", 200_000);
  for (let index = 0; index < 6; index += 1) {
    await expect(
      actorTest.mutation(
        (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
        claimArgs(
          actorFixture,
          `community_agent_mention:actor-rate-${index}`,
          `actor-rate-claim-${index}`,
          201_000 + index,
        ),
      ),
    ).resolves.toMatchObject({ ok: true });
  }
  await expect(
    actorTest.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      claimArgs(
        actorFixture,
        "community_agent_mention:actor-rate-blocked",
        "actor-rate-claim-blocked",
        201_010,
      ),
    ),
  ).resolves.toMatchObject({ ok: false, errorCode: "founder_inference_actor_rate_limited" });

  const communityTest = convexTest(schema, modules);
  const communityFixture = await createActiveFundingFixture(communityTest, "community-rate", 300_000);
  await communityTest.run(async (ctx) => {
    for (let index = 0; index < 60; index += 1) {
      const actorUserId = await insertUser(ctx, `community-rate-${index}`, 301_000 + index);
      await ctx.db.insert("communityInferenceReceipts", {
        receiptKey: `community_agent_mention:community-rate-${index}`,
        sourceRunId: `community-agent-serve:community-rate-${index}`,
        communityId: communityFixture.communityId,
        actorUserId,
        payerUserId: communityFixture.ownerId,
        fundingMode: "owner_api_key",
        founderGrantId: communityFixture.grantId,
        surface: "community_agent_mention",
        provider: "openai",
        modelId: "gpt-5.6-luna",
        status: "failed",
        claimToken: `community-rate-claim-${index}`,
        leaseExpiresAt: 302_000,
        failureCode: "pre_spend_failure",
        authorizedAt: 301_000 + index,
        failedAt: 301_000 + index,
        createdAt: 301_000 + index,
        updatedAt: 301_000 + index,
      });
    }
  });
  await expect(
    communityTest.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      claimArgs(
        communityFixture,
        "community_agent_mention:community-rate-blocked",
        "community-rate-claim-blocked",
        302_000,
      ),
    ),
  ).resolves.toMatchObject({ ok: false, errorCode: "founder_inference_community_rate_limited" });
});

test("provider start revalidates ownership and failure settlement preserves known usage", async () => {
  const authorityTest = convexTest(schema, modules);
  const authorityFixture = await createActiveFundingFixture(authorityTest, "authority-change", 400_000);
  const authorityReceiptKey = "community_agent_mention:authority-change";
  const authorityClaim = await authorityTest.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(authorityFixture, authorityReceiptKey, "authority-claim", 401_000),
  );
  await authorityTest.run(async (ctx) => {
    const newOwnerId = await insertUser(ctx, "authority-new-owner", 401_001);
    await ctx.db.patch(authorityFixture.communityId, { ownerId: newOwnerId, updatedAt: 401_001 });
  });
  await expect(
    authorityTest.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey: authorityReceiptKey, claimToken: "authority-claim", nowMs: 401_002 },
    ),
  ).resolves.toMatchObject({ ok: false, errorCode: "funding_authority_changed" });
  await authorityTest.run(async (ctx) => {
    expect(await ctx.db.get(authorityClaim.receiptId)).toMatchObject({
      status: "failed",
      failureCode: "funding_authority_changed",
    });
  });

  const settlementTest = convexTest(schema, modules);
  const settlementFixture = await createActiveFundingFixture(settlementTest, "settlement", 500_000);
  const knownReceiptKey = "community_agent_mention:settlement-known";
  const knownClaim = await settlementTest.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(settlementFixture, knownReceiptKey, "known-claim", 501_000),
  );
  await expect(
    settlementTest.mutation(
      (internal as any).founderInference.finalizeCommunityInferenceFailureInternal,
      {
        receiptKey: knownReceiptKey,
        claimToken: "known-claim",
        promptTokens: 123,
        completionTokens: 45,
        usageComplete: true,
        failureCode: "provider_error_after_usage",
        disposition: "indeterminate",
        nowMs: 501_001,
      },
    ),
  ).resolves.toEqual({ ok: true, status: "settled" });
  await settlementTest.run(async (ctx) => {
    expect(await ctx.db.get(knownClaim.receiptId)).toMatchObject({
      status: "settled",
      promptTokens: 123,
      completionTokens: 45,
      outcomeCode: "provider_error_after_usage",
    });
  });

  const unknownReceiptKey = "community_agent_mention:settlement-unknown";
  const unknownClaim = await settlementTest.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(settlementFixture, unknownReceiptKey, "unknown-claim", 501_002),
  );
  await expect(
    settlementTest.mutation(
      (internal as any).founderInference.finalizeCommunityInferenceFailureInternal,
      {
        receiptKey: unknownReceiptKey,
        claimToken: "unknown-claim",
        promptTokens: 0,
        completionTokens: 0,
        usageComplete: false,
        failureCode: "provider_error",
        disposition: "indeterminate",
        nowMs: 501_003,
      },
    ),
  ).resolves.toEqual({ ok: true, status: "indeterminate" });
  await settlementTest.run(async (ctx) => {
    expect(await ctx.db.get(unknownClaim.receiptId)).toMatchObject({
      status: "indeterminate",
      failureCode: "provider_token_usage_missing",
    });
  });
});

test("replacing or deleting the owner's OpenAI key suspends active funding", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "credential-change", 600_000);
  const sameFingerprint = "credential-change-fingerprint";
  await t.mutation(
    (internal as any).providerConnections.upsertOpenAiConnectionInternal,
    {
      userId: fixture.ownerId,
      encryptedSecretHex: "encrypted-same",
      secretIvHex: "iv-same",
      secretVersion: 1,
      keyLastFour: "same",
      keyFingerprint: sameFingerprint,
      validatedAt: 601_000,
      nowMs: 601_000,
    },
  );
  await t.run(async (ctx) => {
    expect((await ctx.db.get(fixture.grantId))?.status).toBe("active");
  });

  await t.mutation(
    (internal as any).providerConnections.upsertOpenAiConnectionInternal,
    {
      userId: fixture.ownerId,
      encryptedSecretHex: "encrypted-replacement",
      secretIvHex: "iv-replacement",
      secretVersion: 1,
      keyLastFour: "ment",
      keyFingerprint: "replacement-fingerprint",
      validatedAt: 602_000,
      nowMs: 602_000,
    },
  );
  await t.run(async (ctx) => {
    expect((await ctx.db.get(fixture.grantId))?.status).toBe("suspended");
    await ctx.db.patch(fixture.grantId, {
      status: "active",
      activatedAt: 603_000,
      suspendedAt: undefined,
      updatedAt: 603_000,
    });
  });
  await expect(
    t.mutation(
      (internal as any).providerConnections.deleteOpenAiConnectionInternal,
      { userId: fixture.ownerId },
    ),
  ).resolves.toEqual({ deleted: true });
  await t.run(async (ctx) => {
    expect((await ctx.db.get(fixture.grantId))?.status).toBe("suspended");
    expect(
      await ctx.db
        .query("userProviderConnections")
        .withIndex("by_user_provider", (q: any) =>
          q.eq("userId", fixture.ownerId).eq("provider", "openai"),
        )
        .first(),
    ).toBeNull();
  });
});

test("a community-targeted founder subscription meters managed Luna usage", async () => {
  const priorEnv = {
    input: process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS,
    output: process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
    reservation: process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS,
  };
  process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = "1000000";
  process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = "2000000";
  process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = "1000000";
  try {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const fixture = await t.run(async (ctx) => {
      const cohortFounderId = await insertUser(ctx, "paid-cohort-anchor", nowMs);
      await ctx.db.insert("founderInferenceGrants", {
        userId: cohortFounderId,
        cohortKey: EXISTING_FOUNDER_INFERENCE_COHORT_KEY,
        status: "approved",
        approvedAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const ownerId = await insertUser(ctx, "paid-owner", nowMs);
      const memberId = await insertUser(ctx, "paid-member", nowMs);
      const communityId = await insertCommunity(ctx, ownerId, "paid-community", nowMs);
      const founderSubscriptionId = await ctx.db.insert("founderSubscriptions", {
        ownerUserId: ownerId,
        communityId,
        provider: "stripe",
        providerCustomerId: "cus_founder_paid",
        providerSubscriptionId: "sub_founder_paid",
        providerPriceId: "price_founder_paid",
        status: "active",
        currentPeriodStartAt: nowMs - 60_000,
        currentPeriodEndAt: nowMs + 2_592_000_000,
        cancelAtPeriodEnd: false,
        lastProviderEventCreatedAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const subscription = await ctx.db.get(founderSubscriptionId);
      if (!subscription) throw new Error("test_subscription_missing");
      await syncFounderUsageCycle({
        ctx,
        subscription: subscription as any,
        cycleStartAt: nowMs - 60_000,
        cycleEndAt: nowMs + 2_592_000_000,
        pricing: {
          pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
          includedCostMicros: 20_000_000,
          inputCostMicrosPerMillionTokens: 1_000_000,
          outputCostMicrosPerMillionTokens: 2_000_000,
          maxRunReservationCostMicros: 1_000_000,
        },
        nowMs,
      });
      return { communityId, founderSubscriptionId, memberId, ownerId };
    });

    await expect(
      t.run(async (ctx) =>
        await resolveCommunityInferenceFundingAdmission(ctx, fixture.communityId),
      ),
    ).resolves.toMatchObject({
      ok: true,
      mode: "platform_subscription",
      payerUserId: fixture.ownerId,
      subscriptionId: fixture.founderSubscriptionId,
      modelId: "gpt-5.6-luna",
    });

    const receiptKey = "community_agent_mention:paid-founder";
    const claimed = await t.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      {
        receiptKey,
        sourceRunId: "community-agent-serve:paid-founder",
        communityId: fixture.communityId,
        actorUserId: fixture.memberId,
        expectedPayerUserId: fixture.ownerId,
        expectedFundingMode: "platform_subscription",
        expectedFounderSubscriptionId: fixture.founderSubscriptionId,
        claimToken: "paid-founder-claim",
        nowMs: nowMs + 1_000,
      },
    );
    expect(claimed).toMatchObject({ ok: true, reclaimed: false });
    await t.run(async (ctx) => {
      const receipt = (await ctx.db.get(claimed.receiptId)) as any;
      expect(receipt).toMatchObject({
        fundingMode: "platform_subscription",
        founderSubscriptionId: fixture.founderSubscriptionId,
        pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
        reservedCostMicros: 1_000_000,
      });
      const cycle = await ctx.db.get(receipt?.usageCycleId as any);
      expect(cycle).toMatchObject({ reservedCostMicros: 1_000_000, settledCostMicros: 0 });
    });
    await expect(
      t.mutation(
        (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
        { receiptKey, claimToken: "paid-founder-claim", nowMs: nowMs + 2_000 },
      ),
    ).resolves.toEqual({ ok: true });
    await t.run(async (ctx) => {
      await settleAuthorizedFounderInferenceReceipt({
        ctx,
        receiptKey,
        claimToken: "paid-founder-claim",
        promptTokens: 1_000,
        completionTokens: 500,
        outcomeCode: "completed",
        nowMs: nowMs + 3_000,
      });
      const receipt = (await ctx.db.get(claimed.receiptId)) as any;
      expect(receipt).toMatchObject({ status: "settled", settledCostMicros: 2_000 });
      const cycle = await ctx.db.get(receipt?.usageCycleId as any);
      expect(cycle).toMatchObject({ reservedCostMicros: 0, settledCostMicros: 2_000 });
      await ctx.db.patch(receipt.usageCycleId, {
        settledCostMicros: 19_500_001,
        updatedAt: nowMs + 3_100,
      });
    });
    await expect(
      t.mutation(
        (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
        {
          receiptKey: "community_agent_mention:paid-founder-exhausted",
          sourceRunId: "community-agent-serve:paid-founder-exhausted",
          communityId: fixture.communityId,
          actorUserId: fixture.memberId,
          expectedPayerUserId: fixture.ownerId,
          expectedFundingMode: "platform_subscription",
          expectedFounderSubscriptionId: fixture.founderSubscriptionId,
          claimToken: "paid-founder-exhausted-claim",
          nowMs: nowMs + 3_200,
        },
      ),
    ).resolves.toMatchObject({ ok: false, errorCode: "founder_usage_exhausted" });
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.founderSubscriptionId, {
        status: "past_due",
        updatedAt: nowMs + 4_000,
      });
      const activeGrantId = await ctx.db.insert("founderInferenceGrants", {
        userId: fixture.ownerId,
        cohortKey: EXISTING_FOUNDER_INFERENCE_COHORT_KEY,
        status: "active",
        approvedAt: nowMs,
        activatedAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await insertOpenAiConnection(ctx, fixture.ownerId, "paid-fallback-key", nowMs);
      expect(activeGrantId).toBeTruthy();
      await expect(
        resolveCommunityInferenceFundingAdmission(ctx, fixture.communityId),
      ).resolves.toEqual({ ok: false, code: "founder_subscription_inactive" });
    });
  } finally {
    if (priorEnv.input === undefined) delete process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS;
    else process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = priorEnv.input;
    if (priorEnv.output === undefined) delete process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS;
    else process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = priorEnv.output;
    if (priorEnv.reservation === undefined) delete process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS;
    else process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = priorEnv.reservation;
  }
});

test("managed policy fails closed and founder checkouts remain independent per community", async () => {
  const t = convexTest(schema, modules);
  const nowMs = 650_000;
  const fixture = await t.run(async (ctx) => {
    const cohortAnchorId = await insertUser(ctx, "policy-anchor", nowMs);
    await ctx.db.insert("founderInferenceGrants", {
      userId: cohortAnchorId,
      cohortKey: EXISTING_FOUNDER_INFERENCE_COHORT_KEY,
      status: "approved",
      approvedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const ownerId = await insertUser(ctx, "checkout-owner", nowMs);
    const otherOwnerId = await insertUser(ctx, "checkout-other-owner", nowMs);
    const firstCommunityId = await insertCommunity(ctx, ownerId, "checkout-first", nowMs);
    const secondCommunityId = await insertCommunity(ctx, ownerId, "checkout-second", nowMs);
    const otherCommunityId = await insertCommunity(
      ctx,
      otherOwnerId,
      "checkout-other",
      nowMs,
    );
    await ctx.db.patch(firstCommunityId, {
      inferenceFundingPolicy: "managed_required",
      updatedAt: nowMs,
    });
    return {
      ownerId,
      firstCommunityId,
      secondCommunityId,
      otherCommunityId,
    };
  });

  await expect(
    t.run(async (ctx) =>
      await resolveCommunityInferenceFundingAdmission(
        ctx,
        fixture.firstCommunityId,
      ),
    ),
  ).resolves.toEqual({ ok: false, code: "founder_plan_required" });

  await t.mutation(
    (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
    {
      sessionId: "founder-checkout-first",
      ownerUserId: fixture.ownerId,
      communityId: fixture.firstCommunityId,
      expiresAt: nowMs + 60_000,
      nowMs,
    },
  );
  await expect(
    t.mutation(
      (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
      {
        sessionId: "founder-checkout-second",
        ownerUserId: fixture.ownerId,
        communityId: fixture.secondCommunityId,
        expiresAt: nowMs + 60_000,
        nowMs,
      },
    ),
  ).resolves.toMatchObject({
    sessionId: "founder-checkout-second",
    reused: false,
  });
  await expect(
    t.mutation(
      (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
      {
        sessionId: "founder-checkout-duplicate",
        ownerUserId: fixture.ownerId,
        communityId: fixture.firstCommunityId,
        expiresAt: nowMs + 60_000,
        nowMs,
      },
    ),
  ).resolves.toMatchObject({
    sessionId: "founder-checkout-first",
    reused: true,
  });
  await expect(
    t.mutation(
      (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
      {
        sessionId: "founder-checkout-forbidden",
        ownerUserId: fixture.ownerId,
        communityId: fixture.otherCommunityId,
        expiresAt: nowMs + 60_000,
        nowMs,
      },
    ),
  ).rejects.toThrow("founder_subscription_community_forbidden");
});

test("community subscription history selects one granting row and rejects two", async () => {
  const t = convexTest(schema, modules);
  const nowMs = 675_000;
  await t.run(async (ctx) => {
    const ownerId = await insertUser(ctx, "history-owner", nowMs);
    const communityId = await insertCommunity(ctx, ownerId, "history-community", nowMs);
    await ctx.db.insert("founderSubscriptions", {
      ownerUserId: ownerId,
      communityId,
      provider: "stripe",
      providerCustomerId: "cus_history",
      providerSubscriptionId: "sub_history_ended",
      providerPriceId: "price_history",
      status: "ended",
      currentPeriodStartAt: nowMs - 100_000,
      currentPeriodEndAt: nowMs - 50_000,
      cancelAtPeriodEnd: false,
      endedAt: nowMs - 50_000,
      lastProviderEventCreatedAt: nowMs - 50_000,
      createdAt: nowMs - 100_000,
      updatedAt: nowMs - 50_000,
    });
    const activeId = await ctx.db.insert("founderSubscriptions", {
      ownerUserId: ownerId,
      communityId,
      provider: "stripe",
      providerCustomerId: "cus_history",
      providerSubscriptionId: "sub_history_active",
      providerPriceId: "price_history",
      status: "active",
      currentPeriodStartAt: nowMs - 10_000,
      currentPeriodEndAt: nowMs + 100_000,
      cancelAtPeriodEnd: false,
      lastProviderEventCreatedAt: nowMs,
      createdAt: nowMs - 10_000,
      updatedAt: nowMs,
    });
    await expect(
      getFounderSubscriptionByCommunity(ctx, communityId, nowMs),
    ).resolves.toMatchObject({ _id: activeId });
    await ctx.db.insert("founderSubscriptions", {
      ownerUserId: ownerId,
      communityId,
      provider: "stripe",
      providerCustomerId: "cus_history",
      providerSubscriptionId: "sub_history_ambiguous",
      providerPriceId: "price_history",
      status: "cancel_at_period_end",
      currentPeriodStartAt: nowMs - 5_000,
      currentPeriodEndAt: nowMs + 100_000,
      cancelAtPeriodEnd: true,
      lastProviderEventCreatedAt: nowMs,
      createdAt: nowMs - 5_000,
      updatedAt: nowMs,
    });
    await expect(
      getFounderSubscriptionByCommunity(ctx, communityId, nowMs),
    ).rejects.toThrow("founder_subscription_ambiguous");
  });
});

test("Stripe founder subscription sync is idempotent and ignores stale lifecycle events", async () => {
  const priorEnv = {
    priceId: process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID,
    input: process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS,
    output: process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
    reservation: process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS,
  };
  process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID = "price_founder_79";
  process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = "1000000";
  process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = "2000000";
  process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = "1000000";
  try {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const ownerId = await insertUser(ctx, "stripe-sync-owner", 700_000);
      const communityId = await insertCommunity(
        ctx,
        ownerId,
        "stripe-sync-community",
        700_000,
      );
      return { ownerId, communityId };
    });
    await t.mutation(
      (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
      {
        sessionId: "founder-checkout-sync",
        ownerUserId: fixture.ownerId,
        communityId: fixture.communityId,
        expiresAt: 9_000_000,
        nowMs: 700_000,
      },
    );
    const syncArgs = {
      localSessionId: "founder-checkout-sync",
      providerCheckoutSessionId: "cs_founder_sync",
      providerCustomerId: "cus_founder_sync",
      providerSubscriptionId: "sub_founder_sync",
      providerPriceId: "price_founder_79",
      subscriptionStatus: "active",
      currentPeriodStartAt: 700_000,
      currentPeriodEndAt: 3_292_000_000,
      cancelAtPeriodEnd: false,
      providerEventCreatedAt: 710_000,
    };
    const first = await t.mutation(
      (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
      syncArgs,
    );
    expect(first).toMatchObject({ ok: true, ignored: false, subscriptionStatus: "active" });
    expect(first).toMatchObject({ communityId: fixture.communityId });
    const replay = await t.mutation(
      (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
      syncArgs,
    );
    expect(replay).toMatchObject({
      ok: true,
      ignored: false,
      founderSubscriptionId: first.founderSubscriptionId,
      usageCycleId: first.usageCycleId,
    });
    await expect(
      t.mutation(
        (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
        {
          ...syncArgs,
          localSessionId: null,
          subscriptionStatus: "past_due",
          providerEventCreatedAt: 709_999,
        },
      ),
    ).resolves.toMatchObject({ ok: true, ignored: true, reason: "founder_subscription_event_stale" });
    await expect(
      t.mutation(
        (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
        {
          ...syncArgs,
          localSessionId: null,
          providerCustomerId: "cus_wrong_owner",
          providerEventCreatedAt: 711_000,
        },
      ),
    ).rejects.toThrow("founder_subscription_customer_mismatch");
    await expect(
      t.mutation(
        (internal as any).founderBilling.syncFounderSubscriptionRiskStatusInternal,
        {
          providerSubscriptionId: "sub_founder_sync",
          status: "ended",
          revokedReason: "subscription_refunded",
          providerEventCreatedAt: 720_000,
        },
      ),
    ).resolves.toMatchObject({
      ok: true,
      ignored: false,
      subscriptionStatus: "ended",
      revokedReason: "subscription_refunded",
    });
    const restored = await t.mutation(
      (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
      {
        ...syncArgs,
        localSessionId: null,
        providerEventCreatedAt: 730_000,
      },
    );
    expect(restored).toMatchObject({ ok: true, ignored: false, subscriptionStatus: "active" });
    await expect(
      t.mutation(
        (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
        {
          ...syncArgs,
          localSessionId: null,
          providerPriceId: "price_unmanaged_replacement",
          providerEventCreatedAt: 740_000,
        },
      ),
    ).resolves.toMatchObject({
      ok: true,
      ignored: false,
      subscriptionStatus: "ended",
      revokedReason: "founder_subscription_price_changed",
    });
    await t.mutation(
      (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
      {
        ...syncArgs,
        localSessionId: null,
        providerEventCreatedAt: 750_000,
      },
    );
    await t.run(async (ctx) => {
      expect(await ctx.db.query("founderSubscriptions").collect()).toHaveLength(1);
      expect(await ctx.db.query("founderUsageCycles").collect()).toHaveLength(1);
      const subscription = await ctx.db.get(first.founderSubscriptionId);
      expect(subscription).toMatchObject({ status: "active" });
      expect(subscription).toMatchObject({ communityId: fixture.communityId });
      const community = await ctx.db.get(fixture.communityId);
      expect(community).toMatchObject({ inferenceFundingPolicy: "managed_required" });
      expect(subscription).not.toHaveProperty("endedAt");
      expect(subscription).not.toHaveProperty("revokedReason");
      const checkout = await ctx.db
        .query("checkoutSessions")
        .withIndex("by_sessionId", (q: any) => q.eq("sessionId", "founder-checkout-sync"))
        .first();
      expect(checkout).toMatchObject({
        status: "complete",
        communityId: fixture.communityId,
        founderSubscriptionId: first.founderSubscriptionId,
        providerSubscriptionId: "sub_founder_sync",
      });
    });
  } finally {
    if (priorEnv.priceId === undefined) delete process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID;
    else process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID = priorEnv.priceId;
    if (priorEnv.input === undefined) delete process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS;
    else process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = priorEnv.input;
    if (priorEnv.output === undefined) delete process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS;
    else process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = priorEnv.output;
    if (priorEnv.reservation === undefined) delete process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS;
    else process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = priorEnv.reservation;
  }
});
