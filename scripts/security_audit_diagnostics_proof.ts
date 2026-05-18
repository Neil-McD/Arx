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

const criticalAudit = read("convex/criticalAudit.ts");
const operatorIntelligence = read("convex/operatorIntelligence.ts");
const operatorDashboard = read("convex/operatorDashboard.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const operatorPlatformHealth = read("shared/operatorPlatformHealth.ts");
const operatorTypes = read("shared/operatorTypes.ts");
const operatorPanel = read("apps/web/src/components/WebWorkspaceRightPanel.tsx");
const packageJson = read("package.json");

const securityDiagnosticsBlock = sliceBetween(
  operatorIntelligence,
  "getOperatorSecurityAuditDiagnosticsInternal = internalQuery",
  "export const getOperatorRuntimeToolDiagnosticsInternal",
);
const securityCardBlock = sliceBetween(
  operatorPlatformHealth,
  "function buildSecurityCard",
  "export function buildOperatorPlatformHealthCards",
);
const trustBoundaryPanelBlock = sliceBetween(
  operatorPanel,
  "<h2>Trust boundary</h2>",
  "<h2>Runtime execution</h2>",
);

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
  operatorTypes,
  /trustBoundary\?:[\s\S]*score: number \| null[\s\S]*findings: number[\s\S]*blockedBoundaryActions: number[\s\S]*attentionItems: OperatorSecurityAuditAttentionItem\[\]/,
  "security audit diagnostics must expose trust-boundary health separately",
);
assert.match(
  operatorTypes,
  /auditActivity\?:[\s\S]*events: number[\s\S]*warnings: number[\s\S]*destructiveActions: number[\s\S]*billingTrustEvents: number/,
  "security audit diagnostics must expose normal audit activity separately",
);

assert.match(
  operatorIntelligence,
  /getOperatorSecurityAuditDiagnosticsInternal = internalQuery/,
  "security audit diagnostics read model must be internal",
);
assert.match(
  securityDiagnosticsBlock,
  /trustBoundaryRows[\s\S]*trustBoundaryScore[\s\S]*trustBoundary:[\s\S]*auditActivity:/,
  "security audit diagnostics must split trust-boundary health from audit activity",
);
assert.match(
  securityDiagnosticsBlock,
  /eventType === "account_delete_blocked"[\s\S]*return false/,
  "account deletion safety blocks must not degrade trust-boundary health",
);
assert.match(
  securityDiagnosticsBlock,
  /blockedBoundaryActions[\s\S]*operatorAccessBlocks[\s\S]*unknownSecurityEvents/,
  "trust-boundary health must track blocked boundary, operator access, and unknown security events",
);
assert.match(
  operatorIntelligence,
  /SECURITY_AUDIT_EVENT_TYPES[\s\S]*stripe_connect_onboarding_failed[\s\S]*stripe_webhook_failed[\s\S]*operator_role_upserted[\s\S]*account_delete_completed/,
  "security audit diagnostics must classify the security-critical audit event types",
);
assert.match(
  operatorIntelligence,
  /BILLING_TRUST_AUDIT_EVENT_TYPES[\s\S]*stripe_connect_onboarding_failed[\s\S]*stripe_connect_account_synced[\s\S]*stripe_webhook_failed/,
  "Stripe Connect onboarding failures must be classified as billing trust events, not unknown security events",
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
  /Trust boundary/,
  "operator panel must render the security audit diagnostics surface",
);
assert.doesNotMatch(
  operatorPanel,
  /Security &amp; audit/,
  "operator panel should use the trust-boundary label",
);
assert.match(
  securityCardBlock,
  /security\.trustBoundary[\s\S]*Trust-boundary failures clear/,
  "platform security card must score trust-boundary health",
);
assert.doesNotMatch(
  securityCardBlock,
  /audit warnings|blocked actions/,
  "platform security card must not score normal audit warning volume or generic blocked activity",
);
assert.match(
  trustBoundaryPanelBlock,
  /Trust health[\s\S]*Trust findings[\s\S]*Webhook failures[\s\S]*Operator access blocks[\s\S]*Blocked boundary actions[\s\S]*Audit events/,
  "operator security panel must separate trust health from audit activity",
);
assert.match(
  operatorPanel,
  /Trust-boundary diagnostics are sampled for this window/,
  "operator panel must label sampled security audit diagnostics",
);
assert.match(
  packageJson,
  /"check:security-audit-diagnostics-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/security_audit_diagnostics_proof\.ts"/,
  "security audit diagnostics proof must be wired into package scripts",
);

console.log("security_audit_diagnostics_proof: ok");
