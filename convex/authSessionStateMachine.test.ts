/// <reference types="vite/client" />

import { readFileSync } from "node:fs";

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import {
  AUTH_SESSION_ABSOLUTE_TTL_MS,
  AUTH_SESSION_TERMINAL_RETENTION_MS,
  hashAuthSessionCredential,
} from "./authSessionCore";
import {
  AUTH_PROVIDER_RESPONSE_TIMEOUT_MS,
  AUTH_REQUEST_TIMEOUT,
} from "./authProviderRequest";
import schema from "./schema";

const modules = import.meta.glob([
  "./authSessions.ts",
  "./authSessionCore.ts",
  "./authProviderRequest.ts",
  "./providerConnections.ts",
  "./_generated/**/*.*s",
]);

const NOW_MS = 1_750_000_000_000;
const CREDENTIAL = "123e4567-e89b-42d3-a456-426614174000";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function createFixture() {
  vi.stubEnv("ARX_DB_KEY", "auth-session-state-machine-test-key");
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      authSubject: "workos:auth_session_fixture",
      email: "session@example.com",
      displayName: "Session fixture",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    }),
  );
  const sessionTokenHash = await hashAuthSessionCredential(CREDENTIAL);
  return { t, userId, sessionTokenHash };
}

async function createSession(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  overrides: Record<string, unknown> = {},
) {
  return await fixture.t.mutation(
    (internal as any).authSessions.createAuthSessionInternal,
    {
      sessionTokenHash: fixture.sessionTokenHash,
      userId: fixture.userId,
      accessToken: "access-token-v1",
      idToken: "id-token-v1",
      refreshToken: "refresh-token-v1",
      accessTokenExpiresAt: Math.floor(NOW_MS / 1_000) + 3_600,
      email: "session@example.com",
      displayName: "Session fixture",
      externalUserId: "workos:auth_session_fixture",
      nowMs: NOW_MS,
      ...overrides,
    },
  );
}

async function createRefreshActionFixture(
  subject: string,
  options: { accessTokenExpiresAt?: number } = {},
) {
  vi.stubEnv("ARX_DB_KEY", "auth-session-state-machine-test-key");
  vi.stubEnv("ARX_AUTH_TOKEN_URL", "https://auth.example.test/token");
  vi.stubEnv("ARX_AUTH_CLIENT_ID", "test-client-id");
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      authSubject: subject,
      createdAt: nowMs,
      updatedAt: nowMs,
    }),
  );
  const sessionTokenHash = await hashAuthSessionCredential(CREDENTIAL);
  const created = await t.mutation((internal as any).authSessions.createAuthSessionInternal, {
    sessionTokenHash,
    userId,
    accessToken: "expired-access-token",
    refreshToken: "refresh-token-v1",
    accessTokenExpiresAt: options.accessTokenExpiresAt ?? Math.floor(nowMs / 1_000) - 1,
    externalUserId: subject,
    nowMs,
  });
  return { t, created, sessionTokenHash };
}

function jwtWithSubject(subject: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: subject })).toString("base64url");
  return `${header}.${payload}.unsigned`;
}

test("one sign-in creates one hashed bounded session and collisions fail closed", async () => {
  const fixture = await createFixture();
  await createSession(fixture);

  const rows = await fixture.t.run(async (ctx) => await ctx.db.query("authSessions").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    sessionTokenHash: fixture.sessionTokenHash,
    userId: fixture.userId,
    expiresAt: NOW_MS + AUTH_SESSION_ABSOLUTE_TTL_MS,
    purgeAfterAt:
      NOW_MS + AUTH_SESSION_ABSOLUTE_TTL_MS + AUTH_SESSION_TERMINAL_RETENTION_MS,
    secretRevision: 0,
  });
  expect(JSON.stringify(rows[0])).not.toContain(CREDENTIAL);

  await expect(createSession(fixture)).rejects.toThrow("auth_session_credential_collision");
  expect(
    await fixture.t.run(async (ctx) => await ctx.db.query("authSessions").collect()),
  ).toHaveLength(1);
});

