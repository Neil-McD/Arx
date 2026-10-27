/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  AUTH_SESSION_ABSOLUTE_TTL_MS,
  AUTH_SESSION_IDLE_TTL_MS,
} from "./authSessionLifecycleCore";
import schema from "./schema";

const modules = import.meta.glob([
  "./authSessions.ts",
  "./authSessionLifecycleCore.ts",
  "./authSessionMaintenanceCore.ts",
  "./secretCrypto.ts",
  "./platformDiagnostics.ts",
  "./_generated/**/*.*s",
]);

const NOW = 1_800_000_000_000;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function insertSessionFixture(
  t: ReturnType<typeof convexTest>,
  args: {
    sessionId: string;
    replacedBySessionId?: string;
    refreshGeneration?: number;
    refreshLeaseId?: string;
    refreshLeaseExpiresAt?: number;
    accessTokenExpiresAt?: number;
    lastRefreshAt?: number;
    idleExpiresAt?: number;
    absoluteExpiresAt?: number;
    revokedAt?: number;
  },
) {
  return await t.run(async (ctx) => {
    let user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("authSubject"), "session-user"))
      .first();
    if (!user) {
      const userId = await ctx.db.insert("users", {
        authSubject: "session-user",
        createdAt: NOW - 10_000,
        updatedAt: NOW - 10_000,
      });
      user = await ctx.db.get(userId);
    }
    if (!user) throw new Error("session_fixture_user_missing");
    return await ctx.db.insert("authSessions", {
      sessionId: args.sessionId,
      authSubject: "session-user",
      userId: user._id,
      ...(args.replacedBySessionId
        ? { replacedBySessionId: args.replacedBySessionId }
        : {}),
      encryptedSecretHex: "encrypted-placeholder",
      secretIvHex: "iv-placeholder",
      secretVersion: 1,
      ...(args.accessTokenExpiresAt === undefined
        ? {}
        : { accessTokenExpiresAt: args.accessTokenExpiresAt }),
      ...(args.lastRefreshAt === undefined
        ? {}
        : { lastRefreshAt: args.lastRefreshAt }),
      ...(args.refreshGeneration === undefined
        ? {}
        : { refreshGeneration: args.refreshGeneration }),
      ...(args.refreshLeaseId
        ? { refreshLeaseId: args.refreshLeaseId }
        : {}),
      ...(args.refreshLeaseExpiresAt === undefined
        ? {}
        : { refreshLeaseExpiresAt: args.refreshLeaseExpiresAt }),
      idleExpiresAt:
        args.idleExpiresAt ?? NOW + AUTH_SESSION_IDLE_TTL_MS,
      absoluteExpiresAt:
        args.absoluteExpiresAt ?? NOW + AUTH_SESSION_ABSOLUTE_TTL_MS,
      ...(args.revokedAt === undefined ? {} : { revokedAt: args.revokedAt }),
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    });
  });
}

test("concurrent refresh claims elect one server leader and create no rows", async () => {
  const t = convexTest(schema, modules);
  await insertSessionFixture(t, { sessionId: "stable", refreshGeneration: 7 });

  const results = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      t.mutation(
        (internal as any).authSessions.claimAuthSessionRefreshInternal,
        {
          sessionId: "stable",
          leaseId: `claim-${index}`,
          nowMs: NOW,
        },
      ),
    ),
  );

  expect(results.filter((result) => result.status === "leader")).toHaveLength(1);
  expect(results.filter((result) => result.status === "waiting")).toHaveLength(19);
  await t.run(async (ctx) => {
    const rows = await ctx.db.query("authSessions").collect();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sessionId: "stable", refreshGeneration: 7 });
  });
});

test("an expired refresh lease is reclaimed by exactly one new leader", async () => {
  const t = convexTest(schema, modules);
  await insertSessionFixture(t, {
    sessionId: "expired-lease",
    refreshGeneration: 2,
    refreshLeaseId: "crashed",
    refreshLeaseExpiresAt: NOW - 1,
  });

  const result = await t.mutation(
    (internal as any).authSessions.claimAuthSessionRefreshInternal,
    {
      sessionId: "expired-lease",
      leaseId: "takeover",
      nowMs: NOW,
    },
  );

  expect(result).toMatchObject({
    status: "leader",
    sessionId: "expired-lease",
    generation: 2,
    leaseTakeover: true,
  });
});

