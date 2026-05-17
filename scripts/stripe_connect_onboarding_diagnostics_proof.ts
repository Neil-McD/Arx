import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const creatorCommerce = readText("../convex/creatorCommerce.ts");
const criticalAudit = readText("../convex/criticalAudit.ts");
const platformDiagnostics = readText("../convex/platformDiagnostics.ts");

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
assert.doesNotMatch(
  creatorCommerce,
  /metadata:\s*error\b/,
  "Diagnostics must not store raw provider error objects.",
);

console.log("stripe_connect_onboarding_diagnostics_proof: ok");
