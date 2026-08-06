/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./email.ts",
  "./emailDigests.ts",
  "./_generated/**/*.*s",
]);

test("weekly digests include legacy-active communities and omit archived communities", async () => {
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
    const insertCommunity = async (
      slug: string,
      lifecycle?: { status: "archived"; generation: number },
    ) => {
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug,
        name: slug,
        visibility: "published",
        inferenceFundingPolicy: "managed_required",
        entryPolicy: "approval",
        lifecycleStatus: lifecycle?.status,
        lifecycleGeneration: lifecycle?.generation,
        activeMemberCount: 1,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const threadId = await ctx.db.insert("communityChatThreads", {
        communityId,
        lastSeq: 3,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      for (const seq of [1, 2, 3]) {
        await ctx.db.insert("communityChatMessages", {
          threadId,
          seq,
          role: "user",
          contentJson: { text: `Recent activity ${seq} for ${slug}` },
          senderUserId: ownerId,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
      return communityId;
    };
    return {
      ownerId,
      activeCommunityId: await insertCommunity("legacy-active-digest"),
      archivedCommunityId: await insertCommunity("archived-digest", {
        status: "archived",
        generation: 1,
      }),
    };
  });

  await expect(
    t.query(
      internal.emailDigests.buildWeeklyCommunityDigestBatchesInternal,
      {
        communityId: fixture.activeCommunityId,
        force: true,
        nowMs,
      },
    ),
  ).resolves.toEqual([
    expect.objectContaining({
      communityId: String(fixture.activeCommunityId),
      communitySlug: "legacy-active-digest",
    }),
  ]);

  await expect(
    t.query(
      internal.emailDigests.buildWeeklyCommunityDigestBatchesInternal,
      {
        communityId: fixture.archivedCommunityId,
        force: true,
        nowMs,
      },
    ),
  ).resolves.toEqual([]);

  const batches = await t.query(
    internal.emailDigests.buildWeeklyCommunityDigestBatchesInternal,
    {
      force: true,
      nowMs,
      limitCommunities: 10,
    },
  );
  expect(batches.map((batch) => batch.communityId)).toEqual([
    String(fixture.activeCommunityId),
  ]);

  await t.mutation(internal.email.enqueueEmailJobInternal, {
    kind: "weekly_member_digest",
    communityId: fixture.activeCommunityId,
    communityLifecycleGeneration: 0,
    recipientUserId: fixture.ownerId,
    templateKey: "weekly_member_digest",
    payload: { communityName: "legacy-active-digest" },
    dedupeKey: "archive-runtime-active",
    nowMs,
  });
  await expect(
    t.mutation(internal.email.claimDueEmailOutboxBatchInternal, { nowMs }),
  ).resolves.toEqual([
    expect.objectContaining({ dedupeKey: "archive-runtime-active" }),
  ]);

  await expect(
    t.mutation(internal.email.enqueueEmailJobInternal, {
      kind: "weekly_member_digest",
      communityId: fixture.activeCommunityId,
      communityLifecycleGeneration: 0,
      recipientUserId: fixture.ownerId,
      templateKey: "weekly_member_digest",
      payload: { communityName: "legacy-active-digest" },
      dedupeKey: "archive-runtime-pending",
      nowMs,
    }),
  ).resolves.toMatchObject({ status: "pending" });
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.activeCommunityId, {
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
    await ctx.db.patch(fixture.activeCommunityId, {
      lifecycleStatus: "active",
      lifecycleGeneration: 2,
      updatedAt: nowMs + 2,
    });
  });
  await expect(
    t.mutation(internal.email.enqueueEmailJobInternal, {
      kind: "weekly_member_digest",
      communityId: fixture.activeCommunityId,
      communityLifecycleGeneration: 0,
      recipientUserId: fixture.ownerId,
      templateKey: "weekly_member_digest",
      payload: { communityName: "legacy-active-digest" },
      dedupeKey: "archive-runtime-restored-stale",
      nowMs: nowMs + 2,
    }),
  ).resolves.toMatchObject({
    status: "suppressed",
    reason: "community_inactive",
  });
});
