/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { registerCommunityMemberWelcomeActivationCore } from "./communityMemberWelcome";
import schema from "./schema";
import { COMMUNITY_MEMBER_WELCOME_DELAY_MS } from "../shared/communityMemberWelcome";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob([
  "./communityInteractions.ts",
  "./communityInteractionEvidence.ts",
  "./communityMemberWelcome.ts",
  "./communityAgentConcierge.ts",
  "./communityAgentServeWorker.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "member-welcome-owner";
const MEMBER_ONE_SUBJECT = "member-welcome-one";
const MEMBER_TWO_SUBJECT = "member-welcome-two";
const NOW_MS = 1_780_000_000_000;

afterEach(() => {
  vi.useRealTimers();
});

async function createFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: OWNER_SUBJECT,
      displayName: "Welcome Founder",
      handle: "welcome-founder",
      normalizedHandle: "welcome-founder",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const memberOneId = await ctx.db.insert("users", {
      authSubject: MEMBER_ONE_SUBJECT,
      displayName: "Member One",
      handle: "member-one",
      normalizedHandle: "member-one",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const memberTwoId = await ctx.db.insert("users", {
      authSubject: MEMBER_TWO_SUBJECT,
      displayName: "Member Two",
      handle: "member-two",
      normalizedHandle: "member-two",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    await ctx.db.insert("userProfileDetails", {
      userId: memberOneId,
      displayName: "Member One",
      avatarUrl: "https://example.com/member-one.png",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    for (const document of PLATFORM_LEGAL_DOCUMENTS) {
      await ctx.db.insert("legalAcceptances", {
        userId: memberOneId,
        documentKey: document.key,
        documentVersion: document.version,
        acceptedAt: NOW_MS,
        source: "test",
        createdAt: NOW_MS,
      });
    }
    await ctx.db.insert("operatorRoles", {
      userId: ownerId,
      role: "owner",
      active: true,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "member-welcome",
      name: "Member Welcome",
      lifecycleStatus: "active",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const channelId = await ctx.db.insert("communityChannels", {
      communityId,
      systemRole: "general",
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const membershipOneId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberOneId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      activationSequence: 1,
      activatedAt: NOW_MS,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const membershipTwoId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberTwoId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      activationSequence: 1,
      activatedAt: NOW_MS + 1,
      createdAt: NOW_MS + 1,
      updatedAt: NOW_MS + 1,
    });
    return {
      channelId,
      communityId,
      memberOneId,
      memberTwoId,
      membershipOneId,
      membershipTwoId,
      ownerId,
    };
  });
}

test("member activations converge on one due batch and cannot publish early", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);

  const first = await t.run(
    async (ctx) =>
      await registerCommunityMemberWelcomeActivationCore(ctx, {
        membershipId: fixture.membershipOneId,
        activationSequence: 1,
      }),
  );
  const second = await t.run(
    async (ctx) =>
      await registerCommunityMemberWelcomeActivationCore(ctx, {
        membershipId: fixture.membershipTwoId,
        activationSequence: 1,
      }),
  );

  expect(first).toMatchObject({ scheduled: true, deduped: false });
  expect(second).toMatchObject({
    scheduled: true,
    deduped: true,
    batchId: first.batchId,
  });
  await expect(
    t.mutation(
      internal.communityMemberWelcome
        .publishCommunityMemberWelcomeBatchInternal,
      {
        batchId: first.batchId as any,
      },
    ),
  ).resolves.toEqual({ published: false, code: "batch_not_due" });
  const { batches, scheduledFunctions } = await t.run(async (ctx) => ({
    batches: await ctx.db.query("communityMemberWelcomeBatches").collect(),
    scheduledFunctions: await ctx.db.system
      .query("_scheduled_functions")
      .collect(),
  }));
  expect(batches).toHaveLength(1);
  expect(batches[0]).toMatchObject({
    status: "scheduled",
    windowStartAt: NOW_MS,
    dueAt: NOW_MS + COMMUNITY_MEMBER_WELCOME_DELAY_MS,
  });
  expect(scheduledFunctions).toHaveLength(1);
});

test("the canonical membership activation registers a batch without blocking access", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const joiningUserId = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        authSubject: "member-welcome-canonical-join",
        displayName: "Canonical Join",
        handle: "canonical-join",
        normalizedHandle: "canonical-join",
        createdAt: NOW_MS,
        updatedAt: NOW_MS,
      }),
  );

  const activation = await t.run(
    async (ctx) =>
      await activateCommunityMembershipCore({
        ctx,
        communityId: fixture.communityId,
        userId: joiningUserId,
        role: "member",
        accessSource: "free_grant",
        activationReason: "member_welcome_contract",
        nowMs: NOW_MS,
      }),
  );
  expect(activation).toMatchObject({ accessGranted: true });

  const { batches, scheduledFunctions } = await t.run(async (ctx) => ({
    batches: await ctx.db.query("communityMemberWelcomeBatches").collect(),
    scheduledFunctions: await ctx.db.system
      .query("_scheduled_functions")
      .collect(),
  }));
  expect(batches).toHaveLength(1);
  expect(batches[0]).toMatchObject({
    communityId: fixture.communityId,
    status: "scheduled",
    windowStartAt: NOW_MS,
  });
  expect(scheduledFunctions).toHaveLength(1);
});

test("the scheduled due batch writes one canonical agent root exactly once", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const registered = await t.run(
    async (ctx) =>
      await registerCommunityMemberWelcomeActivationCore(ctx, {
        membershipId: fixture.membershipOneId,
        activationSequence: 1,
      }),
  );
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());

  await expect(
    t.mutation(
      internal.communityMemberWelcome
        .publishCommunityMemberWelcomeBatchInternal,
      { batchId: registered.batchId as any },
    ),
  ).resolves.toEqual({
    published: false,
    code: "batch_not_scheduled",
  });

  const stored = await t.run(async (ctx) => {
    const [batches, blocks, mentions, roots] = await Promise.all([
      ctx.db.query("communityMemberWelcomeBatches").collect(),
      ctx.db.query("communityInteractionContentBlocks").collect(),
      ctx.db.query("communityInteractionMentions").collect(),
      ctx.db.query("communityInteractionRoots").collect(),
    ]);
    return { batches, blocks, mentions, roots };
  });
  expect(stored.batches).toHaveLength(1);
  expect(stored.batches[0]).toMatchObject({ status: "published" });
  expect(stored.roots).toHaveLength(1);
  expect(stored.roots[0]).toMatchObject({
    communityId: fixture.communityId,
    channelId: fixture.channelId,
    actorType: "community_agent",
    actorAgentKey: "community_agent",
    status: "live",
  });
  expect(stored.blocks).toHaveLength(1);
  expect(stored.blocks[0]?.text).toContain("@member-one, @member-two");
  expect(stored.blocks[0]?.text).toContain("community concierge");
  expect(stored.mentions).toHaveLength(2);
  expect(stored.mentions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        mentionedUserId: fixture.memberOneId,
        emailEligible: false,
        notifyState: "sent",
      }),
      expect.objectContaining({
        mentionedUserId: fixture.memberTwoId,
        emailEligible: false,
        notifyState: "sent",
      }),
    ]),
  );
});