test("refresh lease admits one owner, rejects a concurrent owner, and commits in place", async () => {
  const fixture = await createFixture();
  await createSession(fixture);
  const lookup = { sessionTokenHash: fixture.sessionTokenHash };

  const first = await fixture.t.mutation(
    (internal as any).authSessions.claimAuthSessionRefreshInternal,
    {
      ...lookup,
      expectedSecretRevision: 0,
      leaseId: "123e4567-e89b-42d3-a456-426614174001",
      nowMs: NOW_MS + 1_000,
    },
  );
  const second = await fixture.t.mutation(
    (internal as any).authSessions.claimAuthSessionRefreshInternal,
    {
      ...lookup,
      expectedSecretRevision: 0,
      leaseId: "123e4567-e89b-42d3-a456-426614174002",
      nowMs: NOW_MS + 1_001,
    },
  );
  expect(first.status).toBe("claimed");
  expect(second).toEqual({ status: "busy" });

  const completed = await fixture.t.mutation(
    (internal as any).authSessions.completeAuthSessionRefreshInternal,
    {
      ...lookup,
      expectedSecretRevision: 0,
      leaseId: "123e4567-e89b-42d3-a456-426614174001",
      accessToken: "access-token-v2",
      refreshToken: "refresh-token-v2",
      accessTokenExpiresAt: Math.floor(NOW_MS / 1_000) + 7_200,
      email: "session@example.com",
      externalUserId: "workos:auth_session_fixture",
      nowMs: NOW_MS + 2_000,
    },
  );
  expect(completed.committed).toBe(true);

  const rows = await fixture.t.run(async (ctx) => await ctx.db.query("authSessions").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    sessionTokenHash: fixture.sessionTokenHash,
    secretRevision: 1,
    expiresAt: NOW_MS + AUTH_SESSION_ABSOLUTE_TTL_MS,
  });
  expect(rows[0].refreshLeaseId).toBeUndefined();
});

test("two concurrent refresh actions produce one provider effect and one committed revision", async () => {
  vi.stubEnv("ARX_DB_KEY", "auth-session-state-machine-test-key");
  vi.stubEnv("ARX_AUTH_TOKEN_URL", "https://auth.example.test/token");
  vi.stubEnv("ARX_AUTH_CLIENT_ID", "test-client-id");
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      authSubject: "workos:concurrent_refresh",
      createdAt: nowMs,
      updatedAt: nowMs,
    }),
  );
  const sessionTokenHash = await hashAuthSessionCredential(CREDENTIAL);
  await t.mutation((internal as any).authSessions.createAuthSessionInternal, {
    sessionTokenHash,
    userId,
    accessToken: "expired-access-token",
    refreshToken: "refresh-token-v1",
    accessTokenExpiresAt: Math.floor(nowMs / 1_000) - 1,
    externalUserId: "workos:concurrent_refresh",
    nowMs,
  });

  let releaseProvider!: () => void;
  let markProviderStarted!: () => void;
  const providerStarted = new Promise<void>((resolve) => {
    markProviderStarted = resolve;
  });
  const providerRelease = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  let providerCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      providerCalls += 1;
      markProviderStarted();
      await providerRelease;
      return new Response(
        JSON.stringify({
          access_token: "access-token-v2",
          refresh_token: "refresh-token-v2",
          expires_in: 3_600,
          user: { id: "workos:concurrent_refresh" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );

  const firstPromise = t.action((internal as any).authSessions.refreshAuthSessionInternal, {
    sessionTokenHash,
  });
  await providerStarted;
  const second = await t.action((internal as any).authSessions.refreshAuthSessionInternal, {
    sessionTokenHash,
  });
  releaseProvider();
  const first = await firstPromise;

  expect(providerCalls).toBe(1);
  expect(first).toMatchObject({
    status: "refreshed",
    session: { user: { id: "workos:concurrent_refresh" } },
  });
  expect(second).toEqual({
    status: "transient_failure",
    reason: "auth_session_refresh_in_progress",
  });
  const rows = await t.run(async (ctx) => await ctx.db.query("authSessions").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].secretRevision).toBe(1);
});

test("a provider subject mismatch revokes the session without committing refreshed credentials", async () => {
  const fixture = await createRefreshActionFixture("workos:subject_owner");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: "different-subject-access-token",
          refresh_token: "different-subject-refresh-token",
          expires_in: 3_600,
          user: { id: "workos:different_subject" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );

  const result = await fixture.t.action((internal as any).authSessions.refreshAuthSessionInternal, {
    sessionTokenHash: fixture.sessionTokenHash,
  });

  expect(result).toEqual({
    status: "terminal_failure",
    reason: "auth_session_subject_mismatch",
  });
  expect(JSON.stringify(result)).not.toContain("different-subject-access-token");
  const row = await fixture.t.run(async (ctx) => await ctx.db.get(fixture.created.id)) as any;
  expect(row).toMatchObject({ secretRevision: 0 });
  expect(row?.revokedAt).toBeTypeOf("number");
  expect(row?.purgeAfterAt).toBeTypeOf("number");
  expect(row?.refreshLeaseId).toBeUndefined();
});

