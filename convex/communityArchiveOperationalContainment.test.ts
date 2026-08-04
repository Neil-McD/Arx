/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";
import { requireOperationalCommunityById } from "./communityLifecycleCore";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityAgentHeartbeat.ts",
  "./communityInteractionEmbedRefresh.ts",
  "./communityInteractions.ts",
  "./email.ts",
  "./_generated/**/*.*s",
]);

const NOW_MS = 1_785_000_000_000;

async function createFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "archive-containment-owner",
      email: "archive-containment-owner@example.com",
      emailVerifiedAt: NOW_MS,
      displayName: "Archive containment owner",
      handle: "archive-containment-owner",
      normalizedHandle: "archive-containment-owner",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const insertCommunity = async (
      slug: string,
      lifecycleStatus?: "active" | "archiving" | "archived",
    ) => await ctx.db.insert("communities", {
      ownerId,
      slug,
      name: slug,
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      ...(lifecycleStatus ? { lifecycleStatus } : null),
      lifecycleGeneration: lifecycleStatus ? 1 : undefined,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    return {
      ownerId,
      legacyId: await insertCommunity("archive-containment-legacy"),
      activeId: await insertCommunity("archive-containment-active", "active"),
      archivingId: await insertCommunity("archive-containment-archiving", "archiving"),
      archivedId: await insertCommunity("archive-containment-archived", "archived"),
    };
  });
}

test("one canonical lifecycle resolver admits only legacy-active and active communities", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  for (const communityId of [fixture.legacyId, fixture.activeId]) {
    await expect(t.run(async (ctx) =>
      await requireOperationalCommunityById({ ctx, communityId }),
    )).resolves.toMatchObject({ _id: communityId });
  }
  await expect(t.run(async (ctx) =>
    await requireOperationalCommunityById({ ctx, communityId: fixture.archivingId }),
  )).rejects.toThrow("community_archiving");
  await expect(t.run(async (ctx) =>
    await requireOperationalCommunityById({ ctx, communityId: fixture.archivedId }),
  )).rejects.toThrow("community_archived");
});

test("archiving and archived communities are absent from memory sweeps and inference funding admission", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const targets = await t.query(
    internal.communityAgentHeartbeat.listCommunityMemorySweepTargetsInternal,
    { limit: 20 },
  );
  const targetIds = targets.map((target: { communityId: string }) => target.communityId);
  expect(targetIds).toEqual(expect.arrayContaining([
    String(fixture.legacyId),
    String(fixture.activeId),
  ]));
  expect(targetIds).not.toContain(String(fixture.archivingId));
  expect(targetIds).not.toContain(String(fixture.archivedId));
  await expect(t.run(async (ctx) =>
    await resolveCommunityInferenceFundingAdmission(ctx, fixture.archivedId),
  )).resolves.toEqual({ ok: false, code: "community_archived" });
});

test("community email admission suppresses archiving and archived work but preserves generic email", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const archived = await t.mutation(internal.email.enqueueEmailJobInternal, {
    kind: "weekly_member_digest",
    communityId: fixture.archivedId,
    recipientUserId: fixture.ownerId,
    templateKey: "weekly_member_digest",
    payload: {},
    dedupeKey: "archive-containment-email-archived",
    nowMs: NOW_MS,
  });
  expect(archived.status).toBe("suppressed");

  const archiving = await t.mutation(internal.email.enqueueEmailJobInternal, {
    kind: "weekly_member_digest",
    communityId: fixture.archivingId,
    recipientUserId: fixture.ownerId,
    templateKey: "weekly_member_digest",
    payload: {},
    dedupeKey: "archive-containment-email-archiving",
    scheduledAt: NOW_MS + 60_000,
    nowMs: NOW_MS,
  });
  expect(archiving.status).toBe("suppressed");

  const generic = await t.mutation(internal.email.enqueueEmailJobInternal, {
    kind: "billing_issue",
    recipientUserId: fixture.ownerId,
    templateKey: "billing_issue",
    payload: {},
    dedupeKey: "archive-containment-email-generic",
    nowMs: NOW_MS,
  });
  expect(generic.status).toBe("pending");
  const claimed = await t.mutation(internal.email.claimDueEmailOutboxBatchInternal, {
    limit: 10,
    nowMs: NOW_MS,
  });
  expect(claimed.map((row: { _id: unknown }) => String(row._id))).toContain(String(generic.outboxId));
});