test("disabled or inactive communities settle without a chat root", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const registered = await t.run(
    async (ctx) =>
      await registerCommunityMemberWelcomeActivationCore(ctx, {
        membershipId: fixture.membershipOneId,
        activationSequence: 1,
      }),
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      conciergeWelcomesEnabled: false,
    });
  });
  vi.setSystemTime(NOW_MS + COMMUNITY_MEMBER_WELCOME_DELAY_MS + 1);

  await expect(
    t.mutation(
      internal.communityMemberWelcome
        .publishCommunityMemberWelcomeBatchInternal,
      {
        batchId: registered.batchId as any,
      },
    ),
  ).resolves.toEqual({ published: false, code: "concierge_welcomes_disabled" });
  const stored = await t.run(async (ctx) => ({
    batches: await ctx.db.query("communityMemberWelcomeBatches").collect(),
    roots: await ctx.db.query("communityInteractionRoots").collect(),
  }));
  expect(stored.batches[0]).toMatchObject({
    status: "skipped",
    skipReason: "concierge_welcomes_disabled",
  });
  expect(stored.roots).toHaveLength(0);
});

test("a reply to the grouped welcome uses the existing direct-reply agent path", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const registered = await t.run(
    async (ctx) =>
      await registerCommunityMemberWelcomeActivationCore(ctx, {
        membershipId: fixture.membershipOneId,
        activationSequence: 1,
      }),
  );
  vi.setSystemTime(NOW_MS + COMMUNITY_MEMBER_WELCOME_DELAY_MS + 1);
  const published = await t.mutation(
    internal.communityMemberWelcome.publishCommunityMemberWelcomeBatchInternal,
    { batchId: registered.batchId as any },
  );
  const asMember = t.withIdentity({ subject: MEMBER_ONE_SUBJECT });
  await asMember.mutation(
    api.communityInteractions.createCommunityInteractionComposerMessage,
    {
      communityId: fixture.communityId,
      channelId: fixture.channelId,
      rootId: published.rootId as any,
      idempotencyKey: "member-welcome-direct-reply",
      text: "Where should I start?",
    },
  );

  const requests = await t.run(
    async (ctx) => await ctx.db.query("communityAgentServeRequests").collect(),
  );
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    communityId: fixture.communityId,
    sourceRootId: published.rootId,
    requesterUserId: fixture.memberOneId,
    sponsorUserId: fixture.memberOneId,
    triggerKind: "direct_reply",
    status: "queued",
  });
});
