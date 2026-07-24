/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityIntelligenceDirectory.ts",
  "./communityMemoryMetabolizer.ts",
  "./_generated/**/*.*s",
]);
const NOW_MS = 1_780_000_000_000;

afterEach(() => vi.useRealTimers());

test("new canonical outcomes schedule one same-community metabolizer settlement", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "metabolizer-owner",
      displayName: "Metabolizer owner",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "metabolizer-community",
      name: "Metabolizer community",
      visibility: "unlisted",
      entryPolicy: "approval",
      activeMemberCount: 1,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const nodeId = await ctx.db.insert("communityIntelligenceNodes", {
      communityId,
      type: "insight",
      title: "Outcome-driven memory",
      bodyMd: "Committed outcome evidence triggers score settlement.",
      status: "promising",
      visibilityScope: "community",
      sourceVisibility: "community",
      confidence: 0.8,
      evidenceStrength: "observed",
      workflowIds: [],
      tags: ["metabolizer_fixture"],
      sourceTraceIds: [],
      outcomeObservationIds: [],
      stalenessScore: 0,
      retrievalUsefulnessScore: 0,
      outcomeImpactScore: 0,
      createdByActorType: "admin",
      createdByUserId: ownerId,
      lastUpdatedByActorType: "admin",
      lastUpdatedByUserId: ownerId,
      version: 1,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const retrievalLogId = await ctx.db.insert("communityIntelligenceRetrievalLogs", {
      communityId,
      userId: ownerId,
      receiptVersion: "community_memory_retrieval_receipt:v1",
      surface: "member_agent_dock",
      retrievedNodeIds: [nodeId],
      injectedNodeIds: [nodeId],
      outcomeObservationIds: [],
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    return { communityId, nodeId, retrievalLogId };
  });
  const asOwner = t.withIdentity({ subject: "metabolizer-owner" });
  const args = {
    authSubject: "metabolizer-owner",
    communityId: fixture.communityId,
    surface: "member_agent_dock" as const,
    nodeId: fixture.nodeId,
    retrievalLogId: fixture.retrievalLogId,
    resultStatus: "worked" as const,
    notes: "The retrieved memory helped.",
  };

  expect(
    await asOwner.mutation(
      (internal as any).communityIntelligenceDirectory.recordCommunityOutcomeObservationInternal,
      args,
    ),
  ).toMatchObject({ ok: true, deduplicated: false });
  expect(
    await t.run(async (ctx) => ({
      score: (await ctx.db.get(fixture.nodeId))?.outcomeImpactScore,
      runs: await ctx.db.query("communityMemoryMetabolizerRuns").collect(),
    })),
  ).toEqual({ score: 0, runs: [] });

  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const settled = await t.run(async (ctx) => ({
    node: await ctx.db.get(fixture.nodeId),
    runs: await ctx.db.query("communityMemoryMetabolizerRuns").collect(),
    mutations: await ctx.db
      .query("communityIntelligenceMutations")
      .withIndex("by_community_operation", (q) =>
        q.eq("communityId", fixture.communityId).eq("operation", "update_node"),
      )
      .collect(),
  }));
  expect(settled.node?.outcomeImpactScore).toBeCloseTo(0.2);
  expect(settled.runs).toHaveLength(1);
  expect(settled.runs[0]).toMatchObject({
    communityId: fixture.communityId,
    status: "settled",
    trigger: "internal",
    settledNodeCount: 1,
  });
  expect(settled.mutations).toHaveLength(1);
  expect(settled.mutations[0]).toMatchObject({
    communityId: fixture.communityId,
    actorType: "system",
    reason: "metabolizer_score_settlement",
  });

  expect(
    await asOwner.mutation(
      (internal as any).communityIntelligenceDirectory.recordCommunityOutcomeObservationInternal,
      args,
    ),
  ).toMatchObject({ ok: true, deduplicated: true });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await t.run(async (ctx) => ctx.db.query("communityMemoryMetabolizerRuns").collect()),
  ).toHaveLength(1);
});
