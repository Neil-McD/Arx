/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./email.ts",
  "./_generated/**/*.*s",
]);

test("community email outbox honors archive generation at enqueue and claim", async () => {
  const t = convexTest(schema, modules);
  const nowMs = 1_760_000_000_000;
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "archived-runtime-freeze-owner",
      displayName: "Archive runtime owner",
      handle: "archive-runtime-owner",
      normalizedHandle: "archive-runtime-owner",
      email: "archive-runtime-owner@example.com",
      emailVerifiedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "archive-email-runtime",
      name: "Archive email runtime",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { ownerId, communityId };
  });

  const enqueueEventReminder = (dedupeKey: string, generation: number, at: number) =>
    t.mutation(internal.email.enqueueEmailJobInternal, {
      kind: "event_reminder_24h",
      communityId: fixture.communityId,
      communityLifecycleGeneration: generation,
      recipientUserId: fixture.ownerId,
      templateKey: "event_reminder",
      payload: {
        communityName: "Archive email runtime",
        eventTitle: "Community event",
      },
      dedupeKey,
      nowMs: at,
    });

  await enqueueEventReminder("archive-runtime-active", 0, nowMs);
  await expect(
    t.mutation(internal.email.claimDueEmailOutboxBatchInternal, { nowMs }),
  ).resolves.toEqual([
    expect.objectContaining({ dedupeKey: "archive-runtime-active" }),
  ]);

  await expect(
    enqueueEventReminder("archive-runtime-pending", 0, nowMs),
  ).resolves.toMatchObject({ status: "pending" });
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "archived",
      lifecycleGeneration: 1,
      updatedAt: nowMs + 1,
    });
  });
  await expect(
    t.mutation(internal.email.claimDueEmailOutboxBatchInternal, {
      nowMs: nowMs + 1,
    }),
  ).resolves.toEqual([]);
  await t.run(async (ctx) => {
    const outbox = await ctx.db
      .query("emailOutbox")
      .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", "archive-runtime-pending"))
      .first();
    expect(outbox).toMatchObject({
      status: "suppressed",
      failureReason: "community_inactive",
    });
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "active",
      lifecycleGeneration: 2,
      updatedAt: nowMs + 2,
    });
  });
  await expect(
    enqueueEventReminder("archive-runtime-restored-stale", 0, nowMs + 2),
  ).resolves.toMatchObject({
    status: "suppressed",
    reason: "community_inactive",
  });
});
