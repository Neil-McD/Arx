/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./authActor.ts",
  "./communityResources.ts",
  "./_generated/**/*.*s",
]);

async function createFixture(t: ReturnType<typeof convexTest>, suffix: string) {
  const nowMs = 1_750_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: `source-fence-owner-${suffix}`,
      displayName: "Source fence owner",
      handle: `source-fence-owner-${suffix}`,
      normalizedHandle: `source-fence-owner-${suffix}`,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: `source-fence-member-${suffix}`,
      displayName: "Source fence member",
      handle: `source-fence-member-${suffix}`,
      normalizedHandle: `source-fence-member-${suffix}`,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `source-fence-${suffix}`,
      name: "Source fence",
      lifecycleStatus: "active",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "manual_grant",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const resourceId = await ctx.db.insert("communityResources", {
      communityId,
      createdByUserId: ownerId,
      type: "link",
      role: "source",
      status: "review",
      title: "Founder guide",
      url: "https://example.com/guide",
      sourceIngestionStatus: "queued",
      sourceIngestionKind: "url",
      pinned: false,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { communityId, memberId, ownerId, resourceId };
  });
}

function claimArgs(communityId: any, nowMs: number, retryFailed = false) {
  return {
    communityId,
    retryFailed,
    nowMs,
  };
}

test("concurrent claims serialize to one winner", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t, "concurrent");
  const owner = t.withIdentity({ subject: "source-fence-owner-concurrent" });

  const claims = await Promise.all([
    owner.mutation(
      (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
      claimArgs(fixture.communityId, 9_000),
    ),
    owner.mutation(
      (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
      claimArgs(fixture.communityId, 9_000),
    ),
  ]);
  expect(claims.filter((result) => result.claim !== null)).toHaveLength(1);
  expect(claims.filter((result) => result.claim === null)).toHaveLength(1);
});

test("one source has only one active ingestion owner", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t, "exclusive");
  const owner = t.withIdentity({ subject: "source-fence-owner-exclusive" });

  const first = await owner.mutation(
    (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
    claimArgs(fixture.communityId, 10_000),
  );
  expect(first.claim).toMatchObject({ resourceId: fixture.resourceId, attempt: 1 });

  const second = await owner.mutation(
    (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
    claimArgs(fixture.communityId, 10_001),
  );
  expect(second.claim).toBeNull();

  await expect(t.mutation(
    (internal as any).communityResources.finalizeCommunitySourceIngestionInternal,
    {
      resourceId: fixture.resourceId,
      leaseId: "not-the-owner",
      attempt: 1,
      status: "ready",
      kind: "url",
      bodyMd: "# Stale body",
      nowMs: 10_002,
    },
  )).resolves.toMatchObject({ ok: false, code: "community_source_ingestion_claim_lost" });

  await expect(t.mutation(
    (internal as any).communityResources.finalizeCommunitySourceIngestionInternal,
    {
      resourceId: fixture.resourceId,
      leaseId: first.claim.leaseId,
      attempt: first.claim.attempt,
      status: "ready",
      kind: "url",
      nowMs: 10_002,
    },
  )).rejects.toThrow("community_source_ingestion_body_required");

  await expect(t.mutation(
    (internal as any).communityResources.finalizeCommunitySourceIngestionInternal,
    {
      resourceId: fixture.resourceId,
      leaseId: first.claim.leaseId,
      attempt: first.claim.attempt,
      status: "ready",
      kind: "url",
      bodyMd: "# Canonical body\n\nUseful founder knowledge.",
      nowMs: 10_003,
    },
  )).resolves.toMatchObject({ ok: true });

  const row = await t.run((ctx) => ctx.db.get(fixture.resourceId));
  expect(row).toMatchObject({
    sourceIngestionStatus: "ready",
    sourceIngestionAttempt: 1,
  });
  expect(row).not.toHaveProperty("sourceIngestionLeaseId");
  expect(row).not.toHaveProperty("sourceIngestionLeaseExpiresAt");
});

