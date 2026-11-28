/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { grantCommunityCheckout } from "./billingCore";
import { startCommunityJoinCheckoutCore } from "./communityCommerce";
import schema from "./schema";

const { createCheckoutSessionMock, createCustomerMock } = vi.hoisted(() => ({
  createCheckoutSessionMock: vi.fn(),
  createCustomerMock: vi.fn(),
}));

vi.mock("./stripeCore", () => ({
  getStripeClient: () => ({
    checkout: {
      sessions: {
        create: createCheckoutSessionMock,
      },
    },
    customers: {
      create: createCustomerMock,
      retrieve: vi.fn().mockResolvedValue({ id: "cus_test_slice3", deleted: false }),
    },
  }),
  requireStripeConnectWebhookConfiguration: () => undefined,
}));

const modules = import.meta.glob([
  "./communityLanding.ts",
  "./communityAdmin.ts",
  "./communityCommerce.ts",
  "./communityCheckoutBuyer.ts",
  "./communityPodPayments.ts",
  "./communityMemberRecords.ts",
  "./communityMemberJourney.ts",
  "./distributionAttribution.ts",
  "./authActor.ts",
  "./starterProfile.ts",
  "./communityMembershipLifecycle.ts",
  "./communityPublic.ts",
  "./communityPlanPods.ts",
  "./communityMemberSearch.ts",
  "./creatorCommerce.ts",
  "./email.ts",
  "./emailEvents.ts",
  "./communityMemberCoach.ts",
  "./connectedApps.ts",
  "./_generated/**/*.*s",
]);

const AID_1 = "6df50193-e11a-49cf-91e7-18e09ede226f";
const CID_1 = "883c5850-e04d-4c60-9869-024102985541";
const ACCOUNT_A = "2d6f6736-3df3-49b7-b84c-c82db2d5f412";
const NOW = 1_780_000_000_000;

