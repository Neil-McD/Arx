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
  "reconcile daytona orphan sandboxes",
  { minutes: 15 },
  internal.daytonaOrphanReconciler.reconcileDaytonaOrphanedSandboxesInternal,
  {},
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

export default crons;
