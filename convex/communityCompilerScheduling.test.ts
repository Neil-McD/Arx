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
  "./providerConnections.ts",
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

test("new digest schedules one heartbeat and replay schedules no duplicate", async () => {
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
  expect(state.scheduled[0].name).toContain("runCommunityAgentHeartbeatInternal");

  const running = await t.run(async (ctx) => {
    const digest = (await ctx.db.query("communityCompilerDigests").first())!;
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
  expect(afterSettlement).toHaveLength(2);
  expect(afterSettlement[1].name).toContain("runCommunityCompilerDigestPassInternal");
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

async function seedCompilerDigest(
  t: ReturnType<typeof convexTest>,
  args: {
    communityId: any;
    key: string;
    state?: "pending" | "running" | "handled";
    claimedAt?: number;
    createdAt: number;
  },
) {
  return await t.run(async (ctx) => await ctx.db.insert("communityCompilerDigests", {
    communityId: args.communityId,
    dedupeKey: `repair:${args.key}`,
    versionKey: `version:${args.key}`,
    ...(args.state ? { agentHandoffState: args.state } : {}),
    ...(args.claimedAt !== undefined ? { agentClaimedAt: args.claimedAt } : {}),
    windowStartedAt: args.createdAt - 1_000,
    windowEndedAt: args.createdAt,
    summary: "Repair scheduling fixture",
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
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
  }));
}

test("repair pages select only overdue traces and interrupted handoffs", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  const t = convexTest(schema, modules);
  const due = await seedCommunity(t, "repair-due-trace");
  const young = await seedCommunity(t, "repair-young-trace");
  const pending = await seedCommunity(t, "repair-pending-handoff");
  const stale = await seedCommunity(t, "repair-stale-handoff");
  const fresh = await seedCommunity(t, "repair-fresh-handoff");
  const legacy = await seedCommunity(t, "repair-legacy-digest");
  await t.run(async (ctx) => {
    const insertTrace = async (
      fixture: { communityId: any; ownerId: any },
      key: string,
      pendingSince: number,
      compilerState: "pending" | "excluded_by_visibility",
    ) => await ctx.db.insert("communitySourceTraces", {
      communityId: fixture.communityId,
      sourceType: "interaction",
      sourceId: key,
      summary: key,
      visibilityScope: "community",
      sourceVisibility: "community",
      artifactIds: [],
      outcomeObservationIds: [],
      actorType: "member",
      actorUserId: fixture.ownerId,
      compilerState,
      compilerPendingSince: pendingSince,
      createdAt: pendingSince,
      updatedAt: pendingSince,
    });
    await insertTrace(
      due,
      "due",
      NOW_MS - COMPILER_EVIDENCE_AGE_THRESHOLD_MS - 1,
      "pending",
    );
    await insertTrace(young, "young", NOW_MS - 1_000, "pending");
    await insertTrace(
      due,
      "terminal",
      NOW_MS - COMPILER_EVIDENCE_AGE_THRESHOLD_MS - 1,
      "excluded_by_visibility",
    );
  });
  await seedCompilerDigest(t, {
    communityId: pending.communityId,
    key: "pending",
    state: "pending",
    createdAt: NOW_MS - 1_000,
  });
  await seedCompilerDigest(t, {
    communityId: stale.communityId,
    key: "stale",
    state: "running",
    claimedAt: NOW_MS - 31 * 60 * 1_000,
    createdAt: NOW_MS - 40 * 60 * 1_000,
  });
  await seedCompilerDigest(t, {
    communityId: fresh.communityId,
    key: "fresh",
    state: "running",
    claimedAt: NOW_MS - 29 * 60 * 1_000,
    createdAt: NOW_MS - 40 * 60 * 1_000,
  });
  await seedCompilerDigest(t, {
    communityId: legacy.communityId,
    key: "legacy",
    createdAt: NOW_MS - 24 * 60 * 60 * 1_000,
  });

  const page = (phase: "due_trace" | "pending_handoff" | "stale_handoff") =>
    t.query(
      (internal as any).communityAgentHeartbeat.listCommunityCompilerRepairPageInternal,
      { phase, scanStartedAt: NOW_MS },
    );
  expect((await page("due_trace")).targets.map((row: any) => row.communityId)).toEqual([
    due.communityId,
  ]);
  expect((await page("pending_handoff")).targets.map((row: any) => row.communityId)).toEqual([
    pending.communityId,
  ]);
  expect((await page("stale_handoff")).targets.map((row: any) => row.communityId)).toEqual([
    stale.communityId,
  ]);
});

test("repair cursor reaches every overdue community beyond the page cap", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  const t = convexTest(schema, modules);
  const expected = new Set<string>();
  await t.run(async (ctx) => {
    for (let index = 0; index < 61; index += 1) {
      const ownerId = await ctx.db.insert("users", {
        authSubject: `repair-owner-${index}`,
        displayName: "Repair owner",
        createdAt: NOW_MS,
        updatedAt: NOW_MS,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug: `repair-community-${index}`,
        name: "Repair community",
        visibility: "unlisted",
        entryPolicy: "approval",
        activeMemberCount: 1,
        createdAt: NOW_MS,
        updatedAt: NOW_MS,
      });
      expected.add(String(communityId));
      await ctx.db.insert("communitySourceTraces", {
        communityId,
        sourceType: "interaction",
        sourceId: `repair-trace-${index}`,
        summary: `Repair trace ${index}`,
        visibilityScope: "community",
        sourceVisibility: "community",
        artifactIds: [],
        outcomeObservationIds: [],
        actorType: "member",
        actorUserId: ownerId,
        compilerState: "pending",
        compilerPendingSince: NOW_MS - COMPILER_EVIDENCE_AGE_THRESHOLD_MS - index - 1,
        createdAt: NOW_MS - COMPILER_EVIDENCE_AGE_THRESHOLD_MS - index - 1,
        updatedAt: NOW_MS,
      });
    }
  });

  const seen = new Set<string>();
  let cursor: string | undefined;
  let isDone = false;
  let pages = 0;
  while (!isDone) {
    const result = await t.query(
      (internal as any).communityAgentHeartbeat.listCommunityCompilerRepairPageInternal,
      {
        phase: "due_trace",
        cursor,
        scanStartedAt: NOW_MS,
      },
    ) as any;
    pages += 1;
    for (const target of result.targets) seen.add(String(target.communityId));
    isDone = result.isDone;
    cursor = result.continueCursor || undefined;
  }
  expect(pages).toBe(3);
  expect(seen).toEqual(expected);
});

test("repair skips an unfunded candidate without blocking the next community", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  const t = convexTest(schema, modules);
  const unfunded = await seedCommunity(t, "repair-unfunded");
  const funded = await seedCommunity(t, "repair-funded");
  await t.run(async (ctx) => {
    for (const fixture of [unfunded, funded]) {
      await ctx.db.insert("communitySourceTraces", {
        communityId: fixture.communityId,
        sourceType: "interaction",
        sourceId: `repair:${String(fixture.communityId)}`,
        summary: "Overdue compiler evidence",
        visibilityScope: "community",
        sourceVisibility: "community",
        artifactIds: [],
        outcomeObservationIds: [],
        actorType: "member",
        actorUserId: fixture.ownerId,
        compilerState: "pending",
        compilerPendingSince: NOW_MS - COMPILER_EVIDENCE_AGE_THRESHOLD_MS - 1,
        createdAt: NOW_MS - COMPILER_EVIDENCE_AGE_THRESHOLD_MS - 1,
        updatedAt: NOW_MS,
      });
    }
    await ctx.db.insert("userProviderConnections", {
      userId: funded.ownerId,
      provider: "chatgpt",
      authKind: "oauth_tokens",
      encryptedSecretHex: "encrypted",
      secretIvHex: "iv",
      secretVersion: 1,
      validatedAt: NOW_MS,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
  });

  expect(await t.action(
    (internal as any).communityAgentHeartbeat.runCommunityCompilerRepairInternal,
    { scanStartedAt: NOW_MS },
  )).toMatchObject({
    phase: "due_trace",
    targets: 2,
    enqueued: 1,
    skipped: { owner_connection_missing: 1 },
    continuation_scheduled: true,
  });
  const scheduled = await scheduledFunctions(t);
  expect(scheduled).toHaveLength(2);
  expect(scheduled.some((row) =>
    row.name.includes("runCommunityCompilerRepairInternal")
  )).toBe(true);
  expect(scheduled.some((row) =>
    row.name.includes("runCommunityAgentHeartbeatInternal")
  )).toBe(true);
});
