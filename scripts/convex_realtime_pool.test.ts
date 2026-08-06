import { describe, expect, it } from "vitest";
import type { ConvexReactClient } from "convex/react";

import {
  AuthenticatedConvexRealtimePool,
  type AuthenticatedConvexRealtimeClient,
  type ConvexRealtimeAuthState,
} from "../shared/convexRealtimeAuth";

type TestSession = {
  access_token: string;
  user: { id: string };
};

function session(userId: string, token: string): TestSession {
  return { access_token: token, user: { id: userId } };
}

function createHarness() {
  let nextClientId = 1;
  let nextTimerId = 1;
  const created: Array<{
    id: number;
    authState: ConvexRealtimeAuthState<any>;
    source: string;
    reauthenticateCalls: number;
    closeCalls: number;
  }> = [];
  const scheduled = new Map<number, () => void>();
  const scheduledDelays: number[] = [];
  const cancelled: number[] = [];

  const pool = new AuthenticatedConvexRealtimePool({
    createClient: ({ authState, source }): AuthenticatedConvexRealtimeClient => {
      const record = {
        id: nextClientId++,
        authState,
        source,
        reauthenticateCalls: 0,
        closeCalls: 0,
      };
      created.push(record);
      return {
        client: { testClientId: record.id } as unknown as ConvexReactClient,
        reauthenticate: () => { record.reauthenticateCalls += 1; },
        close: () => { record.closeCalls += 1; },
      };
    },
    closeLingerMs: 1_500,
    scheduleClose: (callback, delayMs) => {
      const timerId = nextTimerId++;
      scheduled.set(timerId, callback);
      scheduledDelays.push(delayMs);
      return timerId as unknown as ReturnType<typeof setTimeout>;
    },
    cancelClose: (timer) => {
      const timerId = timer as unknown as number;
      cancelled.push(timerId);
      scheduled.delete(timerId);
    },
  });

  return {
    pool,
    created,
    scheduled,
    scheduledDelays,
    cancelled,
    runTimer(timerId: number) {
      const callback = scheduled.get(timerId);
      scheduled.delete(timerId);
      callback?.();
    },
  };
}

describe("authenticated Convex realtime pool", () => {
  it("shares one transport across leases and closes only after the final release", () => {
    const harness = createHarness();
    const leases = Array.from({ length: 10 }, () => harness.pool.acquire({
        convexUrl: "https://example.convex.cloud",
        session: session("user-1", "token-a"),
      }));

    expect(harness.created).toHaveLength(1);
    expect(new Set(leases.map((lease) => lease.client)).size).toBe(1);
    expect(harness.created[0]?.source).toBe("convex_realtime_shared");

    for (const lease of leases.slice(0, -1)) lease.close();
    leases[0]?.close();
    expect(harness.scheduled.size).toBe(0);
    expect(harness.created[0]?.closeCalls).toBe(0);

    leases.at(-1)?.close();
    expect(harness.scheduled.size).toBe(1);
    expect(harness.scheduledDelays).toEqual([1_500]);
    harness.runTimer(1);
    expect(harness.created[0]?.closeCalls).toBe(1);
  });

  it("cancels a pending close when a consumer reacquires the transport", () => {
    const harness = createHarness();
    const first = harness.pool.acquire({
      convexUrl: "https://example.convex.cloud",
      session: session("user-1", "token-a"),
    });
    first.close();
    expect(harness.scheduled.has(1)).toBe(true);

    const second = harness.pool.acquire({
      convexUrl: "https://example.convex.cloud",
      session: session("user-1", "token-a"),
    });
    expect(harness.created).toHaveLength(1);
    expect(harness.cancelled).toEqual([1]);
    expect(harness.created[0]?.closeCalls).toBe(0);

    second.close();
    harness.runTimer(2);
    expect(harness.created[0]?.closeCalls).toBe(1);
  });

  it("updates credentials and reauthenticates exactly once when the token rotates", () => {
    const harness = createHarness();
    const ensureSession = async (value: TestSession) => value;
    const first = harness.pool.acquire({
      convexUrl: "https://example.convex.cloud",
      session: session("user-1", "token-a"),
      ensureSession,
    });
    const second = harness.pool.acquire({
      convexUrl: "https://example.convex.cloud",
      session: session("user-1", "token-b"),
    });
    const third = harness.pool.acquire({
      convexUrl: "https://example.convex.cloud",
      session: session("user-1", "token-b"),
    });

    expect(harness.created).toHaveLength(1);
    expect(harness.created[0]?.reauthenticateCalls).toBe(1);
    expect(harness.created[0]?.authState.sessionRef.current.access_token).toBe("token-b");
    expect(harness.created[0]?.authState.ensureSessionRef.current).toBe(ensureSession);

    first.close();
    second.close();
    third.close();
  });

  it("isolates identities and closes one subject immediately without touching another", () => {
    const harness = createHarness();
    const first = harness.pool.acquire({
      convexUrl: "https://example.convex.cloud",
      session: session("user-1", "token-a"),
    });
    const second = harness.pool.acquire({
      convexUrl: "https://example.convex.cloud",
      session: session("user-2", "token-b"),
    });

    expect(harness.created).toHaveLength(2);
    expect(first.client).not.toBe(second.client);
    harness.pool.closeForSubject("user-1");
    expect(harness.created[0]?.closeCalls).toBe(1);
    expect(harness.created[1]?.closeCalls).toBe(0);

    first.close();
    expect(harness.scheduled.size).toBe(0);
    second.close();
    harness.runTimer(1);
    expect(harness.created[1]?.closeCalls).toBe(1);
  });

  it("does not bind browser timer functions to the pool instance", () => {
    const priorSetTimeout = globalThis.setTimeout;
    const priorClearTimeout = globalThis.clearTimeout;
    const scheduleReceivers: unknown[] = [];
    const cancelReceivers: unknown[] = [];
    try {
      globalThis.setTimeout = function browserSetTimeout(this: unknown) {
        scheduleReceivers.push(this);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      } as typeof setTimeout;
      globalThis.clearTimeout = function browserClearTimeout(this: unknown) {
        cancelReceivers.push(this);
      } as typeof clearTimeout;

      const pool = new AuthenticatedConvexRealtimePool({
        createClient: () => ({
          client: {} as ConvexReactClient,
          reauthenticate: () => {},
          close: () => {},
        }),
      });
      const first = pool.acquire({
        convexUrl: "https://example.convex.cloud",
        session: session("user-1", "token-a"),
      });
      first.close();
      const second = pool.acquire({
        convexUrl: "https://example.convex.cloud",
        session: session("user-1", "token-a"),
      });
      second.close();
      pool.closeForSubject("user-1");

      expect(scheduleReceivers).toEqual([undefined, undefined]);
      expect(cancelReceivers).toEqual([undefined, undefined]);
    } finally {
      globalThis.setTimeout = priorSetTimeout;
      globalThis.clearTimeout = priorClearTimeout;
    }
  });
});
