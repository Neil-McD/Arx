/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityColdArchive.ts",
  "./communityCommerce.ts",
  "./criticalAudit.ts",
  "./founderBilling.ts",
  "./_generated/**/*.*s",
]);

const NOW_MS = 1_760_000_000_000;
const OWNER_SUBJECT = "cold-archive-command-owner";
const MEMBER_SUBJECT = "cold-archive-command-member";

async function createFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: OWNER_SUBJECT,
      displayName: "Archive owner",
      handle: "archive-command-owner",
      normalizedHandle: "archive-command-owner",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: MEMBER_SUBJECT,
      displayName: "Archive member",
      handle: "archive-command-member",
      normalizedHandle: "archive-command-member",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "cold-archive-command",
      name: "Cold archive command",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "paid_subscription",
      activeMemberCount: 2,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId,
      billingPeriod: "monthly",
      name: "Monthly",
      amountBaseUnits: 2_900,
      currency: "usd",
      currencyDecimals: 2,
      isCurrent: true,
      providerAccountId: "acct_archive_command",
      providerPriceId: "price_archive_command",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "paid_subscription",
      pricePointId,
      active: true,
      activationSequence: 1,
      activatedAt: NOW_MS,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const threadId = await ctx.db.insert("communityChatThreads", {
      communityId,
      lastSeq: 1,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const messageId = await ctx.db.insert("communityChatMessages", {
      threadId,
      seq: 1,
      role: "user",
      contentJson: { text: "Preserve me" },
      senderUserId: memberId,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const checkoutSessionId = await ctx.db.insert("checkoutSessions", {
      sessionId: "archive-command-checkout",
      mode: "community_join",
      provider: "stripe",
      providerAccountId: "acct_archive_command",
      providerCheckoutSessionId: "cs_archive_command",
      providerSubscriptionId: "sub_checkout_archive_command",
      communityId,
      communityLifecycleGeneration: 0,
      billingPeriod: "monthly",
      pricePointId,
      amountBaseUnits: 2_900,
      currency: "usd",
      currencyDecimals: 2,
      ownerUserId: memberId,
      status: "pending",
      expiresAt: NOW_MS + 60_000,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const communitySubscriptionId = await ctx.db.insert("communitySubscriptions", {
      communityId,
      userId: memberId,
      membershipId,
      pricePointId,
      source: "stripe",
      status: "active",
      providerSubscriptionId: "sub_member_archive_command",
      providerAccountId: "acct_archive_command",
      cancelAtPeriodEnd: false,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const founderSubscriptionId = await ctx.db.insert("founderSubscriptions", {
      ownerUserId: ownerId,
      communityId,
      provider: "stripe",
      providerCustomerId: "cus_archive_command",
      providerSubscriptionId: "sub_founder_archive_command",
      providerPriceId: "price_founder_79_monthly",
      status: "active",
      currentPeriodStartAt: NOW_MS - 1_000,
      currentPeriodEndAt: NOW_MS + 30 * 24 * 60 * 60 * 1_000,
      cancelAtPeriodEnd: false,
      lastProviderEventCreatedAt: NOW_MS,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    return {
      ownerId,
      memberId,
      communityId,
      membershipId,
      messageId,
      checkoutSessionId,
      communitySubscriptionId,
      founderSubscriptionId,
    };
  });
}

test("only the owner can archive and repeated commands preserve one generation and job", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await expect(
    asMember.mutation((api as any).communityColdArchive.archiveCommunity, {
      communityId: fixture.communityId,
    }),
  ).rejects.toThrow("community_archive_forbidden");

  await expect(
    asOwner.mutation((api as any).communityColdArchive.archiveCommunity, {
      communityId: fixture.communityId,
    }),
  ).resolves.toMatchObject({
    ok: true,
    changed: true,
    lifecycle_status: "archived",
    lifecycle_generation: 1,
    billing_cleanup_status: "pending",
  });

  await expect(
    asOwner.mutation((api as any).communityColdArchive.archiveCommunity, {
      communityId: fixture.communityId,
    }),
  ).resolves.toMatchObject({
    ok: true,
    changed: false,
    lifecycle_status: "archived",
    lifecycle_generation: 1,
  });

  const state = await t.run(async (ctx) => ({
    community: await ctx.db.get(fixture.communityId),
    membership: await ctx.db.get(fixture.membershipId),
    message: await ctx.db.get(fixture.messageId),
    jobs: await ctx.db
      .query("communityArchiveBillingJobs")
      .withIndex("by_community_generation", (q) =>
        q.eq("communityId", fixture.communityId).eq("lifecycleGeneration", 1),
      )
      .collect(),
  }));
  expect(state.community).toMatchObject({
    lifecycleStatus: "archived",
    lifecycleGeneration: 1,
  });
  expect(state.membership).toMatchObject({ active: true });
  expect(state.message).toMatchObject({ contentJson: { text: "Preserve me" } });
  expect(state.jobs).toHaveLength(1);
});

test("cleanup work is ordered checkouts then connected members then founder and preserves content", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  await asOwner.mutation((api as any).communityColdArchive.archiveCommunity, {
    communityId: fixture.communityId,
  });
  const jobId = await t.run(async (ctx) =>
    (await ctx.db
      .query("communityArchiveBillingJobs")
      .withIndex("by_community_generation", (q) =>
        q.eq("communityId", fixture.communityId).eq("lifecycleGeneration", 1),
      )
      .first())!._id,
  );

  await expect(
    t.query(
      (internal as any).communityColdArchive.getCommunityArchiveBillingJobWorkInternal,
      { jobId },
    ),
  ).resolves.toMatchObject({
    kind: "checkouts",
    targets: [{ providerAccountId: "acct_archive_command" }],
  });
  await t.mutation(
    (internal as any).communityColdArchive.applyCommunityArchiveBillingBatchInternal,
    {
      jobId,
      checkoutSessionIds: [fixture.checkoutSessionId],
      communitySubscriptionIds: [],
      founderSubscriptionIds: [],
      nowMs: NOW_MS + 1,
    },
  );

  await expect(
    t.query(
      (internal as any).communityColdArchive.getCommunityArchiveBillingJobWorkInternal,
      { jobId },
    ),
  ).resolves.toMatchObject({
    kind: "member_subscriptions",
    targets: [
      {
        providerSubscriptionId: "sub_member_archive_command",
        providerAccountId: "acct_archive_command",
      },
    ],
  });
  await t.mutation(
    (internal as any).communityColdArchive.applyCommunityArchiveBillingBatchInternal,
    {
      jobId,
      checkoutSessionIds: [],
      communitySubscriptionIds: [fixture.communitySubscriptionId],
      founderSubscriptionIds: [],
      nowMs: NOW_MS + 2,
    },
  );

  await expect(
    t.query(
      (internal as any).communityColdArchive.getCommunityArchiveBillingJobWorkInternal,
      { jobId },
    ),
  ).resolves.toMatchObject({
    kind: "founder_subscriptions",
    targets: [
      {
        providerSubscriptionId: "sub_founder_archive_command",
        providerAccountId: null,
      },
    ],
  });
  await t.mutation(
    (internal as any).communityColdArchive.applyCommunityArchiveBillingBatchInternal,
    {
      jobId,
      checkoutSessionIds: [],
      communitySubscriptionIds: [],
      founderSubscriptionIds: [fixture.founderSubscriptionId],
      nowMs: NOW_MS + 3,
    },
  );
  await expect(
    t.query(
      (internal as any).communityColdArchive.getCommunityArchiveBillingJobWorkInternal,
      { jobId },
    ),
  ).resolves.toMatchObject({ kind: "complete" });
  await t.mutation(
    (internal as any).communityColdArchive.completeCommunityArchiveBillingJobInternal,
    { jobId, nowMs: NOW_MS + 4 },
  );
  const pricePointId = await t.run(async (ctx) =>
    (await ctx.db.get(fixture.communitySubscriptionId))!.pricePointId,
  );

  await expect(
    t.mutation(
      (internal as any).communityCommerce.syncCommunitySubscriptionLifecycleInternal,
      {
        communityId: fixture.communityId,
        userId: fixture.memberId,
        source: "stripe",
        status: "active",
        pricePointId,
        providerAccountId: "acct_archive_command",
        providerSubscriptionId: "sub_member_archive_command",
        nowMs: NOW_MS + 5,
      },
    ),
  ).resolves.toMatchObject({ ignored: true, reason: "community_archived" });
  await expect(
    t.mutation(
      (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
      {
        providerCustomerId: "cus_archive_command",
        providerSubscriptionId: "sub_founder_archive_command",
        providerPriceId: "price_founder_79_monthly",
        subscriptionStatus: "active",
        currentPeriodStartAt: NOW_MS,
        currentPeriodEndAt: NOW_MS + 30 * 24 * 60 * 60 * 1_000,
        cancelAtPeriodEnd: false,
        providerEventCreatedAt: NOW_MS + 6,
      },
    ),
  ).resolves.toMatchObject({ ignored: true, reason: "community_archived" });

  const state = await t.run(async (ctx) => ({
    checkout: await ctx.db.get(fixture.checkoutSessionId),
    communitySubscription: await ctx.db.get(fixture.communitySubscriptionId),
    founderSubscription: await ctx.db.get(fixture.founderSubscriptionId),
    membership: await ctx.db.get(fixture.membershipId),
    message: await ctx.db.get(fixture.messageId),
    job: await ctx.db.get(jobId),
  }));
  expect(state.checkout).toMatchObject({ status: "expired" });
  expect(state.communitySubscription).toMatchObject({ status: "ended" });
  expect(state.founderSubscription).toMatchObject({
    status: "ended",
    revokedReason: "community_archived",
  });
  expect(state.membership).toMatchObject({ active: true });
  expect(state.message).toMatchObject({ contentJson: { text: "Preserve me" } });
  expect(state.job).toMatchObject({ status: "complete" });
});

test("an in-flight checkout without provider identity gets a bounded settlement window", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const checkoutCreatedAt = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.delete(fixture.checkoutSessionId);
    await ctx.db.insert("checkoutSessions", {
      sessionId: "archive-command-settling-checkout",
      mode: "community_join",
      provider: "stripe",
      providerAccountId: "acct_archive_command",
      communityId: fixture.communityId,
      communityLifecycleGeneration: 0,
      billingPeriod: "monthly",
      amountBaseUnits: 2_900,
      currency: "usd",
      currencyDecimals: 2,
      ownerUserId: fixture.memberId,
      status: "pending",
      expiresAt: checkoutCreatedAt + 60_000,
      createdAt: checkoutCreatedAt,
      updatedAt: checkoutCreatedAt,
    });
  });
  await t.withIdentity({ subject: OWNER_SUBJECT }).mutation(
    (api as any).communityColdArchive.archiveCommunity,
    { communityId: fixture.communityId },
  );
  const jobId = await t.run(async (ctx) =>
    (await ctx.db
      .query("communityArchiveBillingJobs")
      .withIndex("by_community_generation", (q) =>
        q.eq("communityId", fixture.communityId).eq("lifecycleGeneration", 1),
      )
      .first())!._id,
  );
  await expect(
    t.query(
      (internal as any).communityColdArchive.getCommunityArchiveBillingJobWorkInternal,
      { jobId },
    ),
  ).resolves.toMatchObject({ kind: "wait" });
});

test("blocked cleanup can be explicitly rearmed without another lifecycle transition", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  await asOwner.mutation((api as any).communityColdArchive.archiveCommunity, {
    communityId: fixture.communityId,
  });
  const jobId = await t.run(async (ctx) =>
    (await ctx.db
      .query("communityArchiveBillingJobs")
      .withIndex("by_community_generation", (q) =>
        q.eq("communityId", fixture.communityId).eq("lifecycleGeneration", 1),
      )
      .first())!._id,
  );
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await t.mutation(
      (internal as any).communityColdArchive.failCommunityArchiveBillingJobInternal,
      { jobId, errorCode: "stripe_unavailable", nowMs: NOW_MS + attempt },
    );
  }
  await expect(t.run(async (ctx) => ctx.db.get(jobId))).resolves.toMatchObject({
    status: "blocked",
    attemptCount: 12,
  });
  await expect(
    asOwner.mutation((api as any).communityColdArchive.archiveCommunity, {
      communityId: fixture.communityId,
    }),
  ).resolves.toMatchObject({
    changed: false,
    lifecycle_generation: 1,
    billing_cleanup_status: "pending",
  });
  await expect(t.run(async (ctx) => ctx.db.get(jobId))).resolves.toMatchObject({
    status: "pending",
    attemptCount: 0,
  });
});

test("the platform home community cannot be archived", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, { slug: "polynet" });
  });
  await expect(
    t.withIdentity({ subject: OWNER_SUBJECT }).mutation(
      (api as any).communityColdArchive.archiveCommunity,
      { communityId: fixture.communityId },
    ),
  ).rejects.toThrow("community_archive_platform_home_forbidden");
});
