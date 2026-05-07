import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const operatorSentryDiagnostics = read("convex/operatorSentryDiagnostics.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const operatorTypes = read("shared/operatorTypes.ts");
const operatorPanel = read("apps/web/src/components/WebOperatorDataPanel.tsx");
const packageJson = read("package.json");

assert.match(
  operatorTypes,
  /export type OperatorFrontendErrorDiagnosticsSnapshot = /,
  "frontend error diagnostics snapshot contract is missing",
);
for (const field of ["issues", "events", "affectedUsers", "unresolvedIssues"]) {
  assert.match(operatorTypes, new RegExp(`${field}: number`), `frontend error totals missing ${field}`);
}
assert.match(
  operatorTypes,
  /topIssues: OperatorFrontendErrorIssue\[\]/,
  "frontend error diagnostics must expose sanitized top issues only",
);
assert.match(
  operatorTypes,
  /configured: boolean[\s\S]*unavailableReason: string \| null[\s\S]*sampled: boolean[\s\S]*isTruncated: boolean/,
  "frontend error evidence must expose configuration, sampling, and truncation state",
);

assert.match(
  operatorSentryDiagnostics,
  /getOperatorFrontendErrorDiagnostics = action/,
  "frontend error diagnostics must be a Convex action",
);
assert.match(
  operatorSentryDiagnostics,
  /ctx\.runQuery\(\(api as any\)\.operatorDashboard\.getOperatorAccess/,
  "frontend error diagnostics action must be operator-gated",
);
for (const envName of ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT", "SENTRY_PROJECT_ID", "SENTRY_BASE_URL"]) {
  assert.match(operatorSentryDiagnostics, new RegExp(envName), `frontend error diagnostics missing ${envName}`);
}
assert.match(
  operatorSentryDiagnostics,
  /method:\s*"GET"[\s\S]*Authorization:\s*`Bearer \$\{token\}`/,
  "Sentry diagnostics must use read-only GET requests with server-side bearer auth",
);
assert.match(
  operatorSentryDiagnostics,
  /AbortController[\s\S]*controller\.abort\(\)[\s\S]*SENTRY_REQUEST_TIMEOUT_MS/,
  "Sentry diagnostics fetch must be timeout-bound",
);
assert.match(
  operatorSentryDiagnostics,
  /summarizeSentryIssues[\s\S]*cleanRequiredString\(issue\.title[\s\S]*cleanOptionalString\(issue\.culprit[\s\S]*cleanOptionalString\(issue\.permalink/,
  "Sentry diagnostics must sanitize issue rows before returning them",
);
assert.doesNotMatch(
  operatorSentryDiagnostics,
  /ctx\.db\.insert|ctx\.db\.patch|ctx\.db\.delete|mutation\(/,
  "Sentry diagnostics must stay read-only",
);

assert.match(
  operatorGateway,
  /loadOperatorFrontendErrorDiagnosticsCanonical/,
  "operator gateway must expose canonical frontend error diagnostics",
);
assert.match(
  operatorGateway,
  /operatorSentryDiagnostics:getOperatorFrontendErrorDiagnostics/,
  "operator gateway must call the gated Sentry diagnostics action",
);
assert.match(
  operatorGateway,
  /readCurrentBuildFromVersionJson\(\)[\s\S]*currentBuildId: build\.buildId/,
  "operator gateway must pass current build evidence to Sentry diagnostics",
);
assert.doesNotMatch(
  operatorGateway,
  /SENTRY_AUTH_TOKEN|Authorization|Bearer/,
  "browser gateway must not expose Sentry tokens or auth headers",
);

assert.match(
  operatorPanel,
  /loadOperatorFrontendErrorDiagnosticsCanonical/,
  "operator panel must load frontend error diagnostics",
);
assert.match(
  operatorPanel,
  /Frontend errors/,
  "operator panel must render frontend error diagnostics",
);
assert.match(
  operatorPanel,
  /Sentry frontend diagnostics unavailable/,
  "operator panel must show Sentry unavailable evidence",
);
assert.match(
  operatorPanel,
  /Frontend error diagnostics are sampled from top Sentry issues/,
  "operator panel must label sampled Sentry issue counts",
);
assert.match(
  operatorPanel,
  /Promise\.allSettled[\s\S]*frontendErrors[\s\S]*fulfilledValue\(frontendErrors\)/,
  "Sentry diagnostics failure must not blank the whole operator panel",
);
assert.match(
  packageJson,
  /"check:sentry-frontend-diagnostics-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/sentry_frontend_diagnostics_proof\.ts"/,
  "Sentry frontend diagnostics proof must be wired into package scripts",
);

console.log("sentry_frontend_diagnostics_proof: ok");
