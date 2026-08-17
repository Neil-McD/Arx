import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const authSessions = read("convex/authSessions.ts");
const auth = read("convex/auth.ts");
const httpAuthBridge = read("convex/httpAuthBridge.ts");
const http = read("convex/http.ts");
const convexClient = read("shared/convexAuthenticatedClient.ts");
const billing = read("convex/founderBilling.ts");
const email = read("convex/email.ts");

assert.match(
  authSessions,
  /emailVerified: boolean[\s\S]*"email_verified"[\s\S]*email_verified: stored\.user\.emailVerified/,
  "the server-owned auth session must preserve the provider verification claim",
);
assert.match(
  httpAuthBridge,
  /stored\.user\.id !== authSubject[\s\S]*auth_subject_mismatch/,
  "auth completion must bind the stored provider user to the verified bearer subject",
);
assert.match(
  httpAuthBridge,
  /auth_email_mismatch[\s\S]*emailVerified[\s\S]*emailVerificationSource: "oauth_provider"/,
  "auth completion must fail mismatched email and persist same-email provider verification",
);
assert.match(
  httpAuthBridge,
  /reconcilePaidBuilderPurchasesForOwnerInternal[\s\S]*verifiedEmail: normalizedStored\.user\.email/,
  "auth completion must reconcile paid Builder purchases on the server",
);
assert.doesNotMatch(
  httpAuthBridge,
  /resolveTrustedEmailVerification|user_management\/users/,
  "auth completion must not run a second WorkOS lookup",
);
assert.doesNotMatch(
  auth,
  /syncAuthenticatedEmailVerification|verification_owned_by_auth_bridge/,
  "the retired verification compatibility action must stay deleted",
);
assert.doesNotMatch(
  convexClient,
  /syncAuthenticatedEmailVerification/,
  "the browser bootstrap must not trigger a second verification path",
);
assert.doesNotMatch(
  http,
  /resolveTrustedEmailVerification/,
  "authenticated HTTP requests must trust verified identity claims or existing persisted verification",
);
assert.match(
  billing,
  /reconcilePaidBuilderPurchasesForOwnerInternal[\s\S]*emailVerifiedAt[\s\S]*by_mode_recovery_email/,
  "Builder reconciliation must require persisted verified email and use the recovery-email index",
);
assert.match(
  email,
  /verifiedEmail: typeof user\.emailVerifiedAt === "number" \? recordEmail : null[\s\S]*email_recipient_unverified/,
  "email sending must keep the verified-email gate intact",
);

console.log("email_verified_auth_sync_contract_proof: ok");