test("expired work is reclaimed and a stale attempt cannot finalize", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t, "reclaim");
  const owner = t.withIdentity({ subject: "source-fence-owner-reclaim" });

  const first = await owner.mutation(
    (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
    claimArgs(fixture.communityId, 20_000),
  );
  const second = await owner.mutation(
    (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
    claimArgs(fixture.communityId, first.claim.leaseExpiresAt),
  );
  expect(second.claim).toMatchObject({ resourceId: fixture.resourceId, attempt: 2 });
  expect(second.claim.leaseId).not.toBe(first.claim.leaseId);

  await expect(t.mutation(
    (internal as any).communityResources.finalizeCommunitySourceIngestionInternal,
    {
      resourceId: fixture.resourceId,
      leaseId: first.claim.leaseId,
      attempt: first.claim.attempt,
      status: "failed",
      kind: "url",
      error: "stale failure",
      nowMs: first.claim.leaseExpiresAt + 1,
    },
  )).resolves.toMatchObject({ ok: false, code: "community_source_ingestion_claim_lost" });

  await expect(t.mutation(
    (internal as any).communityResources.finalizeCommunitySourceIngestionInternal,
    {
      resourceId: fixture.resourceId,
      leaseId: second.claim.leaseId,
      attempt: second.claim.attempt,
      status: "ready",
      kind: "url",
      bodyMd: "# Recovered body",
      nowMs: first.claim.leaseExpiresAt + 2,
    },
  )).resolves.toMatchObject({ ok: true });
});

test("automatic retries stop while an explicit retry can recover an exhausted source", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t, "bounded");
  const owner = t.withIdentity({ subject: "source-fence-owner-bounded" });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const claim = await owner.mutation(
      (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
      claimArgs(fixture.communityId, 30_000 + attempt * 10, attempt > 1),
    );
    expect(claim.claim).toMatchObject({ attempt });
    await expect(t.mutation(
      (internal as any).communityResources.finalizeCommunitySourceIngestionInternal,
      {
        resourceId: fixture.resourceId,
        leaseId: claim.claim.leaseId,
        attempt: claim.claim.attempt,
        status: "failed",
        kind: "url",
        error: `failure-${attempt}`,
        nowMs: 30_001 + attempt * 10,
      },
    )).resolves.toMatchObject({ ok: true });
    if (attempt === 1) {
      const sameRunRetry = await owner.mutation(
        (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
        {
          ...claimArgs(fixture.communityId, 30_002 + attempt * 10, true),
          excludeResourceIds: [fixture.resourceId],
        },
      );
      expect(sameRunRetry.claim).toBeNull();
    }
  }

  const exhausted = await owner.mutation(
    (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
    claimArgs(fixture.communityId, 31_000),
  );
  expect(exhausted.claim).toBeNull();
  await expect(t.run((ctx) => ctx.db.get(fixture.resourceId))).resolves.toMatchObject({
    sourceIngestionStatus: "failed",
    sourceIngestionAttempt: 3,
    sourceIngestionError: "failure-3",
  });

  const explicitRetry = await owner.mutation(
    (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
    claimArgs(fixture.communityId, 31_001, true),
  );
  expect(explicitRetry.claim).toMatchObject({
    resourceId: fixture.resourceId,
    attempt: 1,
  });
});

test("normal intake leaves historical failures alone and claims queued work", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t, "queued-before-failed");
  const owner = t.withIdentity({ subject: "source-fence-owner-queued-before-failed" });
  const queuedResourceId = await t.run(async (ctx) => {
    await ctx.db.patch(fixture.resourceId, {
      sourceIngestionStatus: "failed",
      sourceIngestionAttempt: 3,
      sourceIngestionError: "historical-failure",
    });
    return await ctx.db.insert("communityResources", {
      communityId: fixture.communityId,
      createdByUserId: fixture.ownerId,
      type: "link",
      role: "source",
      status: "review",
      title: "New guide",
      url: "https://example.com/new-guide",
      sourceIngestionStatus: "queued",
      sourceIngestionKind: "url",
      pinned: false,
      createdAt: 1_750_000_000_001,
      updatedAt: 1_750_000_000_001,
    });
  });

  const claim = await owner.mutation(
    (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
    claimArgs(fixture.communityId, 32_000),
  );
  expect(claim.claim).toMatchObject({ resourceId: queuedResourceId, attempt: 1 });
  await expect(t.run((ctx) => ctx.db.get(fixture.resourceId))).resolves.toMatchObject({
    sourceIngestionStatus: "failed",
    sourceIngestionAttempt: 3,
    sourceIngestionError: "historical-failure",
  });
});

