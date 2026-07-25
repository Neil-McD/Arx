/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import { upsertCommunitySourceTrace } from "./communityIntelligenceDirectory";
import { COMPILER_EVIDENCE_AGE_THRESHOLD_MS } from "./communityCompilerEvidenceCore";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityAgentHeartbeat.ts",
  "./communityCompilerDigest.ts",
  "./communityIntelligenceDirectory.ts",
  "./_generated/**/*.*s",
]);
const NOW_MS = 1_780_000_000_000;

afterEach(() => vi.useRealTimers());

async function seedCommunity(t: ReturnType<typeof convexTest>, slug: string) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: `${slug}-owner`,
      displayName: "Compiler owner",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug,
      name: "Compiler scheduling",
      visibility: "unlisted",
      entryPolicy: "approval",
      activeMemberCount: 1,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    return { communityId, ownerId };
  });
}

async function scheduledFunctions(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    await (ctx.db as any).system.query("_scheduled_functions").collect()
  ) as Array<{ name: string; scheduledTime: number }>;
}

test("only material eligible trace transitions schedule compiler evaluation", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  const t = convexTest(schema, modules);
  const { communityId, ownerId } = await seedCommunity(t, "compiler-source-events");
  const write = (args: {
    sourceId: string;
    summary: string;
    sourceVisibility?: "community" | "redacted";
    actorAgentKey?: string;
    allowExistingUpdate?: boolean;
  }) => t.run(async (ctx) => await upsertCommunitySourceTrace({
    ctx,
    communityId,
    sourceType: "interaction",
    sourceId: args.sourceId,
    summary: args.summary,
    visibilityScope: "community",
    sourceVisibility: args.sourceVisibility ?? "community",
    actorType: args.actorAgentKey ? "agent" : "member",
    actorUserId: args.actorAgentKey ? undefined : ownerId,
    actorAgentKey: args.actorAgentKey,
    allowExistingUpdate: args.allowExistingUpdate,
    nowMs: NOW_MS,
  }));

  await write({ sourceId: "eligible", summary: "first version" });
  expect(await scheduledFunctions(t)).toHaveLength(1);

  await write({
    sourceId: "eligible",
    summary: "first version",
    allowExistingUpdate: true,
  });
  await write({
    sourceId: "redacted",
    summary: "private evidence",
    sourceVisibility: "redacted",
  });
  await write({
    sourceId: "self-authored",
    summary: "agent output",
    actorAgentKey: "community_agent",
  });
  expect(await scheduledFunctions(t)).toHaveLength(1);

  await write({
    sourceId: "eligible",
    summary: "materially changed version",
    allowExistingUpdate: true,
  });
  const scheduled = await scheduledFunctions(t);
  expect(scheduled).toHaveLength(2);
  expect(scheduled.every((row) =>
    row.name.includes("communityCompilerDigest") &&
    row.name.includes("runCommunityCompilerDigestPassInternal")
  )).toBe(true);
});

