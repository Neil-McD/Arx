/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { podScopeKey } from "./communityNotesStore";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);

async function seedWorld(t: any) {
  return await t.run(async (ctx: any) => {
    const mkUser = (subject: string, handle: string, email: string) =>
      ctx.db.insert("users", {
        authSubject: subject,
        displayName: handle,
        handle,
        normalizedHandle: handle.toLowerCase(),
        email,
        normalizedEmail: email.toLowerCase(),
        createdAt: NOW,
        updatedAt: NOW,
      });
    const ownerId = await mkUser("w1-owner", "owner", "owner@example.com");
    const hostId = await mkUser("w1-host", "host", "host@example.com");
    const memberId = await mkUser("w1-member", "member", "member@example.com");
    const outsiderId = await mkUser("w1-outsider", "secret_outsider", "outsider@example.com");

    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "w1-club",
      name: "Wave 1 Club",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 3,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("communityMemberships", {
      communityId, userId: ownerId, role: "admin", accessSource: "free_grant", state: "active",
      activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    });
    const hostMembershipId = await ctx.db.insert("communityMemberships", {
      communityId, userId: hostId, role: "member", accessSource: "free_grant", state: "active",
      activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    });
    const memberMembershipId = await ctx.db.insert("communityMemberships", {
      communityId, userId: memberId, role: "member", accessSource: "free_grant", state: "active",
      activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    });
    const generalId = await ctx.db.insert("communityChannels", {
      communityId, slug: "general", name: "General", accessMode: "all_members",
      postingPolicy: "members", status: "active", position: 0, createdAt: NOW, updatedAt: NOW,
    });
    const podChannelId = await ctx.db.insert("communityChannels", {
      communityId, slug: "builders", name: "Builders", accessMode: "restricted",
      postingPolicy: "members", status: "active", position: 1, createdAt: NOW, updatedAt: NOW,
    });
    const podId = await ctx.db.insert("communityPods", {
      communityId, channelId: podChannelId, purpose: "Build together", visibility: "listed",
      hostUserIds: [hostId], seats: 1, priceAmountBaseUnits: 5000, priceCurrency: "usd",
      createdAt: NOW, updatedAt: NOW,
    });
    await ctx.db.insert("communityChannelParticipants", {
      communityId, channelId: podChannelId, principalKey: `user:${hostId}`,
      status: "active", reasons: ["host"], membershipId: hostMembershipId,
      membershipActivationSequence: 1, createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW,
    });
    return {
      ownerId, hostId, memberId, outsiderId,
      communityId, hostMembershipId, memberMembershipId,
      generalId, podChannelId, podId,
    };
  });
}

