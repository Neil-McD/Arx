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

crons.interval(
  "finalize expired blaxel project workspace leases",
  { minutes: 15 },
  (internal as any).blaxelWorkspaceWake.finalizeExpiredBlaxelProjectWorkspaceLeasesInternal,
  {
    limit: 100,
  },
);

crons.interval(
  "record blaxel storage provider costs",
  { minutes: 60 },
  (internal as any).workspaceCredits.recordBlaxelStorageProviderCostsInternal,
  {
    pageSize: 100,
    maxPages: 5,
  },
);

crons.interval(
  "sweep expired daytona codex runtime targets",
  { minutes: 5 },
  (internal as any).daytonaCodexRuntimeTargetActions
    .sweepExpiredDaytonaCodexRuntimeTargetsInternal,
  {
    limit: 20,
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

export default crons;
