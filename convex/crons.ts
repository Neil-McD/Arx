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

// Paid pods (docs/specs/pods-v0.md): stop billing anyone who can no longer
// reach their pod (left the community, taken off the pod, or the pod closed).
crons.interval(
  "stop billing for unreachable pods",
  { minutes: 60 },
  (internal as any).communityPodPayments.sweepUnreachablePodPaymentsInternal,
  {},
);

// Mention email pings: mentions still "pending" after the in-app grace window
// get one email each, preference-gated and deduped per mention.
crons.interval(
  "process pending mention emails",
  { minutes: 15 },
  (internal as any).communityMentionEmails.processPendingMentionEmailsInternal,
  {},
);


// The founder's daily brief: due when the founder's local hour arrives.
crons.interval("send due founder briefs", { minutes: 15 },
  (internal as any).communityFounderBrief.processDueFounderBriefsInternal, {});
// The guide's memory reviews schedule themselves per community; this only
// re-schedules one whose job was lost (convex/agentWork.ts).
crons.interval("repair lost memory reviews", { hours: 24 },
  (internal as any).agentWork.repairAgentWorkScheduleInternal, {});
// Backfill legacy communities into the per-community member search index
// independently of member administration actions (no-op once all are indexed).
crons.interval("backfill community member search index", { minutes: 15 },
  (internal as any).communityMemberSearch.sweepUnindexedCommunityMemberSearchInternal, {});
// Backfill pre-existing courses into the per-student course progress projection.
crons.interval("backfill course progress projections", { minutes: 15 },
  (internal as any).communityLessonProgress.sweepUnindexedCourseProgressInternal, {});
// Refresh stale pre-computed member view counts and seed large communities (500+).
crons.interval("refresh community member view counts", { minutes: 15 },
  (internal as any).communityMemberRecords.sweepStaleMemberViewCountsInternal, {});
export default crons;
