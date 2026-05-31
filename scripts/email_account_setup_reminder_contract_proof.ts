import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const email = read("convex/email.ts");
const emailCore = read("convex/emailCore.ts");
const accountSetupCore = read("convex/accountSetupCore.ts");
const accountSetup = read("shared/accountSetup.ts");
const crons = read("convex/crons.ts");
const packageJson = read("package.json");

const reminderActionStart = email.indexOf("export const enqueueAccountSetupReminderEmailInternal");
const reminderActionEnd = email.indexOf("export const claimDueEmailOutboxBatchInternal");
assert.ok(reminderActionStart > 0, "account setup reminder enqueue action must exist");
assert.ok(reminderActionEnd > reminderActionStart, "account setup reminder action must stay before outbox claiming");
const reminderAction = email.slice(reminderActionStart, reminderActionEnd);
const claimBatchStart = email.indexOf("export const claimDueEmailOutboxBatchInternal");
const suppressJobStart = email.indexOf("export const suppressEmailJobInternal");
const refreshPayloadStart = email.indexOf("export const refreshEmailJobPayloadInternal");
const workerStart = email.indexOf("export const processPendingEmailOutboxInternal");
assert.ok(claimBatchStart > 0, "email outbox claim batch must exist");
assert.ok(suppressJobStart > claimBatchStart, "email suppression mutation must exist after outbox claiming");
assert.ok(refreshPayloadStart > 0, "email payload refresh mutation must exist");
assert.ok(workerStart > suppressJobStart, "email worker must exist after suppression mutation");
const claimBatch = email.slice(claimBatchStart, suppressJobStart);
const suppressJob = email.slice(suppressJobStart, workerStart);
const worker = email.slice(workerStart);

assert.match(
  emailCore,
  /EMAIL_TEMPLATE_KEYS[\s\S]*"account_setup_reminder"/,
  "account setup reminder must be a first-class email template key",
);

assert.match(
  emailCore,
  /case "account_setup_reminder":[\s\S]*renderAccountSetupReminderTemplate\(payload\)/,
  "account setup reminder must render through the central email template switch",
);

assert.match(
  emailCore,
  /formatAccountSetupMissingLabel[\s\S]*"display_name"[\s\S]*"inference_provider"[\s\S]*"agent_name"/,
  "account setup reminder copy must name concrete missing setup items",
);

assert.match(
  emailCore,
  /readAccountSetupReminderSubject[\s\S]*currentStep === "identity"[\s\S]*Finish your Polynet profile[\s\S]*currentStep === "inference"[\s\S]*Connect your AI provider to finish Polynet setup[\s\S]*currentStep === "agent"[\s\S]*Name your Polynet agent/,
  "account setup reminder subject must adapt to the missing setup stage",
);

assert.match(
  email,
  /loadAccountSetupReminderTargetInternal = internalQuery[\s\S]*loadAccountSetupStatusForUserId\(ctx, args\.recipientUserId\)[\s\S]*formatAccountSetupMissingGuidance\(status\)/,
  "reminder targeting must use the canonical account setup status and guidance",
);

assert.match(
  accountSetupCore,
  /export async function loadAccountSetupStatusForUserId/,
  "account setup status must remain loadable by user id",
);

assert.match(
  accountSetup,
  /export function formatAccountSetupMissingGuidance/,
  "account setup guidance must remain centralized in the shared model",
);

assert.match(
  reminderAction,
  /target\.completed === true[\s\S]*reason: "account_setup_complete"/,
  "completed users must be skipped before an email outbox row is enqueued",
);

assert.match(
  reminderAction,
  /ctx\.runMutation\(\(internal as any\)\.email\.enqueueEmailJobInternal[\s\S]*kind: "account_setup_reminder"[\s\S]*recipientUserId: args\.recipientUserId[\s\S]*templateKey: "account_setup_reminder"/,
  "reminders must enqueue through the existing verified-recipient email pipeline",
);

assert.match(
  email,
  /getUserEmailDeliveryState[\s\S]*emailVerifiedAt[\s\S]*email_recipient_unverified/,
  "existing user-recipient email enqueue must suppress unverified recipients",
);

assert.match(
  email,
  /buildAccountSetupReminderDedupeKey[\s\S]*"account_setup_reminder"[\s\S]*String\(params\.recipientUserId\)[\s\S]*params\.currentStep[\s\S]*String\(params\.completedItems\)[\s\S]*missingSignature/,
  "account setup reminder dedupe must be scoped to user and setup progress",
);

assert.match(
  email,
  /buildAccountSetupReminderSignature[\s\S]*currentStep[\s\S]*`\$\{completedItems\}\/\$\{totalItems\}`[\s\S]*missing\.length \? missing\.join\(","\) : "none"/,
  "account setup reminder payloads must carry a setup signature",
);

assert.match(
  email,
  /buildAccountSetupReminderPayload[\s\S]*setupSignature: buildAccountSetupReminderSignature\(target, missing\)/,
  "account setup reminder payload construction must be centralized",
);

assert.match(
  claimBatch,
  /recipientUserId: row\.recipientUserId \?\? null/,
  "email worker claims must carry recipientUserId for send-time reminder validation",
);

assert.match(
  suppressJob,
  /status: "suppressed"[\s\S]*failureReason: readString\(args\.reason\) \|\| "email_suppressed"/,
  "email worker must be able to suppress a claimed stale job without calling Resend",
);

assert.match(
  worker,
  /job\.templateKey === "account_setup_reminder"[\s\S]*loadAccountSetupReminderTargetInternal[\s\S]*target\.completed === true[\s\S]*account_setup_complete_before_send[\s\S]*continue;[\s\S]*refreshedPayload = buildAccountSetupReminderPayload\(target\)[\s\S]*payload = refreshedPayload[\s\S]*sendRenderedEmail/,
  "account setup reminders must re-check setup completion immediately before sending",
);

assert.match(
  worker,
  /previousSignature = readString\(asRecord\(job\.payload\)\.setupSignature\)[\s\S]*nextSignature = readString\(refreshedPayload\.setupSignature\)[\s\S]*refreshEmailJobPayloadInternal/,
  "account setup reminders must refresh stale queued payloads before sending",
);

assert.match(
  worker,
  /let suppressed = 0[\s\S]*suppressed \+= 1[\s\S]*suppressed,/,
  "email worker result must report send-time suppressions",
);

assert.doesNotMatch(
  reminderAction,
  /sendRenderedEmail|resend\.emails\.send/,
  "account setup reminder enqueue must not send directly",
);

assert.doesNotMatch(
  crons,
  /account_setup_reminder|enqueueAccountSetupReminderEmailInternal/,
  "first slice must not add an automated account setup reminder cron",
);

assert.match(
  packageJson,
  /"check:email-account-setup-reminder-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/email_account_setup_reminder_contract_proof\.ts"/,
  "package scripts must expose the account setup reminder proof",
);

console.log("email_account_setup_reminder_contract_proof: ok");
