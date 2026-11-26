import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.UTC(2026, 10, 25, 2, 30); // 2:30am UTC (quiet hours in UTC)

async function seedCommunity(
  t: ReturnType<typeof convexTest>,
  planTier: "free" | "guide" | "chief_of_staff",
) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: `owner-${planTier}`,
      displayName: "Neil",
      handle: `neil_${planTier}`,
      normalizedHandle: `neil_${planTier}`,
      email: `owner-${planTier}@example.com`,
      normalizedEmail: `owner-${planTier}@example.com`,
      emailVerifiedAt: NOW - 10_000,
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: `member-${planTier}`,
      displayName: "Maya",
      handle: `maya_${planTier}`,
      normalizedHandle: `maya_${planTier}`,
      email: `maya-${planTier}@example.com`,
      normalizedEmail: `maya-${planTier}@example.com`,
      emailVerifiedAt: NOW - 10_000,
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    });
    await ctx.db.insert("users", {
      authSubject: `unverified-${planTier}`,
      displayName: "Unverified",
      handle: `unv_${planTier}`,
      normalizedHandle: `unv_${planTier}`,
      email: `unverified-${planTier}@example.com`,
      normalizedEmail: `unverified-${planTier}@example.com`,
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `club-${planTier.replace(/_/g, "-")}`,
      name: `Club ${planTier}`,
      oneLiner: "Build and ship faster together.",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    } as any);

    await ctx.db.insert("communityApps", {
      communityId,
      appSlug: "community_agent",
      enabled: planTier !== "free",
      updatedByUserId: ownerId,
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    } as any);

    if (planTier !== "free") {
      await ctx.db.insert("founderSubscriptions", {
        ownerUserId: ownerId,
        communityId,
        provider: "stripe",
        providerCustomerId: `cus_${planTier}`,
        providerSubscriptionId: `sub_${planTier}`,
        providerPriceId: `price_${planTier}`,
        planTier,
        status: "active",
        currentPeriodStartAt: NOW - 5 * 86_400_000,
        currentPeriodEndAt: NOW + 25 * 86_400_000,
        cancelAtPeriodEnd: false,
        lastProviderEventCreatedAt: NOW - 5 * 86_400_000,
        createdAt: NOW - 5 * 86_400_000,
        updatedAt: NOW - 5 * 86_400_000,
      });
    }

    await ctx.db.insert("communityJourneyConfig", {
      communityId,
      stages: [
        {
          key: "new",
          name: "New",
          goal: "Introduce yourself and launch your first workflow in Acme Studio.",
          position: 0,
          checkpoints: [
            { key: "first_post", label: "Posted or replied once", kind: "first_post" },
            { key: "launched_workflow", label: "Launched first workflow", kind: "custom" },
          ],
        },
        {
          key: "active",
          name: "Active",
          goal: "Shipping weekly.",
          position: 1,
          checkpoints: [],
        },
      ],
      autoAdvanceEnabled: false,
      updatedByUserId: ownerId,
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    });

    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId,
      createdByUserId: ownerId,
      name: "Quickstart",
      status: "live",
      sortOrder: 0,
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    });
    await ctx.db.insert("communityResources", {
      communityId,
      moduleId,
      createdByUserId: ownerId,
      type: "post",
      role: "page",
      status: "published",
      title: "Day 1 Setup",
      bodyChars: 200,
      pinned: false,
      sortOrder: 0,
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    } as any);

    await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      title: "Weekly Kickoff Call",
      startsAt: NOW + 2 * 86_400_000,
      endsAt: NOW + 2 * 86_400_000 + 3_600_000,
      timezone: "UTC",
      locationType: "online",
      locationLabel: "Zoom",
      recurrenceFrequency: "none",
      visibility: "members",
      status: "live",
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    } as any);

    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "free_grant",
      state: "active",
      activationSequence: 1,
      activatedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    } as any);

    return { ownerId, memberId, communityId };
  });
}

