/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { settleCommunityCheckout } from "./communityCheckoutBuyer";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.UTC(2026, 10, 21, 14, 0, 0);

async function seedWorld(t: any) {
  return await t.run(async (ctx: any) => {
    const mkUser = (subject: string, handle: string) =>
      ctx.db.insert("users", {
        authSubject: subject,
        displayName: handle,
        handle,
        normalizedHandle: handle.toLowerCase(),
        email: `${handle}@example.com`,
        normalizedEmail: `${handle}@example.com`,
        emailVerifiedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
    const ownerId = await mkUser("w15-owner", "w15owner");
    const payerId = await mkUser("w15-payer", "w15payer");
    const attackerId = await mkUser("w15-attacker", "w15attacker");

    // Onboarding completed so attacker/owner can create communities and edit branding.
    for (const uid of [ownerId, payerId, attackerId]) {
      await ctx.db.insert("userProfileDetails", {
        userId: uid,
        displayName: String(uid),
        onboardingCompletedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
    }

    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "w15-club",
      name: "Wave 1.5 Club",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "paid_subscription",
      activeMemberCount: 2,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId,
      billingPeriod: "monthly",
      name: "Monthly",
      amountBaseUnits: 2000,
      currency: "usd",
      currencyDecimals: 2,
      isCurrent: true,
      providerAccountId: "acct_w15",
      providerPriceId: "price_w15",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const payerMembershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: payerId,
      role: "member",
      accessSource: "paid_subscription",
      pricePointId,
      state: "active",
      activationSequence: 1,
      activatedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const subscriptionId = await ctx.db.insert("communitySubscriptions", {
      communityId,
      userId: payerId,
      membershipId: payerMembershipId,
      pricePointId,
      source: "stripe",
      status: "active",
      providerSubscriptionId: "sub_w15",
      providerAccountId: "acct_w15",
      currentPeriodStartAt: NOW,
      currentPeriodEndAt: NOW + 30 * 86_400_000,
      cancelAtPeriodEnd: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const channelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId,
      createdByUserId: ownerId,
      name: "Course 1",
      status: "live",
      sortOrder: 1000,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return {
      ownerId,
      payerId,
      attackerId,
      communityId,
      pricePointId,
      payerMembershipId,
      subscriptionId,
      channelId,
      moduleId,
    };
  });
}

describe("Wave 1.5 security & billing-race hardening", () => {
  it("rejects cross-table IDs in course and resource mutations without modifying unrelated tables", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const asOwner = t.withIdentity({ subject: "w15-owner" });

    // Attempting to delete or patch a channel via course/resource mutations fails closed.
    await expect(
      asOwner.mutation(api.communityResources.saveCommunityResourceModule, {
        moduleId: String(w.channelId),
        isPatch: true,
        payload: { name: "Hijacked" },
      }),
    ).rejects.toThrow("community_resource_module_not_found");

    await expect(
      asOwner.mutation(api.communityResources.deleteCommunityResourceModule, {
        moduleId: String(w.channelId),
      }),
    ).resolves.toEqual({ ok: true, movedResources: 0 });

    await expect(
      asOwner.mutation(api.communityResources.saveCommunityResource, {
        resourceId: String(w.payerMembershipId),
        isPatch: true,
        payload: { title: "Hijacked" },
      }),
    ).rejects.toThrow("community_resource_not_found");

    await expect(
      asOwner.mutation(api.communityResources.deleteCommunityResource, {
        resourceId: String(w.payerMembershipId),
      }),
    ).resolves.toEqual({ ok: true });

    const [channelAfter, membershipAfter]: any = await t.run(async (ctx) => [
      await ctx.db.get(w.channelId),
      await ctx.db.get(w.payerMembershipId),
    ]);
    expect(channelAfter?.name).toBe("General");
    expect(membershipAfter?.state).toBe("active");
  });

  it("blocks cross-tenant storage deletion and private-attachment signed URL exfiltration across branding, courses, profiles, and threads", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const asOwner = t.withIdentity({ subject: "w15-owner" });
    const asAttacker = t.withIdentity({ subject: "w15-attacker" });

    const { publicPng, privateDmPng, pdfBlob, attackerThreadId } = await t.run(async (ctx) => {
      const pngBytes = new Uint8Array([137, 80, 78, 71]);
      const publicPng = await ctx.storage.store(new Blob([pngBytes], { type: "image/png" }));
      const privateDmPng = await ctx.storage.store(new Blob([pngBytes], { type: "image/png" }));
      const pdfBlob = await ctx.storage.store(new Blob([new Uint8Array([37, 80, 68, 70])], { type: "application/pdf" }));
      await ctx.db.insert("dmAttachments", {
        uploaderUserId: w.ownerId,
        uploadMessageKey: "dm-secret-1",
        uploadExpiresAt: NOW + 60_000,
        status: "sent",
        storageId: privateDmPng,
        name: "secret-dm.png",
        mimeType: "image/png",
        attachmentKind: "image",
        sizeBytes: 4,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const attackerThreadId = await ctx.db.insert("threads", {
        ownerId: w.attackerId,
        title: "Probe thread",
        titleSource: "manual",
        lastSeq: 0,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const lessonId = await ctx.db.insert("communityResources", {
        communityId: w.communityId,
        moduleId: w.moduleId,
        createdByUserId: w.ownerId,
        type: "markdown",
        role: "page",
        status: "published",
        title: "Lesson 1",
        pinned: false,
        sortOrder: 1000,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("communityLessonFiles", {
        communityId: w.communityId,
        resourceId: lessonId,
        createdByUserId: w.ownerId,
        status: "attached",
        storageId: pdfBlob,
        title: "Workbook.pdf",
        name: "workbook.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4,
        position: 0,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { publicPng, privateDmPng, pdfBlob, attackerThreadId };
    });

    // 1. Private DM attachment cannot be attached as community avatar/banner, course banner, or profile avatar.
    await expect(
      asOwner.mutation(api.communityLifecycle.saveCommunitySettings, {
        communityId: w.communityId,
        name: "Wave 1.5 Club",
        slug: "w15-club",
        avatarStorageId: privateDmPng,
      }),
    ).rejects.toThrow("community_avatar_invalid");

    await expect(
      asOwner.mutation(api.communityLifecycle.saveCommunitySettings, {
        communityId: w.communityId,
        name: "Wave 1.5 Club",
        slug: "w15-club",
        bannerStorageId: privateDmPng,
      }),
    ).rejects.toThrow("community_banner_invalid");

    await expect(
      asOwner.mutation(api.communityResources.saveCommunityResourceModule, {
        communityId: w.communityId,
        payload: { name: "Bad Banner", banner_storage_id: privateDmPng },
      }),
    ).rejects.toThrow("community_resource_banner_invalid");

    await expect(
      asAttacker.mutation(api.profiles.upsertProfileDetail, {
        avatarStorageId: privateDmPng,
      }),
    ).rejects.toThrow();

    // Private lesson file and bogus cross-table IDs are also rejected as course banners.
    await expect(
      asOwner.mutation(api.communityResources.saveCommunityResourceModule, {
        communityId: w.communityId,
        payload: { name: "PDF Banner", banner_storage_id: pdfBlob },
      }),
    ).rejects.toThrow("community_resource_banner_invalid");

    await expect(
      asOwner.mutation(api.communityResources.saveCommunityResourceModule, {
        communityId: w.communityId,
        payload: { name: "Channel ID Banner", banner_storage_id: String(w.channelId) },
      }),
    ).rejects.toThrow("community_resource_banner_invalid");

    // 2. Replacing or deleting a course banner or community banner NEVER deletes another tenant's blob.
    await asOwner.mutation(api.communityLifecycle.saveCommunitySettings, {
      communityId: w.communityId,
      name: "Wave 1.5 Club",
      slug: "w15-club",
      bannerStorageId: publicPng,
    });
    await asOwner.mutation(api.communityLifecycle.saveCommunitySettings, {
      communityId: w.communityId,
      name: "Wave 1.5 Club",
      slug: "w15-club",
      bannerStorageId: null,
      bannerUrl: "https://example.com/replacement-banner.png",
    });
    expect(await t.run((ctx) => ctx.db.system.get(publicPng))).not.toBeNull();

    const createdModule: any = await asOwner.mutation(api.communityResources.saveCommunityResourceModule, {
      communityId: w.communityId,
      payload: { name: "Course With Cover", banner_storage_id: publicPng },
    });
    await asOwner.mutation(api.communityResources.deleteCommunityResourceModule, {
      moduleId: String(createdModule.id),
    });
    expect(await t.run((ctx) => ctx.db.system.get(publicPng))).not.toBeNull();

    // 3. Thread messages cannot attach unowned storageIds on write, and unclaimed storageIds resolve url: null on read.
    await expect(
      asAttacker.mutation(api.threads.addCloudThreadMessage, {
        threadId: attackerThreadId,
        messageKey: "probe-msg-1",
        seq: 1,
        role: "assistant",
        contentJson: { text: "exfil", attachments: [{ id: "a1", name: "secret.png", type: "image", storageId: String(privateDmPng) }] },
      }),
    ).rejects.toThrow("member_agent_attachment_claim_missing");

    await t.run(async (ctx) => {
      await ctx.db.insert("cloudMessages", {
        ownerId: w.attackerId,
        threadId: attackerThreadId,
        messageKey: "legacy-unclaimed",
        seq: 1,
        role: "user",
        contentJson: { text: "old", attachments: [{ id: "a1", name: "secret.png", type: "image", storageId: String(privateDmPng) }] },
        createdAt: NOW,
      });
    });
    const readMessages: any[] = await asAttacker.query(api.threads.listNewestCloudThreadMessages, {
      threadId: attackerThreadId,
    });
    expect(readMessages[0].contentJson.attachments[0].url).toBeNull();
  });

  it("ignores stale or post-end Stripe webhooks and prevents delayed invoice.paid from lifting a refund payment_hold", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);

    const sync = (status: string, extra: Record<string, unknown>) =>
      t.mutation(internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal, {
        communityId: w.communityId,
        userId: w.payerId,
        source: "stripe",
        status,
        providerAccountId: "acct_w15",
        providerSubscriptionId: "sub_w15",
        ...extra,
      });

    // 1. Refund at t=2000 puts membership in payment_hold with riskStateChangedAt=2000.
    await sync("ended", {
      revokedReason: "subscription_refunded",
      isRiskRevocation: true,
      providerEventCreatedAt: NOW + 2000,
      nowMs: NOW + 2000,
    });
    expect((await t.run((ctx) => ctx.db.get(w.payerMembershipId)) as any).state).toBe("payment_hold");

    // 2. Delayed/duplicate invoice.paid from the refunded charge (paid at t=1500 <= 2000) CANNOT lift hold!
    await sync("active", {
      allowRiskRestoration: true,
      providerEventCreatedAt: NOW + 1500,
      nowMs: NOW + 1500,
    });
    expect((await t.run((ctx) => ctx.db.get(w.payerMembershipId)) as any).state).toBe("payment_hold");
    expect((await t.run((ctx) => ctx.db.get(w.subscriptionId)) as any).status).toBe("ended");

    // 3. Routine subscription.updated AFTER refund (t=2500, allowRiskRestoration=false) also CANNOT lift hold.
    await sync("active", {
      preserveRiskRevocation: true,
      providerEventCreatedAt: NOW + 2500,
      nowMs: NOW + 2500,
    });
    expect((await t.run((ctx) => ctx.db.get(w.payerMembershipId)) as any).state).toBe("payment_hold");

    // 4. A genuinely NEW renewal payment after the refund (t=3000 > 2000, allowRiskRestoration=true) DOES restore access.
    await sync("active", {
      allowRiskRestoration: true,
      providerEventCreatedAt: NOW + 3000,
      nowMs: NOW + 3000,
    });
    expect((await t.run((ctx) => ctx.db.get(w.payerMembershipId)) as any).state).toBe("active");

    // 5. Recoverable non-terminal ended state (e.g. Stripe paused/unpaid at t=3600)
    // CAN resume when a genuinely newer active event arrives (t=3800), while older
    // stale events (t=3500) are still ignored.
    await sync("ended", {
      preserveRiskRevocation: true,
      isTerminalCancellation: false,
      providerEventCreatedAt: NOW + 3600,
      nowMs: NOW + 3600,
    });
    expect((await t.run((ctx) => ctx.db.get(w.payerMembershipId)) as any).state).toBe("lapsed");

    const staleWhilePaused = await sync("active", {
      preserveRiskRevocation: true,
      providerEventCreatedAt: NOW + 3500,
      nowMs: NOW + 3500,
    });
    expect(staleWhilePaused).toMatchObject({ ignored: true, reason: "community_subscription_event_stale" });
    expect((await t.run((ctx) => ctx.db.get(w.payerMembershipId)) as any).state).toBe("lapsed");

    await sync("active", {
      preserveRiskRevocation: true,
      providerEventCreatedAt: NOW + 3800,
      nowMs: NOW + 3800,
    });
    expect((await t.run((ctx) => ctx.db.get(w.payerMembershipId)) as any).state).toBe("active");

    // 6. Terminal Stripe cancellation at t=4000 -> stale active update at t=3900 is IGNORED,
    // and non-restoring active update on the terminally canceled subscription at t=4500 is ALSO ignored.
    await sync("canceled", {
      preserveRiskRevocation: true,
      isTerminalCancellation: true,
      providerEventCreatedAt: NOW + 4000,
      nowMs: NOW + 4000,
    });
    expect((await t.run((ctx) => ctx.db.get(w.payerMembershipId)) as any).state).toBe("lapsed");

    const stale = await sync("active", {
      preserveRiskRevocation: true,
      providerEventCreatedAt: NOW + 3900,
      nowMs: NOW + 3900,
    });
    expect(stale).toMatchObject({ ignored: true, reason: "community_subscription_event_stale" });
    expect((await t.run((ctx) => ctx.db.get(w.payerMembershipId)) as any).state).toBe("lapsed");

    const postEnd = await sync("active", {
      preserveRiskRevocation: true,
      providerEventCreatedAt: NOW + 4500,
      nowMs: NOW + 4500,
    });
    expect(postEnd).toMatchObject({ ignored: true, reason: "community_subscription_already_ended" });
    expect((await t.run((ctx) => ctx.db.get(w.payerMembershipId)) as any).state).toBe("lapsed");
  });

  it("auto-refunds a signed-in buyer who gets blocked mid-checkout during settlement", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);

    const sessionId = "cs_blocked_signed_in";
    await t.run(async (ctx) => {
      await ctx.db.insert("communityBlocks", {
        communityId: w.communityId,
        userId: w.attackerId,
        createdByUserId: w.ownerId,
        reason: "spam",
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("checkoutSessions", {
        sessionId,
        ownerUserId: w.attackerId,
        communityId: w.communityId,
        pricePointId: w.pricePointId,
        mode: "community_join",
        status: "complete",
        providerAccountId: "acct_w15",
        providerSubscriptionId: "sub_blocked_buyer",
        communitySubscriptionStatus: "active",
        expiresAt: NOW + 3600_000,
        createdAt: NOW,
        updatedAt: NOW,
      } as any);
      await settleCommunityCheckout(ctx, sessionId, NOW + 1000, {
        paymentIntentId: "pi_1",
        chargeId: "ch_1",
      });
    });

    const [sessionRow, scheduled]: any = await t.run(async (ctx) => [
      await ctx.db
        .query("checkoutSessions")
        .withIndex("by_sessionId", (q: any) => q.eq("sessionId", sessionId))
        .first(),
      await ctx.db.system.query("_scheduled_functions").collect(),
    ]);
    expect(sessionRow.communityHold).toBe("buyer_blocked");
    expect(
      scheduled.some((job: any) => String(job.name).includes("refundDuplicateCommunitySubscriptionInternal")),
    ).toBe(true);
  });
});
