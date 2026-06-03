import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const schema = read("convex/schema.ts");
const crons = read("convex/crons.ts");
const reminders = read("convex/eventReminders.ts");
const recipients = read("convex/communityRecipientCore.ts");
const email = read("convex/email.ts");
const emailCore = read("convex/emailCore.ts");
const packageJson = read("package.json");

assert.match(
  schema,
  /communityEvents:[\s\S]*\.index\("by_status_startsAt", \["status", "startsAt"\]\)[\s\S]*\.index\("by_status_recurrenceFrequency_startsAt", \["status", "recurrenceFrequency", "startsAt"\]\)/,
  "event reminders need global live-event indexes for one-off and recurring scans",
);

assert.match(
  crons,
  /enqueue 24h event reminder emails[\s\S]*\{ minutes: 15 \}[\s\S]*eventReminders\.enqueueEventReminderEmailsInternal[\s\S]*lookaheadMs: 20 \* 60 \* 1000/,
  "event reminders should run on a narrow 15-minute cron with a 20-minute lookahead",
);

assert.match(
  reminders,
  /const DAY_MS = 24 \* 60 \* 60 \* 1000/,
  "event reminders must be 24-hour reminders",
);

assert.match(
  reminders,
  /const windowStart = nowMs \+ DAY_MS;[\s\S]*const windowEnd = windowStart \+ lookaheadMs/,
  "event reminders must look 24 hours ahead, not immediately before start time",
);

assert.match(
  reminders,
  /withIndex\("by_status_startsAt"[\s\S]*eq\("status", "live"\)[\s\S]*gte\("startsAt", windowStart\)[\s\S]*lte\("startsAt", windowEnd\)/,
  "one-off event reminders must target live events in the 24-hour window",
);

assert.match(
  reminders,
  /for \(const frequency of \["daily", "weekly", "monthly"\] as const\)[\s\S]*withIndex\("by_status_recurrenceFrequency_startsAt"[\s\S]*getEventOccurrenceStartsInWindow/,
  "event reminders must consider recurring event occurrences",
);

assert.match(
  reminders,
  /getCommunityEventOccurrenceStartsInRange[\s\S]*timeZone: row\.timezone/,
  "event reminders must use the same timezone-aware recurrence expansion as the Events tab",
);

assert.match(
  reminders,
  /listActiveCommunityRecipientUserIds\(ctx, \{[\s\S]*communityOwnerId: community\.ownerId[\s\S]*limit: limitRecipientsPerEvent/,
  "event reminders must use the canonical active community recipient policy",
);

assert.match(
  recipients,
  /settings\?\.muted === true[\s\S]*settings\.mutedUntil > params\.nowMs[\s\S]*membership\.active === false \|\| typeof membership\.revokedAt === "number"/,
  "active community recipient policy must suppress muted and revoked users",
);

assert.match(
  reminders,
  /kind: "event_reminder_24h"[\s\S]*templateKey: "event_reminder"[\s\S]*dedupeKey: `event_reminder_24h:\$\{batch\.eventId\}:\$\{batch\.occurrenceStartsAt\}:\$\{String\(userId\)\}`/,
  "event reminder emails must be idempotent per event occurrence and user",
);

assert.match(
  email,
  /templateKey === "event_reminder"[\s\S]*preferences\.eventReminderEnabled !== false/,
  "event reminder emails must respect event reminder email preferences",
);

assert.match(
  emailCore,
  /case "event_reminder"[\s\S]*is happening tomorrow/,
  "event reminder template must stay explicitly 24-hour oriented",
);

assert.doesNotMatch(
  reminders,
  /15\s*\*\s*60\s*\*\s*1000|starting soon/i,
  "do not add 15-minute reminder behavior to the event reminder worker",
);

assert.match(
  packageJson,
  /"check:event-reminder-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/event_reminder_contract_proof\.ts"/,
  "package scripts must expose the event reminder contract proof",
);

console.log("event_reminder_contract_proof: ok");
