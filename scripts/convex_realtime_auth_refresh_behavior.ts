import assert from "node:assert/strict";

import { resolveConvexRuntimeToken } from "../shared/authSession.ts";
import {
  classifyConvexRealtimeTerminalFailure,
  createConvexRealtimeTokenFetcher,
  guardConvexRealtimeWatch,
  resolveConvexRealtimeAuthRetryDelay,
} from "../shared/convexRealtimeAuth.ts";

type TestSession = {
  access_token: string;
  id_token?: string | null;
  user: { id: string };
};

const initialSession: TestSession = {
  access_token: "access-a",
  id_token: "stale-id-token",
  user: { id: "user-1" },
};

assert.equal(
  resolveConvexRuntimeToken(initialSession),
  "access-a",
  "Convex runtime authentication must prefer the rotating access token",
);

const authState = {
  sessionRef: { current: initialSession as TestSession | null },
  ensureSessionRef: {
    current: undefined as
      | ((
          session: TestSession,
          source?: string,
          options?: { forceRefresh?: boolean },
        ) => Promise<TestSession | null>)
      | undefined,
  },
};

let refreshStarts = 0;
let refreshInFlight: Promise<TestSession> | null = null;
authState.ensureSessionRef.current = async (_session, source, options) => {
  assert.equal(source, "realtime_auth_behavior");
  assert.equal(options?.forceRefresh, true);
  if (!refreshInFlight) {
    refreshStarts += 1;
    refreshInFlight = new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          access_token: "access-b",
          id_token: null,
          user: { id: "user-1" },
        });
      }, 0);
    });
  }
  return await refreshInFlight;
};

const fetchToken = createConvexRealtimeTokenFetcher({
  authState,
  source: "realtime_auth_behavior",
});

assert.equal(
  await fetchToken({ forceRefreshToken: false }),
  "access-a",
  "a normal SDK token read must reuse the current runtime token",
);
assert.equal(refreshStarts, 0, "a normal SDK token read must not refresh upstream");

const refreshedTokens = await Promise.all([
  fetchToken({ forceRefreshToken: true }),
  fetchToken({ forceRefreshToken: true }),
  fetchToken({ forceRefreshToken: true }),
]);
assert.deepEqual(refreshedTokens, ["access-b", "access-b", "access-b"]);
assert.equal(refreshStarts, 1, "the token fetcher must preserve central refresh coalescing");
assert.equal(authState.sessionRef.current?.access_token, "access-b");
assert.equal(authState.sessionRef.current?.id_token, null);

authState.ensureSessionRef.current = async () => null;
assert.equal(
  await fetchToken({ forceRefreshToken: true }),
  null,
  "a failed forced refresh must fail closed instead of replaying an expired token",
);

assert.deepEqual(
  Array.from({ length: 6 }, (_, attempt) => resolveConvexRealtimeAuthRetryDelay(attempt)),
  [1_000, 3_000, 10_000, 30_000, null, null],
  "realtime auth retries must have a finite terminal budget",
);
assert.equal(resolveConvexRealtimeAuthRetryDelay(-1), null);
assert.equal(resolveConvexRealtimeAuthRetryDelay(1.5), null);

assert.equal(
  classifyConvexRealtimeTerminalFailure(
    new Error("This deployment is disabled because it exceeded its usage limit"),
  ),
  "deployment_disabled",
);
assert.equal(
  classifyConvexRealtimeTerminalFailure("The Convex deployment is paused"),
  "deployment_paused",
);
assert.equal(
  classifyConvexRealtimeTerminalFailure(new Error("temporary network disconnect")),
  null,
  "transient transport failures must remain recoverable",
);

const terminalSignals: string[] = [];
const terminalWatch = guardConvexRealtimeWatch({
  localQueryResult: () => {
    throw new Error("This deployment is disabled because it exceeded its usage limit");
  },
}, (failure) => terminalSignals.push(failure));
assert.throws(() => terminalWatch.localQueryResult(), /usage limit/);
assert.deepEqual(terminalSignals, ["deployment_disabled"]);

const transientSignals: string[] = [];
const transientWatch = guardConvexRealtimeWatch({
  localQueryResult: () => {
    throw new Error("temporary network disconnect");
  },
}, (failure) => transientSignals.push(failure));
assert.throws(() => transientWatch.localQueryResult(), /temporary network/);
assert.deepEqual(transientSignals, []);

console.log("PASS: Convex realtime auth rotates, coalesces, and fails closed.");
