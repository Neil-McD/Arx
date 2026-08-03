import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const schema = read("convex/schema.ts");
const sessions = read("convex/authSessions.ts");
const lifecycle = read("convex/authSessionLifecycleCore.ts");

assert.match(schema, /refreshGeneration: v\.optional\(v\.number\(\)\)/);
assert.match(schema, /refreshLeaseId: v\.optional\(v\.string\(\)\)/);
assert.match(schema, /idleExpiresAt: v\.optional\(v\.number\(\)\)/);
assert.match(schema, /absoluteExpiresAt: v\.optional\(v\.number\(\)\)/);

assert.match(sessions, /claimAuthSessionRefreshInternal/);
assert.match(sessions, /finalizeAuthSessionRefreshInternal/);
assert.match(sessions, /refreshAuthSessionWithServerLease/);
assert.match(sessions, /ctx\.db\.patch\(row\._id as any, \{/);
assert.doesNotMatch(sessions, /rotateAuthSessionInternal/);
assert.doesNotMatch(sessions, /updateAuthSessionInternal/);
assert.doesNotMatch(sessions, /releaseAuthSessionRefreshLeaseInternal/);

const refreshAction = sessions.slice(
  sessions.indexOf("export const refreshAuthSessionInternal"),
  sessions.indexOf("export const logoutAuthSessionInternal"),
);
assert.match(refreshAction, /refreshAuthSessionWithServerLease/);
assert.doesNotMatch(refreshAction, /ctx\.runMutation[\s\S]*createAuthSessionInternal/);
assert.doesNotMatch(refreshAction, /ctx\.db\.insert/);

assert.match(sessions, /resolveAuthSessionRowInDatabase/);
assert.match(sessions, /replacedBySessionId/);
assert.match(sessions, /eraseLegacyReplacementSecrets/);
assert.match(sessions, /encryptedSecretHex: undefined/);
assert.match(sessions, /secretIvHex: undefined/);
assert.match(lifecycle, /AUTH_SESSION_IDLE_TTL_MS = 30 \* 24 \* 60 \* 60 \* 1_000/);
assert.match(lifecycle, /AUTH_SESSION_ABSOLUTE_TTL_MS = 90 \* 24 \* 60 \* 60 \* 1_000/);
assert.match(lifecycle, /AUTH_SESSION_REFRESH_COALESCE_MS = 10_000/);
assert.match(lifecycle, /currentLeaseId !== args\.leaseId/);
assert.match(lifecycle, /normalizeAuthSessionRefreshGeneration\(args\.expectedGeneration\)/);

console.log("auth_session_kernel_contract_proof: ok");
