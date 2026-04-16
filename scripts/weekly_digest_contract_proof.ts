import assert from "node:assert/strict";

import {
  buildWeeklyDigestDedupeKey,
  buildWeeklyDigestPeriod,
  capWeeklyDigestItems,
  formatWeeklyDigestStats,
  shouldSendWeeklyDigest,
  stableWeeklyDigestDay,
  utcDayKey,
} from "../shared/weeklyDigestCore.ts";

function proveStableCommunitySchedule() {
  const communityId = "community_alpha";
  const first = stableWeeklyDigestDay(communityId);
  const second = stableWeeklyDigestDay(communityId);
  assert.equal(first, second);
  assert.ok(first >= 0 && first <= 6);
  assert.notEqual(
    stableWeeklyDigestDay("community_alpha"),
    stableWeeklyDigestDay("community_beta"),
    "different communities should normally stagger across different digest days",
  );
  console.log("PASS: weekly digest day is deterministic and bounded");
}

function provePeriodKeys() {
  const nowMs = Date.UTC(2026, 3, 15, 13, 0, 0);
  const period = buildWeeklyDigestPeriod(nowMs, 7);
  assert.equal(period.periodEndMs, nowMs);
  assert.equal(period.periodEndDay, "2026-04-15");
  assert.equal(period.periodStartDay, "2026-04-08");
  assert.equal(utcDayKey(period.periodStartMs), period.periodStartDay);
  console.log("PASS: weekly digest period uses stable UTC day keys");
}

function proveDedupeKey() {
  const key = buildWeeklyDigestDedupeKey({
    communityId: "com_123",
    userId: "usr_456",
    periodStartDay: "2026-04-08",
    periodEndDay: "2026-04-15",
  });
  assert.equal(key, "weekly_member_digest:com_123:usr_456:2026-04-08:2026-04-15");
  console.log("PASS: weekly digest dedupe key is period scoped");
}

function proveActivityThresholds() {
  assert.equal(
    shouldSendWeeklyDigest({
      chatMessageCount: 0,
      aiFeedPostCount: 0,
      resourceCount: 0,
      archiveDocumentCount: 0,
      newMemberCount: 0,
    }),
    false,
  );
  assert.equal(
    shouldSendWeeklyDigest({
      chatMessageCount: 0,
      aiFeedPostCount: 0,
      resourceCount: 0,
      archiveDocumentCount: 1,
      newMemberCount: 0,
    }),
    true,
    "collective intelligence artifacts should trigger the digest",
  );
  assert.equal(
    shouldSendWeeklyDigest({
      chatMessageCount: 2,
      aiFeedPostCount: 0,
      resourceCount: 0,
      archiveDocumentCount: 0,
      newMemberCount: 1,
    }),
    false,
    "low chat/member noise should not trigger the digest",
  );
  console.log("PASS: weekly digest activity threshold matches MVP shape");
}

function proveStatsAndCaps() {
  assert.equal(
    formatWeeklyDigestStats({
      chatMessageCount: 3,
      aiFeedPostCount: 1,
      resourceCount: 2,
      archiveDocumentCount: 4,
      newMemberCount: 1,
    }),
    "3 messages • 1 AI signal • 2 resources • 4 knowledge artifacts • 1 new member",
  );
  assert.deepEqual(capWeeklyDigestItems([1, 2, 3, 4], 2), [1, 2]);
  assert.equal(capWeeklyDigestItems(Array.from({ length: 30 }, (_, index) => index), 100).length, 20);
  console.log("PASS: weekly digest stats and item caps are stable");
}

proveStableCommunitySchedule();
provePeriodKeys();
proveDedupeKey();
proveActivityThresholds();
proveStatsAndCaps();

console.log("PASS: weekly digest contract proof complete");
