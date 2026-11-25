/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import { renderEmailTemplate } from "./emailCore";
import schema from "./schema";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const ORIGINAL_PUBLIC_APP_URL = process.env.PUBLIC_APP_URL;

beforeEach(() => {
  process.env.PUBLIC_APP_URL = "https://www.polynet.ai";
});

afterEach(() => {
  if (ORIGINAL_PUBLIC_APP_URL === undefined) {
    delete process.env.PUBLIC_APP_URL;
  } else {
    process.env.PUBLIC_APP_URL = ORIGINAL_PUBLIC_APP_URL;
  }
});

async function seedCommunityWithMembers(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", {
      authSubject: "owner_subj",
      displayName: "Neil",
      email: "owner@example.com",
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const memberAId = await ctx.db.insert("users", {
      authSubject: "member_a_subj",
      displayName: "Alice",
      email: "alice@example.com",
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const memberOptOutId = await ctx.db.insert("users", {
      authSubject: "member_optout_subj",
      displayName: "Bob",
      email: "bob@example.com",
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "builders-club",
      name: "Builders Club",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 3,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberAId,
      role: "member",
      state: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberOptOutId,
      role: "member",
      state: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("emailPreferences", {
      userId: memberOptOutId,
      weeklyDigestEnabled: true,
      eventReminderEnabled: false,
      mentionEmailsEnabled: true,
      dmEmailsEnabled: true,
      founderAdminEmailsEnabled: true,
      createdAt: now,
      updatedAt: now,
    });
    return { ownerId, memberAId, memberOptOutId, communityId, now };
  });
}

test("cancelling one date of a weekly community event marks only that date cancelled, skips its 24h reminder, and can be restored", async () => {
  const t = convexTest(schema, modules);
  const { ownerId, communityId, now } = await seedCommunityWithMembers(t);
  const firstStart = now + 2 * DAY_MS;
  const secondStart = firstStart + WEEK_MS;
  const eventId = await t.run(async (ctx) =>
    ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      title: "Weekly Office Hours",
      startsAt: firstStart,
      endsAt: firstStart + 60 * 60 * 1000,
      timezone: "UTC",
      locationType: "online",
      visibility: "members",
      status: "live",
      recurrenceFrequency: "weekly",
      recurrenceInterval: 1,
      createdAt: now,
      updatedAt: now,
    }),
  );

  const owner = t.withIdentity({ subject: "owner_subj" });

  // Invalid date that isn't part of the weekly recurrence fails closed.
  await expect(
    owner.mutation(api.communityEvents.cancelCommunityEvent, {
      authSubject: "owner_subj",
      eventId: String(eventId),
      scope: "occurrence",
      occurrenceStartsAtIso: new Date(firstStart + DAY_MS).toISOString(),
    }),
  ).rejects.toThrow("community_event_occurrence_not_found");

  // Cancel just this week's date with a note.
  const firstCancel = await owner.mutation(api.communityEvents.cancelCommunityEvent, {
    authSubject: "owner_subj",
    eventId: String(eventId),
    scope: "occurrence",
    occurrenceStartsAtIso: new Date(firstStart).toISOString(),
    note: "Travelling this week — see you next week!",
  });
  expect(firstCancel).toEqual({ ok: true, alreadyCancelled: false });

  // Repeat cancel of the same date is idempotent.
  const repeatCancel = await owner.mutation(api.communityEvents.cancelCommunityEvent, {
    authSubject: "owner_subj",
    eventId: String(eventId),
    scope: "occurrence",
    occurrenceStartsAtIso: new Date(firstStart).toISOString(),
    note: "Duplicate call",
  });
  expect(repeatCancel).toEqual({ ok: true, alreadyCancelled: true });

  // With includeCancelled: false, only next week's live date appears.
  const liveOnly = await owner.query(api.communityEvents.listCommunityEvents, {
    authSubject: "owner_subj",
    communityId,
    startIso: new Date(now).toISOString(),
    endIso: new Date(secondStart + DAY_MS).toISOString(),
    includeCancelled: false,
  });
  expect(liveOnly.map((row: any) => row.starts_at)).toEqual([new Date(secondStart).toISOString()]);
  expect(liveOnly[0].status).toBe("live");

  // With includeCancelled: true, this week shows cancelled with scope + note, and next week is live.
  const withCancelled = await owner.query(api.communityEvents.listCommunityEvents, {
    authSubject: "owner_subj",
    communityId,
    startIso: new Date(now).toISOString(),
    endIso: new Date(secondStart + DAY_MS).toISOString(),
    includeCancelled: true,
  });
  expect(withCancelled).toHaveLength(2);
  expect(withCancelled[0]).toMatchObject({
    starts_at: new Date(firstStart).toISOString(),
    status: "cancelled",
    cancellation_scope: "occurrence",
    cancellation_note: "Travelling this week — see you next week!",
  });
  expect(withCancelled[1]).toMatchObject({
    starts_at: new Date(secondStart).toISOString(),
    status: "live",
    cancellation_scope: null,
    cancellation_note: null,
  });

  // 24h reminder batching skips the cancelled week and still reminds next week.
  const cancelledWeekReminders = await t.query(
    internal.eventReminders.buildEventReminderBatchesInternal,
    { nowMs: firstStart - DAY_MS - 5 * 60 * 1000, lookaheadMs: 20 * 60 * 1000 },
  );
  expect(cancelledWeekReminders).toHaveLength(0);

  const liveNextWeekReminders = await t.query(
    internal.eventReminders.buildEventReminderBatchesInternal,
    { nowMs: secondStart - DAY_MS - 5 * 60 * 1000, lookaheadMs: 20 * 60 * 1000 },
  );
  expect(liveNextWeekReminders).toHaveLength(1);

  // Restoring just that single date brings it back to live and re-enables its 24h reminder.
  await owner.mutation(api.communityEvents.restoreCommunityEvent, {
    authSubject: "owner_subj",
    eventId: String(eventId),
    occurrenceStartsAtIso: new Date(firstStart).toISOString(),
  });
  const afterRestore = await owner.query(api.communityEvents.listCommunityEvents, {
    authSubject: "owner_subj",
    communityId,
    startIso: new Date(now).toISOString(),
    endIso: new Date(secondStart + DAY_MS).toISOString(),
    includeCancelled: true,
  });
  expect(afterRestore.every((row: any) => row.status === "live")).toBe(true);
  const restoredReminders = await t.query(
    internal.eventReminders.buildEventReminderBatchesInternal,
    { nowMs: firstStart - DAY_MS - 5 * 60 * 1000, lookaheadMs: 20 * 60 * 1000 },
  );
  expect(restoredReminders).toHaveLength(1);
});

