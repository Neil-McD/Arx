/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { markCommunityMemoryReviewDue } from "./communityMemory";
import { markCommunityBriefDue } from "./communityBriefs";
import { markReplyDraftDue } from "./communityReplyDrafts";
import { communityScopeKey, workFor } from "./communityNotesStore";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.UTC(2026, 10, 21, 16, 0, 0);

async function seedWorld(t: any) {
  return await t.run(async (ctx: any) => {
    const mkUser = (subject: string, handle: string, displayName: string) =>
      ctx.db.insert("users", {
        authSubject: subject,
        displayName,
        handle,
        normalizedHandle: handle.toLowerCase(),
        email: `${handle}@example.com`,
        normalizedEmail: `${handle}@example.com`,
        createdAt: NOW,
        updatedAt: NOW,
      });
    const ownerId = await mkUser("w2a-owner", "owner", "Founder Alice");
    const memberId = await mkUser("w2a-member", "member", "Member Bob");
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "w2a-club",
      name: "Wave 2A Club",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 2,
      memberSearchIndexedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const memberMembershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "free_grant",
      state: "active",
      activationSequence: 1,
      activatedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("communityMemberSearch", {
      communityId,
      userId: ownerId,
      role: "owner",
      displayName: "Founder Alice",
      handle: "owner",
      searchText: "founder alice owner",
      active: true,
      updatedAt: NOW,
    });
    await ctx.db.insert("communityMemberSearch", {
      communityId,
      userId: memberId,
      role: "member",
      displayName: "Member Bob",
      handle: "member",
      searchText: "member bob member",
      active: true,
      updatedAt: NOW,
    });
    const generalId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "general",
      name: "General",
      systemRole: "general",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const podId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "builders",
      name: "Builders",
      accessMode: "restricted",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("communityPods", {
      communityId,
      channelId: podId,
      purpose: "Ship fast",
      visibility: "listed",
      seats: 250,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return { ownerId, memberId, communityId, memberMembershipId, generalId, podId };
  });
}

describe("Wave 2A hot-path scalability hardening", () => {
  it("updates activeMemberCount incrementally on joins and leaves without recounting every membership", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);

    const newUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        authSubject: "w2a-new",
        displayName: "Clara Zeta",
        handle: "clarazeta",
        normalizedHandle: "clarazeta",
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );

    // Join increments activeMemberCount from 2 -> 3 and indexes Clara in communityMemberSearch.
    await t.run(async (ctx) => {
      await activateCommunityMembershipCore({
        ctx,
        communityId: w.communityId,
        userId: newUserId,
        accessSource: "free_grant",
        activationReason: "open_join",
        nowMs: NOW + 1000,
      });
    });
    const afterJoin: any = await t.run((ctx) => ctx.db.get(w.communityId));
    expect(afterJoin.activeMemberCount).toBe(3);

    // Mention search finds Clara immediately via communityMemberSearch.
    const asMember = t.withIdentity({ subject: "w2a-member" });
    const found: any[] = await asMember.query(api.communityDirectory.searchCommunityMentionCandidates, {
      communityId: w.communityId,
      query: "clara",
    });
    expect(found.some((entry) => entry.handle === "clarazeta")).toBe(true);

    // Leaving decrements activeMemberCount from 3 -> 2 and marks Clara inactive in search.
    const asClara = t.withIdentity({ subject: "w2a-new" });
    await asClara.mutation(api.communityAdmin.leaveCommunity, { communityId: w.communityId });
    const afterLeave: any = await t.run((ctx) => ctx.db.get(w.communityId));
    expect(afterLeave.activeMemberCount).toBe(2);

    const foundAfterLeave: any[] = await asMember.query(api.communityDirectory.searchCommunityMentionCandidates, {
      communityId: w.communityId,
      query: "clara",
    });
    expect(foundAfterLeave.some((entry) => entry.handle === "clarazeta")).toBe(false);
  });

  it("short-circuits agentWork writes when already scheduled and flips dirtyWhileLeased at most once per active lease", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const scope = communityScopeKey(w.communityId);

    await t.run(async (ctx) => {
      // First message schedules all 3 work rows.
      await markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.generalId, actorType: "human", nowMs: NOW });
      await markCommunityBriefDue(ctx, { communityId: w.communityId, channelId: w.generalId, actorType: "human", nowMs: NOW });
      await markReplyDraftDue(ctx, { communityId: w.communityId, channelId: w.generalId, actorType: "human", nowMs: NOW });
    });

    const firstSnapshots = await t.run(async (ctx) => ({
      mem: await workFor(ctx, scope, "memory_review"),
      brief: await workFor(ctx, scope, "brief"),
      draft: await workFor(ctx, scope, "reply_draft"),
    }));
    expect(firstSnapshots.mem?.pending).toBe(1);

    // Burst of subsequent messages while already scheduled (not leased) -> ZERO patches!
    await t.run(async (ctx) => {
      for (let i = 1; i <= 5; i += 1) {
        const ts = NOW + i * 1000;
        await markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.generalId, actorType: "human", nowMs: ts });
        await markCommunityBriefDue(ctx, { communityId: w.communityId, channelId: w.generalId, actorType: "human", nowMs: ts });
        await markReplyDraftDue(ctx, { communityId: w.communityId, channelId: w.generalId, actorType: "human", nowMs: ts });
      }
    });

    const afterBurst = await t.run(async (ctx) => ({
      mem: await workFor(ctx, scope, "memory_review"),
      brief: await workFor(ctx, scope, "brief"),
      draft: await workFor(ctx, scope, "reply_draft"),
    }));
    expect(afterBurst.mem?.updatedAt).toBe(firstSnapshots.mem?.updatedAt);
    expect(afterBurst.brief?.updatedAt).toBe(firstSnapshots.brief?.updatedAt);
    expect(afterBurst.draft?.updatedAt).toBe(firstSnapshots.draft?.updatedAt);

    // While actively leased, first message flips dirtyWhileLeased=true once; subsequent messages do zero writes.
    await t.run(async (ctx) => {
      await ctx.db.patch(firstSnapshots.mem!._id, { leaseUntil: NOW + 600_000 });
      await markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.generalId, actorType: "human", nowMs: NOW + 10_000 });
      await markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.generalId, actorType: "human", nowMs: NOW + 20_000 });
    });
    const whileLeased = await t.run(async (ctx) => await workFor(ctx, scope, "memory_review"));
    expect(whileLeased?.dirtyWhileLeased).toBe(true);
    expect(whileLeased?.pending).toBe(2);
    expect(whileLeased?.updatedAt).toBe(NOW + 10_000);
  });

  it("reads active pod seats past 200+ historical revoked rows via by_channel_status", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);

    // Insert 220 historical revoked rows, then 1 active row for memberId.
    await t.run(async (ctx) => {
      for (let i = 0; i < 220; i += 1) {
        await ctx.db.insert("communityChannelParticipants", {
          communityId: w.communityId,
          channelId: w.podId,
          principalKey: `user:revoked_${String(i).padStart(4, "0")}`,
          status: "revoked",
          reasons: [],
          createdByUserId: w.ownerId,
          createdAt: NOW - 1000,
          updatedAt: NOW - 1000,
        });
      }
      await ctx.db.insert("communityChannelParticipants", {
        communityId: w.communityId,
        channelId: w.podId,
        principalKey: `user:${w.memberId}`,
        membershipId: w.memberMembershipId,
        membershipActivationSequence: 1,
        status: "active",
        reasons: ["host"],
        createdByUserId: w.ownerId,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    const asMember = t.withIdentity({ subject: "w2a-member" });
    const listed: any = await asMember.query(api.communityPods.listCommunityPods, {
      communityId: w.communityId,
    });
    expect(listed.pods).toHaveLength(1);
    expect(listed.pods[0]).toMatchObject({ slug: "builders", members: 1, is_member: true });

    const podDetail: any = await asMember.query(api.communityPods.getPod, {
      communityId: w.communityId,
      channelId: w.podId,
    });
    expect(podDetail.members).toHaveLength(1);
    expect(podDetail.my_membership).toMatchObject({ state: "added" });
  });

  it("keeps Member Home lightweight and detects hasPosted via indexed actor lookup", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const asMember = t.withIdentity({ subject: "w2a-member" });

    // Before posting, member home steps knows member hasn't posted yet.
    const beforeSteps: any[] = await asMember.query(api.communityHomeMoments.getMemberHomeSteps, {
      communityId: w.communityId,
    });
    expect(beforeSteps.some((step) => step.kind === "say_hello")).toBe(true);

    // After posting, indexed lookup immediately marks member as having posted.
    await t.run(async (ctx) => {
      await ctx.db.insert("communityInteractionRoots", {
        communityId: w.communityId,
        channelId: w.generalId,
        actorType: "human",
        actorUserId: w.memberId,
        kind: "discussion",
        status: "live",
        visibilityScope: "community",
        contentSummary: "Hello everyone!",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "w2a-post-1",
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    const afterSteps: any[] = await asMember.query(api.communityHomeMoments.getMemberHomeSteps, {
      communityId: w.communityId,
    });
    expect(afterSteps.some((step) => step.kind === "say_hello")).toBe(false);

    // Member Home snapshot omits founder-only fields cleanly.
    const memberSnap: any = await asMember.query(api.communityFounderBrief.getCommunityMemberHomeSnapshot, {
      communityId: w.communityId,
    });
    expect(memberSnap.joinRequestsPending).toBe(0);
    expect(memberSnap.quietNewcomers).toEqual({ count: 0, names: [] });
    expect(memberSnap.newMembers.names).toEqual([]);
  });

  it("sweeps legacy communities, paginates profile sync, and excludes lapsed app-grant members from mention search", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);

    // 1. Legacy community without memberSearchIndexedAt gets picked up by the independent sweep.
    await t.run((ctx) => ctx.db.patch(w.communityId, { memberSearchIndexedAt: undefined }));
    const sweepResult: any = await t.mutation(
      internal.communityMemberSearch.sweepUnindexedCommunityMemberSearchInternal,
      {},
    );
    expect(sweepResult.scheduled).toBeGreaterThanOrEqual(1);
    const afterSweep: any = await t.run((ctx) => ctx.db.get(w.communityId));
    expect(typeof afterSweep.memberSearchBackfillStartedAt).toBe("number");

    // Run backfill batch directly to mark indexed.
    await t.mutation(internal.communityMemberSearch.backfillCommunityMemberSearchBatchInternal, {
      communityId: w.communityId,
      cursor: null,
    });
    const indexedCommunity: any = await t.run((ctx) => ctx.db.get(w.communityId));
    expect(typeof indexedCommunity.memberSearchIndexedAt).toBe("number");

    // 2. Ending a connected-app grant deactivates the search entry and removes the member from mention search.
    const appBuyerId = await t.run(async (ctx) => {
      const uid = await ctx.db.insert("users", {
        authSubject: "w2a-app-buyer",
        displayName: "Zara Buyer",
        handle: "zarabuyer",
        normalizedHandle: "zarabuyer",
        email: "zara@example.com",
        normalizedEmail: "zara@example.com",
        emailVerifiedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.patch(w.communityId, { entryPolicy: "paid_subscription" });
      return uid;
    });
    await t.mutation(internal.communityAppSales.recordAppSaleInternal, {
      appId: "app_test",
      communityId: w.communityId,
      email: "zara@example.com",
      active: true,
    });
    const asOwner = t.withIdentity({ subject: "w2a-owner" });
    const foundActive: any[] = await asOwner.query(api.communityDirectory.searchCommunityMentionCandidates, {
      communityId: w.communityId,
      query: "zara",
    });
    expect(foundActive.some((c) => c.handle === "zarabuyer")).toBe(true);

    await t.mutation(internal.communityAppSales.recordAppSaleInternal, {
      appId: "app_test",
      communityId: w.communityId,
      email: "zara@example.com",
      active: false,
    });
    const searchRowAfterLapse: any = await t.run((ctx) =>
      ctx.db
        .query("communityMemberSearch")
        .withIndex("by_community_user", (q: any) => q.eq("communityId", w.communityId).eq("userId", appBuyerId))
        .first(),
    );
    expect(searchRowAfterLapse?.active).toBe(false);
    const foundAfterLapse: any[] = await asOwner.query(api.communityDirectory.searchCommunityMentionCandidates, {
      communityId: w.communityId,
      query: "zara",
    });
    expect(foundAfterLapse.some((c) => c.handle === "zarabuyer")).toBe(false);

    // 3. Profile sync paginates across multiple batches so users in many communities stay updated.
    const extraCommunityIds = await t.run(async (ctx) => {
      const ids: any[] = [];
      for (let i = 0; i < 3; i += 1) {
        const cid = await ctx.db.insert("communities", {
          ownerId: w.ownerId,
          slug: `w2a-extra-${i}`,
          name: `Extra ${i}`,
          visibility: "published",
          inferenceFundingPolicy: "managed_required",
          entryPolicy: "open",
          activeMemberCount: 2,
          memberSearchIndexedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
        });
        await ctx.db.insert("communityMemberSearch", {
          communityId: cid,
          userId: w.memberId,
          role: "member",
          displayName: "Old Name",
          handle: "w2amember",
          searchText: "old name w2amember",
          active: true,
          updatedAt: NOW,
        });
        ids.push(cid);
      }
      await ctx.db.patch(w.memberId, { displayName: "Renamed Member", updatedAt: NOW + 5_000 });
      return ids;
    });
    // Paginate with batchSize=2 to exercise continuation scheduling.
    const firstPage: any = await t.mutation(
      internal.communityMemberSearch.syncUserMemberSearchEntriesBatchInternal,
      { userId: w.memberId, cursor: null, nowMs: NOW + 5_000, batchSize: 2 },
    );
    expect(firstPage.isDone).toBe(false);
    expect(firstPage.continueCursor).toBeTruthy();
    await t.mutation(internal.communityMemberSearch.syncUserMemberSearchEntriesBatchInternal, {
      userId: w.memberId,
      cursor: firstPage.continueCursor,
      nowMs: NOW + 5_000,
      batchSize: 2,
    });
    const allMemberSearchRows: any[] = await t.run((ctx) =>
      ctx.db
        .query("communityMemberSearch")
        .withIndex("by_user", (q: any) => q.eq("userId", w.memberId))
        .collect(),
    );
    expect(allMemberSearchRows.length).toBeGreaterThanOrEqual(extraCommunityIds.length + 1);
    for (const row of allMemberSearchRows) {
      expect(row.displayName).toBe("Renamed Member");
      expect(row.searchText).toContain("renamed member");
    }
  });
});
