import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

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
  // Releasing a skipped/aborted run frees its in-flight reservation immediately.
  await t.mutation(internal.communityMemberCoach.releaseNewMemberOnboardingReservationInternal, {
    communityId: ids.communityId,
    reservationToken: draftCandidate!.reservationToken,
    nowMs: NOW + 1_000,
  });

  // Enabling auto-send for member_onboarding delivers immediately for live joins even at 2:30am UTC,
  // while offline activations (host approval / app grant) respect quiet hours and wait as drafts.
  await asOwner.mutation(api.communityMemberCoach.setMemberCoachSettings, {
    communityId: ids.communityId,
    enabled: true,
    autoReasons: ["member_onboarding"],
  });
  const offlineCandidate = await t.mutation(internal.communityMemberCoach.claimNewMemberOnboardingCandidateInternal, {
    communityId: ids.communityId,
    memberUserId: ids.memberId,
    activationSequence: 1,
    isLiveJoin: false,
    nowMs: NOW + 2_000,
  });
  expect(offlineCandidate?.mode).toBe("draft");
  await t.mutation(internal.communityMemberCoach.releaseNewMemberOnboardingReservationInternal, {
    communityId: ids.communityId,
    reservationToken: offlineCandidate!.reservationToken,
    nowMs: NOW + 3_000,
  });

  const autoCandidate = await t.mutation(internal.communityMemberCoach.claimNewMemberOnboardingCandidateInternal, {
    communityId: ids.communityId,
    memberUserId: ids.memberId,
    activationSequence: 1,
    isLiveJoin: true,
    nowMs: NOW + 4_000,
  });
  expect(autoCandidate?.mode).toBe("auto");

  // Deliver the Day-0 welcome atomically and release its in-flight reservation (now counted in drafts).
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
    isLiveJoin: true,
    nowMs: NOW + 5_000,
  });
  expect(delivered).toMatchObject({ ok: true, outcome: "sent_auto" });
  await t.mutation(internal.communityMemberCoach.releaseNewMemberOnboardingReservationInternal, {
    communityId: ids.communityId,
    reservationToken: autoCandidate!.reservationToken,
    nowMs: NOW + 5_500,
  });

  // Dedupe prevents a duplicate Day-0 welcome for the same join.
  const secondCheck = await t.mutation(internal.communityMemberCoach.claimNewMemberOnboardingCandidateInternal, {
    communityId: ids.communityId,
    memberUserId: ids.memberId,
    activationSequence: 1,
    nowMs: NOW + 60_000,
  });
  expect(secondCheck).toBeNull();

  // Member Board card records clean privacy-safe outcome note AND does NOT falsely
  // mark the brand-new member as "stuck" immediately after their Day-0 welcome.
  const card: any = await t.run((ctx) =>
    ctx.db
      .query("communityMemberJourneyCards")
      .withIndex("by_community_user", (q) => q.eq("communityId", ids.communityId).eq("userId", ids.memberId))
      .unique(),
  );
  expect(card?.agentOutcomeNote).toContain("Day-0 welcome");

  const board = await asOwner.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, {
    communityId: ids.communityId,
  });
  const mayaCard = board.cards.find((entry) => entry.name === "Maya");
  expect(mayaCard?.status).toBe("on_track");

  // Two days later, quiet_newcomer does NOT send a duplicate welcome to Maya (she already got Day-0).
  const day2Scan = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
    communityId: ids.communityId,
    autoReasons: ["quiet_newcomer"],
    nowMs: NOW + 2 * 86_400_000 + 60_000,
  });
  expect(day2Scan.candidate).toBeNull();

  // Atomic daily cap: a burst of 6 simultaneous new joins cannot exceed 5 total daily touches
  // (1 already sent above -> only 4 more succeed in-flight; releasing one immediately frees a slot).
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
  const winners = claimed.filter(Boolean);
  expect(winners).toHaveLength(4);
  // Release one failed/skipped slot and verify the 5th burst member can now claim cleanly.
  await t.mutation(internal.communityMemberCoach.releaseNewMemberOnboardingReservationInternal, {
    communityId: ids.communityId,
    reservationToken: winners[0]!.reservationToken,
    nowMs: NOW + 61_000,
  });
  const loserIdx = claimed.findIndex((item) => !item);
  const recovered = await t.mutation(internal.communityMemberCoach.claimNewMemberOnboardingCandidateInternal, {
    communityId: ids.communityId,
    memberUserId: burstIds[loserIdx]!,
    activationSequence: 1,
    nowMs: NOW + 62_000,
  });
  expect(recovered).not.toBeNull();
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

  // Retrying the same app outcome is idempotent (no duplicate win rows).
  const retry = await postMilestone(app.secret, {
    email: "maya-chief_of_staff@example.com",
    milestone: "launched_workflow",
    outcome: "Launched first workflow in Acme Studio",
  });
  expect(retry.status).toBe(200);
  const cardAfterRetry: any = await t.run((ctx) =>
    ctx.db
      .query("communityMemberJourneyCards")
      .withIndex("by_community_user", (q) => q.eq("communityId", ids.communityId).eq("userId", ids.memberId))
      .unique(),
  );
  expect(cardAfterRetry?.outcomes).toHaveLength(1);

  // Unconfigured custom app milestones surface cleanly as an app win instead of disappearing silently.
  const customRes = await postMilestone(app.secret, {
    email: "maya-chief_of_staff@example.com",
    milestone: "first_win",
    label: "Completed first workspace export",
  });
  expect(customRes.status).toBe(200);
  expect(await customRes.json()).toMatchObject({
    recorded: true,
    milestone_key: "first_win",
    done: true,
    outcome: "Completed first workspace export",
  });

  // Turning on autoAdvanceEnabled moves a card automatically once its final stage checkpoint completes.
  await asOwner.mutation(api.communityMemberJourney.saveCommunityJourneyStages, {
    communityId: ids.communityId,
    stages: [
      {
        key: "new",
        name: "New",
        goal: "Introduce yourself and launch your first workflow in Acme Studio.",
        checkpoints: [
          { key: "first_post", label: "Posted or replied once", kind: "first_post" },
          { key: "launched_workflow", label: "Launched first workflow", kind: "custom" },
        ],
      },
      {
        key: "active",
        name: "Active",
        goal: "Shipping weekly.",
        checkpoints: [],
      },
    ],
    autoAdvanceEnabled: true,
  });
  const autoAdvanced = await postMilestone(app.secret, {
    email: "maya-chief_of_staff@example.com",
    milestone: "first_post",
  });
  expect(autoAdvanced.status).toBe(200);
  expect(await autoAdvanced.json()).toMatchObject({
    recorded: true,
    stage_key: "active",
    stage_name: "Active",
  });
});

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