test("late refresh callers reuse the newly fresh generation", async () => {
  const t = convexTest(schema, modules);
  await insertSessionFixture(t, {
    sessionId: "already-fresh",
    refreshGeneration: 8,
    accessTokenExpiresAt: Math.floor(NOW / 1_000) + 3_600,
    lastRefreshAt: NOW - 1,
  });

  const results = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      t.mutation(
        (internal as any).authSessions.claimAuthSessionRefreshInternal,
        {
          sessionId: "already-fresh",
          leaseId: `late-${index}`,
          nowMs: NOW,
        },
      ),
    ),
  );

  expect(results).toEqual(
    Array.from({ length: 10 }, () =>
      expect.objectContaining({
        status: "ready",
        sessionId: "already-fresh",
        generation: 8,
      }),
    ),
  );
  await t.run(async (ctx) => {
    const rows = await ctx.db.query("authSessions").collect();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.refreshLeaseId).toBeUndefined();
  });
});

test("an explicit refresh cannot reuse the generation it was asked to replace", async () => {
  const t = convexTest(schema, modules);
  await insertSessionFixture(t, {
    sessionId: "force-refresh",
    refreshGeneration: 8,
    accessTokenExpiresAt: Math.floor(NOW / 1_000) + 3_600,
    lastRefreshAt: NOW - 1,
  });

  await expect(
    t.mutation(
      (internal as any).authSessions.claimAuthSessionRefreshInternal,
      {
        sessionId: "force-refresh",
        leaseId: "force-leader",
        nowMs: NOW,
        forceRefresh: true,
        refreshRequestedAt: NOW,
      },
    ),
  ).resolves.toMatchObject({
    status: "leader",
    generation: 8,
  });
});

test("a completed forced refresh is reused by its waiting callers", async () => {
  const t = convexTest(schema, modules);
  await insertSessionFixture(t, {
    sessionId: "force-complete",
    refreshGeneration: 9,
    accessTokenExpiresAt: Math.floor(NOW / 1_000) + 3_600,
    lastRefreshAt: NOW + 1,
  });

  await expect(
    t.mutation(
      (internal as any).authSessions.claimAuthSessionRefreshInternal,
      {
        sessionId: "force-complete",
        leaseId: "late-force-caller",
        nowMs: NOW + 2,
        forceRefresh: true,
        refreshRequestedAt: NOW,
      },
    ),
  ).resolves.toMatchObject({
    status: "ready",
    generation: 9,
  });
});

test("fresh-token coalescing is bounded and cannot suppress a later refresh", async () => {
  const t = convexTest(schema, modules);
  await insertSessionFixture(t, {
    sessionId: "outside-coalesce-window",
    refreshGeneration: 9,
    accessTokenExpiresAt: Math.floor(NOW / 1_000) + 3_600,
    lastRefreshAt: NOW - 10_001,
  });

  await expect(
    t.mutation(
      (internal as any).authSessions.claimAuthSessionRefreshInternal,
      {
        sessionId: "outside-coalesce-window",
        leaseId: "new-leader",
        nowMs: NOW,
      },
    ),
  ).resolves.toMatchObject({
    status: "leader",
    generation: 9,
    leaseTakeover: false,
  });
});

test("legacy replacement cookies converge on the terminal stable row", async () => {
  const t = convexTest(schema, modules);
  await insertSessionFixture(t, {
    sessionId: "legacy",
    replacedBySessionId: "stable",
    revokedAt: NOW - 1_000,
  });
  await insertSessionFixture(t, { sessionId: "stable", refreshGeneration: 3 });

  const result = await t.mutation(
    (internal as any).authSessions.claimAuthSessionRefreshInternal,
    { sessionId: "legacy", leaseId: "claim", nowMs: NOW },
  );

  expect(result).toMatchObject({
    status: "leader",
    sessionId: "stable",
    generation: 3,
    wasRedirected: true,
    chainDepth: 1,
  });
  await t.run(async (ctx) => {
    const rows = await ctx.db.query("authSessions").collect();
    expect(rows).toHaveLength(2);
    const legacy = rows.find((row) => row.sessionId === "legacy")!;
    expect(legacy.encryptedSecretHex).toBeUndefined();
    expect(legacy.secretIvHex).toBeUndefined();
  });
});

