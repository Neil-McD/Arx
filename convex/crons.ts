import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "process pending email outbox",
  { minutes: 5 },
  (internal as any).email.processPendingEmailOutboxInternal,
  {
    limit: 25,
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
// Proactive Member Coach: hourly bounded scan for quiet newcomers, stalled
// course learners, and quiet members (draft mode by default, auto per reason).
crons.interval("process due member coach scans", { minutes: 60 },
  (internal as any).communityMemberCoach.processDueMemberCoachScansInternal, {});
// Zero-AI weekly community digest emails: keeps quiet and Cold handed-off
// members in the loop with recent posts and lessons at $0 AI spend.
crons.interval("process due weekly community digests", { minutes: 30 },
  (internal as any).communityWeeklyDigestWorker.processDueCommunityWeeklyDigestsInternal, {});
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
// Refresh stale community billing summaries and backfill daily analytics rollups.
crons.interval("refresh community analytics rollups", { minutes: 15 },
  (internal as any).communityAnalyticsRollups.sweepCommunityAnalyticsRollupsInternal, {});
// Refresh pre-computed Discover activity stats for published communities in paginated batches.
crons.interval("refresh discover activity stats", { minutes: 15 },
  (internal as any).communityAnalyticsRollups.refreshDiscoverActivityStatsBatchInternal, {});
// Prune expired Sign in with Polynet one-time OAuth authorization codes.
crons.interval("prune expired connected app auth codes", { hours: 24 },
  (internal as any).connectedApps.pruneExpiredConnectedAppAuthCodesInternal, {});
export default crons;