test("POST /apps/v1/milestones supports pairwise user_id, daily active pings, idempotency, unmapped discovery, and Chief of Staff recency", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedCommunity(t, "chief_of_staff");
  const asOwner = t.withIdentity({ subject: "owner-chief_of_staff" });
  const asMember = t.withIdentity({ subject: "member-chief_of_staff" });

  // Complete Maya's account setup so Sign in with Polynet OAuth succeeds.
  await t.run(async (ctx) => {
    await ctx.db.insert("userProfileDetails", {
      userId: ids.memberId,
      displayName: "Maya",
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    } as any);
    for (const doc of PLATFORM_LEGAL_DOCUMENTS) {
      await ctx.db.insert("legalAcceptances", {
        userId: ids.memberId,
        documentKey: doc.key,
        documentVersion: doc.version,
        acceptedAt: NOW - 10_000,
        source: "account_setup",
        createdAt: NOW - 10_000,
      } as any);
    }
  });

  const callbackA = "https://acme.example.com/api/auth/polynet/callback";
  const callbackB = "https://other.example.com/api/auth/polynet/callback";
  const appA = await asOwner.mutation(api.connectedApps.registerConnectedApp, {
    communityId: ids.communityId,
    name: "Acme Studio",
    appUrl: "https://acme.example.com",
  });
  const appB = await asOwner.mutation(api.connectedApps.registerConnectedApp, {
    communityId: ids.communityId,
    name: "Other App",
    appUrl: "https://other.example.com",
  });
  await asOwner.mutation(api.connectedApps.updateConnectedApp, {
    communityId: ids.communityId,
    appId: appA.app_id,
    redirectUrls: [callbackA],
  });
  await asOwner.mutation(api.connectedApps.updateConnectedApp, {
    communityId: ids.communityId,
    appId: appB.app_id,
    redirectUrls: [callbackB],
  });

  // Exchange a Sign in with Polynet code for App A to obtain Maya's pairwise pusr_... ID.
  const verifier = "verifier_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";
  const challenge = await pkceChallenge(verifier);
  const approved = await asMember.mutation(api.connectedApps.approveConnectedAppAuthorization, {
    clientId: appA.app_id,
    redirectUri: callbackA,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });
  const tokenRes = await t.fetch("/apps/v1/oauth/token", {
    method: "POST",
    headers: { authorization: `Bearer ${appA.secret}`, "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: approved.code,
      redirect_uri: callbackA,
      code_verifier: verifier,
    }),
  });
  expect(tokenRes.status).toBe(200);
  const { user: oauthUser } = await tokenRes.json();
  expect(oauthUser.id).toMatch(/^pusr_[a-f0-9]{32}$/);

  const postMilestone = (secret: string, body: unknown) =>
    t.fetch("/apps/v1/milestones", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  // Validation rejects missing identifier or malformed user_id.
  expect((await postMilestone(appA.secret, { milestone: "first_campaign" })).status).toBe(400);
  expect((await postMilestone(appA.secret, { user_id: "not_a_pusr", active: true })).status).toBe(400);

  // Cross-app isolation: App B cannot use App A's pairwise user_id.
  const crossApp = await postMilestone(appB.secret, {
    user_id: oauthUser.id,
    milestone: "first_campaign",
  });
  expect(crossApp.status).toBe(200);
  expect(await crossApp.json()).toEqual({ recorded: false });

  // Email + user_id mismatch fails closed.
  const mismatch = await postMilestone(appA.secret, {
    user_id: oauthUser.id,
    email: "someone-else@example.com",
    milestone: "first_campaign",
  });
  expect(mismatch.status).toBe(200);
  expect(await mismatch.json()).toEqual({ recorded: false });

  // Valid pairwise user_id + idempotency_key records unmapped milestone and surfaces it for discovery.
  const firstCall = await postMilestone(appA.secret, {
    user_id: oauthUser.id,
    milestone: "first_campaign",
    label: "Launched first campaign",
    outcome: "Sent first outbound campaign",
    idempotency_key: "evt_camp_1",
  });
  expect(firstCall.status).toBe(200);
  expect(await firstCall.json()).toMatchObject({
    recorded: true,
    milestone_key: "first_campaign",
    done: true,
    outcome: "Sent first outbound campaign",
  });

  // Repeating the same idempotency_key from the SAME app deduplicates cleanly without creating a second outcome.
  const dupKey = await postMilestone(appA.secret, {
    user_id: oauthUser.id,
    outcome: "Different text that should be ignored on duplicate key",
    idempotency_key: "evt_camp_1",
  });
  expect(dupKey.status).toBe(200);
  expect(await dupKey.json()).toMatchObject({ recorded: true, deduplicated: true });

  // A DIFFERENT connected app in the same community reusing the same local idempotency_key is NOT suppressed.
  const sameKeyOtherApp = await postMilestone(appB.secret, {
    email: "maya-chief_of_staff@example.com",
    outcome: "Completed setup in Other App",
    idempotency_key: "evt_camp_1",
  });
  expect(sameKeyOtherApp.status).toBe(200);
  expect(await sameKeyOtherApp.json()).toMatchObject({
    recorded: true,
    outcome: "Completed setup in Other App",
  });

  // Daily active ping on the same UTC day deduplicates cleanly, AND if it carries a new idempotency_key
  // that key is remembered so a retry after UTC midnight cannot falsely refresh lastAppActivityAt.
  const cardBeforePing: any = await t.run((ctx) =>
    ctx.db
      .query("communityMemberJourneyCards")
      .withIndex("by_community_user", (q) => q.eq("communityId", ids.communityId).eq("userId", ids.memberId))
      .unique(),
  );
  expect(typeof cardBeforePing?.lastAppActivityAt).toBe("number");
  expect(cardBeforePing?.outcomes).toHaveLength(2);

  const sameDayPing = await postMilestone(appA.secret, {
    user_id: oauthUser.id,
    active: true,
    idempotency_key: "ping_today_1",
  });
  expect(sameDayPing.status).toBe(200);
  expect(await sameDayPing.json()).toMatchObject({ recorded: true, deduplicated: true, active: true });

  // Simulate moving past UTC midnight (previous activity was 2 days ago) and retrying the same keyed ping:
  // it must still deduplicate and NOT overwrite lastAppActivityAt.
  const staleActivityAt = Date.now() - 2 * 86_400_000;
  await t.run(async (ctx) => {
    await ctx.db.patch(cardBeforePing._id, { lastAppActivityAt: staleActivityAt });
  });
  const retryPingNextDay = await postMilestone(appA.secret, {
    user_id: oauthUser.id,
    active: true,
    idempotency_key: "ping_today_1",
  });
  expect(retryPingNextDay.status).toBe(200);
  expect(await retryPingNextDay.json()).toMatchObject({ recorded: true, deduplicated: true, active: true });
  const cardAfterMidnightRetry: any = await t.run((ctx) => ctx.db.get(cardBeforePing._id));
  expect(cardAfterMidnightRetry?.lastAppActivityAt).toBe(staleActivityAt);

  // Restore fresh activity timestamp for the Board assertions below.
  await t.run(async (ctx) => {
    await ctx.db.patch(cardBeforePing._id, { lastAppActivityAt: cardBeforePing.lastAppActivityAt });
  });

  // Member Board surfaces the unmapped milestone for 1-click tracking AND exposes last_app_active_at.
  const boardBefore = await asOwner.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, {
    communityId: ids.communityId,
  });
  expect(boardBefore.discovered_app_milestones).toEqual([
    expect.objectContaining({
      key: "first_campaign",
      label: "Launched first campaign",
      member_count: 1,
    }),
  ]);
  const mayaCardBefore = boardBefore.cards.find((c) => c.name === "Maya");
  expect(mayaCardBefore?.last_app_active_at).toBeTruthy();

  // Lightweight getCommunityJourneyStages works for managers and fails closed for regular members.
  const stagesRes = await asOwner.query(api.communityMemberJourney.getCommunityJourneyStages, {
    communityId: ids.communityId,
  });
  expect(stagesRes.stages.length).toBeGreaterThanOrEqual(2);
  await expect(
    asMember.query(api.communityMemberJourney.getCommunityJourneyStages, {
      communityId: ids.communityId,
    }),
  ).rejects.toThrow();

  // Promoting "first_campaign" to a stage checkpoint clears it from discovered_app_milestones
  // and immediately ticks Maya's card checkpoint as done.
  await asOwner.mutation(api.communityMemberJourney.saveCommunityJourneyStages, {
    communityId: ids.communityId,
    stages: [
      {
        key: "new",
        name: "New",
        goal: "Ship your first campaign.",
        checkpoints: [
          { key: "first_post", label: "Posted or replied once", kind: "first_post" },
          { key: "first_campaign", label: "Launched first campaign", kind: "custom" },
        ],
      },
      {
        key: "active",
        name: "Active",
        goal: "Shipping weekly.",
        checkpoints: [],
      },
    ],
  });
  const boardAfter = await asOwner.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, {
    communityId: ids.communityId,
  });
  expect(boardAfter.discovered_app_milestones).toEqual([]);
  const mayaCardAfter = boardAfter.cards.find((c) => c.name === "Maya");
  expect(mayaCardAfter?.checkpoints.find((cp) => cp.key === "first_campaign")?.done).toBe(true);

  // Chief of Staff cross-surface recency (evaluated at 15:00 UTC outside quiet hours):
  // Maya joined 5 days ago and never posted in community channels, but she IS active in Acme Studio today
  // -> must NOT be flagged as a quiet_newcomer.
  const mayaMembership: any = await t.run((ctx) =>
    ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) => q.eq("communityId", ids.communityId).eq("userId", ids.memberId))
      .unique(),
  );
  const dayScanNowMs = Date.UTC(2026, 10, 26, 15, 0);
  await t.run(async (ctx) => {
    await ctx.db.patch(mayaMembership._id, {
      createdAt: dayScanNowMs - 5 * 86_400_000,
      activatedAt: dayScanNowMs - 5 * 86_400_000,
    });
    await ctx.db.patch(cardBeforePing._id, {
      lastAppActivityAt: dayScanNowMs - 60_000,
    });
  });
  const scanActiveInApp = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
    communityId: ids.communityId,
    autoReasons: [],
    nowMs: dayScanNowMs,
  });
  expect(scanActiveInApp.candidate).toBeNull();

  // If Maya joined 25 days ago, was last active in Acme Studio 18 days ago (quiet in BOTH app and community),
  // and there is an upcoming event within 7 days -> Chief of Staff catches her as quiet_member.
  await t.run(async (ctx) => {
    await ctx.db.patch(mayaMembership._id, {
      createdAt: dayScanNowMs - 25 * 86_400_000,
      activatedAt: dayScanNowMs - 25 * 86_400_000,
    });
    await ctx.db.patch(cardBeforePing._id, {
      lastAppActivityAt: dayScanNowMs - 18 * 86_400_000,
    });
    await ctx.db.insert("communityEvents", {
      communityId: ids.communityId,
      createdByUserId: ids.ownerId,
      title: "Weekly Builder Office Hours",
      startsAt: dayScanNowMs + 2 * 86_400_000,
      endsAt: dayScanNowMs + 2 * 86_400_000 + 3_600_000,
      timezone: "UTC",
      locationType: "online",
      visibility: "members",
      status: "live",
      createdAt: dayScanNowMs - 86_400_000,
      updatedAt: dayScanNowMs - 86_400_000,
    } as any);
  });
  const scanQuietInBoth = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
    communityId: ids.communityId,
    autoReasons: [],
    nowMs: dayScanNowMs,
  });
  expect(scanQuietInBoth.candidate?.reason).toBe("quiet_member");
});
