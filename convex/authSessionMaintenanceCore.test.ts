/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import {
  MAX_AUTH_SESSION_PRUNE_BATCH_SIZE,
  normalizeAuthSessionPruneCutoff,
  normalizeAuthSessionPruneLimit,
  pruneRevokedAuthSessionsBatch,
  requireAuthSessionMaintenanceSecret,
} from "./authSessionMaintenanceCore";

const modules = import.meta.glob([
  "./authSessionMaintenanceCore.ts",
  "./_generated/**/*.*s",
]);

async function insertSessionFixture(
  t: ReturnType<typeof convexTest>,
  rows: Array<{ sessionId: string; revokedAt?: number }>,
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authSubject: "auth-session-maintenance-user",
      createdAt: 1,
      updatedAt: 1,
    });
    for (const row of rows) {
      await ctx.db.insert("authSessions", {
        sessionId: row.sessionId,
        authSubject: "auth-session-maintenance-user",
        userId,
        encryptedSecretHex: "encrypted",
        secretIvHex: "iv",
        secretVersion: 1,
        ...(row.revokedAt === undefined ? {} : { revokedAt: row.revokedAt }),
        createdAt: 1,
        updatedAt: row.revokedAt ?? 1,
      });
    }
  });
}

test("prune inputs are finite, positive, and server-clamped", () => {
  expect(normalizeAuthSessionPruneLimit(undefined)).toBe(100);
  expect(normalizeAuthSessionPruneLimit(25.9)).toBe(25);
  expect(normalizeAuthSessionPruneLimit(10_000)).toBe(
    MAX_AUTH_SESSION_PRUNE_BATCH_SIZE,
  );
  expect(normalizeAuthSessionPruneCutoff(500.9)).toBe(500);
  expect(() => normalizeAuthSessionPruneCutoff(0)).toThrow(
    "auth_session_maintenance_cutoff_invalid",
  );
  expect(() => normalizeAuthSessionPruneCutoff(Number.NaN)).toThrow(
    "auth_session_maintenance_cutoff_invalid",
  );
});

test("maintenance authorization fails closed and preserves exact secret matching", () => {
  expect(() =>
    requireAuthSessionMaintenanceSecret({
      expectedSecret: "",
      providedSecret: "secret",
    }),
  ).toThrow("auth_session_maintenance_unauthorized");
  expect(() =>
    requireAuthSessionMaintenanceSecret({
      expectedSecret: "secret",
      providedSecret: "wrong",
    }),
  ).toThrow("auth_session_maintenance_unauthorized");
  expect(() =>
    requireAuthSessionMaintenanceSecret({
      expectedSecret: "secret",
      providedSecret: "secret",
    }),
  ).not.toThrow();
});

test("dry-run is bounded and never deletes active, recent, or eligible sessions", async () => {
  const t = convexTest(schema, modules);
  await insertSessionFixture(t, [
    { sessionId: "active" },
    { sessionId: "old-1", revokedAt: 100 },
    { sessionId: "old-2", revokedAt: 200 },
    { sessionId: "cutoff", revokedAt: 500 },
    { sessionId: "recent", revokedAt: 501 },
  ]);

  await t.run(async (ctx) => {
    await expect(
      pruneRevokedAuthSessionsBatch({
        ctx,
        revokedBeforeMs: 500,
        limit: 2,
      }),
    ).resolves.toEqual({
      scanned: 3,
      eligible: 2,
      deleted: 0,
      has_more: true,
      done: false,
      dry_run: true,
      cutoff_ms: 500,
      batch_limit: 2,
    });
    expect(await ctx.db.query("authSessions").collect()).toHaveLength(5);
  });
});

test("execution drains eligible sessions in idempotent bounded batches", async () => {
  const t = convexTest(schema, modules);
  await insertSessionFixture(t, [
    { sessionId: "active" },
    { sessionId: "old-1", revokedAt: 100 },
    { sessionId: "old-2", revokedAt: 200 },
    { sessionId: "cutoff", revokedAt: 500 },
    { sessionId: "recent", revokedAt: 501 },
  ]);

  await t.run(async (ctx) => {
    const first = await pruneRevokedAuthSessionsBatch({
      ctx,
      revokedBeforeMs: 500,
      limit: 2,
      dryRun: false,
    });
    expect(first).toMatchObject({ deleted: 2, has_more: true, done: false });

    const second = await pruneRevokedAuthSessionsBatch({
      ctx,
      revokedBeforeMs: 500,
      limit: 2,
      dryRun: false,
    });
    expect(second).toMatchObject({ deleted: 1, has_more: false, done: true });

    const third = await pruneRevokedAuthSessionsBatch({
      ctx,
      revokedBeforeMs: 500,
      limit: 2,
      dryRun: false,
    });
    expect(third).toMatchObject({ deleted: 0, has_more: false, done: true });

    const remaining = await ctx.db.query("authSessions").collect();
    expect(remaining.map((row) => row.sessionId).sort()).toEqual([
      "active",
      "recent",
    ]);
  });
});
