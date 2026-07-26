import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const operatorSentryDiagnostics = read("convex/operatorSentryDiagnostics.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const operatorTypes = read("shared/operatorTypes.ts");
const operatorPanel = [
  read("apps/web/src/components/WebOperatorDashboardHost.tsx"),
  read("apps/web/src/components/useOperatorDashboardData.ts"),
  read("apps/web/src/components/OperatorPlatformPanelView.tsx"),
].join("\n");
const viteConfig = read("apps/web/vite.config.ts");
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
  /issueLimit: number[\s\S]*configured: boolean[\s\S]*unavailableReason: string \| null[\s\S]*sampled: boolean[\s\S]*isTruncated: boolean/,
  "frontend error evidence must expose limit, configuration, sampling, and truncation state",
);

assert.match(
  viteConfig,
  /polynetBuildVersionPlugin[\s\S]*sentryRelease: string \| null[\s\S]*environment: string \| null[\s\S]*fileName: "version\.json"[\s\S]*JSON\.stringify\(params/,
  "version.json must include frontend Sentry release and environment evidence",
);

assert.match(
  operatorSentryDiagnostics,
  /getOperatorFrontendErrorDiagnostics = action/,
  "frontend error diagnostics must be a Convex action",
);
assert.match(
  operatorSentryDiagnostics,
  /frontendSentryRelease: v\.optional\(v\.string\(\)\)/,
  "Sentry diagnostics action must accept frontend Sentry release evidence from version.json",
);
assert.doesNotMatch(
  operatorSentryDiagnostics,
  /process\.env\.SENTRY_RELEASE|process\.env\.VERCEL_GIT_COMMIT_SHA|process\.env\.GIT_COMMIT_SHA/,
  "Sentry diagnostics action must not use Convex env release as primary frontend release truth",
);
assert.match(
  operatorSentryDiagnostics,
  /ctx\.runQuery\(\(api as any\)\.operatorAccess\.getMyOperatorAccessOptional[\s\S]*if \(!operatorAccess\)[\s\S]*operator_access_required/,
  "frontend error diagnostics action must be operator-gated without logging expected access denials",
);
assert.doesNotMatch(
  operatorSentryDiagnostics,
  /operatorDashboard\.getOperatorAccess/,
  "frontend error diagnostics must not use the noisy throwing operator dashboard access query",
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
  /summarizeSentryIssues[\s\S]*sentryRelease: string \| null[\s\S]*cleanRequiredString\(issue\.title[\s\S]*cleanOptionalString\(issue\.culprit[\s\S]*cleanOptionalString\(issue\.permalink/,
  "Sentry diagnostics must sanitize issue rows before returning them",
);
assert.match(
  operatorSentryDiagnostics,
  /issueLimit: SENTRY_ISSUE_LIMIT[\s\S]*isTruncated: rows\.length >= SENTRY_ISSUE_LIMIT/,
  "Sentry diagnostics must expose bounded issue limit and truncation evidence",
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
  /readCurrentBuildFromVersionJson\(\)[\s\S]*sentryRelease: string \| null[\s\S]*currentBuildId: build\.buildId[\s\S]*frontendSentryRelease: build\.sentryRelease/,
  "operator gateway must pass current build and frontend Sentry release evidence to Sentry diagnostics",
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
  /Open issues shown[\s\S]*Top issue events[\s\S]*Affected users shown[\s\S]*formatBoundedCount/,
  "operator panel must label bounded sampled Sentry metrics explicitly",
);
assert.match(
  operatorPanel,
  /Frontend error diagnostics show the top \{props\.frontendErrors\.evidence\.issueLimit\} Sentry issues/,
  "operator panel must render the backend issue limit",
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
