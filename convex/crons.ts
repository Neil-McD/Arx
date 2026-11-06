import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "process pending email outbox",
  { minutes: 5 },
  (internal as any).email.processPendingEmailOutboxInternal,
  {
    limit: 10,
  },
);

crons.interval(
  "recover distribution attribution deliveries",
  { minutes: 5 },
  (internal as any).distributionAttribution.recoverDueDeliveriesInternal,
  { limit: 25 },
);

crons.interval(
  "recover archived community billing cleanup",
  { minutes: 5 },
  (internal as any).communityColdArchive
    .scheduleDueCommunityArchiveBillingJobsInternal,
  { limit: 3 },
);

crons.interval(
  "enqueue 24h event reminder emails",
  { minutes: 15 },
  (internal as any).eventReminders.enqueueEventReminderEmailsInternal,
  // Every member, in batches; the job's own event limit (logged if hit).
  { lookaheadMs: 20 * 60 * 1000 },
);

// Mention email pings: mentions still "pending" after the in-app grace window
// get one email each, preference-gated and deduped per mention.
crons.interval(
  "process pending mention emails",
  { minutes: 15 },
  (internal as any).communityMentionEmails.processPendingMentionEmailsInternal,
  {},
);

crons.interval("advance due workflow milestones", { minutes: 1 },
  internal.communityMemberWorkflows.processDueMilestoneTimersInternal, {});

// The founder's daily brief: due when the founder's local hour arrives.
crons.interval("send due founder briefs", { minutes: 15 },
  (internal as any).communityFounderBrief.processDueFounderBriefsInternal, {});
export default crons;