test("automated Day-0 onboarding runs ONLY on Chief of Staff, never on Free or Guide, and enforces atomic daily cap", async () => {
  for (const tier of ["free", "guide"] as const) {
    const t = convexTest(schema, modules);
    const ids = await seedCommunity(t, tier);
    const candidate = await t.mutation(internal.communityMemberCoach.claimNewMemberOnboardingCandidateInternal, {
      communityId: ids.communityId,
      memberUserId: ids.memberId,
      activationSequence: 1,
      nowMs: NOW,
    });
    expect(candidate, `tier=${tier}`).toBeNull();
  }

  const t = convexTest(schema, modules);
  const ids = await seedCommunity(t, "chief_of_staff");
  const asOwner = t.withIdentity({ subject: "owner-chief_of_staff" });
  await asOwner.mutation(api.connectedApps.registerConnectedApp, {
    communityId: ids.communityId,
    name: "Acme Studio",
    appUrl: "https://acme.example.com",
  });

  // Draft mode by default, carrying full Member Board Stage 1 + starter course + event + connected app context.
  const draftCandidate = await t.mutation(internal.communityMemberCoach.claimNewMemberOnboardingCandidateInternal, {
    communityId: ids.communityId,
    memberUserId: ids.memberId,
    activationSequence: 1,
    nowMs: NOW,
  });
  expect(draftCandidate).not.toBeNull();
  expect(draftCandidate!.mode).toBe("draft");
  expect(draftCandidate!.journeyStageName).toBe("New");
  expect(draftCandidate!.journeyStageGoal).toContain("Introduce yourself and launch your first workflow");
  expect(draftCandidate!.journeyStageGoal).toContain("Launched first workflow");
  expect(draftCandidate!.signalDetail).toContain("Quickstart");
  expect(draftCandidate!.signalDetail).toContain("Day 1 Setup");
  expect(draftCandidate!.signalDetail).toContain("Weekly Kickoff Call");
  expect(draftCandidate!.signalDetail).toContain("Acme Studio");

  // Enabling auto-send for member_onboarding delivers immediately even at 2:30am UTC (quiet hours).
  await asOwner.mutation(api.communityMemberCoach.setMemberCoachSettings, {
    communityId: ids.communityId,
    enabled: true,
    autoReasons: ["member_onboarding"],
  });
  const autoCandidate = await t.mutation(internal.communityMemberCoach.claimNewMemberOnboardingCandidateInternal, {
    communityId: ids.communityId,
    memberUserId: ids.memberId,
    activationSequence: 1,
    nowMs: NOW,
  });
  expect(autoCandidate?.mode).toBe("auto");

  // Deliver the Day-0 welcome atomically and verify Board outcome + dedupe.
  const delivered = await t.mutation(internal.communityMemberCoach.recordMemberCoachJudgeOutcomeInternal, {
    communityId: ids.communityId,
    memberUserId: ids.memberId,
    reason: "member_onboarding",
    dedupeKey: autoCandidate!.dedupeKey,
    signalSummary: autoCandidate!.signalSummary,
    decision: "send",
    text: "Welcome to Club chief_of_staff! Start with Day 1 Setup in Quickstart, then launch Acme Studio from your sidebar.",
    requestedMode: "auto",
    usedPrivateContext: false,
    nowMs: NOW,
  });
  expect(delivered).toMatchObject({ ok: true, outcome: "sent_auto" });

  // Dedupe prevents a duplicate Day-0 welcome for the same join.
  const secondCheck = await t.mutation(internal.communityMemberCoach.claimNewMemberOnboardingCandidateInternal, {
    communityId: ids.communityId,
    memberUserId: ids.memberId,
    activationSequence: 1,
    nowMs: NOW + 60_000,
  });
  expect(secondCheck).toBeNull();

  // Member Board card records clean privacy-safe outcome note.
  const card: any = await t.run((ctx) =>
    ctx.db
      .query("communityMemberJourneyCards")
      .withIndex("by_community_user", (q) => q.eq("communityId", ids.communityId).eq("userId", ids.memberId))
      .unique(),
  );
  expect(card?.agentOutcomeNote).toContain("Day-0 welcome");

  // Atomic daily cap: a burst of 6 simultaneous new joins cannot exceed 5 total daily reservations (2 already reserved above -> only 3 more succeed).
  const burstIds = await t.run(async (ctx) => {
    const out: any[] = [];
    for (let i = 0; i < 6; i += 1) {
      const uid = await ctx.db.insert("users", {
        authSubject: `burst-${i}`,
        displayName: `Burst ${i}`,
        handle: `burst_${i}`,
        normalizedHandle: `burst_${i}`,
        email: `burst-${i}@example.com`,
        normalizedEmail: `burst-${i}@example.com`,
        emailVerifiedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("communityMemberships", {
        communityId: ids.communityId,
        userId: uid,
        role: "member",
        accessSource: "free_grant",
        state: "active",
        activationSequence: 1,
        activatedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      } as any);
      out.push(uid);
    }
    return out;
  });
  const claimed = await Promise.all(
    burstIds.map((uid) =>
      t.mutation(internal.communityMemberCoach.claimNewMemberOnboardingCandidateInternal, {
        communityId: ids.communityId,
        memberUserId: uid,
        activationSequence: 1,
        nowMs: NOW + 60_000,
      }),
    ),
  );
  expect(claimed.filter(Boolean)).toHaveLength(3);
});

test("activateCommunityMembershipCore schedules onboarding only for Chief of Staff members, never Free", async () => {
  const tFree = convexTest(schema, modules);
  const freeIds = await seedCommunity(tFree, "free");
  const freeNewUserId = await tFree.run((ctx) =>
    ctx.db.insert("users", {
      authSubject: "free-joiner",
      displayName: "Free Joiner",
      handle: "free_joiner",
      normalizedHandle: "free_joiner",
      email: "free-joiner@example.com",
      normalizedEmail: "free-joiner@example.com",
      emailVerifiedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );
  let freeScheduled = 0;
  await tFree.run(async (ctx) => {
    const wrappedCtx = Object.create(ctx);
    wrappedCtx.scheduler = {
      runAfter: async () => {
        freeScheduled += 1;
      },
    };
    await activateCommunityMembershipCore({
      ctx: wrappedCtx,
      communityId: freeIds.communityId,
      userId: freeNewUserId,
      accessSource: "free_grant",
      activationReason: "open_join",
      nowMs: NOW,
    });
  });
  expect(freeScheduled).toBe(0);

  const tChief = convexTest(schema, modules);
  const chiefIds = await seedCommunity(tChief, "chief_of_staff");
  const chiefNewUserId = await tChief.run((ctx) =>
    ctx.db.insert("users", {
      authSubject: "chief-joiner",
      displayName: "Chief Joiner",
      handle: "chief_joiner",
      normalizedHandle: "chief_joiner",
      email: "chief-joiner@example.com",
      normalizedEmail: "chief-joiner@example.com",
      emailVerifiedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );
  const scheduledCalls: Array<{ delay: number; args: any }> = [];
  await tChief.run(async (ctx) => {
    const wrappedCtx = Object.create(ctx);
    wrappedCtx.scheduler = {
      runAfter: async (delay: number, _fn: any, args: any) => {
        scheduledCalls.push({ delay, args });
      },
    };
    await activateCommunityMembershipCore({
      ctx: wrappedCtx,
      communityId: chiefIds.communityId,
      userId: chiefNewUserId,
      accessSource: "free_grant",
      activationReason: "open_join",
      nowMs: NOW,
    });
  });
  expect(scheduledCalls).toHaveLength(1);
  expect(scheduledCalls[0]!.delay).toBe(15_000);
  expect(scheduledCalls[0]!.args).toMatchObject({
    communityId: chiefIds.communityId,
    memberUserId: chiefNewUserId,
    activationSequence: 1,
  });
});

test("POST /apps/v1/milestones records verified member milestones & outcomes onto the Member Board and fails closed for non-members", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedCommunity(t, "chief_of_staff");
  const asOwner = t.withIdentity({ subject: "owner-chief_of_staff" });
  const app = await asOwner.mutation(api.connectedApps.registerConnectedApp, {
    communityId: ids.communityId,
    name: "Acme Studio",
    appUrl: "https://acme.example.com",
  });

  const postMilestone = (secret: string | null, body: unknown) =>
    t.fetch("/apps/v1/milestones", {
      method: "POST",
      headers: {
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
        "content-type": "application/json",
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  // Missing secret or bad payload fails closed.
  expect((await postMilestone(null, { email: "maya-chief_of_staff@example.com", milestone: "launched_workflow" })).status).toBe(401);
  expect((await postMilestone(app.secret, { email: "maya-chief_of_staff@example.com" })).status).toBe(400);
  expect((await postMilestone(app.secret, "x".repeat(4_100))).status).toBe(413);

  // Unknown, unverified, and owner emails return identical opaque { recorded: false }.
  for (const email of [
    "nobody@example.com",
    "unverified-chief_of_staff@example.com",
    "owner-chief_of_staff@example.com",
  ]) {
    const res = await postMilestone(app.secret, { email, milestone: "launched_workflow" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recorded: false });
  }

  // Verified active member milestone + win records cleanly onto Member Board with source "app".
  const ok = await postMilestone(app.secret, {
    email: "Maya-Chief_Of_Staff@Example.com",
    milestone: "launched_workflow",
    outcome: "Launched first workflow in Acme Studio",
  });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({
    recorded: true,
    stage_key: "new",
    stage_name: "New",
    milestone_key: "launched_workflow",
    done: true,
    outcome: "Launched first workflow in Acme Studio",
  });

  const card: any = await t.run((ctx) =>
    ctx.db
      .query("communityMemberJourneyCards")
      .withIndex("by_community_user", (q) => q.eq("communityId", ids.communityId).eq("userId", ids.memberId))
      .unique(),
  );
  expect(card?.completedMilestones).toMatchObject([
    { key: "launched_workflow", label: "Launched first workflow", source: "app" },
  ]);
  expect(card?.outcomes).toMatchObject([
    { text: "Launched first workflow in Acme Studio", source: "app" },
  ]);
});