test("conflicting fresh token subjects fail closed even when the provider user matches", async () => {
  const fixture = await createRefreshActionFixture("workos:subject_owner");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: jwtWithSubject("workos:different_subject"),
          refresh_token: "refresh-token-v2",
          expires_in: 3_600,
          user: { id: "workos:subject_owner" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );

  const result = await fixture.t.action((internal as any).authSessions.refreshAuthSessionInternal, {
    sessionTokenHash: fixture.sessionTokenHash,
  });

  expect(result).toEqual({
    status: "terminal_failure",
    reason: "auth_session_subject_mismatch",
  });
  const row = await fixture.t.run(async (ctx) => await ctx.db.get(fixture.created.id)) as any;
  expect(row).toMatchObject({ secretRevision: 0 });
  expect(row?.revokedAt).toBeTypeOf("number");
  expect(row?.refreshLeaseId).toBeUndefined();
});

test("an unverifiable successful refresh response never commits and releases its lease", async () => {
  const fixture = await createRefreshActionFixture("workos:subject_owner");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: "opaque-access-token-without-subject",
          refresh_token: "refresh-token-v2",
          expires_in: 3_600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );

  const result = await fixture.t.action((internal as any).authSessions.refreshAuthSessionInternal, {
    sessionTokenHash: fixture.sessionTokenHash,
  });

  expect(result).toEqual({
    status: "transient_failure",
    reason: "auth_session_subject_unverifiable",
  });
  const row = await fixture.t.run(async (ctx) => await ctx.db.get(fixture.created.id)) as any;
  expect(row).toMatchObject({ secretRevision: 0 });
  expect(row?.revokedAt).toBeUndefined();
  expect(row?.refreshLeaseId).toBeUndefined();
});

test("a provider timeout releases the lease and never commits expired session state", async () => {
  vi.useFakeTimers();
  const fixture = await createRefreshActionFixture("workos:timeout_expired");
  let markProviderStarted!: () => void;
  const providerStarted = new Promise<void>((resolve) => {
    markProviderStarted = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      markProviderStarted();
      return await new Promise<Response>(() => undefined);
    }),
  );

  const resultPromise = fixture.t.action(
    (internal as any).authSessions.refreshAuthSessionInternal,
    { sessionTokenHash: fixture.sessionTokenHash },
  );
  await providerStarted;
  await vi.advanceTimersByTimeAsync(AUTH_PROVIDER_RESPONSE_TIMEOUT_MS);
  const result = await resultPromise;

  expect(result).toEqual({ status: "transient_failure", reason: AUTH_REQUEST_TIMEOUT });
  const row = await fixture.t.run(async (ctx) => await ctx.db.get(fixture.created.id)) as any;
  expect(row).toMatchObject({ secretRevision: 0 });
  expect(row?.revokedAt).toBeUndefined();
  expect(row?.refreshLeaseId).toBeUndefined();
  expect(row?.refreshLeaseExpiresAt).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

test("a provider timeout preserves a still-usable stored token without committing", async () => {
  vi.useFakeTimers();
  const nowSec = Math.floor(Date.now() / 1_000);
  const fixture = await createRefreshActionFixture("workos:timeout_recovery", {
    accessTokenExpiresAt: nowSec + 3_600,
  });
  let markProviderStarted!: () => void;
  const providerStarted = new Promise<void>((resolve) => {
    markProviderStarted = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      markProviderStarted();
      return await new Promise<Response>(() => undefined);
    }),
  );

  const resultPromise = fixture.t.action(
    (internal as any).authSessions.refreshAuthSessionInternal,
    { sessionTokenHash: fixture.sessionTokenHash },
  );
  await providerStarted;
  await vi.advanceTimersByTimeAsync(AUTH_PROVIDER_RESPONSE_TIMEOUT_MS);
  const result = await resultPromise;

  expect(result).toMatchObject({
    status: "ready",
    session: { access_token: "expired-access-token" },
    trace: { bootstrapPath: "stored_token", recoveredAfterRefreshFailure: true },
  });
  const row = await fixture.t.run(async (ctx) => await ctx.db.get(fixture.created.id)) as any;
  expect(row).toMatchObject({ secretRevision: 0 });
  expect(row?.revokedAt).toBeUndefined();
  expect(row?.refreshLeaseId).toBeUndefined();
  expect(row?.refreshLeaseExpiresAt).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

test("unsupported encrypted-secret versions fail closed and become terminally purgeable", async () => {
  vi.stubEnv("ARX_DB_KEY", "auth-session-state-machine-test-key");
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      authSubject: "workos:unsupported_secret_version",
      createdAt: nowMs,
      updatedAt: nowMs,
    }),
  );
  const sessionTokenHash = await hashAuthSessionCredential(CREDENTIAL);
  const created = await t.mutation((internal as any).authSessions.createAuthSessionInternal, {
    sessionTokenHash,
    userId,
    accessToken: "access-token",
    refreshToken: "refresh-token",
    accessTokenExpiresAt: Math.floor(nowMs / 1_000) + 3_600,
    externalUserId: "workos:unsupported_secret_version",
    nowMs,
  });
  await t.run(async (ctx) => await ctx.db.patch(created.id, { secretVersion: 99 }));

  const result = await t.action((internal as any).authSessions.bootstrapAuthSessionInternal, {
    sessionTokenHash,
  });
  expect(result).toEqual({ status: "terminal_failure", reason: "auth_session_invalid" });
  const row = await t.run(async (ctx) => await ctx.db.get(created.id)) as any;
  expect(row?.revokedAt).toBeTypeOf("number");
  expect(row?.purgeAfterAt).toBeTypeOf("number");
});

