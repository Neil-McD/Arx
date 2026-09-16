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
const emailPanel = read("apps/web/src/components/OperatorEmailPanelView.tsx");
const operatorHost = read("apps/web/src/components/WebOperatorDashboardHost.tsx");
const appShellNavigation = read("shared/appShellNavigation.ts");
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
  /RESEND_API_KEY_ENV_KEYS[\s\S]*EMAIL_FROM_ENV_KEYS[\s\S]*RESEND_WEBHOOK_SECRET_ENV_KEYS[\s\S]*configuration:[\s\S]*resendApiKeyConfigured[\s\S]*senderConfigured[\s\S]*webhookSecretConfigured/,
  "email diagnostics must expose redacted Resend/provider configuration health",
);

assert.match(
  diagnostic,
  /pendingDueNow[\s\S]*staleSending[\s\S]*oldestPendingAt[\s\S]*recentRows[\s\S]*recentFailures[\s\S]*lastEventType[\s\S]*lastEventAt/,
  "email diagnostics must expose read-only queue and webhook health fields",
);

assert.match(
  diagnostic,
  /totalOutboxRows = await ctx\.db\.query\("emailOutbox"\)\.collect\(\)[\s\S]*totals:[\s\S]*rows: totalOutboxRows\.length[\s\S]*byStatus: totalOutboxByStatus[\s\S]*failures: totalOutboxFailures[\s\S]*outboxTotalMode: "exact_collect"[\s\S]*outboxTotalRows: totalOutboxRows\.length/,
  "email diagnostics must expose exact outbox totals separately from capped samples",
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
  /export type OperatorEmailAuthDiagnosticSnapshot = \{[\s\S]*configuration:[\s\S]*resendApiKeyConfigured: boolean[\s\S]*emailVerifiedClaimValue: boolean \| null[\s\S]*workosUser:[\s\S]*emailVerified\?: boolean \| null[\s\S]*aggregate:[\s\S]*currentUser:[\s\S]*emailVerifiedAtPresent: boolean[\s\S]*outbox:[\s\S]*failures: Record<string, number>[\s\S]*pendingDueNow: number[\s\S]*recentRows: Array[\s\S]*deliveries:[\s\S]*lastEventType: string \| null/,
  "operator types must expose the redacted email auth and ops diagnostic snapshot",
);

assert.match(
  operatorTypes,
  /outbox:[\s\S]*totals:[\s\S]*rows: number[\s\S]*byStatus: Record<string, number>[\s\S]*failures: Record<string, number>[\s\S]*outboxTotalMode: "exact_collect" \| string[\s\S]*outboxTotalRows: number/,
  "operator types must expose exact outbox totals and their evidence metadata",
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
  operatorHost,
  /import \{ OperatorEmailPanelView \}[\s\S]*props\.activeTab === "email"[\s\S]*<OperatorEmailPanelView[\s\S]*monetization=\{operator\.state\.monetization\}[\s\S]*emailAuth=\{operator\.state\.emailAuth\}/,
  "the live operator console must route email diagnostics to the dedicated Email tab",
);

assert.match(
  appShellNavigation,
  /OPERATOR_TABS = \[\s*"platform",\s*"business",\s*"email",\s*"communities",?\s*\] as const[\s\S]*export type OperatorTab = \(typeof OPERATOR_TABS\)\[number\]/,
  "canonical operator navigation must expose Email as one of four bounded operator tabs",
);

assert.match(
  emailPanel,
  /Provider health[\s\S]*Resend API key[\s\S]*Email engagement[\s\S]*Email auth[\s\S]*Queue health[\s\S]*Recent outbox/,
  "operator Email panel must project provider, engagement, auth, and queue diagnostics",
);

assert.match(
  emailPanel,
  /outboxTotals = outbox\?\.totals[\s\S]*suppressedEmails = outboxTotals\?\.byStatus\.suppressed[\s\S]*failureEntries = topEntries\(outboxTotals\?\.failures[\s\S]*Suppressed outbox total[\s\S]*outboxTotals\?\.byStatus\[status\]/,
  "operator Email panel must prefer exact outbox totals over capped sample counts",
);

assert.doesNotMatch(
  businessPanel,
  /Email engagement|Email auth|emailAuth/,
  "operator Business panel must not retain the dedicated email diagnostic sections",
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
