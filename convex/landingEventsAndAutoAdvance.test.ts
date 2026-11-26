import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { maybeAutoAdvanceMemberOnActivity } from "./communityMemberJourney";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

test("public community landing page shows ongoing recurring weekly calls (skipping cancelled dates) and hides pod/private calls", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const dayMs = 86_400_000;
  // Weekly series started 14 days ago -> next occurrence is today + 0ms (if in future) or +7d.
  // Pick a clean anchor: 14 days ago + 2 hours from now so occurrences fall at T-14d+2h, T-7d+2h, T+2h, T+7d+2h.
  const firstStartMs = nowMs - 14 * dayMs + 2 * 3_600_000;
  const cancelledUpcomingMs = nowMs + 2 * 3_600_000;
  const expectedNextLiveMs = nowMs + 7 * dayMs + 2 * 3_600_000;

  await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "owner-events",
      displayName: "Neil",
      handle: "neil_ev",
      normalizedHandle: "neil_ev",
      email: "neil-ev@example.com",
      normalizedEmail: "neil-ev@example.com",
      emailVerifiedAt: nowMs - 30 * dayMs,
      createdAt: nowMs - 30 * dayMs,
      updatedAt: nowMs - 30 * dayMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "weekly-club",
      name: "Weekly Club",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs - 30 * dayMs,
      updatedAt: nowMs - 30 * dayMs,
    } as any);
    const podChannelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "vip-pod",
      name: "VIP Pod",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: ownerId,
      createdAt: nowMs - 30 * dayMs,
      updatedAt: nowMs - 30 * dayMs,
    } as any);

    // Public recurring weekly call that started 2 weeks ago, with this week's date cancelled.
    await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      title: "Weekly Founder Office Hours",
      startsAt: firstStartMs,
      endsAt: firstStartMs + 3_600_000,
      timezone: "UTC",
      locationType: "online",
      locationLabel: "Zoom",
      recurrenceFrequency: "weekly",
      cancelledOccurrences: [{ startsAt: cancelledUpcomingMs, cancelledAt: nowMs - 1_000 }],
      visibility: "public",
      status: "live",
      createdAt: nowMs - 20 * dayMs,
      updatedAt: nowMs - 20 * dayMs,
    } as any);

    // Members-only recurring call (must stay hidden on public landing page).
    await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      title: "Members Only Roundtable",
      startsAt: firstStartMs,
      endsAt: firstStartMs + 3_600_000,
      timezone: "UTC",
      locationType: "online",
      recurrenceFrequency: "weekly",
      visibility: "members",
      status: "live",
      createdAt: nowMs - 20 * dayMs,
      updatedAt: nowMs - 20 * dayMs,
    } as any);

    // Private pod recurring call marked public (must STILL stay hidden from community-wide landing page).
    await ctx.db.insert("communityEvents", {
      communityId,
      podChannelId,
      createdByUserId: ownerId,
      title: "VIP Pod Call",
      startsAt: firstStartMs,
      endsAt: firstStartMs + 3_600_000,
      timezone: "UTC",
      locationType: "online",
      recurrenceFrequency: "weekly",
      visibility: "public",
      status: "live",
      createdAt: nowMs - 20 * dayMs,
      updatedAt: nowMs - 20 * dayMs,
    } as any);
  });

  const landing: any = await t.query(api.communityLanding.getCommunityLandingPage, {
    communitySlug: "weekly-club",
  });
  expect(landing.ok).toBe(true);
  expect(landing.events).toHaveLength(1);
  expect(landing.events[0]).toMatchObject({
    title: "Weekly Founder Office Hours",
    starts_at: new Date(expectedNextLiveMs).toISOString(),
    repeats: "weekly",
  });
});

