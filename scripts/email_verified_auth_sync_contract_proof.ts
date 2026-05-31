import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const workos = read("convex/workosEmailVerification.ts");
const auth = read("convex/auth.ts");
const httpAuthBridge = read("convex/httpAuthBridge.ts");
const http = read("convex/http.ts");
const repair = read("convex/emailVerificationRepair.ts");
const convexClient = read("shared/convexAuthenticatedClient.ts");
const email = read("convex/email.ts");
const pkg = read("package.json");

assert.match(
  workos,
  /WORKOS_API_KEY_ENV_KEYS = \["ARX_WORKOS_API_KEY", "WORKOS_API_KEY"\]/,
  "WorkOS email verification must use the server-side WorkOS API key env names",
);

assert.match(
  workos,
  /\/user_management\/users\/\$\{encodeURIComponent\(authSubject\)\}/,
  "WorkOS email verification must fetch the authoritative WorkOS user by auth subject",
);

assert.match(
  workos,
  /WORKOS_USER_LOOKUP_TIMEOUT_MS[\s\S]*new AbortController\(\)[\s\S]*signal: controller\.signal[\s\S]*workos_user_fetch_timeout/,
  "WorkOS email verification fetch must be timeout-bound",
);

assert.match(
  workos,
  /lookup\.subjectMatchedResponseId !== true[\s\S]*workos_subject_mismatch/,
  "WorkOS verification must require WorkOS id to match the authenticated subject",
);

assert.match(
  workos,
  /lookup\.emailVerified !== true[\s\S]*workos_email_unverified/,
  "WorkOS verification must require WorkOS email verification to be true",
);

assert.match(
  workos,
  /normalizeEmailForVerification\(lookup\.email\) !== normalizedEmail[\s\S]*workos_email_mismatch/,
  "WorkOS verification must require WorkOS email to match the local user email",
);

assert.match(
  workos,
  /const normalizedIdentityEmail = normalizeEmailForVerification\(args\.identityEmail\)[\s\S]*args\.identityEmailVerified === true[\s\S]*normalizedIdentityEmail === normalizedEmail/,
  "identity claim verification must only be trusted for the same identity email",
);

assert.match(
  auth,
  /function seedAuthenticatedProfile[\s\S]*identityVerifiedForEmail[\s\S]*args\.identity\.emailVerified[\s\S]*normalizeEmailForVerification\(args\.identity\.email\) === normalizeEmailForVerification\(email\)[\s\S]*emailVerified: identityVerifiedForEmail/,
  "auth bootstrap must not let browser-provided email inherit an unrelated verified identity claim",
);

assert.match(
  auth,
  /export const syncAuthenticatedEmailVerification = action[\s\S]*resolveAuthenticatedIdentityProfile[\s\S]*resolveTrustedEmailVerification[\s\S]*ensureAuthenticatedActorByExplicitSubjectInternal/,
  "auth must expose a server action that syncs trusted email verification into the user actor",
);

assert.match(
  convexClient,
  /client\.action\("auth:syncAuthenticatedEmailVerification"[\s\S]*authSubject[\s\S]*email: sessionEmail/,
  "authenticated Convex bootstrap must trigger the email verification sync action",
);

assert.match(
  httpAuthBridge,
  /identityEmailMatchesStored[\s\S]*resolveTrustedEmailVerification[\s\S]*identityEmail: verified\.identity\.email[\s\S]*identityEmailVerified: identityEmailMatchesStored \? verified\.identity\.emailVerified : false[\s\S]*emailVerified: emailVerification\.emailVerified/,
  "auth bridge session creation must enrich email verification from trusted WorkOS authority",
);

assert.match(
  http,
  /resolveAuthenticatedActorInternal[\s\S]*emailVerifiedAt[\s\S]*resolveTrustedEmailVerification[\s\S]*emailVerified: trustedEmailVerification\.emailVerified/,
  "HTTP authenticated actor upsert must reuse existing verified state or resolve trusted verification",
);

assert.match(
  repair,
  /export const backfillEmailVerifiedAtFromWorkos = action[\s\S]*operatorDashboard\.getOperatorAccess[\s\S]*const dryRun = args\.dryRun !== false/,
  "WorkOS email verification backfill must be operator-gated and default to dry-run",
);

assert.match(
  repair,
  /patchEmailVerifiedAtFromWorkosInternal[\s\S]*auth_subject_mismatch[\s\S]*email_mismatch[\s\S]*emailVerifiedAt: args\.nowMs[\s\S]*emailVerificationSource: "oauth_provider"/,
  "WorkOS email verification backfill patch must re-check subject/email before writing",
);

assert.match(
  repair,
  /mutatesEmailOutbox: false[\s\S]*sendsEmail: false/,
  "WorkOS email verification backfill must not mutate outbox rows or send email",
);

assert.match(
  email,
  /verifiedEmail: typeof user\.emailVerifiedAt === "number" \? recordEmail : null[\s\S]*email_recipient_unverified/,
  "email sending must keep the verified-email gate intact",
);

assert.match(
  pkg,
  /"check:email-verified-auth-sync-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/email_verified_auth_sync_contract_proof\.ts"/,
  "package scripts must expose the email verified auth sync proof",
);

console.log("email_verified_auth_sync_contract_proof: ok");
