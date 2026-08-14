import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN,
  COMMUNITY_WEEKLY_DIGEST_MAX_ITEMS,
  COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_COMMUNITY_BATCH,
  COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_RUN,
  nextCommunityWeeklyDigestAt,
} from "../shared/communityWeeklyDigestSchedule.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const schema = read("convex/schema.ts");
const schedule = read("convex/communityWeeklyDigestSchedule.ts");
const worker = read("convex/communityWeeklyDigestWorker.ts");
const crons = read("convex/crons.ts");
const contract = read("docs/platform-cost-safety-contract-v1.md");
const agentContract = read("AGENTS.md");
const snapshotValidators = read("convex/communityWeeklyDigestValidators.ts");
const communityLifecycle = read("convex/communityLifecycle.ts");
const communityColdArchive = read("convex/communityColdArchive.ts");
const founderBilling = read("convex/founderBilling.ts");

assert.equal(COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN, 5);
assert.equal(COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_COMMUNITY_BATCH, 50);
assert.equal(COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_RUN, 100);
assert.equal(COMMUNITY_WEEKLY_DIGEST_MAX_ITEMS, 8);
assert.ok(
  COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_COMMUNITY_BATCH <=
    COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_RUN,
  "one community batch must not exceed the global run ceiling",
);

const firstDueAt = nextCommunityWeeklyDigestAt("community-a", 1_000);
const secondDueAt = nextCommunityWeeklyDigestAt("community-a", firstDueAt);
assert.ok(firstDueAt > 1_000, "the initial due time must be in the future");
assert.equal(
  secondDueAt - firstDueAt,
  7 * 24 * 60 * 60 * 1000,
  "a community must retain one stable weekly cadence",
);

assert.match(
  schema,
  /communityWeeklyDigestSchedules: defineTable\([\s\S]*by_community[\s\S]*by_status_nextAttemptAt[\s\S]*by_status_leaseExpiresAt/,
  "weekly digest control state must have one community index and bounded due/lease indexes",
);
assert.match(
  snapshotValidators,
  /communityWeeklyDigestSnapshotValidator = v\.object/,
  "digest continuation state must have one explicit snapshot validator",
);
assert.match(
  schema,
  /digestSnapshot: v\.optional\(communityWeeklyDigestSnapshotValidator\)/,
  "the schedule table must enforce the canonical snapshot shape",
);
assert.match(
  schedule,
  /COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN[\s\S]*\.take\(limit\)[\s\S]*\.take\(limit\)/,
  "due and expired-lease discovery must share the hard community ceiling",
);
assert.match(
  schedule,
  /communityLifecycleGenerationMatches[\s\S]*status: "paused"/,
  "lifecycle drift must pause digest work",
);
assert.match(
  schedule,
  /syncCommunityWeeklyDigestScheduleForCommunity[\s\S]*if \(!community \|\| !communityIsActive\(community\)\)[\s\S]*status: "paused"[\s\S]*status: "community_inactive"/,
  "one lifecycle sync authority must pause inactive communities",
);
assert.match(
  schedule,
  /syncCommunityWeeklyDigestScheduleForCommunity[\s\S]*communityLifecycleGeneration: lifecycle\.generation[\s\S]*status: "scheduled"[\s\S]*nextCommunityWeeklyDigestAt/,
  "the lifecycle sync authority must schedule active communities",
);
assert.match(
  schedule,
  /ensureCommunityWeeklyDigestScheduleInternal[\s\S]*handler: syncCommunityWeeklyDigestScheduleForCommunity/,
  "manual enrollment must delegate to the same lifecycle sync authority",
);
assert.match(
  communityLifecycle,
  /insert\("communities"[\s\S]*syncCommunityWeeklyDigestScheduleForCommunity\(ctx, \{[\s\S]*communityId,[\s\S]*nowMs/,
  "community creation must enroll its digest schedule in the creation transaction",
);
assert.match(
  communityColdArchive,
  /archiveCommunity = mutation[\s\S]*syncCommunityWeeklyDigestScheduleForCommunity\(ctx, \{[\s\S]*communityId: args\.communityId,[\s\S]*nowMs/,
  "community archive must pause its digest schedule in the archive transaction",
);
assert.match(
  communityColdArchive,
  /restoreCommunityWithoutPaymentHandler[\s\S]*syncCommunityWeeklyDigestScheduleForCommunity\(ctx, \{[\s\S]*communityId: args\.communityId,[\s\S]*nowMs/,
  "grandfathered and operator restore must reschedule through the canonical lifecycle sync",
);
assert.match(
  founderBilling,
  /restoresArchivedCommunity[\s\S]*syncCommunityWeeklyDigestScheduleForCommunity\(args\.ctx, \{[\s\S]*communityId,[\s\S]*nowMs: args\.providerEventCreatedAt/,
  "verified paid restore must reschedule through the canonical lifecycle sync",
);
assert.match(
  schedule,
  /row\.leaseToken !== args\.leaseToken[\s\S]*status: "stale_lease"/,
  "settlement must reject stale or overlapping workers",
);
assert.match(
  schedule,
  /outcome === "continue"[\s\S]*recipientCursor[\s\S]*COMMUNITY_WEEKLY_DIGEST_CONTINUATION_DELAY_MS/,
  "recipient overflow must checkpoint a continuation",
);
assert.doesNotMatch(
  crons,
  /weekly community digest|communityWeeklyDigestSchedule/,
  "the cron must remain disabled during the schedule-foundation slice",
);
assert.match(
  contract,
  /protected MVP engagement requirement[\s\S]*lifecycle enrollment is wired[\s\S]*no digest cron is active/i,
  "the contract must distinguish lifecycle enrollment from worker activation",
);
assert.match(
  worker,
  /processDueCommunityWeeklyDigestsInternal[\s\S]*claimDueCommunityWeeklyDigestSchedulesInternal/,
  "the schedule must have exactly one bounded worker consumer",
);
assert.match(
  agentContract,
  /Weekly community digest email automation with indexed due-work, bounded[\s\S]*fanout, recipient preferences, and idempotent delivery/,
  "the MVP execution contract must protect the weekly community digest",
);

console.log("community weekly digest schedule contract proof passed");