test("cancelling a whole series marks it cancelled with note and restoring brings the series back", async () => {
  const t = convexTest(schema, modules);
  const { ownerId, communityId, now } = await seedCommunityWithMembers(t);
  const firstStart = now + 2 * DAY_MS;
  const eventId = await t.run(async (ctx) =>
    ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      title: "Monthly Demo Day",
      startsAt: firstStart,
      timezone: "UTC",
      locationType: "online",
      visibility: "members",
      status: "live",
      recurrenceFrequency: "none",
      recurrenceInterval: 1,
      createdAt: now,
      updatedAt: now,
    }),
  );

  const owner = t.withIdentity({ subject: "owner_subj" });
  const result = await owner.mutation(api.communityEvents.cancelCommunityEvent, {
    authSubject: "owner_subj",
    eventId: String(eventId),
    scope: "series",
    note: "Moving to next month.",
  });
  expect(result).toEqual({ ok: true, alreadyCancelled: false });

  const duplicate = await owner.mutation(api.communityEvents.cancelCommunityEvent, {
    authSubject: "owner_subj",
    eventId: String(eventId),
    scope: "series",
  });
  expect(duplicate).toEqual({ ok: true, alreadyCancelled: true });

  const listed = await owner.query(api.communityEvents.listCommunityEvents, {
    authSubject: "owner_subj",
    communityId,
    startIso: new Date(now).toISOString(),
    endIso: new Date(firstStart + DAY_MS).toISOString(),
    includeCancelled: true,
  });
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({
    status: "cancelled",
    cancellation_scope: "series",
    cancellation_note: "Moving to next month.",
  });

  await owner.mutation(api.communityEvents.restoreCommunityEvent, {
    authSubject: "owner_subj",
    eventId: String(eventId),
  });
  const restored = await owner.query(api.communityEvents.listCommunityEvents, {
    authSubject: "owner_subj",
    communityId,
    startIso: new Date(now).toISOString(),
    endIso: new Date(firstStart + DAY_MS).toISOString(),
    includeCancelled: false,
  });
  expect(restored).toHaveLength(1);
  expect(restored[0]).toMatchObject({
    status: "live",
    cancellation_scope: null,
    cancellation_note: null,
  });
});

