import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const criticalAudit = read("convex/criticalAudit.ts");
const operatorIntelligence = read("convex/operatorIntelligence.ts");
const operatorDashboard = read("convex/operatorDashboard.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const operatorTypes = read("shared/operatorTypes.ts");
const operatorPanel = read("apps/web/src/components/WebOperatorDataPanel.tsx");
const packageJson = read("package.json");

assert.match(
  criticalAudit,
  /export function sanitizeCriticalAuditMetadata/,
  "critical audit events must sanitize metadata at the write boundary",
);
assert.match(
  criticalAudit,
  /CRITICAL_AUDIT_METADATA_ALLOWLIST/,
  "critical audit metadata must be event-type allowlisted",
);
for (const eventType of ["account_delete_blocked", "stripe_webhook_failed", "operator_role_upserted"]) {
  assert.match(
    criticalAudit,
    new RegExp(`${eventType}: \\[`),
    `critical audit metadata allowlist missing ${eventType}`,
  );
}
assert.match(
  criticalAudit,
  /CRITICAL_AUDIT_METADATA_BLOCKED_KEY_PARTS[\s\S]*"token"[\s\S]*"secret"[\s\S]*"authorization"[\s\S]*"session"[\s\S]*"payload"[\s\S]*"raw"/,
  "critical audit sanitizer must block common sensitive metadata keys",
);
assert.match(
  criticalAudit,
  /allowedKeys\.length === 0[\s\S]*typeof metadata !== "object"[\s\S]*Array\.isArray\(metadata\)[\s\S]*return undefined/,
  "critical audit metadata must fail closed for unknown events and non-object metadata",
);
assert.match(
  criticalAudit,
  /metadata:\s*sanitizeCriticalAuditMetadata\(eventType, input\.metadata\)/,
  "critical audit insert must use sanitized metadata",
);
assert.doesNotMatch(
  criticalAudit,
  /metadata:\s*input\.metadata/,
  "critical audit must not store caller metadata directly",
);

assert.match(
  operatorTypes,
  /export type OperatorSecurityAuditDiagnosticsSnapshot = /,
  "operator security audit snapshot contract is missing",
);
for (const field of [
  "webhookFailures",
  "blockedActions",
  "destructiveActions",
  "operatorRoleChanges",
  "operatorAccessBlocks",
  "billingTrustEvents",
  "unknownSecurityEvents",
]) {
  assert.match(operatorTypes, new RegExp(`${field}: number`), `security audit totals missing ${field}`);
}

assert.match(
  operatorIntelligence,
  /getOperatorSecurityAuditDiagnosticsInternal = internalQuery/,
  "security audit diagnostics read model must be internal",
);
assert.match(
  operatorIntelligence,
  /SECURITY_AUDIT_EVENT_TYPES[\s\S]*stripe_webhook_failed[\s\S]*operator_role_upserted[\s\S]*account_delete_completed/,
  "security audit diagnostics must classify the security-critical audit event types",
);
assert.match(
  operatorIntelligence,
  /readCriticalAuditEventsByType[\s\S]*withIndex\("by_type_createdAt"/,
  "security audit diagnostics must use critical audit type indexes",
);
assert.match(
  operatorIntelligence,
  /readCriticalAuditEventsBySeverity[\s\S]*withIndex\("by_severity_createdAt"/,
  "security audit diagnostics must use critical audit severity indexes",
);
assert.match(
  operatorIntelligence,
  /sanitizeCriticalAuditMetadata/,
  "operator audit event projection must sanitize critical audit metadata",
);
assert.doesNotMatch(
  operatorIntelligence,
  /internalMutation|mutation|action|ctx\.db\.insert|ctx\.db\.patch|ctx\.db\.delete/,
  "operator security audit diagnostics must stay read-only",
);

assert.match(
  operatorDashboard,
  /getOperatorSecurityAuditDiagnostics = query[\s\S]*requireOperatorAccess[\s\S]*getOperatorSecurityAuditDiagnosticsInternal/,
  "public security audit diagnostics query must be operator-gated",
);
assert.match(
  operatorGateway,
  /operatorDashboard:getOperatorSecurityAuditDiagnostics/,
  "web gateway must call the gated security audit diagnostics query",
);
assert.doesNotMatch(
  operatorGateway,
  /operatorIntelligence:getOperatorSecurityAuditDiagnosticsInternal/,
  "web gateway must not call internal security audit diagnostics directly",
);
assert.match(
  operatorPanel,
  /loadOperatorSecurityAuditDiagnosticsCanonical/,
  "operator panel must load the security audit diagnostics snapshot",
);
assert.match(
  operatorPanel,
  /Security &amp; audit/,
  "operator panel must render the security audit diagnostics surface",
);
assert.match(
  operatorPanel,
  /Security audit diagnostics are sampled for this window/,
  "operator panel must label sampled security audit diagnostics",
);
assert.match(
  packageJson,
  /"check:security-audit-diagnostics-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/security_audit_diagnostics_proof\.ts"/,
  "security audit diagnostics proof must be wired into package scripts",
);

console.log("security_audit_diagnostics_proof: ok");