test("absolute expiry and revocation fail closed before refresh ownership", async () => {
  const fixture = await createFixture();
  await createSession(fixture);
  const expired = await fixture.t.mutation(
    (internal as any).authSessions.claimAuthSessionRefreshInternal,
    {
      sessionTokenHash: fixture.sessionTokenHash,
      expectedSecretRevision: 0,
      leaseId: "123e4567-e89b-42d3-a456-426614174003",
      nowMs: NOW_MS + AUTH_SESSION_ABSOLUTE_TTL_MS,
    },
  );
  expect(expired).toEqual({ status: "terminal", reason: "auth_session_expired" });

  await fixture.t.mutation((internal as any).authSessions.revokeAuthSessionInternal, {
    sessionTokenHash: fixture.sessionTokenHash,
    nowMs: NOW_MS + 5_000,
  });
  const revoked = await fixture.t.mutation(
    (internal as any).authSessions.claimAuthSessionRefreshInternal,
    {
      sessionTokenHash: fixture.sessionTokenHash,
      expectedSecretRevision: 0,
      leaseId: "123e4567-e89b-42d3-a456-426614174004",
      nowMs: NOW_MS + 6_000,
    },
  );
  expect(revoked).toEqual({ status: "terminal", reason: "auth_session_revoked" });
});

test("an untouched session survives until its expiry retention deadline and is then deleted", async () => {
  const fixture = await createFixture();
  await createSession(fixture);
  const purgeAfterAt =
    NOW_MS + AUTH_SESSION_ABSOLUTE_TTL_MS + AUTH_SESSION_TERMINAL_RETENTION_MS;

  const early = await fixture.t.mutation(
    (internal as any).authSessions.pruneTerminalAuthSessionsInternal,
    { nowMs: purgeAfterAt - 1, limit: 3 },
  );
  expect(early).toEqual({
    deleted: 0,
    repaired: 0,
    limit: 3,
    doneForNow: true,
    continuationScheduled: false,
  });
  expect(
    await fixture.t.run(async (ctx) => await ctx.db.query("authSessions").collect()),
  ).toHaveLength(1);

  const due = await fixture.t.mutation(
    (internal as any).authSessions.pruneTerminalAuthSessionsInternal,
    { nowMs: purgeAfterAt, limit: 3 },
  );
  expect(due).toEqual({
    deleted: 1,
    repaired: 0,
    limit: 3,
    doneForNow: true,
    continuationScheduled: false,
  });
  expect(
    await fixture.t.run(async (ctx) => await ctx.db.query("authSessions").collect()),
  ).toEqual([]);
});

