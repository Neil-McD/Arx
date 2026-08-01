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
const communityCommerce = readText("../convex/communityCommerce.ts");
const communityLifecycle = readText("../convex/communityLifecycle.ts");
const auth = readText("../convex/auth.ts");
const stripeConnectPresentation = readText("../apps/web/src/controllers/buildStripeConnectPresentation.ts");

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
const accountCreateParamsBody = creatorCommerce.slice(
  creatorCommerce.indexOf("function buildStripeConnectAccountCreateParams"),
  creatorCommerce.indexOf("async function buildStripeConnectAccountCreateIdempotencyKey"),
);
assert.ok(
  onboardingFailureDiagnosticBody.length > 0,
  "Stripe Connect onboarding failure diagnostic helper must exist.",
);
assert.ok(
  accountCreateParamsBody.length > 0,
  "Stripe Connect account-create payload helper must exist.",
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
  /function buildStripeConnectAccountCreateParams/,
  "Stripe Connect account creation must centralize the exact payload sent to Stripe.",
);
assert.match(
  creatorCommerce,
  /stableStripeConnectFingerprintJson\(args\.createParams\)/,
  "Stripe Connect account creation idempotency keys must fingerprint the exact normalized Stripe create payload.",
);
assert.match(
  creatorCommerce,
  /polynet-connect-account:v3:\$\{mode\}:s_\$\{scopeFingerprint\}:p_\$\{payloadFingerprint\}/,
  "Stripe Connect account creation idempotency must use a v3 key with operation-scope and payload fingerprints.",
);
assert.doesNotMatch(
  creatorCommerce,
  /polynet-connect-account:(create|replace):\$\{policyKey\}/,
  "Stripe Connect account creation must not use the old policy-only v2 key shape.",
);
assert.doesNotMatch(
  creatorCommerce,
  /polynet-connect-account:replace:\$\{userId\}:\$\{existingStripeAccountId\}:\$\{country\}/,
  "Stripe Connect replacement idempotency must not reuse the old key shape that collides after policy changes.",
);
assert.doesNotMatch(
  creatorCommerce,
  /polynet-connect-account:v3:[^`]*\$\{userId\}/,
  "Stripe Connect idempotency keys must not embed raw user ids.",
);
assert.doesNotMatch(
  creatorCommerce,
  /polynet-connect-account:v3:[^`]*\$\{existingStripeAccountId\}/,
  "Stripe Connect idempotency keys must not embed raw connected account ids.",
);
assert.match(
  schema,
  /userStripeConnectAccounts:[\s\S]*country: v\.optional\(v\.string\(\)\)/,
  "Stored Stripe Connect accounts must preserve the country chosen for account creation.",
);
assert.match(
  schema,
  /userStripeConnectAccounts:[\s\S]*serviceAgreement: v\.optional\(v\.string\(\)\)[\s\S]*transfersEnabled: v\.optional\(v\.boolean\(\)\)/,
  "Stored Stripe Connect accounts must preserve service agreement and transfer-capability readiness.",
);
assert.match(
  stripeConnectAccountCore,
  /const country = normalizeStripeConnectCountry\(account\.country\)/,
  "Stripe Connect account snapshots must persist Stripe's account country.",
);
assert.match(
  stripeConnectAccountCore,
  /account\.tos_acceptance\?\.service_agreement/,
  "Stripe Connect snapshots must preserve Stripe's service agreement type.",
);
assert.match(
  stripeConnectAccountCore,
  /account\.capabilities\?\.transfers === "active"/,
  "Stripe Connect snapshots must preserve active transfer capability state.",
);
assert.match(
  accountStatusGateway,
  /country: string \| null/,
  "Account commerce status must expose Stripe Connect country to setup surfaces.",
);
assert.match(
  auth,
  /can_receive_community_revenue: canReceiveRevenue/,
  "Account commerce status must expose the canonical community revenue readiness field.",
);
assert.match(
  accountStatusGateway,
  /can_receive_community_revenue:/,
  "Account commerce gateway must preserve canonical community revenue readiness.",
);
assert.match(
  stripeConnectPresentation,
  /can_receive_community_revenue === true/,
  "Frontend Stripe setup presentation must use community revenue readiness instead of charge wording.",
);
assert.match(
  stripeConnectCountries,
  /\{ code: "KW", name: "Kuwait" \}/,
  "Stripe Connect supported countries must include Kuwait.",
);
assert.match(
  stripeConnectCountries,
  /STRIPE_CONNECT_RECIPIENT_SERVICE_AGREEMENT_COUNTRIES[\s\S]*"KW"/,
  "Kuwait must use Stripe's recipient service agreement instead of requesting card payments.",
);
assert.match(
  stripeConnectCountries,
  /export function getStripeConnectCountryPolicy/,
  "Stripe Connect country behavior must be represented as an explicit policy, not scattered conditional checks.",
);
assert.match(
  stripeConnectCountries,
  /requestCardPayments: serviceAgreement === "full"/,
  "Stripe Connect country policy must derive card payment requests from the account service agreement route.",
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
  /function buildStripeConnectAccountCreateParams[\s\S]*country,/,
  "Stripe Connect account creation must pass country to Stripe.",
);
assert.match(
  creatorCommerce,
  /getStripeConnectCountryPolicy\(country\)/,
  "Stripe Connect account creation must branch on the country-specific service agreement policy.",
);
assert.match(
  creatorCommerce,
  /policy\.requestCardPayments \? \{ card_payments: \{ requested: true \} \} : \{\}/,
  "Recipient-service countries must not request card_payments.",
);
assert.match(
  creatorCommerce,
  /tos_acceptance:[\s\S]*policy\.serviceAgreement === "recipient"[\s\S]*service_agreement: "recipient"/,
  "Recipient-service countries must create accounts with recipient service agreement.",
);
assert.doesNotMatch(
  accountCreateParamsBody,
  /\bemail\b/,
  "Stripe Connect account creation must not include volatile email in the idempotent create payload.",
);
assert.match(
  stripeConnectAccountCore,
  /export function canReceiveCommunityRevenue/,
  "Stripe Connect revenue-destination readiness must be centralized for checkout and paid community settings.",
);
assert.match(
  stripeConnectAccountCore,
  /account\?\.chargesEnabled === true/,
  "Direct community commerce requires connected-account card charge capability.",
);
assert.match(
  communityCommerce,
  /canReceiveCommunityRevenue\(connectAccount\)/,
  "Community checkout must use centralized creator revenue-destination readiness.",
);
assert.match(
  communityLifecycle,
  /canReceiveCommunityRevenue\(connectAccount\)/,
  "Paid community settings must use the same creator revenue-destination readiness as checkout.",
);
assert.doesNotMatch(
  communityLifecycle,
  /chargesEnabled === true[\s\S]{0,120}payoutsEnabled === true/,
  "Paid community settings must use the centralized direct-charge readiness predicate.",
);
assert.doesNotMatch(
  communityCommerce,
  /transfer_data:[\s\S]*destination:/,
  "Community checkout must not create platform-owned destination charges.",
);
assert.match(
  communityCommerce,
  /checkout\.sessions\.create\([\s\S]*application_fee_percent:[\s\S]*stripeAccount: checkoutConfig\.providerAccountId/,
  "Community checkout must create direct connected-account subscriptions with an application fee.",
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
  /const createParams = buildStripeConnectAccountCreateParams/,
  "Stripe Connect account creation helper must build the payload before deriving the idempotency key.",
);
assert.match(
  creatorCommerce,
  /const idempotencyKey = await buildStripeConnectAccountCreateIdempotencyKey\([\s\S]*createParams/,
  "Stripe Connect account creation helper must derive the idempotency key from the exact create payload.",
);
assert.match(
  creatorCommerce,
  /stripe\.accounts\.create\(\s*createParams,[\s\S]*idempotencyKey,/,
  "Stripe Connect account creation must pass Stripe request options with the derived idempotency key.",
);
assert.doesNotMatch(
  creatorCommerce,
  /createStripeExpressAccountForUser\(args:[\s\S]*idempotencyKey: string/,
  "Stripe Connect account creation helper must not accept caller-supplied idempotency keys.",
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
