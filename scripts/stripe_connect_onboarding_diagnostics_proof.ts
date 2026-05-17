import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const creatorCommerce = readText("../convex/creatorCommerce.ts");
const criticalAudit = readText("../convex/criticalAudit.ts");
const platformDiagnostics = readText("../convex/platformDiagnostics.ts");
const schema = readText("../convex/schema.ts");
const stripeConnectAccountCore = readText("../convex/stripeConnectAccountCore.ts");
const stripeConnectCountries = readText("../shared/stripeConnectCountries.ts");
const accountStatusGateway = readText("../shared/accountCommerceStatusGateway.ts");

assert.match(
  creatorCommerce,
  /platformDiagnostics\.recordPlatformDiagnosticEventInternal/,
  "Stripe Connect onboarding failures must emit platform diagnostics through the internal mutation from the action.",
);
assert.match(
  creatorCommerce,
  /criticalAudit\.recordCriticalAuditEventInternal/,
  "Stripe Connect onboarding failures must emit critical audit evidence through the internal mutation from the action.",
);
const onboardingFailureDiagnosticBody = creatorCommerce.slice(
  creatorCommerce.indexOf("async function recordStripeConnectOnboardingFailureDiagnostic"),
  creatorCommerce.indexOf("export const getUserStripeConnectAccountInternal"),
);
assert.ok(
  onboardingFailureDiagnosticBody.length > 0,
  "Stripe Connect onboarding failure diagnostic helper must exist.",
);
assert.doesNotMatch(
  onboardingFailureDiagnosticBody,
  /recordPlatformDiagnosticEventBestEffort|recordCriticalAuditEventBestEffort/,
  "Stripe Connect onboarding is an action, so diagnostics must not use db-context best-effort helpers directly.",
);
assert.match(
  creatorCommerce,
  /billing\.stripe_connect_onboarding_failed/,
  "Stripe Connect onboarding failures need a billing diagnostic event type.",
);
assert.match(
  creatorCommerce,
  /stripe_connect_onboarding_failed/,
  "Stripe Connect onboarding failures need a critical audit event type.",
);

for (const stage of [
  "resolve_actor",
  "validate_country",
  "check_payout_access",
  "retrieve_connect_account",
  "create_connect_account",
  "sync_connect_account",
  "create_express_login_link",
  "create_onboarding_account_link",
]) {
  assert.match(
    creatorCommerce,
    new RegExp(`"${stage}"`),
    `Stripe Connect onboarding diagnostics must preserve stage ${stage}.`,
  );
}

for (const key of [
  "context",
  "communitySlug",
  "country",
  "stage",
  "stripeAccountId",
  "stripeErrorType",
  "stripeErrorCode",
  "stripeRequestId",
  "stripeStatusCode",
  "errorMessage",
]) {
  assert.match(
    platformDiagnostics,
    new RegExp(`"billing\\.stripe_connect_onboarding_failed":[\\s\\S]*"${key}"`),
    `Platform diagnostics must allow safe Stripe Connect metadata key ${key}.`,
  );
  assert.match(
    criticalAudit,
    new RegExp(`stripe_connect_onboarding_failed:[\\s\\S]*"${key}"`),
    `Critical audit must allow safe Stripe Connect metadata key ${key}.`,
  );
}

assert.match(
  criticalAudit,
  /"stripe_connect_onboarding_failed"/,
  "Critical audit event type must include Stripe Connect onboarding failures.",
);
assert.match(
  creatorCommerce,
  /Stripe Connect setup could not be opened\. We logged a diagnostic/,
  "Provider failures should surface a stable user-facing message instead of a generic server error.",
);
assert.match(
  creatorCommerce,
  /function stripeConnectAccountCanBeRecreated/,
  "Stripe Connect onboarding must distinguish stale inaccessible account ids from unrecoverable provider failures.",
);
assert.match(
  creatorCommerce,
  /function buildStripeConnectAccountCreateIdempotencyKey/,
  "Stripe Connect account creation must have a deterministic idempotency key builder.",
);
assert.match(
  creatorCommerce,
  /polynet-connect-account:create:\$\{userId\}:\$\{country\}/,
  "First-time Stripe Connect account creation must be idempotent per Polynet user and country.",
);
assert.match(
  creatorCommerce,
  /polynet-connect-account:replace:\$\{userId\}:\$\{existingStripeAccountId\}:\$\{country\}/,
  "Stripe Connect account replacement must be idempotent per user, existing account id, and country.",
);
assert.match(
  schema,
  /userStripeConnectAccounts:[\s\S]*country: v\.optional\(v\.string\(\)\)/,
  "Stored Stripe Connect accounts must preserve the country chosen for account creation.",
);
assert.match(
  stripeConnectAccountCore,
  /country: normalizeStripeConnectCountry\(account\.country\)/,
  "Stripe Connect account snapshots must persist Stripe's account country.",
);
assert.match(
  accountStatusGateway,
  /country: string \| null/,
  "Account commerce status must expose Stripe Connect country to setup surfaces.",
);
assert.match(
  stripeConnectCountries,
  /\{ code: "KW", name: "Kuwait" \}/,
  "Stripe Connect supported countries must include Kuwait.",
);
assert.match(
  creatorCommerce,
  /country: v\.optional\(v\.string\(\)\)/,
  "Stripe Connect onboarding action must accept an explicit country.",
);
assert.match(
  creatorCommerce,
  /!isSupportedStripeConnectCountry\(rawRequestedCountry\)/,
  "Stripe Connect onboarding must reject unsupported country input before creating an account.",
);
assert.match(
  creatorCommerce,
  /throw new Error\("stripe_connect_country_required"\)/,
  "Stripe Connect onboarding must require a country before creating a fresh account.",
);
assert.match(
  creatorCommerce,
  /stripe\.accounts\.create\([\s\S]*country,/,
  "Stripe Connect account creation must pass country to Stripe.",
);
assert.match(
  creatorCommerce,
  /stripeConnectCountryCanBeRecreated\(account\)/,
  "Stripe Connect onboarding may only replace a wrong-country account when the existing account is unfinished.",
);
assert.match(
  creatorCommerce,
  /stripeErrorCode === "account_invalid"/,
  "Stripe Connect onboarding should recover when a stored connected account is no longer accessible to this platform.",
);
assert.match(
  creatorCommerce,
  /stripe_connect_stale_account_recovered/,
  "Stripe Connect stale account recovery should leave log evidence for operator diagnosis.",
);
assert.match(
  creatorCommerce,
  /catch \(error\) \{[\s\S]*stripeConnectAccountCanBeRecreated\(error\)[\s\S]*createStripeExpressAccountForUser/,
  "Stripe Connect onboarding should create a fresh Express account after a recoverable stale-account retrieve failure.",
);
assert.match(
  creatorCommerce,
  /createStripeExpressAccountForUser\(args:[\s\S]*idempotencyKey: string/,
  "Stripe Connect account creation helper must require an idempotency key.",
);
assert.match(
  creatorCommerce,
  /stripe\.accounts\.create\([\s\S]*idempotencyKey: args\.idempotencyKey/,
  "Stripe Connect account creation must pass Stripe request options with an idempotency key.",
);
assert.match(
  creatorCommerce,
  /existingStripeAccountId: existingAccountId/,
  "Stale-account recovery must scope idempotency to the inaccessible account being replaced.",
);
assert.doesNotMatch(
  creatorCommerce,
  /metadata:\s*error\b/,
  "Diagnostics must not store raw provider error objects.",
);

console.log("stripe_connect_onboarding_diagnostics_proof: ok");
