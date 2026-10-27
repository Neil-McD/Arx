import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const realtimeAuth = read("shared/convexRealtimeAuth.ts");
const chatGateway = read("shared/cloudCommunityChatGateway.ts");
const dmGateway = read("shared/cloudDirectMessagesGateway.ts");
const polynetGateway = read("shared/cloudCommunityPolynetGateway.ts");
const authController = read("apps/web/src/controllers/useWebAppAuthController.ts");

assert.match(realtimeAuth, /export class AuthenticatedConvexRealtimePool/);
assert.match(realtimeAuth, /new ConvexReactClient\(params\.convexUrl/);
assert.match(realtimeAuth, /const key = `\$\{convexUrl\}::\$\{authSubject\}`/);
assert.match(realtimeAuth, /entry\.refCount \+= 1/);
assert.match(realtimeAuth, /if \(previousRuntimeToken !== runtimeToken\)/);
assert.match(realtimeAuth, /SHARED_REALTIME_CLOSE_LINGER_MS = 1_500/);
assert.match(
  realtimeAuth,
  /\(\(callback, delayMs\) => setTimeout\(callback, delayMs\)\)/,
  "the default scheduler must preserve the browser timer receiver",
);
assert.match(
  realtimeAuth,
  /\(\(timer\) => clearTimeout\(timer\)\)/,
  "the default canceller must preserve the browser timer receiver",
);
assert.match(realtimeAuth, /closeForSubject\(authSubjectInput: string\)/);
assert.match(realtimeAuth, /classifyConvexRealtimeTerminalFailure/);
assert.match(realtimeAuth, /client\.watchQuery =/);
assert.match(realtimeAuth, /convex_realtime_dormant:/);
assert.match(realtimeAuth, /resolveConvexRealtimeAuthRetryDelay\(retryAttempt\)/);
assert.doesNotMatch(
  realtimeAuth,
  /Math\.min\(retryAttempt, REAUTH_RETRY_DELAYS_MS\.length - 1\)/,
  "realtime authentication must not clamp to an infinite final retry cadence",
);

for (const [label, gateway] of [
  ["community chat", chatGateway],
  ["direct messages", dmGateway],
  ["community Polynet", polynetGateway],
] as const) {
  assert.match(
    gateway,
    /return acquireAuthenticatedConvexRealtimeClient\(\{/,
    `${label} must lease the canonical realtime transport`,
  );
  assert.doesNotMatch(
    gateway,
    /createAuthenticatedConvexRealtimeClient|new ConvexReactClient|ConvexRealtimeAuthState/,
    `${label} must not own transport construction or authentication state`,
  );
  assert.doesNotMatch(
    gateway,
    /SharedLiveClientEntry|sharedLiveClientEntry|SHARED_LIVE_CLIENT_CLOSE_LINGER_MS/,
    `${label} must not retain a domain-local client pool`,
  );
}

assert.match(
  authController,
  /const authSubject = resolveAuthSubject\(sessionRef\.current\);[\s\S]{0,120}closeAuthenticatedConvexRealtimeClientsForSubject\(authSubject\);[\s\S]{0,120}sessionRef\.current = null/,
  "local session invalidation must close the actor's realtime transport before dropping identity",
);
assert.match(
  authController,
  /function closeRealtimeTransportForReplacedIdentity[\s\S]{0,500}currentSubject !== nextSubject[\s\S]{0,160}closeAuthenticatedConvexRealtimeClientsForSubject\(currentSubject\)/,
  "an in-place identity replacement must immediately close the previous actor's transport",
);
assert.match(authController, /closeRealtimeTransportForReplacedIdentity\(sessionRef\.current, nextSession\)/);
assert.match(authController, /onRefreshed: \(refreshed\) => \{[\s\S]{0,80}adoptAuthSession\(refreshed/, "a token refresh adopts through the same identity-replacement path");

console.log("Convex realtime pool contract proof passed");