test("expiry revokes the row and erases stored credentials", async () => {
  const t = convexTest(schema, modules);
  await insertSessionFixture(t, {
    sessionId: "idle-expired",
    idleExpiresAt: NOW,
  });

  const result = await t.mutation(
    (internal as any).authSessions.touchAuthSessionForUseInternal,
    { sessionId: "idle-expired", nowMs: NOW },
  );

  expect(result).toEqual({
    status: "terminal_failure",
    reason: "auth_session_idle_expired",
  });
  await t.run(async (ctx) => {
    const row = (
      await ctx.db.query("authSessions").withIndex("by_sessionId", (q) =>
        q.eq("sessionId", "idle-expired"),
      ).first()
    )!;
    expect(row).toMatchObject({
      revokedAt: NOW,
      revokedReason: "auth_session_idle_expired",
    });
    expect(row.encryptedSecretHex).toBeUndefined();
    expect(row.secretIvHex).toBeUndefined();
    expect(row.secretVersion).toBeUndefined();
  });
});

test("a stale finalizer cannot overwrite a newer generation", async () => {
  vi.stubEnv("ARX_DB_KEY", "auth-session-kernel-test-key");
  const t = convexTest(schema, modules);
  await insertSessionFixture(t, {
    sessionId: "finalize-once",
    refreshGeneration: 5,
    refreshLeaseId: "leader",
    refreshLeaseExpiresAt: NOW - 1,
  });
  const finalizeArgs = {
    sessionId: "finalize-once",
    leaseId: "leader",
    expectedGeneration: 5,
    accessToken: "access-token",
    refreshToken: "refresh-token",
    externalUserId: "external-user",
    nowMs: NOW,
  };

  await expect(
    t.mutation(
      (internal as any).authSessions.finalizeAuthSessionRefreshInternal,
      finalizeArgs,
    ),
  ).resolves.toEqual({ status: "finalized", generation: 6 });
  await expect(
    t.mutation(
      (internal as any).authSessions.finalizeAuthSessionRefreshInternal,
      finalizeArgs,
    ),
  ).resolves.toEqual({
    status: "lost",
    reason: "auth_session_refresh_lease_lost",
  });
  await t.run(async (ctx) => {
    const rows = await ctx.db.query("authSessions").collect();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: "finalize-once",
      refreshGeneration: 6,
    });
    expect(rows[0]?.refreshLeaseId).toBeUndefined();
  });
});

test("a cross-tab refresh swarm performs one provider refresh and one row update", async () => {
  vi.stubEnv("ARX_DB_KEY", "auth-session-kernel-test-key");
  vi.stubEnv("ARX_AUTH_TOKEN_URL", "https://identity.test/token");
  vi.stubEnv("ARX_AUTH_CLIENT_ID", "browser-client");
  const upstreamFetch = vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return new Response(
      JSON.stringify({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 3_600,
        user: {
          id: "external-session-user",
          email: "session@example.com",
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  });
  vi.stubGlobal("fetch", upstreamFetch);
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      authSubject: "action-session-user",
      createdAt: Date.now() - 1_000,
      updatedAt: Date.now() - 1_000,
    }),
  );
  const nowMs = Date.now();
  await t.mutation(
    (internal as any).authSessions.createAuthSessionInternal,
    {
      sessionId: "action-stable",
      authSubject: "action-session-user",
      userId,
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
      accessTokenExpiresAt: Math.floor(nowMs / 1_000) - 1,
      externalUserId: "external-session-user",
      email: "session@example.com",
      nowMs,
    },
  );

  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      t.action(
        (internal as any).authSessions.refreshAuthSessionInternal,
        { sessionId: "action-stable" },
      ),
    ),
  );

  expect(upstreamFetch).toHaveBeenCalledTimes(1);
  expect(
    results.every(
      (result) => result.status === "refreshed" || result.status === "ready",
    ),
  ).toBe(true);
  expect(
    results.every(
      (result) => result.session.access_token === "new-access-token",
    ),
  ).toBe(true);
  await t.run(async (ctx) => {
    const rows = await ctx.db.query("authSessions").collect();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: "action-stable",
      refreshGeneration: 1,
    });
  });
});

