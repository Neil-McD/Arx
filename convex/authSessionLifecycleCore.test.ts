import { describe, expect, test } from "vitest";

import {
  AUTH_SESSION_ABSOLUTE_TTL_MS,
  AUTH_SESSION_IDLE_TTL_MS,
  AUTH_SESSION_REFRESH_LEASE_MS,
  authSessionRefreshFinalizerOwnsLease,
  resolveAuthSessionLifetime,
  resolveAuthSessionRefreshClaim,
} from "./authSessionLifecycleCore";

const NOW = 1_800_000_000_000;

describe("auth session lifetime", () => {
  test("legacy rows adopt explicit windows on first use without a mass logout", () => {
    expect(resolveAuthSessionLifetime({ createdAt: 1 }, NOW)).toEqual({
      ok: true,
      lastUsedAt: NOW,
      idleExpiresAt: NOW + AUTH_SESSION_IDLE_TTL_MS,
      absoluteExpiresAt: NOW + AUTH_SESSION_ABSOLUTE_TTL_MS,
    });
  });

  test("idle and absolute boundaries fail closed", () => {
    expect(
      resolveAuthSessionLifetime(
        {
          createdAt: 1,
          idleExpiresAt: NOW,
          absoluteExpiresAt: NOW + AUTH_SESSION_ABSOLUTE_TTL_MS,
        },
        NOW,
      ),
    ).toEqual({ ok: false, reason: "auth_session_idle_expired" });
    expect(
      resolveAuthSessionLifetime(
        {
          createdAt: 1,
          idleExpiresAt: NOW + AUTH_SESSION_IDLE_TTL_MS,
          absoluteExpiresAt: NOW,
        },
        NOW,
      ),
    ).toEqual({ ok: false, reason: "auth_session_absolute_expired" });
  });

  test("sliding idle expiry never extends beyond absolute expiry", () => {
    expect(
      resolveAuthSessionLifetime(
        {
          createdAt: 1,
          idleExpiresAt: NOW + 1_000,
          absoluteExpiresAt: NOW + 2_000,
        },
        NOW,
      ),
    ).toMatchObject({
      ok: true,
      idleExpiresAt: NOW + 2_000,
      absoluteExpiresAt: NOW + 2_000,
    });
  });
});

describe("auth session refresh lease", () => {
  const active = {
    createdAt: NOW - 1_000,
    refreshGeneration: 4,
    idleExpiresAt: NOW + AUTH_SESSION_IDLE_TTL_MS,
    absoluteExpiresAt: NOW + AUTH_SESSION_ABSOLUTE_TTL_MS,
  };

  test("one active foreign lease makes every other claimant wait", () => {
    expect(
      resolveAuthSessionRefreshClaim(
        {
          ...active,
          refreshLeaseId: "leader",
          refreshLeaseExpiresAt: NOW + 10_000,
        },
        { leaseId: "follower", nowMs: NOW },
      ),
    ).toEqual({
      status: "waiting",
      generation: 4,
      leaseExpiresAt: NOW + 10_000,
    });
  });

  test("an expired lease can be reclaimed without creating a session row", () => {
    expect(
      resolveAuthSessionRefreshClaim(
        {
          ...active,
          refreshLeaseId: "crashed-leader",
          refreshLeaseExpiresAt: NOW - 1,
        },
        { leaseId: "replacement-leader", nowMs: NOW },
      ),
    ).toMatchObject({
      status: "leader",
      generation: 4,
      leaseExpiresAt: NOW + AUTH_SESSION_REFRESH_LEASE_MS,
      leaseTakeover: true,
    });
  });

  test("finalization is fenced by exact lease and generation", () => {
    const row = {
      ...active,
      refreshLeaseId: "leader",
      refreshLeaseExpiresAt: NOW - 1,
    };
    expect(
      authSessionRefreshFinalizerOwnsLease(row, {
        leaseId: "leader",
        expectedGeneration: 4,
      }),
    ).toBe(true);
    expect(
      authSessionRefreshFinalizerOwnsLease(row, {
        leaseId: "other",
        expectedGeneration: 4,
      }),
    ).toBe(false);
    expect(
      authSessionRefreshFinalizerOwnsLease(row, {
        leaseId: "leader",
        expectedGeneration: 3,
      }),
    ).toBe(false);
  });
});
