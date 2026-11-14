import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const diagnostic = read("convex/emailDiagnostics.ts");
const workosEmailVerification = read("convex/workosEmailVerification.ts");
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
