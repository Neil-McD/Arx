import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const diagnostic = read("convex/emailDiagnostics.ts");
const workosEmailVerification = read("convex/workosEmailVerification.ts");
const gateway = read("shared/cloudOperatorDashboardGateway.ts");
const operatorTypes = read("shared/operatorTypes.ts");
const operatorDataHook = read("apps/web/src/components/useOperatorDashboardData.ts");
const businessPanel = read("apps/web/src/components/OperatorBusinessPanelView.tsx");
const rightPanel = read("apps/web/src/components/WebWorkspaceRightPanel.tsx");
const pkg = read("package.json");

assert.match(
  diagnostic,
  /export const getOperatorEmailAuthDiagnostic = action/,
  "email auth diagnostic must expose a public action for operator use",
);

assert.match(
  diagnostic,
  /operatorDashboard\.getOperatorAccess/,
  "email auth diagnostic must use the canonical operator access gate",
);

assert.match(
  diagnostic,
  /ctx\.auth\.getUserIdentity\(\)/,
  "email auth diagnostic must inspect the verified Convex identity shape",
);

assert.match(
  diagnostic,
  /EMAIL_VERIFICATION_CLAIM_KEYS[\s\S]*email_verified[\s\S]*emailVerified[\s\S]*verified_email[\s\S]*verifiedEmail/,
  "email auth diagnostic must report the email verification claim keys currently recognized by authIdentity",
);

assert.match(
  diagnostic,
  /getOperatorEmailAuthDiagnosticAggregateInternal = internalQuery[\s\S]*query\("users"\)[\s\S]*query\("emailOutbox"\)[\s\S]*query\("emailDeliveries"\)/,
  "email auth diagnostic must read the users/outbox/delivery ledgers",
);

assert.match(
  diagnostic,
  /fetchWorkosUserVerification[\s\S]*redactWorkosUserVerificationLookup/,
  "email auth diagnostic must use the shared redacted WorkOS user verification lookup",
);

assert.match(
  workosEmailVerification,
  /ARX_WORKOS_API_KEY[\s\S]*WORKOS_API_KEY[\s\S]*\/user_management\/users\/\$\{encodeURIComponent\(authSubject\)\}/,
  "email auth diagnostic must support a best-effort WorkOS user verification lookup",
);

assert.match(
  workosEmailVerification,
  /WORKOS_USER_LOOKUP_TIMEOUT_MS[\s\S]*new AbortController\(\)[\s\S]*setTimeout\(\(\) => controller\.abort\(\), WORKOS_USER_LOOKUP_TIMEOUT_MS\)[\s\S]*signal: controller\.signal[\s\S]*workos_user_fetch_timeout[\s\S]*clearTimeout\(timeout\)/,
  "email auth diagnostic WorkOS lookup must be timeout-bound",
);

assert.match(
  diagnostic,
  /redacted: true[\s\S]*readOnly: true[\s\S]*mutatesUsers: false[\s\S]*mutatesEmailOutbox: false/,
  "email auth diagnostic must explicitly report that it is redacted and read-only",
);

assert.match(
  operatorTypes,
  /export type OperatorEmailAuthDiagnosticSnapshot = \{[\s\S]*emailVerifiedClaimValue: boolean \| null[\s\S]*workosUser:[\s\S]*emailVerified\?: boolean \| null[\s\S]*aggregate:[\s\S]*currentUser:[\s\S]*emailVerifiedAtPresent: boolean[\s\S]*outbox:[\s\S]*failures: Record<string, number>/,
  "operator types must expose the redacted email auth diagnostic snapshot",
);

assert.match(
  gateway,
  /loadOperatorEmailAuthDiagnosticCanonical[\s\S]*client\.action\("emailDiagnostics:getOperatorEmailAuthDiagnostic"[\s\S]*includeWorkosUserLookup: params\.includeWorkosUserLookup \?\? true/,
  "operator gateway must load the email auth diagnostic through the gated action",
);

assert.match(
  operatorDataHook,
  /loadOperatorEmailAuthDiagnosticCanonical[\s\S]*emailAuth: OperatorEmailAuthDiagnosticSnapshot \| null[\s\S]*emailAuth: null[\s\S]*loadOperatorEmailAuthDiagnosticCanonical\(\{ session, includeWorkosUserLookup: true \}\)[\s\S]*emailAuth: fulfilledValue\(emailAuth\)/,
  "operator dashboard data hook must load and retain the email auth diagnostic",
);

assert.match(
  rightPanel,
  /<OperatorBusinessPanelView[\s\S]*emailAuth=\{props\.state\.emailAuth\}/,
  "workspace operator right panel must pass email auth diagnostics to Business",
);

assert.match(
  businessPanel,
  /Email auth[\s\S]*Current user verified[\s\S]*Identity claim verified[\s\S]*WorkOS user verified[\s\S]*Unverified suppressions/,
  "operator Business panel must project the email auth diagnostic",
);

assert.doesNotMatch(
  diagnostic,
  /ctx\.db\.(insert|patch|replace|delete)\(/,
  "email auth diagnostic must not mutate Convex tables",
);

assert.doesNotMatch(
  diagnostic,
  /sendRenderedEmail|resend\.emails\.send|enqueueEmailJobInternal/,
  "email auth diagnostic must not enqueue or send email",
);

assert.match(
  pkg,
  /"check:email-auth-diagnostic-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/email_auth_diagnostic_contract_proof\.ts"/,
  "package scripts must expose the email auth diagnostic proof",
);

console.log("email_auth_diagnostic_contract_proof: ok");
