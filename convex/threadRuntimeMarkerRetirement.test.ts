/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./threadRuntimeMarkerRetirement.ts",
  "./_generated/**/*.*s",
]);
const internalRefs = internal as any;

test("thread runtime marker retirement is bounded, exact-ID guarded, and idempotent", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const now = 1_800_000_000_000;
    const ownerId = await ctx.db.insert("users", {
      authSubject: "thread-runtime-marker-retirement-owner",
      createdAt: now,
      updatedAt: now,
    });
    const markedThreadId = await ctx.db.insert("threads", {
      ownerId,
      titleSource: "auto",
      runtimeEngine: "polynet",
      createdAt: now,
      updatedAt: now,
    });
    const currentThreadId = await ctx.db.insert("threads", {
      ownerId,
      titleSource: "auto",
      createdAt: now,
      updatedAt: now,
    });
    return { markedThreadId, currentThreadId };
  });

  const preview = await t.mutation(
    internalRefs.threadRuntimeMarkerRetirement.cleanThreadRuntimeMarkerBatchInternal,
    { pageSize: 1, dryRun: true },
  );
  expect(preview).toMatchObject({ dryRun: true, wouldPatch: 1, patched: 0 });
  expect(preview.candidateDocumentIds).toEqual([String(fixture.markedThreadId)]);

  await expect(
    t.mutation(
      internalRefs.threadRuntimeMarkerRetirement.cleanThreadRuntimeMarkerBatchInternal,
      { pageSize: 1, dryRun: false },
    ),
  ).rejects.toThrow("thread_runtime_marker_expected_documents_required");
  await expect(
    t.mutation(
      internalRefs.threadRuntimeMarkerRetirement.cleanThreadRuntimeMarkerBatchInternal,
      {
        pageSize: 1,
        dryRun: false,
        expectedDocumentIds: ["wrong-document"],
      },
    ),
  ).rejects.toThrow("thread_runtime_marker_batch_changed");

  const written = await t.mutation(
    internalRefs.threadRuntimeMarkerRetirement.cleanThreadRuntimeMarkerBatchInternal,
    {
      pageSize: 1,
      dryRun: false,
      expectedDocumentIds: preview.candidateDocumentIds,
    },
  );
  expect(written).toMatchObject({ dryRun: false, wouldPatch: 1, patched: 1 });

  const inspection = await t.query(
    internalRefs.threadRuntimeMarkerRetirement.inspectThreadRuntimeMarkerPageInternal,
    { cursor: null, pageSize: 500 },
  );
  expect(inspection).toMatchObject({ residueCount: 0, isDone: true });

  const after = await t.run(async (ctx) => ({
    marked: await ctx.db.get(fixture.markedThreadId),
    current: await ctx.db.get(fixture.currentThreadId),
  }));
  expect(after.marked).not.toHaveProperty("runtimeEngine");
  expect(after.current).not.toHaveProperty("runtimeEngine");
});
