/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import {
  executeR41nb0wRetirementCore,
  inspectR41nb0wRetirementCore,
  type R41nb0wRetirementTarget,
} from "./r41nb0wRetirementCore";
import { EXISTING_FOUNDER_INFERENCE_COHORT_KEY } from "../shared/founderInference";

const modules = import.meta.glob(["./_generated/**/*.*s"]);

async function insertUser(ctx: any, suffix: string, nowMs = 1_000) {
  return await ctx.db.insert("users", {
    authSubject: `r41nb0w-${suffix}`,
    displayName: suffix,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

async function insertCommunity(ctx: any, ownerId: any, suffix: string, nowMs = 1_000) {
  return await ctx.db.insert("communities", {
    ownerId,
    slug: suffix,
    name: suffix.toUpperCase(),
    visibility: "published",
    entryPolicy: "approval",
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

async function createFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const nowMs = 10_000;
    const ownerUserId = await insertUser(ctx, "owner", nowMs);
    const otherUserId = await insertUser(ctx, "other", nowMs);
    const communityId = await insertCommunity(ctx, ownerUserId, "r41nb0w", nowMs);
    const controlCommunityId = await insertCommunity(ctx, otherUserId, "control", nowMs);
    const avatarStorageId = await ctx.storage.store(new Blob(["avatar"]));
    const moduleStorageId = await ctx.storage.store(new Blob(["module"]));
    await ctx.db.patch(communityId, { avatarStorageId });
    const founderGrantId = await ctx.db.insert("founderInferenceGrants", {
      userId: ownerUserId,
      cohortKey: EXISTING_FOUNDER_INFERENCE_COHORT_KEY,
      status: "approved",
      approvedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const openAiConnectionId = await ctx.db.insert("userProviderConnections", {
      userId: ownerUserId,
      provider: "openai",
      authKind: "api_key",
      encryptedSecretHex: "encrypted",
      secretIvHex: "iv",
      secretVersion: 1,
      keyFingerprint: "fingerprint",
      validatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const retainedProviderConnectionId = await ctx.db.insert("userProviderConnections", {
      userId: ownerUserId,
      provider: "openrouter",
      authKind: "api_key",
      encryptedSecretHex: "encrypted-openrouter",
      secretIvHex: "iv-openrouter",
      secretVersion: 1,
      validatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityFunnels", {
      communityId,
      heroMediaKind: "image",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityAnalyticsEvents", {
      communityId,
      eventType: "funnel_visit",
      createdAt: nowMs,
    });
    const threadId = await ctx.db.insert("communityChatThreads", {
      communityId,
      lastSeq: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const messageId = await ctx.db.insert("communityChatMessages", {
      threadId,
      seq: 1,
      role: "user",
      contentJson: { text: "target" },
      senderUserId: ownerUserId,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityMessageReactions", {
      messageId,
      userId: ownerUserId,
      emoji: "wave",
      createdAt: nowMs,
    });
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId,
      createdByUserId: ownerUserId,
      status: "live",
      name: "Module",
      bannerStorageId: moduleStorageId,
      sortOrder: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityResources", {
      communityId,
      moduleId,
      createdByUserId: ownerUserId,
      type: "link",
      role: "page",
      status: "published",
      title: "Resource",
      url: "https://example.com",
      pinned: false,
      sortOrder: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityArchiveDocuments", {
      communityId,
      sourceType: "resource",
      sourceId: "retained-until-cognition-drain",
      title: "Derived",
      sourceText: "derived",
      text: "derived",
      snippet: "derived",
      isPdf: false,
      embeddingStatus: "pending",
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId,
      billingPeriod: "month",
      name: "Historical price",
      amountBaseUnits: 600,
      currency: "usd",
      currencyDecimals: 2,
      isCurrent: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const checkoutSessionId = await ctx.db.insert("checkoutSessions", {
      sessionId: "retained-session",
      mode: "community_join",
      communityId,
      pricePointId,
      ownerUserId,
      status: "pending",
      expiresAt: nowMs + 1_000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const purchaseClaimId = await ctx.db.insert("purchaseClaims", {
      claimToken: "retained-claim",
      communityId,
      pricePointId,
      ownerUserId,
      status: "pending",
      expiresAt: nowMs + 1_000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const stripeConnectId = await ctx.db.insert("userStripeConnectAccounts", {
      userId: ownerUserId,
      stripeAccountId: "acct_retained",
      accountType: "express",
      status: "ready",
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      requirementsCurrentlyDue: [],
      requirementsEventuallyDue: [],
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const auditId = await ctx.db.insert("criticalAuditEvents", {
      eventKey: "retained-audit",
      eventType: "community_checkout_created",
      severity: "info",
      status: "succeeded",
      communityId,
      provider: "polynet",
      createdAt: nowMs,
    });
    const dmId = await ctx.db.insert("dmConversations", {
      kind: "direct",
      canonicalKey: "retained-dm",
      createdByUserId: ownerUserId,
      createdFromCommunityId: communityId,
      lastSeq: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const appId = await ctx.db.insert("developerApps", {
      ownerUserId,
      name: "Retained app",
      slug: "retained-app",
      endpointUrl: "https://example.com/mcp",
      authType: "none",
      status: "draft",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId: controlCommunityId,
      userId: ownerUserId,
      role: "member",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const controlFunnelId = await ctx.db.insert("communityFunnels", {
      communityId: controlCommunityId,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    const target: R41nb0wRetirementTarget = {
      ownerUserId,
      communityId,
      founderGrantId,
      openAiConnectionId,
      communitySlug: "r41nb0w",
      communityName: "R41NB0W",
    };
    return {
      target,
      avatarStorageId,
      moduleStorageId,
      retainedIds: {
        ownerUserId,
        retainedProviderConnectionId,
        pricePointId,
        checkoutSessionId,
        purchaseClaimId,
        stripeConnectId,
        auditId,
        dmId,
        appId,
        membershipId,
        controlCommunityId,
        controlFunnelId,
      },
    };
  });
}

test("exact retirement deletes only R41NB0W product/control state and preserves history", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);

  await t.run(async (ctx) => {
    const inspection = await inspectR41nb0wRetirementCore({
      ctx,
      target: fixture.target,
    });
    expect(inspection.ready).toBe(true);
    expect(inspection.product_counts).toMatchObject({
      communityFunnels: 1,
      communityAnalyticsEvents: 1,
      communityChatThreads: 1,
      communityChatMessages: 1,
      communityMessageReactions: 1,
      communityResourceModules: 1,
      communityResources: 1,
    });
    expect(inspection.storage_object_count).toBe(2);
    expect(inspection.retained_counts).toMatchObject({
      stripe_connect_accounts: 1,
      community_price_points: 1,
      checkout_sessions: 1,
      purchase_claims: 1,
      critical_audit_events: 1,
      direct_messages_from_community: 1,
      developer_apps: 1,
    });

    await executeR41nb0wRetirementCore({
      ctx,
      target: fixture.target,
      nowMs: 20_000,
    });

    expect(await ctx.db.get(fixture.target.communityId)).toBeNull();
    expect(await ctx.db.get(fixture.target.founderGrantId)).toBeNull();
    expect(await ctx.db.get(fixture.target.openAiConnectionId)).toBeNull();
    for (const id of Object.values(fixture.retainedIds)) {
      expect(await ctx.db.get(id as any)).not.toBeNull();
    }
    expect(await ctx.storage.getUrl(fixture.avatarStorageId)).toBeNull();
    expect(await ctx.storage.getUrl(fixture.moduleStorageId)).toBeNull();
    expect(
      await ctx.db
        .query("communityArchiveDocuments")
        .withIndex("by_community_createdAt", (query: any) =>
          query.eq("communityId", fixture.target.communityId),
        )
        .first(),
    ).not.toBeNull();
    expect(
      await ctx.db
        .query("communityFunnels")
        .withIndex("by_community", (query: any) =>
          query.eq("communityId", fixture.target.communityId),
        )
        .first(),
    ).toBeNull();
  });
});

test("retirement fails closed for activation, access, successful billing, and shared media", async () => {
  const activeGrantTest = convexTest(schema, modules);
  const activeGrantFixture = await createFixture(activeGrantTest);
  await activeGrantTest.run(async (ctx) => {
    await ctx.db.patch(activeGrantFixture.target.founderGrantId, {
      status: "active",
      activatedAt: 20_000,
    });
    const inspection = await inspectR41nb0wRetirementCore({
      ctx,
      target: activeGrantFixture.target,
    });
    expect(inspection.ready).toBe(false);
    expect(inspection.violations).toContain("founder_grant_not_pristine_approved");
  });

  const accessTest = convexTest(schema, modules);
  const accessFixture = await createFixture(accessTest);
  await accessTest.run(async (ctx) => {
    await ctx.db.insert("communityMemberships", {
      communityId: accessFixture.target.communityId,
      userId: accessFixture.target.ownerUserId,
      role: "admin",
      active: true,
      createdAt: 20_000,
      updatedAt: 20_000,
    });
    const inspection = await inspectR41nb0wRetirementCore({
      ctx,
      target: accessFixture.target,
    });
    expect(inspection.ready).toBe(false);
    expect(inspection.violations).toContain("communityMemberships_not_empty");
  });

  const billingTest = convexTest(schema, modules);
  const billingFixture = await createFixture(billingTest);
  await billingTest.run(async (ctx) => {
    await ctx.db.patch(billingFixture.retainedIds.checkoutSessionId, { status: "complete" });
    const inspection = await inspectR41nb0wRetirementCore({
      ctx,
      target: billingFixture.target,
    });
    expect(inspection.ready).toBe(false);
    expect(inspection.violations).toContain("completed_checkout_present");
  });

  const sharedMediaTest = convexTest(schema, modules);
  const sharedMediaFixture = await createFixture(sharedMediaTest);
  await sharedMediaTest.run(async (ctx) => {
    await ctx.db.insert("userProfileDetails", {
      userId: sharedMediaFixture.retainedIds.ownerUserId,
      avatarStorageId: sharedMediaFixture.avatarStorageId,
      createdAt: 20_000,
      updatedAt: 20_000,
    });
    await expect(
      inspectR41nb0wRetirementCore({ ctx, target: sharedMediaFixture.target }),
    ).rejects.toThrow("r41nb0w_retirement_shared_storage_forbidden");
  });
});
