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
  {
    lookaheadMs: 20 * 60 * 1000,
    limitEvents: 500,
    limitRecipientsPerEvent: 500,
  },
);

// Ignition (contract Amendment v1.1): every 6 hours, refresh each community's
// compiler digest (free, deterministic) and knock for a memory cycle. The
// knock is triple-gated — owner off-switch, 2-cycles/day cap, and a delta
// check so unchanged signal never re-wakes the roles — and the heartbeat's
// evidence gate has the final word. The canonical runtime admits founder
// funding before any model call; the scheduler never guesses from credentials.
crons.interval(
  "community memory sweep",
  { hours: 6 },
  (internal as any).communityAgentHeartbeat.runCommunityMemorySweepInternal,
  { limitCommunities: 500 },
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
crons.interval("run workflow date triggers", { minutes: 15 },
  internal.communityMemberWorkflows.processDuePropertyDateTriggersInternal, {});

// Access integrations: retry access webhooks whose schedule was missed, end
// owner grants whose end job did not run, and walk members once a day so a
// missed write still reaches the outside service.
crons.interval("recover access webhook deliveries", { minutes: 5 },
  (internal as any).communityAccess.recoverDueAccessEventsInternal, { limit: 25 });
crons.interval("sweep community access", { minutes: 15 },
  (internal as any).communityAccess.sweepCommunityAccessInternal, {});

// The founder's daily brief: due when the founder's local hour arrives.
crons.interval("send due founder briefs", { minutes: 15 },
  (internal as any).communityFounderBrief.processDueFounderBriefsInternal, {});
export default crons;