test("queued community email is suppressed at claim and immediately before delivery", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const claimRace = await t.mutation(internal.email.enqueueEmailJobInternal, {
    kind: "event_reminder_24h",
    communityId: fixture.activeId,
    recipientUserId: fixture.ownerId,
    templateKey: "event_reminder",
    payload: {},
    dedupeKey: "archive-containment-email-claim-race",
    nowMs: NOW_MS,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.activeId, { lifecycleStatus: "archived", updatedAt: NOW_MS + 1 });
  });
  const claimedAfterArchive = await t.mutation(internal.email.claimDueEmailOutboxBatchInternal, {
    limit: 10,
    nowMs: NOW_MS + 2,
  });
  expect(claimedAfterArchive).toHaveLength(0);
  await expect(t.run(async (ctx) => await ctx.db.get(claimRace.outboxId))).resolves.toMatchObject({
    status: "suppressed",
    failureReason: "community_archived",
  });

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.archivingId, { lifecycleStatus: "active", updatedAt: NOW_MS + 3 });
  });
  const deliveryRace = await t.mutation(internal.email.enqueueEmailJobInternal, {
    kind: "mention_notification",
    communityId: fixture.archivingId,
    recipientUserId: fixture.ownerId,
    templateKey: "mention_notification",
    payload: {},
    dedupeKey: "archive-containment-email-delivery-race",
    nowMs: NOW_MS + 3,
  });
  const deliveryClaim = await t.mutation(internal.email.claimDueEmailOutboxBatchInternal, {
    limit: 10,
    nowMs: NOW_MS + 3,
  });
  expect(deliveryClaim.map((row: { _id: unknown }) => String(row._id))).toContain(String(deliveryRace.outboxId));
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.archivingId, { lifecycleStatus: "archived", updatedAt: NOW_MS + 4 });
  });
  const admission = await t.mutation(internal.email.admitEmailJobForDeliveryInternal, {
    outboxId: deliveryRace.outboxId,
    nowMs: NOW_MS + 4,
  });
  expect(admission).toEqual({ admitted: false, reason: "community_archived" });
});

test("embed refresh scheduling and enrichment exclude archived communities", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const { activeEmbedId, archivedEmbedId } = await t.run(async (ctx) => ({
    activeEmbedId: await ctx.db.insert("communityInteractionEmbeds", {
      communityId: fixture.activeId,
      embedKind: "link",
      status: "ready",
      visibilityScope: "community",
      sourceUrl: "https://x.com/polynet/status/1234567890123456789",
      provider: "x",
      nextRefreshAt: NOW_MS - 1,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    }),
    archivedEmbedId: await ctx.db.insert("communityInteractionEmbeds", {
      communityId: fixture.archivedId,
      embedKind: "link",
      status: "ready",
      visibilityScope: "community",
      sourceUrl: "https://x.com/polynet/status/2234567890123456789",
      provider: "x",
      nextRefreshAt: NOW_MS - 1,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    }),
  }));
  const scheduled = await t.mutation(
    internal.communityInteractionEmbedRefresh.scheduleDueInteractionEmbedPreviewRefresh,
    { limit: 10 },
  );
  expect(scheduled.scheduled).toBe(1);
  await expect(t.query(internal.communityInteractions.getInteractionEmbedForEnrichment, {
    embedId: String(activeEmbedId),
  })).resolves.not.toBeNull();
  await expect(t.query(internal.communityInteractions.getInteractionEmbedForEnrichment, {
    embedId: String(archivedEmbedId),
  })).resolves.toBeNull();
});
