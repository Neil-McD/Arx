/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  COMMUNITY_PRESENCE_HEARTBEAT_COALESCE_WINDOW_MS,
  COMMUNITY_PRESENCE_LEASE_DURATION_MS,
  listCommunityOnlineMembers,
  renewCommunityPresenceLease,
  resolveMemberCommunityPresenceSummary,
} from "./communityPresenceCore";
import { DISCOVER_ACTIVITY_CACHE_TTL_MS } from "./communityPublic";
import { buildSnapshot } from "./communityFounderBrief";

const modules = import.meta.glob([
  "./**/*.ts",
  "!./**/*.test.ts",
  "./_generated/**/*.*s",
]);
const internalRefs = internal as any;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const originalPublicAppUrl = process.env.ARX_PUBLIC_APP_URL;

beforeAll(() => {
  process.env.ARX_PUBLIC_APP_URL = "https://polynet.test";
});

afterAll(() => {
  if (originalPublicAppUrl === undefined) delete process.env.ARX_PUBLIC_APP_URL;
  else process.env.ARX_PUBLIC_APP_URL = originalPublicAppUrl;
});

describe("Wave 2D: presence storm coalescing and parallel online resolution", () => {
  it("coalesces rapid heartbeats within 15s without writing and renews once the window elapses", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const nowMs = 1_000_000;
      const ownerId = await ctx.db.insert("users", {
        authSubject: "w2d-presence-owner",
        displayName: "Owner",
        handle: "w2d-owner",
        normalizedHandle: "w2d-owner",
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "w2d-presence",
        name: "Wave 2D Presence",
        visibility: "unlisted",
        inferenceFundingPolicy: "managed_required",
        entryPolicy: "open",
        activeMemberCount: 1,
        createdAt: nowMs,
        updatedAt: nowMs,
      });

      const first = await renewCommunityPresenceLease({
        ctx,
        communityId,
        userId: ownerId,
        nowMs,
        minRefreshIntervalMs: COMMUNITY_PRESENCE_HEARTBEAT_COALESCE_WINDOW_MS,
      });
      expect(first).toEqual({
        lastSeenAt: nowMs,
        activeUntil: nowMs + COMMUNITY_PRESENCE_LEASE_DURATION_MS,
      });

      // Multi-tab / focus storm 5 seconds later: coalesced, zero DB patch.
      const coalesced = await renewCommunityPresenceLease({
        ctx,
        communityId,
        userId: ownerId,
        nowMs: nowMs + 5_000,
        minRefreshIntervalMs: COMMUNITY_PRESENCE_HEARTBEAT_COALESCE_WINDOW_MS,
      });
      expect(coalesced).toEqual(first);
      const rowAfterCoalesce = await ctx.db
        .query("communityPresence")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", communityId).eq("userId", ownerId),
        )
        .first();
      expect(rowAfterCoalesce?.updatedAt).toBe(nowMs);

      // Once 15s elapses, the next heartbeat renews the lease.
      const renewedAt = nowMs + COMMUNITY_PRESENCE_HEARTBEAT_COALESCE_WINDOW_MS;
      const renewed = await renewCommunityPresenceLease({
        ctx,
        communityId,
        userId: ownerId,
        nowMs: renewedAt,
        minRefreshIntervalMs: COMMUNITY_PRESENCE_HEARTBEAT_COALESCE_WINDOW_MS,
      });
      expect(renewed).toEqual({
        lastSeenAt: renewedAt,
        activeUntil: renewedAt + COMMUNITY_PRESENCE_LEASE_DURATION_MS,
      });
      const rowAfterRenew = await ctx.db
        .query("communityPresence")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", communityId).eq("userId", ownerId),
        )
        .first();
      expect(rowAfterRenew?.updatedAt).toBe(renewedAt);
    });
  });

  it("resolves online member summaries and site member lists accurately in parallel", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const nowMs = Date.now();
      const ownerId = await ctx.db.insert("users", {
        authSubject: "w2d-list-owner",
        displayName: "Owner",
        handle: "w2d-list-owner",
        normalizedHandle: "w2d-list-owner",
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "w2d-online-list",
        name: "Wave 2D Online List",
        visibility: "unlisted",
        inferenceFundingPolicy: "managed_required",
        entryPolicy: "open",
        activeMemberCount: 5,
        createdAt: nowMs,
        updatedAt: nowMs,
      });

      const createdSubjects: string[] = [];
      for (let i = 0; i < 4; i += 1) {
        const subject = `w2d-online-member-${i}`;
        createdSubjects.push(subject);
        const userId = await ctx.db.insert("users", {
          authSubject: subject,
          displayName: `Member ${i}`,
          handle: subject,
          normalizedHandle: subject,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
        await ctx.db.insert("operatorRoles", {
        userId: ownerId,
        role: "owner",
        active: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await ctx.db.insert("communityMemberships", {
          communityId,
          userId,
          role: "member",
          accessSource: "free_grant",
          state: "active",
          createdAt: nowMs,
          updatedAt: nowMs,
        });
        await ctx.db.insert("communityPresence", {
          communityId,
          userId,
          lastSeenAt: nowMs - i * 1_000,
          activeUntil: nowMs + COMMUNITY_PRESENCE_LEASE_DURATION_MS - i * 1_000,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }

      const community = (await ctx.db.get(communityId))!;
      const summary = await resolveMemberCommunityPresenceSummary(ctx, community);
      expect(summary.onlineCount).toBe(4);
      expect(summary.onlineUserIds).toEqual(createdSubjects);

      const onlineList = await listCommunityOnlineMembers(ctx, community);
      expect(onlineList.online_count).toBe(4);
      expect(onlineList.members.map((m) => m.name)).toEqual([
        "Member 0",
        "Member 1",
        "Member 2",
        "Member 3",
      ]);
    });
  });
});

describe("Wave 2D: pre-computed Discover activity stats", () => {
  it("refreshes published community activity in batches, serves O(1) cache, and ages out >7d stats", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const { communityId, postIds } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "w2d-discover-owner",
        displayName: "Discover Host",
        handle: "discover-host",
        normalizedHandle: "discover-host",
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "w2d-discover-club",
        name: "Wave 2D Discover Club",
        oneLiner: "A lively builders community.",
        bannerUrl: "https://example.com/banner.png",
        visibility: "published",
        lifecycleStatus: "active",
        inferenceFundingPolicy: "managed_required",
        entryPolicy: "open",
        activeMemberCount: 12,
        createdAt: nowMs - 10 * DAY_MS,
        updatedAt: nowMs,
      });
      const openChannelId = await ctx.db.insert("communityChannels", {
        communityId,
        systemRole: "general",
        slug: "general",
        name: "General",
        accessMode: "all_members",
        postingPolicy: "members",
        status: "active",
        position: 0,
        createdByUserId: ownerId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const privateChannelId = await ctx.db.insert("communityChannels", {
        communityId,
        slug: "pod-room",
        name: "Pod Room",
        accessMode: "restricted",
        postingPolicy: "members",
        status: "active",
        position: 1,
        createdByUserId: ownerId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const post1 = await ctx.db.insert("communityInteractionRoots", {
        communityId,
        channelId: openChannelId,
        actorType: "human",
        actorUserId: ownerId,
        kind: "discussion",
        status: "live",
        visibilityScope: "community",
        contentSummary: "First open post",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "w2d-d-1",
        createdAt: nowMs - 3 * HOUR_MS,
        updatedAt: nowMs - 3 * HOUR_MS,
      } as any);
      const post2 = await ctx.db.insert("communityInteractionRoots", {
        communityId,
        channelId: openChannelId,
        actorType: "human",
        actorUserId: ownerId,
        kind: "discussion",
        status: "live",
        visibilityScope: "community",
        contentSummary: "Second open post",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "w2d-d-2",
        createdAt: nowMs - HOUR_MS,
        updatedAt: nowMs - HOUR_MS,
      } as any);
      // Should NOT count: guide post and restricted pod post.
      await ctx.db.insert("communityInteractionRoots", {
        communityId,
        channelId: openChannelId,
        actorType: "community_agent",
        kind: "discussion",
        status: "live",
        visibilityScope: "community",
        contentSummary: "Guide note",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "w2d-d-guide",
        createdAt: nowMs - 30 * 60_000,
        updatedAt: nowMs - 30 * 60_000,
      } as any);
      await ctx.db.insert("communityInteractionRoots", {
        communityId,
        channelId: privateChannelId,
        actorType: "human",
        actorUserId: ownerId,
        kind: "discussion",
        status: "live",
        visibilityScope: "community",
        contentSummary: "Private pod post",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "w2d-d-pod",
        createdAt: nowMs - 20 * 60_000,
        updatedAt: nowMs - 20 * 60_000,
      } as any);
      return { communityId, postIds: [post1, post2] };
    });

    const batch = await t.mutation(
      internalRefs.communityAnalyticsRollups.refreshDiscoverActivityStatsBatchInternal,
      {},
    );
    expect(batch).toEqual({ done: true, updated: 1 });

    const stored = await t.run((ctx) => ctx.db.get(communityId));
    expect((stored as any).discoverPosts7dCount).toBe(2);
    expect((stored as any).discoverLastActiveAt).toBe(nowMs - HOUR_MS);
    expect(typeof (stored as any).discoverActivityComputedAt).toBe("number");

    // Delete underlying posts to prove listPublicDiscoverCommunities reads the fresh pre-computed cache (O(1)).
    await t.run(async (ctx) => {
      for (const id of postIds) await ctx.db.delete(id);
    });
    const cachedResult = await t.query(api.communityPublic.listPublicDiscoverCommunities, { limit: 10 });
    expect(cachedResult.communities).toHaveLength(1);
    expect(cachedResult.communities[0].posts_this_week).toBe(2);
    expect(cachedResult.communities[0].last_active_at).toBe(new Date(nowMs - HOUR_MS).toISOString());

    // If cached discoverLastActiveAt is older than 7 days, aged-out activity is suppressed.
    await t.run((ctx) =>
      ctx.db.patch(communityId, {
        discoverLastActiveAt: nowMs - 8 * DAY_MS,
      } as any),
    );
    const agedOut = await t.query(api.communityPublic.listPublicDiscoverCommunities, { limit: 10 });
    expect(agedOut.communities[0].posts_this_week).toBe(0);
    expect(agedOut.communities[0].last_active_at).toBeNull();

    // If discoverActivityComputedAt is older than TTL, query falls back cleanly to live scan (now 0 posts).
    await t.run((ctx) =>
      ctx.db.patch(communityId, {
        discoverLastActiveAt: nowMs - HOUR_MS,
        discoverPosts7dCount: 5,
        discoverActivityComputedAt: nowMs - DISCOVER_ACTIVITY_CACHE_TTL_MS - 60_000,
      } as any),
    );
    const fallback = await t.query(api.communityPublic.listPublicDiscoverCommunities, { limit: 10 });
    expect(fallback.communities[0].posts_this_week).toBe(0);
    expect(fallback.communities[0].last_active_at).toBeNull();
  });
});

