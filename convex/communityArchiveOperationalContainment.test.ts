/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";
import { requireOperationalCommunityById } from "./communityLifecycleCore";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityAgentHeartbeat.ts",
  "./communityAgentConcierge.ts",
  "./communityAgentRuntime.ts",
  "./communityAgentServeWorker.ts",
  "./communityMentionBroadcasts.ts",
  "./communityResources.ts",
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

test("restoring active status cannot resurrect durable work from an older lifecycle generation", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);

  const oldEmail = await t.mutation(internal.email.enqueueEmailJobInternal, {
    kind: "mention_notification",
    communityId: fixture.activeId,
    recipientUserId: fixture.ownerId,
    templateKey: "mention_notification",
    payload: {},
    dedupeKey: "archive-containment-email-old-epoch",
    nowMs: NOW_MS,
  });
  const {
    staleServeRequestId,
    staleDigestId,
    staleAgentMentionId,
    staleBroadcastId,
    staleSourceCrawlJobId,
  } = await t.run(async (ctx) => {
    const rootId = await ctx.db.insert("communityInteractionRoots", {
      communityId: fixture.activeId,
      actorType: "human",
      actorUserId: fixture.ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Lifecycle epoch fence",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "archive-containment-serve-old-epoch",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const mentionId = await ctx.db.insert("communityInteractionMentions", {
      communityId: fixture.activeId,
      rootId,
      mentionKind: "community_agent",
      mentionedAgentKey: "community_agent",
      notifyState: "sent",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const staleServeRequestId = await ctx.db.insert("communityAgentServeRequests", {
      communityId: fixture.activeId,
      communityLifecycleGeneration: 1,
      agentKey: "community_agent",
      sourceMentionId: mentionId,
      sourceRootId: rootId,
      requesterUserId: fixture.ownerId,
      sponsorUserId: fixture.ownerId,
      status: "queued",
      intakeReason: "accepted",
      sourceVisibilityScope: "community",
      responseVisibilityScope: "community",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const staleAgentMentionId = await ctx.db.insert("communityInteractionMentions", {
      communityId: fixture.activeId,
      communityLifecycleGeneration: 1,
      rootId,
      mentionKind: "community_agent",
      mentionedAgentKey: "community_agent",
      notifyState: "pending",
      createdAt: NOW_MS + 1,
      updatedAt: NOW_MS + 1,
    });
    const broadcastSourceMentionId = await ctx.db.insert("communityInteractionMentions", {
      communityId: fixture.activeId,
      communityLifecycleGeneration: 1,
      rootId,
      mentionKind: "role",
      mentionedRoleKey: "everybody",
      notifyState: "pending",
      createdAt: NOW_MS + 2,
      updatedAt: NOW_MS + 2,
    });
    await ctx.db.insert("communityInteractionContentBlocks", {
      communityId: fixture.activeId,
      rootId,
      blockOrder: 0,
      blockType: "markdown_text",
      text: "@everybody lifecycle epoch fence",
      createdAt: NOW_MS + 2,
      updatedAt: NOW_MS + 2,
    });
    const staleBroadcastId = await ctx.db.insert("communityMentionBroadcasts", {
      communityId: fixture.activeId,
      communityLifecycleGeneration: 1,
      roleKey: "everybody",
      actorUserId: fixture.ownerId,
      sourceRootId: rootId,
      sourceMentionId: broadcastSourceMentionId,
      sourceCreatedAt: NOW_MS + 2,
      emailMode: "in_app_and_email",
      status: "queued",
      ownerProcessed: false,
      processedCount: 0,
      recipientCount: 0,
      skippedCount: 0,
      createdAt: NOW_MS + 2,
      updatedAt: NOW_MS + 2,
    });
    const staleDigestId = await ctx.db.insert("communityCompilerDigests", {
      communityId: fixture.activeId,
      communityLifecycleGeneration: 1,
      dedupeKey: "archive-containment-digest-old-epoch",
      versionKey: "archive-containment-digest-old-epoch",
      agentHandoffState: "pending",
      agentAttemptCount: 0,
      windowStartedAt: NOW_MS - 1_000,
      windowEndedAt: NOW_MS,
      summary: "Stale lifecycle digest",
      itemCount: 0,
      items: [],
      signalCounts: {
        chat: 0,
        aiFeed: 0,
        resources: 0,
        events: 0,
        sourceTraces: 0,
        outcomes: 0,
        newMembers: 0,
        activeMembers: 0,
        postingMembers: 0,
        aiFeedReactingMembers: 0,
      },
      createdByActorType: "compiler",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const staleSourceCrawlJobId = await ctx.db.insert("communitySourceCrawlJobs", {
      communityId: fixture.activeId,
      communityLifecycleGeneration: 1,
      createdByUserId: fixture.ownerId,
      provider: "simple",
      rootUrl: "https://example.com/stale-source",
      status: "queued",
      maxPages: 1,
      maxDepth: 0,
      pageCount: 0,
      readyPageCount: 0,
      failedPageCount: 0,
      savedSourceCount: 0,
      skippedSourceCount: 0,
      sourceResourceIds: [],
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    await ctx.db.patch(fixture.activeId, {
      lifecycleStatus: "archived",
      lifecycleGeneration: 2,
      updatedAt: NOW_MS + 1,
    });
    await ctx.db.patch(fixture.activeId, {
      lifecycleStatus: "active",
      lifecycleGeneration: 3,
      updatedAt: NOW_MS + 2,
    });
    return {
      staleServeRequestId,
      staleDigestId,
      staleAgentMentionId,
      staleBroadcastId,
      staleSourceCrawlJobId,
    };
  });

  const claimedEmails = await t.mutation(internal.email.claimDueEmailOutboxBatchInternal, {
    limit: 10,
    nowMs: NOW_MS + 3,
  });
  expect(claimedEmails).toHaveLength(0);
  await expect(t.run(async (ctx) => await ctx.db.get(oldEmail.outboxId))).resolves.toMatchObject({
    status: "suppressed",
    failureReason: "community_lifecycle_generation_stale",
    communityLifecycleGeneration: 1,
  });

  const serveClaim = await t.mutation(
    internal.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
    { requestId: staleServeRequestId, nowMs: NOW_MS + 3 },
  );
  expect(serveClaim.requestId).toBeNull();
  await expect(t.run(async (ctx) => await ctx.db.get(staleServeRequestId))).resolves.toMatchObject({
    status: "skipped",
    skipReason: "community_lifecycle_generation_stale",
  });

  const repairedMentions = await t.mutation(
    internal.communityAgentConcierge.consumePendingCommunityAgentMentionsInternal,
    { limit: 10, nowMs: NOW_MS + 3 },
  );
  expect(repairedMentions.counts.community_lifecycle_generation_stale).toBe(1);
  await expect(t.run(async (ctx) => await ctx.db.get(staleAgentMentionId))).resolves.toMatchObject({
    notifyState: "suppressed",
  });

  await t.mutation(
    internal.communityMentionBroadcasts.processQueuedCommunityMentionBroadcastsInternal,
    { broadcastId: staleBroadcastId, limit: 1, nowMs: NOW_MS + 3 },
  );
  await expect(t.run(async (ctx) => await ctx.db.get(staleBroadcastId))).resolves.toMatchObject({
    status: "canceled",
    errorCode: "community_lifecycle_generation_stale",
  });

  const digestClaim = await t.mutation(
    internal.communityAgentHeartbeat.claimCommunityCompilerDigestHandoffInternal,
    {
      communityId: fixture.activeId,
      claimId: "archive-containment-stale-digest-claim",
      nowMs: NOW_MS + 3,
    },
  );
  expect(digestClaim).toMatchObject({ claimed: false, reason: "no_pending_compiler_handoff" });
  await expect(t.run(async (ctx) => await ctx.db.get(staleDigestId))).resolves.toMatchObject({
    agentHandoffState: "handled",
    agentTerminalReason: "community_lifecycle_generation_stale",
  });

  const sourceCrawlClaim = await t.mutation(
    internal.communityResources.claimCommunitySourceCrawlJobInternal,
    { crawlJobId: String(staleSourceCrawlJobId), nowMs: NOW_MS + 3 },
  );
  expect(sourceCrawlClaim).toMatchObject({
    admitted: false,
    reason: "community_lifecycle_generation_stale",
  });
  await expect(t.run(async (ctx) => await ctx.db.get(staleSourceCrawlJobId))).resolves.toMatchObject({
    status: "failed",
    error: "community_lifecycle_generation_stale",
  });

  const currentSourceCrawlJobId = await t.run(async (ctx) =>
    await ctx.db.insert("communitySourceCrawlJobs", {
      communityId: fixture.activeId,
      communityLifecycleGeneration: 3,
      createdByUserId: fixture.ownerId,
      provider: "simple",
      rootUrl: "https://example.com/current-source",
      status: "queued",
      maxPages: 1,
      maxDepth: 0,
      pageCount: 0,
      readyPageCount: 0,
      failedPageCount: 0,
      savedSourceCount: 0,
      skippedSourceCount: 0,
      sourceResourceIds: [],
      createdAt: NOW_MS + 3,
      updatedAt: NOW_MS + 3,
    }),
  );
  await expect(t.mutation(
    internal.communityResources.claimCommunitySourceCrawlJobInternal,
    { crawlJobId: String(currentSourceCrawlJobId), nowMs: NOW_MS + 4 },
  )).resolves.toMatchObject({ admitted: true, reason: null });
  await expect(t.mutation(
    internal.communityResources.claimCommunitySourceCrawlJobInternal,
    { crawlJobId: String(currentSourceCrawlJobId), nowMs: NOW_MS + 5 },
  )).resolves.toMatchObject({
    admitted: false,
    reason: "community_source_crawl_job_in_progress",
  });

  await expect(t.query(internal.communityAgentHeartbeat.assessCommunityAgentCycleInternal, {
    communityId: fixture.activeId,
    communityLifecycleGeneration: 1,
    nowMs: NOW_MS + 3,
  })).resolves.toMatchObject({
    enqueue: false,
    reason: "community_lifecycle_generation_stale",
  });
  await expect(t.query(internal.communityAgentRuntime.resolveCommunityAgentRunContextInternal, {
    communityId: fixture.activeId,
    communityLifecycleGeneration: 1,
  })).rejects.toThrow("community_lifecycle_generation_stale");

  const staleSourceEmail = await t.mutation(internal.email.enqueueEmailJobInternal, {
    kind: "mention_notification",
    communityId: fixture.activeId,
    communityLifecycleGeneration: 1,
    recipientUserId: fixture.ownerId,
    templateKey: "mention_notification",
    payload: {},
    dedupeKey: "archive-containment-email-stale-source-epoch",
    nowMs: NOW_MS + 3,
  });
  expect(staleSourceEmail.status).toBe("suppressed");

  const currentEmail = await t.mutation(internal.email.enqueueEmailJobInternal, {
    kind: "mention_notification",
    communityId: fixture.activeId,
    recipientUserId: fixture.ownerId,
    templateKey: "mention_notification",
    payload: {},
    dedupeKey: "archive-containment-email-current-epoch",
    nowMs: NOW_MS + 4,
  });
  const currentClaim = await t.mutation(internal.email.claimDueEmailOutboxBatchInternal, {
    limit: 10,
    nowMs: NOW_MS + 4,
  });
  expect(currentClaim.map((row: { _id: unknown }) => String(row._id))).toContain(
    String(currentEmail.outboxId),
  );
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