test("Member Board auto-move catches up ready cards on enable and triggers on native member activity", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();

  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "owner-auto",
      displayName: "Neil",
      handle: "neil_auto",
      normalizedHandle: "neil_auto",
      email: "neil-auto@example.com",
      normalizedEmail: "neil-auto@example.com",
      emailVerifiedAt: nowMs - 10_000,
      createdAt: nowMs - 10_000,
      updatedAt: nowMs - 10_000,
    });
    const memberA = await ctx.db.insert("users", {
      authSubject: "member-a",
      displayName: "Alice",
      handle: "alice_auto",
      normalizedHandle: "alice_auto",
      email: "alice@example.com",
      normalizedEmail: "alice@example.com",
      emailVerifiedAt: nowMs - 10_000,
      createdAt: nowMs - 10_000,
      updatedAt: nowMs - 10_000,
    });
    const memberB = await ctx.db.insert("users", {
      authSubject: "member-b",
      displayName: "Bob",
      handle: "bob_auto",
      normalizedHandle: "bob_auto",
      email: "bob@example.com",
      normalizedEmail: "bob@example.com",
      emailVerifiedAt: nowMs - 10_000,
      createdAt: nowMs - 10_000,
      updatedAt: nowMs - 10_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "auto-club",
      name: "Auto Club",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 3,
      createdAt: nowMs - 10_000,
      updatedAt: nowMs - 10_000,
    } as any);
    const channelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdByUserId: ownerId,
      createdAt: nowMs - 10_000,
      updatedAt: nowMs - 10_000,
    } as any);
    for (const uid of [memberA, memberB]) {
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId: uid,
        role: "member",
        accessSource: "free_grant",
        state: "active",
        activationSequence: 1,
        activatedAt: nowMs - 5_000,
        createdAt: nowMs - 5_000,
        updatedAt: nowMs - 5_000,
      } as any);
      await ctx.db.insert("communityMemberJourneyCards", {
        communityId,
        userId: uid,
        stageKey: "new",
        createdAt: nowMs - 5_000,
        updatedAt: nowMs - 5_000,
      });
    }
    await ctx.db.insert("communityJourneyConfig", {
      communityId,
      stages: [
        {
          key: "new",
          name: "New",
          goal: "Introduce yourself.",
          position: 0,
          checkpoints: [{ key: "first_post", label: "Posted or replied once", kind: "first_post" }],
        },
        {
          key: "active",
          name: "Active",
          goal: "Keep shipping.",
          position: 1,
          checkpoints: [],
        },
      ],
      autoAdvanceEnabled: false,
      updatedByUserId: ownerId,
      createdAt: nowMs - 10_000,
      updatedAt: nowMs - 10_000,
    });
    // Member A already posted while auto-move is OFF -> stays in "new".
    await ctx.db.insert("communityInteractionRoots", {
      communityId,
      channelId,
      actorType: "human",
      actorUserId: memberA,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Hello everyone!",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "post-a-1",
      composerPayloadHash: "hash-a-1",
      createdAt: nowMs - 2_000,
      updatedAt: nowMs - 2_000,
    } as any);
    return { ownerId, memberA, memberB, communityId, channelId };
  });

  // With Auto-move OFF, activity check does NOT move Member A.
  const movedWhileOff = await t.run((ctx) =>
    maybeAutoAdvanceMemberOnActivity(ctx, { communityId: ids.communityId, userId: ids.memberA, nowMs }),
  );
  expect(movedWhileOff).toBe(false);

  // Turning Auto-move ON catches up Member A immediately (leaving Member B in "new").
  const asOwner = t.withIdentity({ subject: "owner-auto" });
  const saved = await asOwner.mutation(api.communityMemberJourney.saveCommunityJourneyStages, {
    communityId: ids.communityId,
    stages: [
      {
        key: "new",
        name: "New",
        goal: "Introduce yourself.",
        checkpoints: [{ key: "first_post", label: "Posted or replied once", kind: "first_post" }],
      },
      {
        key: "active",
        name: "Active",
        goal: "Keep shipping.",
        checkpoints: [],
      },
    ],
    autoAdvanceEnabled: true,
  });
  expect(saved.auto_advance_enabled).toBe(true);

  const boardAfterToggle = await asOwner.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, {
    communityId: ids.communityId,
  });
  expect(boardAfterToggle.auto_advance_enabled).toBe(true);
  expect(boardAfterToggle.cards.find((c) => c.name === "Alice")?.stage_key).toBe("active");
  expect(boardAfterToggle.cards.find((c) => c.name === "Bob")?.stage_key).toBe("new");

  // When Bob posts while Auto-move is ON, maybeAutoAdvanceMemberOnActivity moves him to "active".
  await t.run(async (ctx) => {
    await ctx.db.insert("communityInteractionRoots", {
      communityId: ids.communityId,
      channelId: ids.channelId,
      actorType: "human",
      actorUserId: ids.memberB,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Hey team!",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "post-b-1",
      composerPayloadHash: "hash-b-1",
      createdAt: nowMs + 1_000,
      updatedAt: nowMs + 1_000,
    } as any);
    const moved = await maybeAutoAdvanceMemberOnActivity(ctx, {
      communityId: ids.communityId,
      userId: ids.memberB,
      nowMs: nowMs + 1_000,
    });
    expect(moved).toBe(true);
  });

  const boardAfterBobPost = await asOwner.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, {
    communityId: ids.communityId,
  });
  expect(boardAfterBobPost.cards.find((c) => c.name === "Bob")?.stage_key).toBe("active");
});
