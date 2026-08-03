/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import {
  authSessionHasCredentialMaterial,
  MAX_AUTH_SESSION_PRUNE_BATCH_SIZE,
  MAX_AUTH_SESSION_SCRUB_BATCH_SIZE,
  normalizeAuthSessionPruneCutoff,
  normalizeAuthSessionPruneLimit,
  normalizeAuthSessionScrubCursor,
  normalizeAuthSessionScrubLimit,
  normalizeAuthSessionScrubOrder,
  pruneRevokedAuthSessionsBatch,
  requireAuthSessionMaintenanceSecret,
  scrubRevokedAuthSessionSecretsBatch,
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

test("scrub inputs are bounded and cursors fail closed", () => {
  expect(normalizeAuthSessionScrubLimit(undefined)).toBe(100);
  expect(normalizeAuthSessionScrubLimit(25.9)).toBe(25);
  expect(normalizeAuthSessionScrubLimit(10_000)).toBe(
    MAX_AUTH_SESSION_SCRUB_BATCH_SIZE,
  );
  expect(normalizeAuthSessionScrubCursor(undefined)).toBeNull();
  expect(normalizeAuthSessionScrubCursor(null)).toBeNull();
  expect(normalizeAuthSessionScrubCursor("cursor")).toBe("cursor");
  expect(() => normalizeAuthSessionScrubCursor(123)).toThrow(
    "auth_session_maintenance_cursor_invalid",
  );
  expect(normalizeAuthSessionScrubOrder(undefined)).toBe("asc");
  expect(normalizeAuthSessionScrubOrder("asc")).toBe("asc");
  expect(normalizeAuthSessionScrubOrder("desc")).toBe("desc");
  expect(() => normalizeAuthSessionScrubOrder("sideways")).toThrow(
    "auth_session_maintenance_order_invalid",
  );
});

test("credential detection covers secrets, token metadata, and refresh leases", () => {
  expect(authSessionHasCredentialMaterial({})).toBe(false);
  expect(authSessionHasCredentialMaterial({ encryptedSecretHex: "cipher" })).toBe(true);
  expect(authSessionHasCredentialMaterial({ secretIvHex: "iv" })).toBe(true);
  expect(authSessionHasCredentialMaterial({ secretVersion: 1 })).toBe(true);
  expect(authSessionHasCredentialMaterial({ accessTokenExpiresAt: 1 })).toBe(true);
  expect(authSessionHasCredentialMaterial({ refreshLeaseId: "lease" })).toBe(true);
  expect(authSessionHasCredentialMaterial({ refreshLeaseExpiresAt: 1 })).toBe(true);
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

test("revoked credential scrub is bounded, idempotent, and preserves active rows", async () => {
  const t = convexTest(schema, modules);
  await insertSessionFixture(t, [
    { sessionId: "active" },
    { sessionId: "revoked-secret", revokedAt: 100 },
    { sessionId: "revoked-lease", revokedAt: 200 },
    { sessionId: "revoked-clean", revokedAt: 300 },
  ]);
  await t.run(async (ctx) => {
    const rows = await ctx.db.query("authSessions").collect();
    const leaseRow = rows.find((row) => row.sessionId === "revoked-lease")!;
    const cleanRow = rows.find((row) => row.sessionId === "revoked-clean")!;
    await ctx.db.patch(leaseRow._id, {
      encryptedSecretHex: undefined,
      secretIvHex: undefined,
      secretVersion: undefined,
      refreshLeaseId: "lease",
      refreshLeaseExpiresAt: 999,
    });
    await ctx.db.patch(cleanRow._id, {
      encryptedSecretHex: undefined,
      secretIvHex: undefined,
      secretVersion: undefined,
    });
  });

  const audit = await t.run(async (ctx) =>
    await scrubRevokedAuthSessionSecretsBatch({
      ctx,
      limit: 2,
    }),
  );
  expect(audit).toMatchObject({
    scanned: 2,
    eligible: 2,
    scrubbed: 0,
    has_more: true,
    done: false,
    dry_run: true,
  });

  const first = await t.run(async (ctx) =>
    await scrubRevokedAuthSessionSecretsBatch({
      ctx,
      limit: 2,
      dryRun: false,
    }),
  );
  expect(first).toMatchObject({ scrubbed: 2, has_more: true, done: false });
  const second = await t.run(async (ctx) =>
    await scrubRevokedAuthSessionSecretsBatch({
      ctx,
      cursor: first.continue_cursor,
      limit: 2,
      dryRun: false,
    }),
  );
  expect(second).toMatchObject({ scrubbed: 0, has_more: false, done: true });

  await t.run(async (ctx) => {
    const after = await ctx.db.query("authSessions").collect();
    const active = after.find((row) => row.sessionId === "active")!;
    expect(active.encryptedSecretHex).toBe("encrypted");
    for (const row of after.filter((candidate) => candidate.revokedAt !== undefined)) {
      expect(authSessionHasCredentialMaterial(row)).toBe(false);
      expect(row.revokedAt).toBeTypeOf("number");
    }
  });

  const repeated = await t.run(async (ctx) =>
    await scrubRevokedAuthSessionSecretsBatch({
      ctx,
      limit: 100,
      dryRun: false,
    }),
  );
  expect(repeated).toMatchObject({ scrubbed: 0, done: true });
});

test("revoked credential scrub can traverse newest-first with truthful receipts", async () => {
  const t = convexTest(schema, modules);
  await insertSessionFixture(t, [
    { sessionId: "active" },
    { sessionId: "oldest", revokedAt: 100 },
    { sessionId: "middle", revokedAt: 200 },
    { sessionId: "newest", revokedAt: 300 },
  ]);

  const first = await t.run(async (ctx) =>
    await scrubRevokedAuthSessionSecretsBatch({
      ctx,
      limit: 2,
      order: "desc",
      dryRun: false,
    }),
  );
  expect(first).toMatchObject({
    scanned: 2,
    eligible: 2,
    scrubbed: 2,
    has_more: true,
    done: false,
    order: "desc",
  });

  const second = await t.run(async (ctx) =>
    await scrubRevokedAuthSessionSecretsBatch({
      ctx,
      cursor: first.continue_cursor,
      limit: 2,
      order: "desc",
      dryRun: false,
    }),
  );
  expect(second).toMatchObject({
    scanned: 1,
    eligible: 1,
    scrubbed: 1,
    has_more: false,
    done: true,
    order: "desc",
  });
});
