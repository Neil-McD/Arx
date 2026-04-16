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
  "reconcile daytona orphan sandboxes",
  { minutes: 15 },
  internal.daytonaOrphanReconciler.reconcileDaytonaOrphanedSandboxesInternal,
  {},
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
