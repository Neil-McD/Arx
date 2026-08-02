/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityCommerce.ts",
  "./creatorCommerce.ts",
  "./_generated/**/*.*s",
]);

test("paid-member checkout remains available when community AI is unfunded", async () => {
  const t = convexTest(schema, modules);
  const nowMs = 1_750_000_000_000;
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "community-commerce-unfunded-owner",
      displayName: "Unfunded AI owner",
      handle: "unfunded-ai-owner",
      normalizedHandle: "unfunded-ai-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "unfunded-ai-paid-community",
      name: "Unfunded AI paid community",
      oneLiner: "Member commerce remains independent from community AI.",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "paid_subscription",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId,
      billingPeriod: "monthly",
      name: "Monthly membership",
      amountBaseUnits: 10_000,
      currency: "usd",
      currencyDecimals: 2,
      isCurrent: true,
      providerAccountId: "acct_unfunded_ai_owner",
      providerPriceId: "price_member_monthly",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("userStripeConnectAccounts", {
      userId: ownerId,
      stripeAccountId: "acct_unfunded_ai_owner",
      accountType: "express",
      transfersEnabled: true,
      status: "ready",
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      requirementsCurrentlyDue: [],
      requirementsEventuallyDue: [],
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { communityId, pricePointId };
  });

  await expect(
    t.run(async (ctx) =>
      await resolveCommunityInferenceFundingAdmission(ctx, fixture.communityId),
    ),
  ).resolves.toEqual({ ok: false, code: "founder_plan_required" });

  await expect(
    t.query(
      internal.communityCommerce.resolvePublicCommunityCheckoutConfigInternal,
      {
        communitySlug: "unfunded-ai-paid-community",
        billingPeriod: "monthly",
        nowMs,
      },
    ),
  ).resolves.toMatchObject({
    communityId: fixture.communityId,
    pricePointId: fixture.pricePointId,
    providerAccountId: "acct_unfunded_ai_owner",
    providerPriceId: "price_member_monthly",
    platformFeeBps: 290,
  });
});