test("revocation advances the deadline and idempotently repairs legacy revoked rows", async () => {
  const fixture = await createFixture();
  const created = await createSession(fixture);
  const revokedAt = NOW_MS + 5_000;
  await fixture.t.mutation((internal as any).authSessions.revokeAuthSessionInternal, {
    sessionTokenHash: fixture.sessionTokenHash,
    nowMs: revokedAt,
  });
  const revoked = await fixture.t.run(async (ctx) => await ctx.db.get(created.id)) as any;
  expect(revoked).toMatchObject({
    revokedAt,
    purgeAfterAt: revokedAt + AUTH_SESSION_TERMINAL_RETENTION_MS,
  });

  await fixture.t.run(async (ctx) =>
    await ctx.db.patch(created.id, {
      purgeAfterAt: undefined,
      refreshLeaseId: "legacy-refresh-lease",
      refreshLeaseExpiresAt: NOW_MS + 60_000,
    }),
  );
  await fixture.t.mutation((internal as any).authSessions.revokeAuthSessionInternal, {
    sessionTokenHash: fixture.sessionTokenHash,
    nowMs: revokedAt + 30_000,
  });
  const repaired = await fixture.t.run(async (ctx) => await ctx.db.get(created.id)) as any;
  expect(repaired).toMatchObject({
    revokedAt,
    purgeAfterAt: revokedAt + AUTH_SESSION_TERMINAL_RETENTION_MS,
  });
  expect(repaired.refreshLeaseId).toBeUndefined();
  expect(repaired.refreshLeaseExpiresAt).toBeUndefined();
});

test("the pruner repairs an early active deadline instead of deleting the session", async () => {
  const fixture = await createFixture();
  const created = await createSession(fixture);
  await fixture.t.run(async (ctx) => await ctx.db.patch(created.id, { purgeAfterAt: NOW_MS }));

  const result = await fixture.t.mutation(
    (internal as any).authSessions.pruneTerminalAuthSessionsInternal,
    { nowMs: NOW_MS + 1_000, limit: 3 },
  );
  expect(result).toEqual({
    deleted: 0,
    repaired: 1,
    limit: 3,
    doneForNow: true,
    continuationScheduled: false,
  });
  const row = await fixture.t.run(async (ctx) => await ctx.db.get(created.id)) as any;
  expect(row?.purgeAfterAt).toBe(
    NOW_MS + AUTH_SESSION_ABSOLUTE_TTL_MS + AUTH_SESSION_TERMINAL_RETENTION_MS,
  );
});

test("a full terminal-retention batch schedules and drains its own bounded continuation", async () => {
  vi.useFakeTimers();
  const fixture = await createFixture();
  for (let index = 0; index < 7; index += 1) {
    const credential = `123e4567-e89b-42d3-a456-4266141740${String(index + 10).padStart(2, "0")}`;
    const hash = await hashAuthSessionCredential(credential);
    await createSession(fixture, { sessionTokenHash: hash });
    await fixture.t.mutation((internal as any).authSessions.revokeAuthSessionInternal, {
      sessionTokenHash: hash,
      nowMs: NOW_MS,
    });
  }

  const first = await fixture.t.mutation(
    (internal as any).authSessions.pruneTerminalAuthSessionsInternal,
    {
      nowMs: NOW_MS + AUTH_SESSION_TERMINAL_RETENTION_MS,
      limit: 3,
    },
  );
  expect(first).toEqual({
    deleted: 3,
    repaired: 0,
    limit: 3,
    doneForNow: false,
    continuationScheduled: true,
  });
  expect(
    await fixture.t.run(async (ctx) => await ctx.db.query("authSessions").collect()),
  ).toHaveLength(4);

  await fixture.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await fixture.t.run(async (ctx) => await ctx.db.query("authSessions").collect()),
  ).toEqual([]);
});

test("source contract has one hashed credential path and internal indexed retention", () => {
  const source = readFileSync(new URL("./authSessions.ts", import.meta.url), "utf8");
  const schemaSource = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");
  const authSessionSchema = schemaSource.slice(
    schemaSource.indexOf("authSessions: defineTable"),
    schemaSource.indexOf("userEntitlements: defineTable"),
  );
  expect(source).not.toContain("rotateAuthSessionInternal");
  expect(source).not.toContain("prepareSecureAuthSessionRotation");
  expect(source).not.toContain("legacySessionId");
  expect(source).not.toContain("migrateLegacyAuthSession");
  expect(source).not.toMatch(/query\("authSessions"\)\.collect\(/);
  expect(source).toContain('.withIndex("by_purgeAfterAt"');
  expect(source).toContain("claimAuthSessionRefreshInternal");
  expect(authSessionSchema).not.toContain("sessionId:");
  expect(authSessionSchema).not.toContain("replacedBySessionId:");
  expect(authSessionSchema).toContain("sessionTokenHash: v.string()");
  expect(authSessionSchema).not.toContain('.index("by_sessionId", ["sessionId"])');
});
