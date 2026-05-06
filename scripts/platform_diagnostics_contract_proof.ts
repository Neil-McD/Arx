import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const schema = read("convex/schema.ts");
const platformDiagnostics = read("convex/platformDiagnostics.ts");
const authSessions = read("convex/authSessions.ts");
const operatorAccess = read("convex/operatorAccess.ts");
const operatorDashboard = read("convex/operatorDashboard.ts");
const operatorIntelligence = read("convex/operatorIntelligence.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const operatorTypes = read("shared/operatorTypes.ts");
const operatorPanel = read("apps/web/src/components/WebOperatorDataPanel.tsx");
const packageJson = read("package.json");

assert.match(
  schema,
  /platformDiagnosticEvents: defineTable[\s\S]*\.index\("by_eventKey", \["eventKey"\]\)[\s\S]*\.index\("by_subsystem_createdAt", \["subsystem", "createdAt"\]\)[\s\S]*\.index\("by_user_createdAt", \["userId", "createdAt"\]\)/,
  "platform diagnostics table must exist with operator-ready indexes",
);

assert.match(
  platformDiagnostics,
  /recordPlatformDiagnosticEventInternal = internalMutation/,
  "platform diagnostics must expose a private write path",
);
assert.match(
  platformDiagnostics,
  /listPlatformDiagnosticEventsInternal = internalQuery/,
  "platform diagnostics must expose a private read path",
);
assert.match(
  platformDiagnostics,
  /recordPlatformDiagnosticEventBestEffort/,
  "platform diagnostics producers must have a best-effort helper",
);
assert.match(
  platformDiagnostics,
  /query\("platformDiagnosticEvents"\)[\s\S]*withIndex\("by_eventKey"/,
  "platform diagnostics must dedupe by eventKey",
);
assert.match(
  platformDiagnostics,
  /sanitizePlatformDiagnosticMetadata/,
  "platform diagnostics must sanitize metadata at the write boundary",
);
assert.match(
  platformDiagnostics,
  /DIAGNOSTIC_METADATA_ALLOWLIST[\s\S]*"auth\.session_established": \["bootstrapPath", "rotatedSessionFollowed"\][\s\S]*"auth\.session_refreshed": \[\][\s\S]*"access\.operator_access_granted": \["role", "source"\]/,
  "platform diagnostics metadata must be event-type allowlisted",
);
assert.match(
  platformDiagnostics,
  /DIAGNOSTIC_METADATA_BLOCKED_KEY_PARTS[\s\S]*"token"[\s\S]*"secret"[\s\S]*"authorization"[\s\S]*"session"[\s\S]*"encrypted"/,
  "platform diagnostics metadata sanitizer must keep a defensive sensitive-key denylist",
);
assert.match(
  platformDiagnostics,
  /DIAGNOSTIC_METADATA_SAFE_KEY_EXCEPTIONS[\s\S]*"recoveredWithStoredToken"[\s\S]*"rotatedSessionFollowed"/,
  "platform diagnostics sanitizer must preserve explicit safe auth status labels",
);
assert.match(
  platformDiagnostics,
  /DIAGNOSTIC_METADATA_STRING_MAX_LENGTH = 200/,
  "platform diagnostics metadata strings must be length-limited",
);
assert.match(
  platformDiagnostics,
  /allowedKeys\.length === 0[\s\S]*typeof metadata !== "object"[\s\S]*Array\.isArray\(metadata\)[\s\S]*return undefined/,
  "platform diagnostics metadata must fail closed for unknown event types and non-object metadata",
);
assert.match(
  platformDiagnostics,
  /typeof value === "string"[\s\S]*slice\(0, DIAGNOSTIC_METADATA_STRING_MAX_LENGTH\)[\s\S]*typeof value === "number"[\s\S]*Number\.isFinite\(value\)[\s\S]*typeof value === "boolean"/,
  "platform diagnostics metadata must keep only scalar primitive values",
);
assert.match(
  platformDiagnostics,
  /metadata:\s*sanitizePlatformDiagnosticMetadata\(eventType, input\.metadata\)/,
  "platform diagnostics insert must use sanitized metadata",
);
assert.doesNotMatch(
  platformDiagnostics,
  /metadata:\s*input\.metadata/,
  "platform diagnostics must not store caller metadata directly",
);

for (const eventType of [
  "auth.session_established",
  "auth.bootstrap_failed",
  "auth.session_refreshed",
  "auth.session_refresh_failed",
]) {
  assert.match(authSessions, new RegExp(eventType.replaceAll(".", "\\.")), `auth sessions must record ${eventType}`);
}

const authDiagnosticCalls = authSessions.match(/recordAuthSessionDiagnostic\(ctx, \{[\s\S]*?\n\s*\}\);/g) ?? [];
assert.ok(authDiagnosticCalls.length >= 6, "auth session flow must record diagnostics at key outcomes");
for (const call of authDiagnosticCalls) {
  for (const forbidden of ["sessionId:", "accessToken:", "refreshToken:", "idToken:"]) {
    assert.doesNotMatch(call, new RegExp(forbidden), "auth diagnostics must not put tokens or session ids in metadata");
  }
}

assert.match(
  operatorAccess,
  /access\.operator_access_granted/,
  "operator access must record granted diagnostics",
);
assert.match(
  operatorAccess,
  /access\.operator_access_denied/,
  "operator access must record denied diagnostics",
);
assert.match(
  operatorAccess,
  /recordPlatformDiagnosticEventBestEffort/,
  "operator access diagnostics must be best-effort",
);

assert.match(
  operatorTypes,
  /export type OperatorAuthAccessDiagnosticsSnapshot = /,
  "operator diagnostics snapshot type is missing",
);
assert.match(
  operatorIntelligence,
  /getOperatorAuthAccessDiagnosticsInternal = internalQuery/,
  "operator diagnostics read model must be internal and read-only",
);
assert.match(
  operatorIntelligence,
  /platformDiagnosticEvents/,
  "operator diagnostics read model must read platform diagnostic events",
);
assert.match(
  operatorIntelligence,
  /communityAccessAudit\.listCommunityAccessStateAuditFindingsInternal/,
  "operator diagnostics must include entitlement/access audit findings",
);
assert.doesNotMatch(
  operatorIntelligence,
  /internalMutation|mutation|action|ctx\.db\.insert|ctx\.db\.patch|ctx\.db\.delete/,
  "operator diagnostics read model must stay read-only",
);

assert.match(
  operatorDashboard,
  /getOperatorAuthAccessDiagnostics = query[\s\S]*requireOperatorAccess/,
  "public operator diagnostics query must be operator-gated",
);
assert.match(
  operatorGateway,
  /operatorDashboard:getOperatorAuthAccessDiagnostics/,
  "web gateway must call the gated operator diagnostics surface",
);
assert.doesNotMatch(
  operatorGateway,
  /operatorIntelligence:/,
  "web gateway must not call internal operator intelligence directly",
);
assert.match(
  operatorPanel,
  /Auth &amp; access/,
  "operator panel must project auth and access diagnostics",
);
assert.match(
  operatorPanel,
  /loadOperatorAuthAccessDiagnosticsCanonical/,
  "operator panel must load the canonical auth and access diagnostics snapshot",
);
assert.match(
  packageJson,
  /"check:platform-diagnostics-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/platform_diagnostics_contract_proof\.ts"/,
  "platform diagnostics proof must be wired into package scripts",
);

console.log("platform_diagnostics_contract_proof: ok");
