/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./threads.ts", "./_generated/**/*.*s"]);
const apiRefs = api as any;
const internalRefs = internal as any;

async function createFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const nowMs = 1_000;
    const ownerId = await ctx.db.insert("users", {
      authSubject: "runtime-liveness-owner",
      displayName: "Runtime Owner",
      handle: "runtime-liveness-owner",
      normalizedHandle: "runtime-liveness-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const threadId = await ctx.db.insert("threads", {
      ownerId,
      threadKey: "member-agent:runtime-liveness",
      titleSource: "auto",
      modelId: "gpt-test",
      contextVersion: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const runId = "runtime-liveness-run";
    const runDocId = await ctx.db.insert("runtimeRuns", {
      ownerId,
      threadId,
      runId,
      lane: "platform",
      modelId: "gpt-test",
      status: "running",
      lastEventSeq: 0,
      startedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { ownerId, runDocId, runId, threadId };
  });
  return {
    t,
    asOwner: t.withIdentity({ subject: "runtime-liveness-owner" }),
    ids,
  };
}

test("heartbeats update only running runs and never revive terminal runs", async () => {
  const { t, ids } = await createFixture();
  await t.mutation(internalRefs.threads.touchCloudRuntimeRunHeartbeatInternal, {
    ownerId: ids.ownerId,
    threadId: ids.threadId,
    runId: ids.runId,
    nowMs: 2_000,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.runDocId, {
      status: "error",
      finishedAt: 2_500,
      updatedAt: 2_500,
    });
  });

  await t.mutation(internalRefs.threads.touchCloudRuntimeRunHeartbeatInternal, {
    ownerId: ids.ownerId,
    threadId: ids.threadId,
    runId: ids.runId,
    nowMs: 3_000,
  });
  const run = await t.run((ctx) => ctx.db.get(ids.runDocId));
  expect(run).toMatchObject({ status: "error", updatedAt: 2_500 });
});

test("terminal runs reject new public and internal events but replay existing event keys", async () => {
  const { t, asOwner, ids } = await createFixture();
  const eventArgs = {
    threadId: ids.threadId,
    runId: ids.runId,
    eventType: "tool_call_started",
    eventKey: `${ids.runId}:tool_call_started:1`,
    payload: { run_id: ids.runId, tool_name: "polynet_read" },
    nowMs: 2_000,
  };
  const created = await asOwner.mutation(
    apiRefs.threads.appendCloudRuntimeRunEvent,
    eventArgs,
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.runDocId, {
      status: "error",
      finishedAt: 2_500,
      updatedAt: 2_500,
    });
  });

  await expect(
    asOwner.mutation(apiRefs.threads.appendCloudRuntimeRunEvent, {
      ...eventArgs,
      eventKey: `${ids.runId}:tool_call_started:2`,
      nowMs: 3_000,
    }),
  ).rejects.toThrow("runtime_run_not_active");

  const replayed = await asOwner.mutation(
    apiRefs.threads.appendCloudRuntimeRunEvent,
    { ...eventArgs, payload: { ignored: true }, nowMs: 4_000 },
  );
  expect(replayed._id).toBe(created._id);
  const state = await t.run(async (ctx) => ({
    events: await ctx.db.query("runtimeRunEvents").collect(),
    run: await ctx.db.get(ids.runDocId),
  }));
  expect(state.events).toHaveLength(1);
  expect(state.run).toMatchObject({ status: "error", updatedAt: 2_500 });
});

test("terminal runs reject late context snapshots", async () => {
  const { t, ids } = await createFixture();
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.runDocId, {
      status: "cancelled",
      finishedAt: 2_000,
      updatedAt: 2_000,
    });
  });
  await t.mutation(internalRefs.threads.setCloudRuntimeRunContextSnapshotInternal, {
    ownerId: ids.ownerId,
    threadId: ids.threadId,
    runId: ids.runId,
    phase: "active",
    snapshot: { should_not_persist: true },
    nowMs: 3_000,
  });
  const run = await t.run((ctx) => ctx.db.get(ids.runDocId));
  expect(run).toMatchObject({ status: "cancelled", updatedAt: 2_000 });
  expect(run?.activeContextSnapshot).toBeUndefined();
});