beforeEach(() => {
  vi.stubEnv("ARX_DB_KEY", "test-db-encryption-key-for-slice-3");
  vi.stubEnv("PUBLIC_APP_URL", "https://www.polynet.ai");
  createCheckoutSessionMock.mockReset().mockResolvedValue({
    id: "cs_test_slice3",
    url: "https://checkout.stripe.com/c/pay/cs_test_slice3",
    customer: "cus_test_slice3",
    subscription: "sub_test_slice3",
    expires_at: Math.floor((NOW + 30 * 60_000) / 1000),
  });
  createCustomerMock.mockReset().mockResolvedValue({ id: "cus_test_slice3" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function seedUser(ctx: any, subject: string, email: string) {
  const userId = await ctx.db.insert("users", {
    authSubject: subject,
    email,
    normalizedEmail: email,
    emailVerifiedAt: NOW,
    emailVerificationSource: "oauth_provider",
    displayName: subject,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await ctx.db.insert("userProfileDetails", {
    userId,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await ctx.db.insert("legalAcceptances", {
    userId,
    documentKey: "terms_of_service",
    documentVersion: "2026-01-01",
    acceptedAt: NOW,
    source: "web_signup",
    createdAt: NOW,
  });
  return userId;
}

describe("Slice 3: end-to-end Distribution Engineer coupling across joins, approvals, checkouts, and pods", () => {
  it("stamps DE origin on free join for existing user, queues DE delivery, and isolates Member Profile per community", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const ownerId = await seedUser(ctx, "owner_1", "owner@example.com");
      const memberId = await seedUser(ctx, "existing_member", "existing@example.com");
      const commA = await ctx.db.insert("communities", {
        ownerId,
        slug: "comm-a",
        name: "Community A",
        visibility: "published",
        entryPolicy: "open",
        inferenceFundingPolicy: "managed_required",
        createdAt: NOW,
        updatedAt: NOW,
      });
      const commB = await ctx.db.insert("communities", {
        ownerId,
        slug: "comm-b",
        name: "Community B",
        visibility: "published",
        entryPolicy: "open",
        inferenceFundingPolicy: "managed_required",
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { ownerId, memberId, commA, commB };
    });

    const asOwner = t.withIdentity({ subject: "owner_1" });
    await asOwner.mutation(api.distributionAttribution.saveCommunityDistributionConnection, {
      authSubject: "owner_1",
      communityId: fixture.commA,
      accountId: ACCOUNT_A,
      webhookKey: "de_secret_comm_a_1234567890abcd",
    });

    // Existing Polynet user joins Community A with DE tracking, and Community B organically.
    const asMember = t.withIdentity({ subject: "existing_member" });
    await asMember.mutation(api.communityLanding.joinCommunityFromLanding, {
      communitySlug: "comm-a",
      authSubject: "existing_member",
      distributionAttribution: { anonymousId: AID_1, clickId: CID_1 },
    });
    await asMember.mutation(api.communityLanding.joinCommunityFromLanding, {
      communitySlug: "comm-b",
      authSubject: "existing_member",
    });

    // Membership A has stamped origin + queued DE delivery; Membership B has neither.
    const [memA, memB, deliveries] = await t.run(async (ctx) => {
      const mA = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.commA).eq("userId", fixture.memberId),
        )
        .unique();
      const mB = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.commB).eq("userId", fixture.memberId),
        )
        .unique();
      const d = await ctx.db.query("distributionAttributionDeliveries").collect();
      return [mA, mB, d] as const;
    });

    expect(memA?.attributionAnonymousId).toBe(AID_1);
    expect(memA?.attributionClickId).toBe(CID_1);
    expect(memB?.attributionAnonymousId).toBeUndefined();
    expect(memB?.attributionClickId).toBeUndefined();
    expect(deliveries).toHaveLength(1);
    expect(String(deliveries[0]?.communityId)).toBe(String(fixture.commA));

    // Host profile for Community A shows Distribution Engineer; Community B does NOT bleed!
    const profileA = await asOwner.query(api.communityMemberRecords.getCommunityMemberRecord, {
      authSubject: "owner_1",
      communityId: fixture.commA,
      membershipId: memA!._id,
    });
    const profileB = await asOwner.query(api.communityMemberRecords.getCommunityMemberRecord, {
      authSubject: "owner_1",
      communityId: fixture.commB,
      membershipId: memB!._id,
    });
    expect(profileA?.attribution).toMatchObject({
      source_label: "Distribution Engineer",
      click_id: CID_1,
    });
    expect(profileB?.attribution).toBeNull();
  });

  it("carries DE origin through approval-gated join requests onto approved memberships", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const ownerId = await seedUser(ctx, "owner_app", "owner-app@example.com");
      const applicantId = await seedUser(ctx, "applicant_1", "applicant@example.com");
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "gated-club",
        name: "Gated Club",
        visibility: "published",
        entryPolicy: "approval",
        inferenceFundingPolicy: "managed_required",
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { ownerId, applicantId, communityId };
    });

    const asOwner = t.withIdentity({ subject: "owner_app" });
    await asOwner.mutation(api.distributionAttribution.saveCommunityDistributionConnection, {
      authSubject: "owner_app",
      communityId: fixture.communityId,
      accountId: ACCOUNT_A,
      webhookKey: "de_secret_gated_1234567890abcd",
    });

    const asApplicant = t.withIdentity({ subject: "applicant_1" });
    const joinRes = await asApplicant.mutation(api.communityLanding.joinCommunityFromLanding, {
      communitySlug: "gated-club",
      authSubject: "applicant_1",
      distributionAttribution: { anonymousId: AID_1, clickId: CID_1 },
    });
    expect(joinRes.outcome).toBe("approval_pending");

    const reqRow = await t.run(async (ctx) =>
      ctx.db
        .query("communityJoinRequests")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.communityId).eq("userId", fixture.applicantId),
        )
        .unique(),
    );
    expect(reqRow?.attributionAnonymousId).toBe(AID_1);
    expect(reqRow?.attributionClickId).toBe(CID_1);

    await asOwner.mutation(api.communityAdmin.approveCommunityJoinRequest, {
      authSubject: "owner_app",
      requestId: reqRow!._id,
    });

    const membership = await t.run(async (ctx) =>
      ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.communityId).eq("userId", fixture.applicantId),
        )
        .unique(),
    );
    expect(membership?.attributionAnonymousId).toBe(AID_1);
    expect(membership?.attributionClickId).toBe(CID_1);
  });

  it("forwards DE visitor and click IDs to Stripe membership checkout & subscription metadata and paid pod upsells", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const ownerId = await seedUser(ctx, "owner_paid", "owner-paid@example.com");
      const buyerId = await seedUser(ctx, "buyer_1", "buyer@example.com");
      await ctx.db.insert("userStripeConnectAccounts", {
        userId: ownerId,
        stripeAccountId: "acct_test_owner",
        accountType: "express",
        status: "ready",
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        requirementsCurrentlyDue: [],
        requirementsEventuallyDue: [],
        createdAt: NOW,
        updatedAt: NOW,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "paid-club",
        name: "Paid Club",
        visibility: "published",
        entryPolicy: "paid_subscription",
        inferenceFundingPolicy: "managed_required",
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("communityPricePoints", {
        communityId,
        billingPeriod: "monthly",
        name: "Monthly Membership",
        amountBaseUnits: 4900,
        currency: "usd",
        currencyDecimals: 2,
        providerAccountId: "acct_test_owner",
        providerPriceId: "price_test_paid",
        isCurrent: true,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const podChannelId = await ctx.db.insert("communityChannels", {
        communityId,
        slug: "vip-pod",
        name: "VIP Pod",
        accessMode: "restricted",
        postingPolicy: "members",
        status: "active",
        position: 1,
        createdByUserId: ownerId,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("communityPods", {
        communityId,
        channelId: podChannelId,
        purpose: "VIP coaching pod",
        visibility: "listed",
        priceAmountBaseUnits: 9900,
        priceCurrency: "usd",
        providerAccountId: "acct_test_owner",
        providerProductId: "prod_test_pod",
        providerPriceId: "price_test_pod",
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { ownerId, buyerId, communityId, podChannelId };
    });

    const asOwner = t.withIdentity({ subject: "owner_paid" });
    await asOwner.mutation(api.distributionAttribution.saveCommunityDistributionConnection, {
      authSubject: "owner_paid",
      communityId: fixture.communityId,
      accountId: ACCOUNT_A,
      webhookKey: "de_secret_paid_1234567890abcd",
    });

    // 1. Signed-in checkout forwards de_aid + de_cid to Stripe checkout AND subscription metadata.
    const asBuyer = t.withIdentity({ subject: "buyer_1" });
    const started = await asBuyer.action(api.communityLanding.startCommunityLandingCheckout, {
      communitySlug: "paid-club",
      billingPeriod: "monthly",
      authSubject: "buyer_1",
      distributionAttribution: { anonymousId: AID_1, clickId: CID_1 },
    });
    expect(started.checkout_url).toContain("stripe.com");
    expect(createCheckoutSessionMock).toHaveBeenCalledTimes(1);
    const [stripePayload] = createCheckoutSessionMock.mock.calls[0]!;
    expect(stripePayload.metadata).toMatchObject({ de_aid: AID_1, de_cid: CID_1 });
    expect(stripePayload.subscription_data.metadata).toMatchObject({
      de_aid: AID_1,
      de_cid: CID_1,
    });

    // 2. Completing checkout stamps origin on membership & queues per-community DE delivery.
    const sessionRow = await t.run(async (ctx) => {
      const row = await ctx.db
        .query("checkoutSessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", started.session_id))
        .unique();
      await ctx.db.patch(row!._id, {
        status: "complete",
        communitySubscriptionStatus: "active",
        providerSubscriptionId: "sub_test_slice3",
        updatedAt: NOW + 1000,
      });
      return await ctx.db.get(row!._id);
    });
    expect(sessionRow?.attributionAnonymousId).toBe(AID_1);
    expect(sessionRow?.attributionClickId).toBe(CID_1);

    await t.run(async (ctx) => {
      await grantCommunityCheckout({ ctx, checkoutSession: sessionRow, nowMs: NOW + 2000 });
    });

    const membership = await t.run(async (ctx) =>
      ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.communityId).eq("userId", fixture.buyerId),
        )
        .unique(),
    );
    expect(membership?.attributionAnonymousId).toBe(AID_1);
    expect(membership?.attributionClickId).toBe(CID_1);

    // 3. When that attributed member buys a paid pod upsell, Stripe pod metadata also gets de_aid + de_cid!
    createCheckoutSessionMock.mockClear();
    await asBuyer.action(api.communityPodPayments.startPodCheckout, {
      authSubject: "buyer_1",
      communityId: fixture.communityId,
      channelId: fixture.podChannelId,
      successUrl: "https://www.polynet.ai/c/paid-club?pod={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://www.polynet.ai/c/paid-club",
    });
    expect(createCheckoutSessionMock).toHaveBeenCalledTimes(1);
    const [podStripePayload] = createCheckoutSessionMock.mock.calls[0]!;
    expect(podStripePayload.metadata).toMatchObject({ de_aid: AID_1, de_cid: CID_1 });
    expect(podStripePayload.subscription_data.metadata).toMatchObject({
      de_aid: AID_1,
      de_cid: CID_1,
    });

    // 4. Malformed tracking IDs on guest cash-first checkout are silently dropped (never break checkout).
    createCheckoutSessionMock.mockClear();
    await t.run(async (ctx) => {
      await startCommunityJoinCheckoutCore(
        {
          runQuery: (ref: any, args: any) => t.query(ref, args),
          runMutation: (ref: any, args: any) => t.mutation(ref, args),
        },
        {
          communitySlug: "paid-club",
          billingPeriod: "monthly",
          guest: true,
          visitorHash: "a".repeat(64),
          successUrl: "https://www.polynet.ai/c/paid-club?checkout={CHECKOUT_SESSION_ID}",
          cancelUrl: "https://www.polynet.ai/c/paid-club?checkout=canceled",
          distributionAttribution: { anonymousId: "not-a-uuid", clickId: "bad" },
        },
      );
    });
    expect(createCheckoutSessionMock).toHaveBeenCalledTimes(1);
    const [guestPayload] = createCheckoutSessionMock.mock.calls[0]!;
    expect(guestPayload.metadata.de_aid).toBeUndefined();
    expect(guestPayload.metadata.de_cid).toBeUndefined();
  });

  it("persists UTM, referral, and referrer attribution across open, approval, and paid joins and surfaces on Member Records without firing DE", async () => {
    const t = convexTest(schema, modules);
    const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);

    const fixture = await t.run(async (ctx) => {
      const ownerId = await seedUser(ctx, "owner_utm", "owner-utm@example.com");
      const openUserId = await seedUser(ctx, "member_utm_open", "open@example.com");
      const approvalUserId = await seedUser(ctx, "member_utm_app", "approval@example.com");
      const paidUserId = await seedUser(ctx, "member_utm_paid", "paid@example.com");
      await ctx.db.insert("userStripeConnectAccounts", {
        userId: ownerId,
        stripeAccountId: "acct_utm_paid_123",
        accountType: "express",
        status: "ready",
        detailsSubmitted: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        requirementsCurrentlyDue: [],
        requirementsEventuallyDue: [],
        createdAt: NOW,
        updatedAt: NOW,
      });
      const openCommunityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "utm-open",
        name: "UTM Open",
        visibility: "published",
        entryPolicy: "open",
        inferenceFundingPolicy: "managed_required",
        lifecycleStatus: "active",
        lifecycleGeneration: 1,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const approvalCommunityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "utm-approval",
        name: "UTM Approval",
        visibility: "published",
        entryPolicy: "approval",
        inferenceFundingPolicy: "managed_required",
        lifecycleStatus: "active",
        lifecycleGeneration: 1,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const paidCommunityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "utm-paid",
        name: "UTM Paid",
        visibility: "published",
        entryPolicy: "paid_subscription",
        inferenceFundingPolicy: "managed_required",
        lifecycleStatus: "active",
        lifecycleGeneration: 1,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("communityPricePoints", {
        communityId: paidCommunityId,
        billingPeriod: "monthly",
        name: "Pro",
        amountBaseUnits: 4900,
        currency: "usd",
        currencyDecimals: 2,
        providerAccountId: "acct_utm_paid_123",
        isCurrent: true,
        providerPriceId: "price_utm_pro_1",
        createdAt: NOW,
        updatedAt: NOW,
      });
      return {
        ownerId,
        openUserId,
        approvalUserId,
        paidUserId,
        openCommunityId,
        approvalCommunityId,
        paidCommunityId,
      };
    });

    const asOwner = t.withIdentity({ subject: "owner_utm" });
    const asOpen = t.withIdentity({ subject: "member_utm_open" });
    const asApproval = t.withIdentity({ subject: "member_utm_app" });
    const asPaid = t.withIdentity({ subject: "member_utm_paid" });

    // 1. Open join stamps UTM campaign and appears on Member Record without firing DE.
    await asOpen.mutation(api.communityLanding.joinCommunityFromLanding, {
      authSubject: "member_utm_open",
      communitySlug: "utm-open",
      distributionAttribution: {
        utmSource: "youtube",
        utmMedium: "video",
        utmCampaign: "spring-launch",
      },
    });
    const openMem = await t.run(async (ctx) =>
      ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.openCommunityId).eq("userId", fixture.openUserId),
        )
        .unique(),
    );
    expect(openMem?.attributionUtmSource).toBe("youtube");
    expect(openMem?.attributionUtmCampaign).toBe("spring-launch");
    const openRecord = await asOwner.query(api.communityMemberRecords.getCommunityMemberRecord, {
      authSubject: "owner_utm",
      communityId: fixture.openCommunityId,
      membershipId: openMem!._id,
    });
    expect(openRecord?.attribution).toMatchObject({
      source_label: "YouTube · spring-launch",
      click_id: null,
    });

    // 2. Approval request preserves referral code until manager approval.
    await asApproval.mutation(api.communityLanding.joinCommunityFromLanding, {
      authSubject: "member_utm_app",
      communitySlug: "utm-approval",
      distributionAttribution: { referralCode: "alex" },
    });
    const reqRow = await t.run(async (ctx) =>
      ctx.db
        .query("communityJoinRequests")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.approvalCommunityId).eq("userId", fixture.approvalUserId),
        )
        .unique(),
    );
    expect(reqRow?.attributionReferralCode).toBe("alex");
    await asOwner.mutation(api.communityAdmin.approveCommunityJoinRequest, {
      authSubject: "owner_utm",
      requestId: reqRow!._id,
    });
    const approvalMem = await t.run(async (ctx) =>
      ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.approvalCommunityId).eq("userId", fixture.approvalUserId),
        )
        .unique(),
    );
    expect(approvalMem?.attributionReferralCode).toBe("alex");
    const approvalRecord = await asOwner.query(api.communityMemberRecords.getCommunityMemberRecord, {
      authSubject: "owner_utm",
      communityId: fixture.approvalCommunityId,
      membershipId: approvalMem!._id,
    });
    expect(approvalRecord?.attribution).toMatchObject({
      source_label: "Referral · alex",
      click_id: null,
    });

    // 3. Paid checkout preserves external referrerHost onto checkoutSessions -> membership,
    // without putting non-DE keys into Stripe metadata.
    createCheckoutSessionMock.mockClear();
    const started = await asPaid.action(api.communityLanding.startCommunityLandingCheckout, {
      authSubject: "member_utm_paid",
      communitySlug: "utm-paid",
      billingPeriod: "monthly",
      distributionAttribution: { referrerHost: "mycoolapp.com" },
    });
    const [stripePayload] = createCheckoutSessionMock.mock.calls[0]!;
    expect(stripePayload.metadata.de_aid).toBeUndefined();
    expect(stripePayload.metadata.de_cid).toBeUndefined();

    const sessionRow = await t.run(async (ctx) => {
      const row = await ctx.db
        .query("checkoutSessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", started.session_id))
        .unique();
      await ctx.db.patch(row!._id, {
        status: "complete",
        communitySubscriptionStatus: "active",
        providerSubscriptionId: "sub_utm_paid_1",
        updatedAt: NOW + 1000,
      });
      return await ctx.db.get(row!._id);
    });
    expect(sessionRow?.attributionReferrerHost).toBe("mycoolapp.com");
    await t.run(async (ctx) => {
      await grantCommunityCheckout({ ctx, checkoutSession: sessionRow, nowMs: NOW + 2000 });
    });
    const paidMem = await t.run(async (ctx) =>
      ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.paidCommunityId).eq("userId", fixture.paidUserId),
        )
        .unique(),
    );
    expect(paidMem?.attributionReferrerHost).toBe("mycoolapp.com");
    const paidRecord = await asOwner.query(api.communityMemberRecords.getCommunityMemberRecord, {
      authSubject: "owner_utm",
      communityId: fixture.paidCommunityId,
      membershipId: paidMem!._id,
    });
    expect(paidRecord?.attribution).toMatchObject({
      source_label: "mycoolapp.com",
      click_id: null,
    });

    // Zero DE deliveries were enqueued for non-DE sources.
    const deliveries = await t.run(async (ctx) =>
      ctx.db.query("distributionAttributionDeliveries").collect(),
    );
    expect(deliveries).toHaveLength(0);
  });
});