test("persisted failures prevent a false successful ingestion result", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t, "truthful-result");
  const owner = t.withIdentity({ subject: "source-fence-owner-truthful-result" });
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.resourceId, {
      sourceIngestionStatus: "failed",
      sourceIngestionAttempt: 3,
      sourceIngestionError: "exhausted-failure",
    });
    await ctx.db.insert("communityResources", {
      communityId: fixture.communityId,
      createdByUserId: fixture.ownerId,
      type: "document",
      role: "source",
      status: "review",
      title: "Ready notes",
      bodyMd: "# Ready notes\n\nCanonical founder context.",
      bodyChars: 42,
      sourceIngestionStatus: "ready",
      sourceIngestionKind: "manual",
      pinned: false,
      createdAt: 1_750_000_000_001,
      updatedAt: 1_750_000_000_001,
    });
  });

  const result = await owner.action((api as any).communityResources.ingestCommunitySources, {
    communityId: fixture.communityId,
    retryFailed: false,
  });
  expect(result).toMatchObject({
    ok: false,
    code: "source_ingestion_partial_failure",
    processed: 0,
    failed: 0,
    failed_sources: 1,
    ready_sources: 1,
    pending_sources: 0,
  });
});

test("archiving after claim prevents terminal source writes", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t, "archive");
  const owner = t.withIdentity({ subject: "source-fence-owner-archive" });
  const claim = await owner.mutation(
    (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
    claimArgs(fixture.communityId, 35_000),
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "archived",
      lifecycleGeneration: 1,
      updatedAt: 35_001,
    });
  });

  await expect(t.mutation(
    (internal as any).communityResources.finalizeCommunitySourceIngestionInternal,
    {
      resourceId: fixture.resourceId,
      leaseId: claim.claim.leaseId,
      attempt: claim.claim.attempt,
      status: "ready",
      kind: "url",
      bodyMd: "# Must not persist",
      nowMs: 35_002,
    },
  )).resolves.toMatchObject({
    ok: false,
    code: "community_source_ingestion_community_inactive",
  });
  const row = await t.run((ctx) => ctx.db.get(fixture.resourceId));
  expect(row).toMatchObject({
    sourceIngestionStatus: "processing",
    sourceIngestionAttempt: 1,
  });
  expect(row).not.toHaveProperty("bodyMd");
  expect(row).not.toHaveProperty("bodyChars");
});

test("source edits invalidate an in-flight ingestion claim", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t, "edit");
  const owner = t.withIdentity({ subject: "source-fence-owner-edit" });

  const claim = await owner.mutation(
    (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
    claimArgs(fixture.communityId, 40_000),
  );
  await owner.mutation((api as any).communityResources.saveCommunityResource, {
    resourceId: fixture.resourceId,
    isPatch: true,
    payload: { url: "https://example.com/new-guide" },
  });

  await expect(t.mutation(
    (internal as any).communityResources.finalizeCommunitySourceIngestionInternal,
    {
      resourceId: fixture.resourceId,
      leaseId: claim.claim.leaseId,
      attempt: claim.claim.attempt,
      status: "ready",
      kind: "url",
      bodyMd: "# Outdated body",
      nowMs: 40_001,
    },
  )).resolves.toMatchObject({ ok: false, code: "community_source_ingestion_claim_lost" });

  await expect(t.run((ctx) => ctx.db.get(fixture.resourceId))).resolves.toMatchObject({
    url: "https://example.com/new-guide",
    sourceIngestionStatus: "queued",
  });
});

test("members cannot claim community source ingestion", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t, "auth");
  const member = t.withIdentity({ subject: "source-fence-member-auth" });

  await expect(member.mutation(
    (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
    claimArgs(fixture.communityId, 50_000),
  )).rejects.toThrow("community_forbidden");
});