test("automatic event cancellation email enqueues for opted-in active members, respects opt-outs, deduplicates retries, and skips past events and pod calls", async () => {
  const t = convexTest(schema, modules);
  const { ownerId, memberAId, memberOptOutId, communityId, now } = await seedCommunityWithMembers(t);
  const futureStart = now + 2 * DAY_MS;
  const pastStart = now - 2 * DAY_MS;

  const { liveEventId, pastEventId, podEventId } = await t.run(async (ctx) => {
    const liveEventId = await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      title: "Founder Q&A",
      startsAt: futureStart,
      timezone: "UTC",
      locationType: "online",
      visibility: "members",
      status: "live",
      recurrenceFrequency: "weekly",
      recurrenceInterval: 1,
      createdAt: now,
      updatedAt: now,
    });
    const pastEventId = await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      title: "Old Call",
      startsAt: pastStart,
      timezone: "UTC",
      locationType: "online",
      visibility: "members",
      status: "cancelled",
      createdAt: now,
      updatedAt: now,
    });
    const podChannelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "vip-pod",
      name: "VIP Pod",
      accessMode: "restricted",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdAt: now,
      updatedAt: now,
    });
    const podEventId = await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      podChannelId,
      title: "Pod Standup",
      startsAt: futureStart,
      timezone: "UTC",
      locationType: "online",
      visibility: "members",
      status: "cancelled",
      createdAt: now,
      updatedAt: now,
    });
    return { liveEventId, pastEventId, podEventId };
  });

  // Upcoming community-wide event enqueues emails for owner + memberA, suppressing opted-out memberOptOut.
  const firstRun = await t.action(internal.eventReminders.enqueueEventCancellationEmailsInternal, {
    eventId: liveEventId,
    scope: "occurrence",
    occurrenceStartsAt: futureStart,
    cancelledAt: now,
    note: "Out sick today — see you next week.",
    nowMs: now,
  });
  expect(firstRun).toMatchObject({ enqueued: 2, suppressed: 1, deduped: 0 });

  const jobs = await t.run(async (ctx) => ctx.db.query("emailOutbox").collect());
  const pendingJobs = jobs.filter((job) => job.status === "pending");
  const suppressedJobs = jobs.filter((job) => job.status === "suppressed");
  expect(pendingJobs).toHaveLength(2);
  expect(suppressedJobs).toHaveLength(1);
  expect(pendingJobs.every((job) => job.templateKey === "event_cancelled")).toBe(true);
  expect(pendingJobs.map((job) => String(job.recipientUserId)).sort()).toEqual(
    [String(ownerId), String(memberAId)].sort(),
  );
  expect(String(suppressedJobs[0].recipientUserId)).toBe(String(memberOptOutId));

  // Verify the rendered email includes title, single-date wording, and the host note.
  const rendered = renderEmailTemplate({
    templateKey: "event_cancelled",
    payload: pendingJobs[0].payload,
  });
  expect(rendered.subject).toContain("Cancelled: Founder Q&A");
  expect(rendered.text).toContain("Future sessions remain on the calendar.");
  expect(rendered.text).toContain("Out sick today — see you next week.");

  // Re-running with the same cancelledAt deduplicates cleanly with zero new jobs.
  const duplicateRun = await t.action(internal.eventReminders.enqueueEventCancellationEmailsInternal, {
    eventId: liveEventId,
    scope: "occurrence",
    occurrenceStartsAt: futureStart,
    cancelledAt: now,
    note: "Out sick today — see you next week.",
    nowMs: now,
  });
  expect(duplicateRun).toMatchObject({ enqueued: 0, deduped: 3, suppressed: 0 });

  // Past event does not enqueue any emails.
  const pastRun = await t.action(internal.eventReminders.enqueueEventCancellationEmailsInternal, {
    eventId: pastEventId,
    scope: "series",
    occurrenceStartsAt: pastStart,
    cancelledAt: now,
    nowMs: now,
  });
  expect(pastRun).toMatchObject({ enqueued: 0, skipped: "past_event" });

  // Pod call does not enqueue community-wide cancellation emails.
  const podRun = await t.action(internal.eventReminders.enqueueEventCancellationEmailsInternal, {
    eventId: podEventId,
    scope: "series",
    occurrenceStartsAt: futureStart,
    cancelledAt: now,
    nowMs: now,
  });
  expect(podRun).toMatchObject({ enqueued: 0, skipped: "no_target" });
});