async function createLogoutFixture(t: ReturnType<typeof convexTest>, sessionId: string) {
  vi.stubEnv("ARX_DB_KEY", "auth-session-kernel-test-key");
  const userId = await t.run(ctx => ctx.db.insert("users", { authSubject: "logout-user", createdAt: Date.now(), updatedAt: Date.now() }));
  await t.mutation((internal as any).authSessions.createAuthSessionInternal, {
    sessionId, authSubject: "logout-user", userId, accessToken: "synthetic-logout-access", refreshToken: "synthetic-logout-refresh",
    accessTokenExpiresAt: Math.floor(Date.now()/1000)+300, externalUserId: "logout-user", nowMs: Date.now(),
  });
  return await t.run(ctx => ctx.db.query("authSessions").filter(q => q.eq(q.field("sessionId"), sessionId)).unique()) as Doc<"authSessions"> | null;
}

test.each(["http-failure", "network-failure", "timeout"])("canonical logout erases credentials before provider %s and is idempotent", async failure => {
  const t = convexTest(schema, modules);
  const row = await createLogoutFixture(t, "logout-one");
  const other = await createLogoutFixture(t, "logout-other");
  vi.stubEnv("ARX_AUTH_LOGOUT_URL", "https://identity.test/logout");
  let observed: any;
  const provider = vi.fn(async (_url: string, init: RequestInit) => {
    observed = await t.run(ctx => ctx.db.get(row!._id));
    if(failure === "network-failure") throw Error("provider unavailable");
    if(failure === "timeout") return await new Promise<Response>((_resolve,reject) => init.signal!.addEventListener("abort",()=>reject(Error("aborted"))));
    return new Response("provider unavailable", { status: 503 });
  });
  vi.stubGlobal("fetch", provider);
  expect(await t.action((internal as any).authSessions.logoutAuthSessionInternal, { sessionId: "logout-one" })).toEqual({status:"ok"});
  expect(observed.revokedReason).toBe("logout");
  for(const field of ["encryptedSecretHex","secretIvHex","secretVersion","accessTokenExpiresAt","refreshLeaseId","refreshLeaseExpiresAt"]) expect(observed[field]).toBeUndefined();
  const revokedAt=observed.revokedAt;
  expect(await t.action((internal as any).authSessions.logoutAuthSessionInternal, { sessionId: "logout-one" })).toEqual({status:"ok"});
  expect(provider).toHaveBeenCalledTimes(1);
  const after = await t.run(ctx => ctx.db.get(row!._id)); expect(after?.revokedAt).toBe(revokedAt);
  expect(await t.run(ctx => ctx.db.get(other!._id))).toEqual(other);
  expect((await t.action((internal as any).authSessions.bootstrapAuthSessionInternal, {sessionId:"logout-one"})).status).toBe("terminal_failure");
  expect((await t.action((internal as any).authSessions.refreshAuthSessionInternal, {sessionId:"logout-one"})).status).toBe("terminal_failure");
  expect(provider).toHaveBeenCalledTimes(1);
});

test("missing and unreadable-secret sessions still have deterministic logout", async () => {
  const t = convexTest(schema, modules);
  expect(await t.action((internal as any).authSessions.logoutAuthSessionInternal,{sessionId:"absent"})).toEqual({status:"ok"});
  const id=await insertSessionFixture(t,{sessionId:"unreadable"});
  expect(await t.action((internal as any).authSessions.logoutAuthSessionInternal,{sessionId:"unreadable"})).toEqual({status:"ok"});
  const row=await t.run(ctx=>ctx.db.get(id));
  expect(row?.revokedReason).toBe("logout"); expect(row?.encryptedSecretHex).toBeUndefined(); expect(row?.secretIvHex).toBeUndefined();
});

test("an invalid replacement chain cannot report confirmed logout", async () => {
  const t=convexTest(schema,modules);
  const id=await insertSessionFixture(t,{sessionId:"cycle",replacedBySessionId:"cycle"});
  const before=await t.run(ctx=>ctx.db.get(id));
  const result=await t.action((internal as any).authSessions.logoutAuthSessionInternal,{sessionId:"cycle"});
  expect(result).toEqual({status:"terminal_failure",reason:"auth_session_chain_invalid"});
  expect((await t.action((internal as any).authSessions.bootstrapAuthSessionInternal,{sessionId:"cycle"})).status).toBe("terminal_failure");
  expect(await t.run(ctx=>ctx.db.get(id))).toEqual(before);
});
