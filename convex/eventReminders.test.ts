/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

test("every member of a big community is reminded, in batches, not just the first 500", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "big-club", name: "Big Club", visibility: "unlisted", inferenceFundingPolicy: "managed_required",
      entryPolicy: "open", activeMemberCount: 650, createdAt: NOW, updatedAt: NOW,
    });
    for (let n = 0; n < 650; n += 1) {
      const userId = await ctx.db.insert("users", { authSubject: `m-${n}`, displayName: `m${n}`, createdAt: NOW, updatedAt: NOW });
      await ctx.db.insert("communityMemberships", { communityId, userId, role: "member", active: true, createdAt: NOW, updatedAt: NOW });
    }
    await ctx.db.insert("communityEvents", {
      communityId, createdByUserId: ownerId, title: "Saturday ride", startsAt: NOW + DAY + 5 * 60 * 1000, timezone: "UTC",
      locationType: "online", visibility: "members", status: "live", createdAt: NOW, updatedAt: NOW,
    });
  });
  const batches = await t.query(internal.eventReminders.buildEventReminderBatchesInternal, { nowMs: NOW }) as Array<{ recipientUserIds: unknown[] }>;
  const everyone = new Set(batches.flatMap((batch) => batch.recipientUserIds.map(String)));
  expect(batches.length).toBe(2);
  expect(batches.every((batch) => batch.recipientUserIds.length <= 500)).toBe(true);
  // Members plus the owner, each once.
  expect(everyone.size).toBe(651);
});
