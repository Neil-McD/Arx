import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN,
  COMMUNITY_WEEKLY_DIGEST_MAX_ITEMS,
  COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_COMMUNITY_BATCH,
  COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_RUN,
} from "../shared/communityWeeklyDigestSchedule.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const worker = read("convex/communityWeeklyDigestWorker.ts");
const channels = read("convex/communityChannelCore.ts");
const schedule = read("convex/communityWeeklyDigestSchedule.ts");
const email = read("convex/email.ts");
const crons = read("convex/crons.ts");
const contract = read("docs/platform-cost-safety-contract-v1.md");

assert.equal(COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN, 5);
assert.equal(COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_COMMUNITY_BATCH, 50);
assert.equal(COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_RUN, 100);
assert.equal(COMMUNITY_WEEKLY_DIGEST_MAX_ITEMS, 8);
assert.doesNotMatch(
  worker,
  /\.collect\(\)/,
  "the digest worker must never collect an entire table or community collection",
);
assert.match(
  worker,
  /claimDueCommunityWeeklyDigestSchedulesInternal[\s\S]*\{ limit: 1, nowMs \}/,
  "the worker must claim only the schedule it can immediately process",
);
assert.match(
  worker,
  /listSharedChannelReadableRows\(\{[\s\S]*tableName: "communityInteractionRoots"[\s\S]*limit: COMMUNITY_WEEKLY_DIGEST_MAX_INTERACTIONS_SCANNED[\s\S]*beforeCreatedAt: params.periodEndExclusiveMs/,
  "digest roots must use the bounded shared-audience reader",
);
assert.match(
  worker,
  /listSharedChannelReadableRows\(\{[\s\S]*tableName: "communityInteractionReplies"[\s\S]*limit: COMMUNITY_WEEKLY_DIGEST_MAX_INTERACTIONS_SCANNED[\s\S]*beforeCreatedAt: params.periodEndExclusiveMs/,
  "digest replies must use the bounded shared-audience reader",
);
assert.match(
  channels,
  /by_community_access_status_position[\s\S]*eq\("accessMode", "all_members"\)[\s\S]*\.take\(/,
  "shared audience must be selected by index before applying the channel limit",
);
assert.doesNotMatch(
  worker,
  /communityChatMessages|communityChatThreads/,
  "the retired community chat persistence model must not return",
);
assert.match(
  worker,
  /communityResources[\s\S]*by_community_createdAt[\s\S]*COMMUNITY_WEEKLY_DIGEST_MAX_RESOURCES_SCANNED/,
  "resource discovery must use the bounded canonical resource index",
);
assert.match(
  worker,
  /communityMemberships[\s\S]*by_community_createdAt[\s\S]*\.paginate\(/,
  "recipient fanout must page the canonical membership index",
);
assert.match(
  worker,
  /COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_RUN - recipients[\s\S]*COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_COMMUNITY_BATCH/,
  "global and per-community recipient ceilings must be enforced inside the worker",
);
assert.match(
  worker,
  /enqueueEmailJobInternal[\s\S]*buildCommunityWeeklyDigestDedupeKey/,
  "the worker must enqueue only through the canonical deduplicated outbox",
);
assert.match(
  schedule,
  /digestSnapshot[\s\S]*outcome === "continue"[\s\S]*recipientCursor[\s\S]*digestSnapshot/,
  "continuations must persist one bounded digest snapshot with the recipient cursor",
);
assert.match(
  worker,
  /digestSnapshot: v\.optional\(communityWeeklyDigestSnapshotValidator\)/,
  "worker continuation input must reject untyped digest snapshots",
);
assert.match(
  email,
  /\["pending", "sending", "sent", "failed", "suppressed"\]\.includes\(existing\.status\)/,
  "all terminal and non-terminal outbox rows must close the idempotency key",
);
assert.doesNotMatch(
  crons,
  /processDueCommunityWeeklyDigestsInternal|communityWeeklyDigestWorker/,
  "the proven worker must remain dormant until explicit activation",
);
assert.match(
  contract,
  /Lifecycle enrollment is wired atomically[\s\S]*bounded worker remains\s+dormant because no digest cron is active/,
  "the cost contract must distinguish a proven worker from activation",
);

console.log("community weekly digest worker contract proof passed");