test("new digest owns one bounded recovery chain and replay schedules no duplicate", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  const t = convexTest(schema, modules);
  const { communityId, ownerId } = await seedCommunity(t, "compiler-digest-event");
  await t.run(async (ctx) => {
    for (let index = 0; index < 8; index += 1) {
      await ctx.db.insert("communitySourceTraces", {
        communityId,
        sourceType: "manual",
        sourceId: `manual:${index}`,
        summary: `Evidence ${index}`,
        visibilityScope: "community",
        sourceVisibility: "community",
        artifactIds: [],
        outcomeObservationIds: [],
        actorType: "member",
        actorUserId: ownerId,
        compilerState: "pending",
        compilerPendingSince: NOW_MS,
        createdAt: NOW_MS,
        updatedAt: NOW_MS,
      });
    }
  });

  const run = () => t.mutation(
    (internal as any).communityCompilerDigest.runCommunityCompilerDigestPassInternal,
    { communityId, requireTrigger: true },
  );
  expect(await run()).toMatchObject({ agent_handoff_state: "pending", item_count: 8 });
  expect(await run()).toMatchObject({ agent_handoff_state: "pending", item_count: 8 });

  const state = await t.run(async (ctx) => ({
    digests: await ctx.db.query("communityCompilerDigests").collect(),
    scheduled: await (ctx.db as any).system.query("_scheduled_functions").collect(),
  }));
  expect(state.digests).toHaveLength(1);
  expect(state.scheduled).toHaveLength(1);
  expect(state.scheduled[0].name).toContain("recoverCommunityCompilerDigestHandoffInternal");

  const digest = state.digests[0]!;
  const recover = (nowMs: number) => t.mutation(
    (internal as any).communityAgentHeartbeat.recoverCommunityCompilerDigestHandoffInternal,
    {
      communityId,
      digestId: digest._id,
      versionKey: digest.versionKey!,
      nowMs,
    },
  );
  expect(await recover(NOW_MS)).toMatchObject({
    recovered: true,
    reason: "pending_handoff",
  });
  let scheduled = await scheduledFunctions(t);
  expect(scheduled.filter((row) =>
    row.name.includes("runCommunityAgentHeartbeatInternal")
  )).toHaveLength(1);
  expect(scheduled.filter((row) =>
    row.name.includes("recoverCommunityCompilerDigestHandoffInternal")
  )).toHaveLength(2);

  const running = await t.run(async (ctx) => {
    for (const item of digest.items) {
      await ctx.db.patch(item.sourceTraceIds[0], {
        compilerState: "compiled",
        compilerDecision: {
          version: 1,
          workKey: item.workKey!,
          disposition: "retain",
          reason: "test_settled",
          decidedAt: NOW_MS,
        },
      });
    }
    await ctx.db.patch(digest._id, {
      agentHandoffState: "running",
      agentClaimId: "compiler-claim",
      agentClaimedAt: NOW_MS,
    });
    return { digestId: digest._id, versionKey: digest.versionKey! };
  });
  expect(await recover(NOW_MS)).toMatchObject({
    recovered: false,
    reason: "handoff_running",
    retry_after_ms: 30 * 60 * 1000 + 1000,
  });
  scheduled = await scheduledFunctions(t);
  expect(scheduled.filter((row) =>
    row.name.includes("runCommunityAgentHeartbeatInternal")
  )).toHaveLength(1);

  await t.run(async (ctx) => {
    await ctx.db.patch(running.digestId, {
      agentClaimedAt: NOW_MS - 30 * 60 * 1000 - 1,
    });
  });
  expect(await recover(NOW_MS)).toMatchObject({
    recovered: true,
    reason: "stale_handoff",
  });
  scheduled = await scheduledFunctions(t);
  expect(scheduled.filter((row) =>
    row.name.includes("runCommunityAgentHeartbeatInternal")
  )).toHaveLength(2);

  expect(await t.mutation(
    (internal as any).communityAgentHeartbeat.settleCommunityCompilerDigestHandoffInternal,
    {
      communityId,
      digestId: running.digestId,
      versionKey: running.versionKey,
      claimId: "compiler-claim",
      outcome: "handled",
      nowMs: NOW_MS,
    },
  )).toMatchObject({ state: "handled" });
  const afterSettlement = await scheduledFunctions(t);
  expect(afterSettlement.some((row) =>
    row.name.includes("runCommunityCompilerDigestPassInternal")
  )).toBe(true);

  const scheduledCount = afterSettlement.length;
  expect(await recover(NOW_MS)).toMatchObject({
    recovered: false,
    reason: "handoff_handled",
  });
  expect(await scheduledFunctions(t)).toHaveLength(scheduledCount);
});

test("sub-threshold evidence schedules one bounded age recheck", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  const t = convexTest(schema, modules);
  const { communityId, ownerId } = await seedCommunity(t, "compiler-age-recheck");
  const run = () => t.mutation(
    (internal as any).communityCompilerDigest.runCommunityCompilerDigestPassInternal,
    { communityId, requireTrigger: true },
  );
  expect(await run()).toMatchObject({ skipped: true, reason: "no_trigger" });
  expect(await scheduledFunctions(t)).toEqual([]);

  await t.run(async (ctx) => {
    await ctx.db.insert("communitySourceTraces", {
      communityId,
      sourceType: "interaction",
      sourceId: "interaction:young",
      summary: "Young evidence",
      visibilityScope: "community",
      sourceVisibility: "community",
      artifactIds: [],
      outcomeObservationIds: [],
      actorType: "member",
      actorUserId: ownerId,
      compilerState: "pending",
      compilerPendingSince: NOW_MS,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
  });

  expect(await run()).toMatchObject({ skipped: true, reason: "no_trigger" });

  const scheduled = await scheduledFunctions(t);
  expect(scheduled).toHaveLength(1);
  expect(scheduled[0].name).toContain("runCommunityCompilerDigestPassInternal");
  expect(scheduled[0].scheduledTime).toBe(NOW_MS + COMPILER_EVIDENCE_AGE_THRESHOLD_MS);
  expect(
    await t.run(async (ctx) => ctx.db.query("communityCompilerDigests").collect()),
  ).toEqual([]);
});
