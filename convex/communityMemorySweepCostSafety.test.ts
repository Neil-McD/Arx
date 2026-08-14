/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityAgentHeartbeat.ts",
  "./_generated/**/*.*s",
]);
const internalRefs = internal as any;

async function insertCommunity(ctx: any, ownerId: any, index: number) {
  return await ctx.db.insert("communities", {
    ownerId,
    slug: `cost-sweep-${index}`,
    name: `Cost sweep ${index}`,
    visibility: "unlisted",
    inferenceFundingPolicy: "managed_required",
    entryPolicy: "open",
    createdAt: 1_000 + index,
    updatedAt: 1_000 + index,
  });
}

describe("community memory sweep cost safety", () => {
  test("500 idle communities produce no sweep targets", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "cost-sweep-idle-owner",
        createdAt: 1_000,
        updatedAt: 1_000,
      });
      for (let index = 0; index < 500; index += 1) {
        await insertCommunity(ctx, ownerId, index);
      }
    });

    await expect(
      t.query(
        internalRefs.communityAgentHeartbeat.listCommunityMemorySweepTargetsInternal,
        { limit: 500, nowMs: 10_000_000 },
      ),
    ).resolves.toEqual([]);
  });

  test("due memory, trace, and handoff work is distinct, oldest-first, and bounded", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "cost-sweep-due-owner",
        createdAt: 1_000,
        updatedAt: 1_000,
      });
      const memoryCommunityId = await insertCommunity(ctx, ownerId, 1);
      const traceCommunityId = await insertCommunity(ctx, ownerId, 2);
      const handoffCommunityId = await insertCommunity(ctx, ownerId, 3);
      await ctx.db.patch(memoryCommunityId, {
        memoryMetabolismPending: true,
        memoryMetabolismRevision: 7,
        memoryMetabolismRequestedAt: 10,
      });
      await ctx.db.insert("communitySourceTraces", {
        communityId: traceCommunityId,
        sourceType: "manual",
        summary: "Pending compiler evidence",
        visibilityScope: "community",
        sourceVisibility: "community",
        artifactIds: [],
        outcomeObservationIds: [],
        actorType: "system",
        compilerState: "pending",
        compilerPendingSince: 20,
        createdAt: 20,
        updatedAt: 20,
      });
      await ctx.db.insert("communityCompilerDigests", {
        communityId: handoffCommunityId,
        dedupeKey: "cost-sweep-pending-handoff",
        versionKey: "v1",
        agentHandoffState: "pending",
        windowStartedAt: 0,
        windowEndedAt: 30,
        summary: "Pending handoff",
        itemCount: 0,
        items: [],
        signalCounts: {
          chat: 0,
          aiFeed: 0,
          resources: 0,
          events: 0,
          sourceTraces: 0,
          outcomes: 0,
          newMembers: 0,
          activeMembers: 0,
          postingMembers: 0,
          aiFeedReactingMembers: 0,
        },
        createdByActorType: "compiler",
        createdAt: 30,
        updatedAt: 30,
      });
      return { memoryCommunityId, traceCommunityId, handoffCommunityId };
    });

    const targets = await t.query(
      internalRefs.communityAgentHeartbeat.listCommunityMemorySweepTargetsInternal,
      { limit: 10, nowMs: 10_000_000 },
    );
    expect(targets).toEqual([
      expect.objectContaining({
        communityId: fixture.memoryCommunityId,
        dueAt: 10,
        memoryMetabolismRevision: 7,
        hasMemoryWork: true,
        hasCompilerWork: false,
      }),
      expect.objectContaining({
        communityId: fixture.traceCommunityId,
        dueAt: 20,
        hasMemoryWork: false,
        hasCompilerWork: true,
      }),
      expect.objectContaining({
        communityId: fixture.handoffCommunityId,
        dueAt: 30,
        hasMemoryWork: false,
        hasCompilerWork: true,
      }),
    ]);

    await expect(
      t.query(
        internalRefs.communityAgentHeartbeat.listCommunityMemorySweepTargetsInternal,
        { limit: 2, nowMs: 10_000_000 },
      ),
    ).resolves.toHaveLength(2);
  });

  test("settlement cannot clear a newer concurrent memory revision", async () => {
    const t = convexTest(schema, modules);
    const communityId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "cost-sweep-race-owner",
        createdAt: 1_000,
        updatedAt: 1_000,
      });
      const id = await insertCommunity(ctx, ownerId, 1);
      await ctx.db.patch(id, {
        memoryMetabolismPending: true,
        memoryMetabolismRevision: 2,
        memoryMetabolismRequestedAt: 2_000,
      });
      return id;
    });

    await expect(
      t.mutation(
        internalRefs.communityAgentHeartbeat.settleCommunityMemoryMetabolismRevisionInternal,
        { communityId, revision: 1 },
      ),
    ).resolves.toMatchObject({ settled: false, reason: "newer_memory_work", currentRevision: 2 });

    const stillPending: any = await t.run(async (ctx) => await ctx.db.get(communityId));
    expect(stillPending?.memoryMetabolismPending).toBe(true);

    await expect(
      t.mutation(
        internalRefs.communityAgentHeartbeat.settleCommunityMemoryMetabolismRevisionInternal,
        { communityId, revision: 2 },
      ),
    ).resolves.toMatchObject({ settled: true, reason: "settled", currentRevision: 2 });

    const settled: any = await t.run(async (ctx) => await ctx.db.get(communityId));
    expect(settled?.memoryMetabolismPending).toBe(false);
    expect(settled?.memoryMetabolismSettledRevision).toBe(2);
  });
});