describe("Wave 1 security & reliability hardening", () => {
  it("strips pod hostUserIds when a pod seat is revoked or a member leaves, and blocks stale hosts without pod canRead", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const asOwner = t.withIdentity({ subject: "w1-owner" });
    const asHost = t.withIdentity({ subject: "w1-host" });

    // 1. Revoking pod seat strips hostUserIds automatically.
    await asOwner.mutation(api.communityChannelParticipants.setParticipant, {
      communityId: w.communityId,
      channelId: w.podChannelId,
      target: { kind: "member", userId: w.hostId },
      active: false,
    });
    const afterRevoke: any = await t.run((ctx) => ctx.db.get(w.podId));
    expect(afterRevoke.hostUserIds).toEqual([]);

    // 2. Even if stale hostUserIds exists in DB without an active pod seat,
    // all pod-host surfaces fail closed.
    await t.run(async (ctx) => {
      await ctx.db.patch(w.podId, { hostUserIds: [w.hostId] });
      await ctx.db.insert("communityNotes", {
        scopeKey: podScopeKey(w.podChannelId),
        communityId: w.communityId,
        slug: "pod-rule",
        title: "Pod Rule",
        bodyMd: "Secret pod rule",
        source: "learned",
        authorKind: "guide",
        evidenceRefs: [],
        searchText: "pod rule",
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("communityPodRequests", {
        communityId: w.communityId,
        channelId: w.podChannelId,
        userId: w.memberId,
        status: "pending",
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    await expect(
      asHost.mutation(api.communityPods.decidePodRequest, {
        communityId: w.communityId,
        channelId: w.podChannelId,
        userId: w.memberId,
        approve: true,
      }),
    ).rejects.toThrow("community_pod_manager_required");

    await expect(
      asHost.mutation(api.communityEvents.saveCommunityEvent, {
        payload: {
          community_id: String(w.communityId),
          pod_channel_id: String(w.podChannelId),
          title: "Unauthorized pod call",
          starts_at: new Date(NOW + 60_000).toISOString(),
          timezone: "UTC",
        },
      }),
    ).rejects.toThrow();

    await expect(
      asHost.query(api.communityMemory.listNoteSources, {
        communityId: w.communityId,
        slug: "pod-rule",
        podRoomId: w.podChannelId,
      }),
    ).rejects.toThrow("community_forbidden");

    await expect(
      asHost.mutation(api.communityMemory.undoLearnedNote, {
        communityId: w.communityId,
        slug: "pod-rule",
        podRoomId: w.podChannelId,
      }),
    ).rejects.toThrow("community_forbidden");

    const podPage = await asHost.query(api.communityPods.getPodPage, {
      communityId: w.communityId,
      podSlug: "builders",
    });
    expect(podPage.kind).toBe("outside");

    const facts: any = await t.query(internal.communityPodFacts.readPodFactsInternal, {
      communityId: w.communityId,
      slug: "builders",
      userId: w.hostId,
      lens: "member_private",
    });
    expect(String(facts?.bodyMd ?? facts?.text ?? JSON.stringify(facts))).toContain("Ask to join from the Pods page.");
    expect(String(facts?.bodyMd ?? facts?.text ?? JSON.stringify(facts))).not.toContain("Its room:");

    // 3. Re-granting seat + host, then leaving the community strips hostUserIds.
    await asOwner.mutation(api.communityChannelParticipants.setParticipant, {
      communityId: w.communityId,
      channelId: w.podChannelId,
      target: { kind: "member", userId: w.hostId },
      active: true,
    });
    await t.run((ctx) => ctx.db.patch(w.podId, { hostUserIds: [w.hostId] }));
    await asHost.mutation(api.communityAdmin.leaveCommunity, {
      communityId: w.communityId,
    });
    const afterLeave: any = await t.run((ctx) => ctx.db.get(w.podId));
    expect(afterLeave.hostUserIds).toEqual([]);
  });

  it("rejects cross-table IDs in saveCommunityEvent and cancelCommunityEvent without corrupting other tables", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const asOwner = t.withIdentity({ subject: "w1-owner" });

    await expect(
      asOwner.mutation(api.communityEvents.saveCommunityEvent, {
        eventId: String(w.podChannelId),
        payload: {
          community_id: String(w.communityId),
          title: "Overwrite Channel",
          starts_at: new Date(NOW + 60_000).toISOString(),
          timezone: "UTC",
        },
      }),
    ).rejects.toThrow("community_event_not_found");

    // cancelCommunityEvent treats missing/non-event IDs as idempotent no-op
    // and never touches records in other tables.
    await expect(
      asOwner.mutation(api.communityEvents.cancelCommunityEvent, {
        eventId: String(w.podChannelId),
      }),
    ).resolves.toEqual({ ok: true });

    const channelAfter: any = await t.run((ctx) => ctx.db.get(w.podChannelId));
    expect(channelAfter.status).toBe("active");
    expect(channelAfter.name).toBe("Builders");
  });

  it("enforces manager authorization on syncCommunityMembershipCount and scopes resolveMemberRefsInternal to the community", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const asMember = t.withIdentity({ subject: "w1-member" });
    const asOwner = t.withIdentity({ subject: "w1-owner" });

    await expect(
      asMember.mutation(api.communityAdmin.syncCommunityMembershipCount, {
        communityId: w.communityId,
      }),
    ).rejects.toThrow("community_manager_required");

    await expect(
      asOwner.mutation(api.communityAdmin.syncCommunityMembershipCount, {
        communityId: w.communityId,
      }),
    ).resolves.toBe(3);

    // Non-manager cannot call resolveMemberRefsInternal.
    await expect(
      t.query(internal.communityPeople.resolveMemberRefsInternal, {
        communityId: w.communityId,
        actorUserId: w.memberId,
        refs: ["@member"],
      }),
    ).rejects.toThrow("community_forbidden");

    // Manager resolves member handle in community, but outsider's platform handle is hidden.
    const resolved = await t.query(internal.communityPeople.resolveMemberRefsInternal, {
      communityId: w.communityId,
      actorUserId: w.ownerId,
      refs: ["@member", "@secret_outsider"],
    });
    expect(resolved.refs).toEqual([`user:${w.memberId}`]);
    expect(resolved.missing).toEqual(["@secret_outsider"]);
  });

  it("enforces paid-pod seat capacity, checkout recovery, and reachable re-check before Stripe cancellation", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);

    // Seat cap = 1 and hostId already occupies 1 seat: memberId cannot reserve.
    await expect(
      t.mutation(internal.communityPodPayments.createPendingPodPaymentInternal, {
        communityId: w.communityId,
        channelId: w.podChannelId,
        userId: w.memberId,
        amountBaseUnits: 5000,
        currency: "usd",
        providerAccountId: "acct_1",
        providerPriceId: "price_1",
        nowMs: NOW,
      }),
    ).rejects.toThrow("community_pod_full");

    // Raise seats to 2: memberId can reserve.
    await t.run((ctx) => ctx.db.patch(w.podId, { seats: 2 }));
    const reserved = await t.mutation(internal.communityPodPayments.createPendingPodPaymentInternal, {
      communityId: w.communityId,
      channelId: w.podChannelId,
      userId: w.memberId,
      amountBaseUnits: 5000,
      currency: "usd",
      providerAccountId: "acct_1",
      providerPriceId: "price_1",
      nowMs: NOW,
    });

    // Simulate 2-tab race: reservation got marked expired before attachPodCheckoutInternal ran.
    await t.run((ctx) => ctx.db.patch(reserved.paymentId, { status: "expired" }));
    await t.mutation(internal.communityPodPayments.attachPodCheckoutInternal, {
      paymentId: reserved.paymentId,
      providerCheckoutSessionId: "cs_recover",
      checkoutUrl: "https://checkout.stripe.com/c/recover",
    });
    const recovered: any = await t.run((ctx) => ctx.db.get(reserved.paymentId));
    expect(recovered.status).toBe("pending");
    expect(recovered.checkoutUrl).toBe("https://checkout.stripe.com/c/recover");

    // If pod fills back up to 1 seat before webhook arrives, syncPodPaymentInternal
    // refuses entry and queues automatic refund instead of overselling.
    await t.run((ctx) => ctx.db.patch(w.podId, { seats: 1 }));
    const overflowSync = await t.mutation(internal.communityPodPayments.syncPodPaymentInternal, {
      paymentId: reserved.paymentId,
      providerAccountId: "acct_1",
      providerSubscriptionId: "sub_overflow",
      subscriptionStatus: "active",
      providerEventAt: NOW + 1000,
    });
    expect(overflowSync).toMatchObject({ status: "ended", granted: false });
    const overflowRow: any = await t.run((ctx) => ctx.db.get(reserved.paymentId));
    expect(overflowRow.refundDue).toBe(true);

    // Raise seats to 2 again, create a valid active paid seat, and verify
    // endUnreachablePodPaymentInternal locks cancelDue ONLY when truly unreachable.
    await t.run((ctx) => ctx.db.patch(w.podId, { seats: 2 }));
    const activeRes = await t.mutation(internal.communityPodPayments.createPendingPodPaymentInternal, {
      communityId: w.communityId,
      channelId: w.podChannelId,
      userId: w.memberId,
      amountBaseUnits: 5000,
      currency: "usd",
      providerAccountId: "acct_1",
      providerPriceId: "price_1",
      nowMs: NOW + 2000,
    });
    await t.mutation(internal.communityPodPayments.syncPodPaymentInternal, {
      paymentId: activeRes.paymentId,
      providerAccountId: "acct_1",
      providerSubscriptionId: "sub_live",
      subscriptionStatus: "active",
      providerEventAt: NOW + 3000,
    });

    // Member IS reachable -> endUnreachablePodPaymentInternal refuses to end or cancel.
    const stillReachable = await t.mutation(internal.communityPodPayments.endUnreachablePodPaymentInternal, {
      paymentId: activeRes.paymentId,
      cancelDue: true,
    });
    expect(stillReachable).toEqual({ ended: false });

    // Remove pod seat -> now unreachable -> ends & records cancelDue: true.
    await t.run(async (ctx) => {
      const seat = await ctx.db
        .query("communityChannelParticipants")
        .withIndex("by_channel_principal", (q: any) =>
          q.eq("channelId", w.podChannelId).eq("principalKey", `user:${w.memberId}`),
        )
        .first();
      await ctx.db.patch(seat!._id, { status: "revoked", reasons: [] });
    });
    const endedNow = await t.mutation(internal.communityPodPayments.endUnreachablePodPaymentInternal, {
      paymentId: activeRes.paymentId,
      cancelDue: true,
    });
    expect(endedNow).toEqual({ ended: true });
    const cancelsDue = await t.query(internal.communityPodPayments.listPodCancelsDueInternal, {});
    expect(cancelsDue.map((c: any) => c.paymentId)).toContain(activeRes.paymentId);
    await t.mutation(internal.communityPodPayments.clearPodCancelDueInternal, { paymentId: activeRes.paymentId });
    const cancelsAfter = await t.query(internal.communityPodPayments.listPodCancelsDueInternal, {});
    expect(cancelsAfter.map((c: any) => c.paymentId)).not.toContain(activeRes.paymentId);
  });

  it("guards agentWork completion with leaseToken and clears dueAt when owner has no authSubject", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("operatorRoles", {
        userId: w.ownerId, role: "owner", active: true, createdAt: NOW, updatedAt: NOW,
      });
    });

    const workId = await t.run(async (ctx) => {
      return await ctx.db.insert("agentWork", {
        communityId: w.communityId,
        scopeKey: `community:${w.communityId}`,
        kind: "memory_review",
        scope: "community",
        pending: 1,
        reviewedThrough: NOW - 1000,
        failures: 0,
        dueAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    const firstClaim: any = await t.mutation(internal.agentWork.claimAgentWorkInternal, {
      workId,
      nowMs: NOW + 1000,
    });
    expect(firstClaim.skipped).toBeFalsy();
    expect(typeof firstClaim.leaseToken).toBe("string");

    // Stale completion with wrong leaseToken is ignored (returns null and leaves lease intact).
    const staleResult = await t.mutation(internal.agentWork.completeAgentWorkInternal, {
      workId,
      leaseToken: "stale-lease-token",
      outcome: "reviewed",
      windowEnd: NOW + 2000,
      claimedPending: 1,
      nowMs: NOW + 2000,
    });
    expect(staleResult).toBeNull();
    const stillLeased: any = await t.run((ctx) => ctx.db.get(workId));
    expect(stillLeased.leaseToken).toBe(firstClaim.leaseToken);
    expect(stillLeased.leaseUntil).toBeGreaterThan(NOW);

    // Matching leaseToken completes and clears leaseToken.
    await t.mutation(internal.agentWork.completeAgentWorkInternal, {
      workId,
      leaseToken: firstClaim.leaseToken,
      outcome: "reviewed",
      windowEnd: NOW + 3000,
      claimedPending: 1,
      nowMs: NOW + 3000,
    });
    const completed: any = await t.run((ctx) => ctx.db.get(workId));
    expect(completed.leaseToken).toBeUndefined();
    expect(completed.leaseUntil).toBeUndefined();

    // Empty owner authSubject clears dueAt instead of looping forever.
    const unownedWorkId = await t.run(async (ctx) => {
      await ctx.db.patch(w.ownerId, { authSubject: "" });
      return await ctx.db.insert("agentWork", {
        communityId: w.communityId,
        scopeKey: `community:${w.communityId}:noauth`,
        kind: "memory_review",
        scope: "community",
        pending: 1,
        reviewedThrough: NOW - 1000,
        failures: 0,
        dueAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    const skipped = await t.mutation(internal.agentWork.claimAgentWorkInternal, {
      workId: unownedWorkId,
      nowMs: NOW + 5000,
    });
    expect(skipped).toBeNull();
    const clearedRow: any = await t.run((ctx) => ctx.db.get(unownedWorkId));
    expect(clearedRow.dueAt).toBeUndefined();
    expect(clearedRow.leaseUntil).toBeUndefined();
  });

  it("resolves authenticated actors via indexed subject and normalizedEmail lookups without full-table scans", async () => {
    const t = convexTest(schema, modules);
    await seedWorld(t);

    const existingEmailUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        authSubject: "legacy-subject-to-link",
        displayName: "Linked User",
        email: "LINKED@Example.com",
        normalizedEmail: "linked@example.com",
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    const newActor = await t.mutation(internal.authActor.ensureAuthenticatedActorByExplicitSubjectInternal, {
      authSubject: "brand-new-subject-1",
      email: "fresh@example.com",
      displayName: "Fresh User",
      nowMs: NOW,
    });
    expect(newActor.dbUserId).toBeTruthy();

    // Repeat call with matching subject resolves the exact same user immediately.
    const sameActor = await t.mutation(internal.authActor.ensureAuthenticatedActorByExplicitSubjectInternal, {
      authSubject: "brand-new-subject-1",
      email: "fresh@example.com",
      displayName: "Fresh User",
      nowMs: NOW + 1000,
    });
    expect(sameActor.dbUserId).toBe(newActor.dbUserId);

    // Indexed normalizedEmail lookup still finds the existing email user cleanly.
    const emailUser: any = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_normalizedEmail", (q: any) => q.eq("normalizedEmail", "linked@example.com"))
        .first(),
    );
    expect(emailUser._id).toBe(existingEmailUserId);

    // Legacy user missing normalizedEmail gets self-healed on sign-in without losing verification.
    const legacyUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        authSubject: "legacy-missing-norm",
        displayName: "Legacy",
        email: "Legacy@Example.com",
        emailVerifiedAt: NOW - 5000,
        emailVerificationSource: "oauth_provider",
        createdAt: NOW - 5000,
        updatedAt: NOW - 5000,
      }),
    );
    await t.mutation(internal.authActor.ensureAuthenticatedActorByExplicitSubjectInternal, {
      authSubject: "legacy-missing-norm",
      email: "Legacy@Example.com",
      nowMs: NOW + 2000,
    });
    const healed: any = await t.run((ctx) => ctx.db.get(legacyUserId));
    expect(healed.normalizedEmail).toBe("legacy@example.com");
    expect(healed.emailVerifiedAt).toBe(NOW - 5000);
  });
});
