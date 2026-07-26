import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `expected source to include ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `expected source to include ${endNeedle}`);
  return source.slice(start, end);
}

const schema = read("convex/schema.ts");
const platformDiagnostics = read("convex/platformDiagnostics.ts");
const authSessions = read("convex/authSessions.ts");
const operatorAccess = read("convex/operatorAccess.ts");
const operatorDashboard = read("convex/operatorDashboard.ts");
const operatorIntelligence = read("convex/operatorIntelligence.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const operatorTypes = read("shared/operatorTypes.ts");
const operatorPanel = [
  read("apps/web/src/components/WebOperatorDashboardHost.tsx"),
  read("apps/web/src/components/useOperatorDashboardData.ts"),
  read("apps/web/src/components/OperatorPlatformPanelView.tsx"),
].join("\n");
const packageJson = read("package.json");
const authAccessDiagnosticsBlock = sliceBetween(
  operatorIntelligence,
  "getOperatorAuthAccessDiagnosticsInternal = internalQuery",
  "export const getOperatorSecurityAuditDiagnosticsInternal",
);

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
  /DIAGNOSTIC_METADATA_ALLOWLIST[\s\S]*"auth\.bootstrap_failed": \[\][\s\S]*"auth\.session_refresh_failed": \[\][\s\S]*"auth\.session_logout_failed": \[\][\s\S]*"access\.operator_access_denied": \[\]/,
  "platform diagnostics metadata must be limited to exceptional event types",
);
assert.match(
  platformDiagnostics,
  /DIAGNOSTIC_METADATA_BLOCKED_KEY_PARTS[\s\S]*"token"[\s\S]*"secret"[\s\S]*"authorization"[\s\S]*"session"[\s\S]*"encrypted"/,
  "platform diagnostics metadata sanitizer must keep a defensive sensitive-key denylist",
);
assert.doesNotMatch(platformDiagnostics, /refreshLeaseContended/, "retired success metadata must not remain");
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

for (const eventType of ["auth.bootstrap_failed", "auth.session_refresh_failed", "auth.session_logout_failed"]) {
  assert.match(authSessions, new RegExp(eventType.replaceAll(".", "\\.")), `auth sessions must record ${eventType}`);
}
for (const eventType of ["auth.session_established", "auth.session_refreshed", "auth.session_logged_out"]) {
  assert.doesNotMatch(
    authSessions,
    new RegExp(eventType.replaceAll(".", "\\.")),
    `auth sessions must not durably record routine success ${eventType}`,
  );
}

const authDiagnosticCalls = authSessions.match(/recordAuthSessionDiagnostic\(ctx, \{[\s\S]*?\n\s*\}\);/g) ?? [];
assert.ok(authDiagnosticCalls.length >= 1, "auth session flow must retain exceptional diagnostics");
for (const call of authDiagnosticCalls) {
  for (const forbidden of ["sessionId:", "accessToken:", "refreshToken:", "idToken:"]) {
    assert.doesNotMatch(call, new RegExp(forbidden), "auth diagnostics must not put tokens or session ids in metadata");
  }
}

assert.match(
  operatorAccess,
  /access\.operator_access_denied/,
  "operator access must record denied diagnostics",
);
assert.doesNotMatch(
  operatorAccess,
  /access\.operator_access_granted/,
  "successful operator access must use critical audit only, not duplicate diagnostics",
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
  operatorTypes,
  /authIncidents\?: \{[\s\S]*failures: number;[\s\S]*affectedUsers: number;[\s\S]*unattributedFailures: number;[\s\S]*logoutFailures: number;/,
  "operator auth diagnostics must expose bounded failure impact",
);
assert.doesNotMatch(operatorTypes, /authAvailability|successRate|attempts: number|successes: number/, "success-rate contract must be deleted");
assert.match(
  operatorTypes,
  /accessIntegrity\?: \{[\s\S]*operatorAccessDenied: number;[\s\S]*communityAccessDenied: number;[\s\S]*entitlementErrorFindings: number;/,
  "operator auth diagnostics must separate access integrity from auth availability",
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
assert.match(
  operatorIntelligence,
  /AUTH_INCIDENT_WINDOW_MS = 24 \* 60 \* 60 \* 1000/,
  "operator auth incidents must use a recent window",
);
assert.match(
  operatorIntelligence,
  /AUTH_INCIDENT_EVENT_TYPES\.map[\s\S]*readDiagnosticEventsByType/,
  "operator auth incidents must read exact failure types through the indexed helper",
);
assert.doesNotMatch(authAccessDiagnosticsBlock, /authSuccessRate|recentAuthSuccessRows|authAttempts/, "operator diagnostics must not infer success rate from capped rows");
assert.match(
  operatorIntelligence,
  /accessIntegrity: \{[\s\S]*operatorAccessDenied:[\s\S]*communityAccessDenied:[\s\S]*entitlementErrorFindings,/,
  "operator diagnostics must return a distinct access-integrity summary",
);
assert.match(
  authAccessDiagnosticsBlock,
  /const health: "healthy" \| "degraded" \| "incident" \| "unknown" =[\s\S]*authIncidentHealth === "incident" \|\| accessIntegrityHealth === "incident"[\s\S]*authIncidentHealth === "degraded" \|\| accessIntegrityHealth === "degraded"/,
  "operator auth/access health must mirror nested auth incidents and access integrity",
);
assert.doesNotMatch(
  authAccessDiagnosticsBlock,
  /warningRows\.length > 0 \|\| authFailureRows\.length > 0/,
  "operator auth/access compatibility health must not re-score 30d warning and auth failure totals",
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
  /Auth incident status[\s\S]*24h auth failures[\s\S]*24h affected users/,
  "operator panel must show bounded auth incident evidence",
);
assert.doesNotMatch(operatorPanel, /24h auth success|24h auth attempts/, "operator panel must not claim success rate or attempt volume");
assert.match(
  operatorPanel,
  /Access integrity/,
  "operator panel must separate access integrity from auth availability",
);
assert.doesNotMatch(
  operatorPanel,
  /30d session-start events/,
  "operator panel must not surface raw session-start event totals as an auth-health row",
);
assert.match(
  operatorPanel,
  /loadOperatorAuthAccessDiagnosticsCanonical/,
  "operator panel must load the canonical auth and access diagnostics snapshot",
);
const platformHealth = read("shared/operatorPlatformHealth.ts");
assert.match(
  platformHealth,
  /id: "web" \| "runtime" \| "auth" \| "access" \| "security"/,
  "operator platform health cards must expose a separate access card",
);
assert.match(
  platformHealth,
  /const incidents = auth\.authIncidents[\s\S]*primaryMetric: `\$\{incidents\.failures\} auth incidents`/,
  "operator auth card must foreground bounded incident evidence",
);
assert.doesNotMatch(
  platformHealth,
  /authAvailability|successRate|auth attempts succeeded/,
  "operator auth card must not present capped success telemetry as health",
);
assert.match(
  packageJson,
  /"check:platform-diagnostics-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/platform_diagnostics_contract_proof\.ts"/,
  "platform diagnostics proof must be wired into package scripts",
);

console.log("platform_diagnostics_contract_proof: ok");