describe("Wave 2D: parallelized AI workers and bounded parallel founder briefs", () => {
  it("reads community brief, memory review, reply draft inputs, and founder snapshot deterministically", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const { communityId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "w2d-ai-owner",
        displayName: "AI Owner",
        handle: "ai-owner",
        normalizedHandle: "ai-owner",
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const memberId = await ctx.db.insert("users", {
        authSubject: "w2d-ai-member",
        displayName: "Sam Member",
        handle: "sam-member",
        normalizedHandle: "sam-member",
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const requesterId = await ctx.db.insert("users", {
        authSubject: "w2d-ai-requester",
        displayName: "Pending Pat",
        handle: "pending-pat",
        normalizedHandle: "pending-pat",
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "w2d-ai-club",
        name: "Wave 2D AI Club",
        visibility: "published",
        lifecycleStatus: "active",
        inferenceFundingPolicy: "managed_required",
        entryPolicy: "open",
        activeMemberCount: 2,
        createdAt: nowMs - 10 * DAY_MS,
        updatedAt: nowMs,
      });
      await ctx.db.insert("operatorRoles", {
        userId: ownerId,
        role: "owner",
        active: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId: memberId,
        role: "member",
        accessSource: "free_grant",
        state: "active",
        createdAt: nowMs - 2 * HOUR_MS,
        updatedAt: nowMs - 2 * HOUR_MS,
      });
      await ctx.db.insert("communityJoinRequests", {
        communityId,
        userId: requesterId,
        status: "pending",
        createdAt: nowMs - HOUR_MS,
        updatedAt: nowMs - HOUR_MS,
      });
      const generalId = await ctx.db.insert("communityChannels", {
        communityId,
        systemRole: "general",
        slug: "general",
        name: "general",
        accessMode: "all_members",
        postingPolicy: "members",
        status: "active",
        position: 0,
        createdByUserId: ownerId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const helpId = await ctx.db.insert("communityChannels", {
        communityId,
        slug: "help",
        name: "help",
        accessMode: "all_members",
        postingPolicy: "members",
        status: "active",
        position: 1,
        createdByUserId: ownerId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const questionRootId = await ctx.db.insert("communityInteractionRoots", {
        communityId,
        channelId: helpId,
        actorType: "human",
        actorUserId: memberId,
        kind: "question",
        status: "live",
        visibilityScope: "community",
        title: "How do I configure climbing shoes?",
        contentSummary: "Looking for advice on sizing climbing shoes for bouldering?",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "w2d-q-1",
        createdAt: nowMs - 30 * HOUR_MS,
        updatedAt: nowMs - 30 * HOUR_MS,
      } as any);
      const chatRootId = await ctx.db.insert("communityInteractionRoots", {
        communityId,
        channelId: generalId,
        actorType: "human",
        actorUserId: ownerId,
        kind: "discussion",
        status: "live",
        visibilityScope: "community",
        contentSummary: "Welcome everyone to this week!",
        replyCount: 1,
        reactionSummary: [],
        idempotencyKey: "w2d-c-1",
        createdAt: nowMs - 2 * HOUR_MS,
        updatedAt: nowMs - 2 * HOUR_MS,
      } as any);
      await ctx.db.insert("communityInteractionReplies", {
        communityId,
        channelId: generalId,
        rootId: chatRootId,
        seq: 1,
        actorType: "human",
        actorUserId: memberId,
        status: "live",
        visibilityScope: "community",
        contentSummary: "Glad to be here!",
        reactionSummary: [],
        idempotencyKey: "w2d-r-1",
        createdAt: nowMs - HOUR_MS,
        updatedAt: nowMs - HOUR_MS,
      } as any);
      const moduleId = await ctx.db.insert("communityResourceModules", {
        communityId,
        name: "Gear Guide",
        status: "live",
        sortOrder: 0,
        createdByUserId: ownerId,
        createdAt: nowMs,
        updatedAt: nowMs,
      } as any);
      await ctx.db.insert("communityResources", {
        communityId,
        moduleId,
        type: "post",
        role: "page",
        title: "Sizing Climbing Shoes",
        status: "published",
        pinned: false,
        bodyMd: "When sizing climbing shoes for bouldering, pick a snug fit without painful curled toes.",
        sortOrder: 0,
        createdByUserId: ownerId,
        createdAt: nowMs,
        updatedAt: nowMs,
      } as any);
      expect(questionRootId).toBeTruthy();
      return { communityId };
    });

    const [briefInput, memoryInput, replyDraftInput] = await Promise.all([
      t.query(internalRefs.communityBriefs.readCommunityBriefInputInternal, {
        communityId,
        untilMs: nowMs,
      }),
      t.query(internalRefs.communityMemory.readMemoryReviewInputInternal, {
        communityId,
        sinceMs: nowMs - 3 * DAY_MS,
        untilMs: nowMs,
      }),
      t.query(internalRefs.communityReplyDrafts.readReplyDraftInputInternal, {
        communityId,
        nowMs,
      }),
    ]);

    expect(briefInput.threads).toBe(2);
    expect(briefInput.text).toContain("AI Owner (host)");
    expect(briefInput.text).toContain("Sam Member");

    expect(memoryInput.posts).toBe(3);
    expect(memoryInput.text).toContain("Sizing Climbing Shoes");
    expect(memoryInput.text).toContain("Glad to be here!");

    expect(replyDraftInput.question?.text).toContain("climbing shoes");
    expect(replyDraftInput.lessons).toHaveLength(1);
    expect(replyDraftInput.lessons[0].title).toBe("Sizing Climbing Shoes");

    const snapshot = await t.run(async (ctx) => {
      const community = (await ctx.db.get(communityId))!;
      return await buildSnapshot(ctx, community, nowMs - DAY_MS, nowMs);
    });
    expect(snapshot.joinRequestsPending).toBe(1);
    expect(snapshot.unanswered).toHaveLength(1);
    expect(snapshot.busiest?.channel).toBe("general");
  });

  it("processes multiple due founder briefs concurrently", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 3; i += 1) {
        const ownerId = await ctx.db.insert("users", {
          authSubject: `w2d-fb-owner-${i}`,
          displayName: `Founder ${i}`,
          handle: `w2d-fb-owner-${i}`,
          normalizedHandle: `w2d-fb-owner-${i}`,
          email: `founder${i}@example.com`,
          emailVerifiedAt: nowMs,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
        const communityId = await ctx.db.insert("communities", {
          ownerId,
          slug: `w2d-fb-club-${i}`,
          name: `Club ${i}`,
          visibility: "published",
          lifecycleStatus: "active",
          lifecycleGeneration: 0,
          inferenceFundingPolicy: "managed_required",
          entryPolicy: "open",
          activeMemberCount: 1,
          createdAt: nowMs - 10 * DAY_MS,
          updatedAt: nowMs,
        } as any);
        await ctx.db.insert("communityChannels", {
          communityId,
          systemRole: "general",
          slug: "general",
          name: "general",
          accessMode: "all_members",
          postingPolicy: "members",
          status: "active",
          position: 0,
          createdByUserId: ownerId,
          createdAt: nowMs,
          updatedAt: nowMs,
        } as any);
        await ctx.db.insert("communityFounderBriefSettings", {
          communityId,
          enabled: true,
          localHour: 8,
          timeZone: "UTC",
          nextDueAt: nowMs - 60_000,
          updatedByUserId: ownerId,
          createdAt: nowMs - DAY_MS,
          updatedAt: nowMs - DAY_MS,
        });
      }
    });

    const result = await t.action(
      internalRefs.communityFounderBrief.processDueFounderBriefsInternal,
      {},
    );
    const briefs = await t.run((ctx) => ctx.db.query("communityFounderBriefs").collect());
    expect(briefs.map((b: any) => b.errorCode)).toEqual([undefined, undefined, undefined]);
    expect(result).toEqual({ due: 3, outcomes: { sent: 3 } });
  });
});
