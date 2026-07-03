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

crons.daily(
  "enqueue weekly community digests",
  {
    hourUTC: 13,
    minuteUTC: 0,
  },
  (internal as any).emailDigests.enqueueWeeklyCommunityDigestsInternal,
  {
    limitCommunities: 50,
    limitRecipientsPerCommunity: 500,
  },
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
  "reconcile stale runtime workspace runs",
  { minutes: 5 },
  (internal as any).workspaceCredits.reconcileStaleRuntimeWorkspaceRunsInternal,
  {
    limit: 100,
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
  "reconcile expired credit reservations",
  { minutes: 15 },
  (internal as any).workspaceCredits.reconcileExpiredCreditReservationsInternal,
  {
    limit: 100,
  },
);

crons.interval(
  "retry pending credit settlements",
  { minutes: 15 },
  (internal as any).workspaceCredits.retryPendingCreditSettlementsInternal,
  {
    limit: 50,
  },
);

crons.interval(
  "collect workspace usage by card",
  { minutes: 15 },
  (internal as any).workspaceCredits.collectWorkspaceUsageByCardInternal,
  {
    limit: 10,
  },
);

crons.interval(
  "execute workspace auto recharge",
  { minutes: 15 },
  (internal as any).workspaceAutoRecharge.sweepWorkspaceAutoRechargeExecutionsInternal,
  {
    limit: 20,
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

crons.interval(
  "expire stale tool balance checkouts",
  { minutes: 15 },
  (internal as any).workspaceCredits.expireStaleWorkspaceCreditTopupCheckoutSessionsInternal,
  {
    limit: 100,
  },
);

crons.daily(
  "advance builder partner commissions to payable",
  {
    hourUTC: 6,
    minuteUTC: 0,
  },
  (internal as any).builderPartners.advancePartnerCommissionsToPayableInternal,
  {
    limit: 250,
  },
);

crons.monthly(
  "create builder partner payout cycle",
  {
    day: 1,
    hourUTC: 7,
    minuteUTC: 0,
  },
  (internal as any).builderPartners.createPartnerPayoutCycleInternal,
  {
    limit: 250,
  },
);

crons.monthly(
  "prune low-signal community ai feed posts",
  {
    day: 1,
    hourUTC: 4,
    minuteUTC: 0,
  },
  internal.communityAiFeed.pruneAllCommunityAiFeedPostsInternal,
  {},
);

crons.daily(
  "delete expired hidden community ai feed posts",
  {
    hourUTC: 5,
    minuteUTC: 0,
  },
  internal.communityAiFeed.deleteExpiredHiddenCommunityAiFeedPostsInternal,
  {},
);

// Ignition (contract Amendment v1.1): every 6 hours, refresh each community's
// compiler digest (free, deterministic) and knock for a memory cycle. The
// knock is triple-gated — owner off-switch, 2-cycles/day cap, and a delta
// check so unchanged signal never re-wakes the roles — and the heartbeat's
// evidence gate has the final word. Founder-funded; no owner connection, no
// cycle.
crons.interval(
  "community memory sweep",
  { hours: 6 },
  (internal as any).communityAgentHeartbeat.runCommunityMemorySweepInternal,
  { limitCommunities: 500 },
);

// Concierge repair drain: fresh community-agent mentions are born into
// asker-funded serve requests during the chat write. This deterministic,
// token-free cron only repairs leftover pending mentions.
crons.interval(
  "process pending community agent mentions",
  { minutes: 5 },
  (internal as any).communityAgentConcierge.consumePendingCommunityAgentMentionsInternal,
  { limit: 25 },
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
