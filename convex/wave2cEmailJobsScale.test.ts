/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { tierHoldersChanged } from "./communityPlanPods";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("Wave 2C Email Priority Lanes & Heavy Background Jobs", () => {
  it("claims urgent emails ahead of bulk reminders and still drains legacy unranked rows", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();

    // Enqueue 5 bulk event reminders first (earlier scheduledAt) via batch enqueue.
    const batchRes = await t.mutation(internal.email.enqueueEmailJobsBatchInternal, {
      jobs: Array.from({ length: 5 }, (_, i) => ({
        kind: "event_reminder_24h",
        recipientEmail: `bulk-${i}@example.com`,
        templateKey: "event_reminder" as const,
        payload: {
          communityName: "Scale Club",
          eventTitle: "Town Hall",
          title: "Town Hall is tomorrow",
          subtitle: "Scale Club",
          intro: "Starts tomorrow.",
          actionUrl: "https://polynet.ai/c/scale/events",
        },
        dedupeKey: `bulk-event-${i}`,
        scheduledAt: nowMs - 10_000 + i,
        nowMs,
      })),
    });
    expect(batchRes.enqueued).toBe(5);
    expect(batchRes.deduped).toBe(0);

    // Enqueue 2 urgent transactional emails AFTER the bulk reminders.
    for (let i = 0; i < 2; i += 1) {
      await t.mutation(internal.email.enqueueEmailJobInternal, {
        kind: "community_access_granted",
        recipientEmail: `urgent-${i}@example.com`,
        templateKey: "community_access_granted",
        payload: {
          communityName: "Scale Club",
          actionUrl: "https://polynet.ai/c/scale",
        },
        dedupeKey: `urgent-welcome-${i}`,
        scheduledAt: nowMs,
        nowMs,
      });
    }

    // Insert a legacy outbox row with no priorityRank field.
    await t.run(async (ctx) => {
      await ctx.db.insert("emailOutbox", {
        kind: "legacy_notice",
        recipientEmail: "legacy@example.com",
        templateKey: "community_access_granted",
        payload: { communityName: "Scale Club", actionUrl: "https://polynet.ai/c/scale" },
        status: "pending",
        scheduledAt: nowMs - 20_000,
        attemptCount: 0,
        createdAt: nowMs - 20_000,
        updatedAt: nowMs - 20_000,
      });
    });

    // Claiming 3 rows must return the 2 urgent rows first, then 1 bulk row (urgent never starved!).
    const firstBatch: any[] = await t.mutation(internal.email.claimDueEmailOutboxBatchInternal, {
      limit: 3,
      nowMs: nowMs + 1_000,
    });
    expect(firstBatch).toHaveLength(3);
    expect(firstBatch[0].recipientEmail).toBe("urgent-0@example.com");
    expect(firstBatch[1].recipientEmail).toBe("urgent-1@example.com");
    expect(firstBatch[2].recipientEmail).toBe("bulk-0@example.com");

    // Claiming remaining rows drains the rest of bulk + the legacy unranked row.
    const secondBatch: any[] = await t.mutation(internal.email.claimDueEmailOutboxBatchInternal, {
      limit: 10,
      nowMs: nowMs + 1_000,
    });
    expect(secondBatch).toHaveLength(5);
    expect(secondBatch.map((r) => r.recipientEmail)).toContain("legacy@example.com");
  });

  it("enforces intra-batch deduplication and skips duplicate keys in enqueueEmailJobsBatchInternal", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const res = await t.mutation(internal.email.enqueueEmailJobsBatchInternal, {
      jobs: [
        {
          kind: "event_reminder_24h",
          recipientEmail: "same@example.com",
          templateKey: "event_reminder",
          payload: { communityName: "Club", eventTitle: "Sync", actionUrl: "https://polynet.ai" },
          dedupeKey: "dup-key-1",
          nowMs,
        },
        {
          kind: "event_reminder_24h",
          recipientEmail: "same@example.com",
          templateKey: "event_reminder",
          payload: { communityName: "Club", eventTitle: "Sync", actionUrl: "https://polynet.ai" },
          dedupeKey: "dup-key-1",
          nowMs,
        },
      ],
    });
    expect(res.enqueued).toBe(1);
    expect(res.deduped).toBe(1);
  });

  it("paginates tierHoldersChanged asynchronously past 25 members and syncs every holder's pod seats", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const nowMs = Date.now();
      const { communityId, podChannelId, memberIds } = await t.run(async (ctx) => {
        const ownerId = await ctx.db.insert("users", {
          authSubject: "w2c-owner",
          displayName: "Owner",
          handle: "w2cowner",
          normalizedHandle: "w2cowner",
          createdAt: nowMs - DAY,
          updatedAt: nowMs - DAY,
        });
        const communityId = await ctx.db.insert("communities", {
          ownerId,
          slug: "w2c-tier-scale",
          name: "Tier Scale",
          lifecycleStatus: "active",
          lifecycleGeneration: 0,
          visibility: "published",
          inferenceFundingPolicy: "managed_required",
          entryPolicy: "open",
          activeMemberCount: 31,
          createdAt: nowMs - DAY,
          updatedAt: nowMs - DAY,
        });
        const podChannelId = await ctx.db.insert("communityChannels", {
          communityId,
          slug: "vip-pod",
          name: "VIP Pod",
          position: 1,
          accessMode: "restricted",
          postingPolicy: "members",
          status: "active",
          createdByUserId: ownerId,
          createdAt: nowMs - DAY,
          updatedAt: nowMs - DAY,
        });
        await ctx.db.insert("communityPods", {
          communityId,
          channelId: podChannelId,
          purpose: "VIP pod",
          visibility: "listed",
          createdAt: nowMs - DAY,
          updatedAt: nowMs - DAY,
        });
        await ctx.db.insert("communityTiers", {
          communityId,
          key: "member",
          name: "Member",
          rank: 0,
          grants: [],
          podChannelIds: [podChannelId],
          createdAt: nowMs - DAY,
          updatedAt: nowMs - DAY,
        });
        const memberIds: any[] = [];
        for (let i = 0; i < 30; i += 1) {
          const uid = await ctx.db.insert("users", {
            authSubject: `w2c-mem-${i}`,
            displayName: `Member ${i}`,
            handle: `w2cmem${i}`,
            normalizedHandle: `w2cmem${i}`,
            createdAt: nowMs - DAY,
            updatedAt: nowMs - DAY,
          });
          await ctx.db.insert("communityMemberships", {
            communityId,
            userId: uid,
            role: "member",
            state: "active",
            accessSource: "free_grant",
            activationSequence: 1,
            createdAt: nowMs - DAY,
            updatedAt: nowMs - DAY,
          });
          memberIds.push(uid);
        }
        return { communityId, podChannelId, memberIds };
      });

      // Trigger tierHoldersChanged (30 > 25 triggers async paginated sync).
      await t.run(async (ctx) => {
        await tierHoldersChanged(ctx, communityId, "member");
      });
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());

      // Every single one of the 30 members must now hold an active plan seat in the pod.
      const seats = await t.run(async (ctx) =>
        ctx.db
          .query("communityChannelParticipants")
          .withIndex("by_channel_status", (q) => q.eq("channelId", podChannelId).eq("status", "active"))
          .collect(),
      );
      expect(seats).toHaveLength(memberIds.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it("self-continues sweepUnreachablePodPaymentsInternal across bounded page slices", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      // With maxPagesPerRun=1 and 3 GRANTING statuses, first call processes status 0 and continues.
      const first: any = await t.action(internal.communityPodPayments.sweepUnreachablePodPaymentsInternal, {
        maxPagesPerRun: 1,
      });
      expect(first.continued).toBe(true);
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    } finally {
      vi.useRealTimers();
    }
  });
});
