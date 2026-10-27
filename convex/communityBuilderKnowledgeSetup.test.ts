/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityAdmin.ts",
  "./communityBuilderKnowledgeSetup.ts",
  "./communityWikiArchitect.ts",
  "./communityInteractions.ts",
  "./communityInteractionEvidence.ts",
  "./communityAgentConcierge.ts",
  "./communityAgentServeWorker.ts",
  "./_generated/**/*.*s",
]);

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_750_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "builder-knowledge-owner",
      displayName: "Builder owner",
      handle: "builder-knowledge-owner",
      normalizedHandle: "builder-knowledge-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: "builder-knowledge-member",
      displayName: "Builder member",
      handle: "builder-knowledge-member",
      normalizedHandle: "builder-knowledge-member",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const pendingCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "builder-knowledge-pending",
      name: "Builder knowledge pending",
      lifecycleStatus: "active",
      builderKnowledgeSetupPending: true,
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const legacyCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "builder-knowledge-legacy",
      name: "Builder knowledge legacy",
      lifecycleStatus: "active",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 1,
      createdAt: nowMs - 1,
      updatedAt: nowMs - 1,
    });
    await ctx.db.insert("communityMemberships", {
      communityId: pendingCommunityId,
      userId: memberId,
      role: "member",
      accessSource: "manual_grant",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { legacyCommunityId, memberId, ownerId, pendingCommunityId };
  });
}

test("only the owner projection exposes pending Builder knowledge setup", async () => {
  const t = convexTest(schema, modules);
  await createFixture(t);
  const asOwner = t.withIdentity({ subject: "builder-knowledge-owner" });
  const asMember = t.withIdentity({ subject: "builder-knowledge-member" });

  const ownerRows = await asOwner.query(api.communityAdmin.listCommunityMemberships, {
    selectMode: "full",
  });
  expect(ownerRows.find((row) => row.communities.slug === "builder-knowledge-pending")?.communities)
    .toMatchObject({ builder_knowledge_setup_pending: true });
  expect(ownerRows.find((row) => row.communities.slug === "builder-knowledge-legacy")?.communities)
    .toMatchObject({ builder_knowledge_setup_pending: false });

  const memberRows = await asMember.query(api.communityAdmin.listCommunityMemberships, {
    selectMode: "full",
  });
  expect(memberRows[0]?.communities).toMatchObject({
    slug: "builder-knowledge-pending",
    builder_knowledge_setup_pending: false,
  });
});

test("Builder knowledge completion is owner-only, active-only, and idempotent", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-09T16:00:00.000Z"));
  try {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: "builder-knowledge-owner" });
  const asMember = t.withIdentity({ subject: "builder-knowledge-member" });
  const completeMutation = api.communityBuilderKnowledgeSetup.completeBuilderKnowledgeSetup;

  await expect(asMember.mutation(completeMutation, {
    communityId: fixture.pendingCommunityId,
  })).rejects.toThrow("community_owner_required");

  await expect(asOwner.mutation(completeMutation, {
    communityId: fixture.pendingCommunityId,
  })).resolves.toMatchObject({ ok: true, changed: true });
  await expect(asOwner.mutation(completeMutation, {
    communityId: fixture.pendingCommunityId,
  })).resolves.toMatchObject({ ok: true, changed: false });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());

  await expect(t.run(async (ctx) => {
    const community = await ctx.db.get(fixture.pendingCommunityId);
    const welcomeRoots = await ctx.db
      .query("communityInteractionRoots")
      .withIndex("by_community_idempotencyKey", (q) => q
        .eq("communityId", fixture.pendingCommunityId)
        .eq(
          "idempotencyKey",
          `community_canonical_agent:root:founder_welcome:v1:${fixture.pendingCommunityId}`,
        ))
      .collect();
    return { community, welcomeRoots };
  })).resolves.toMatchObject({
    community: { builderKnowledgeSetupPending: false },
    welcomeRoots: [{ actorType: "community_agent", actorAgentKey: "community_agent" }],
  });

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.legacyCommunityId, {
      lifecycleStatus: "archived",
      builderKnowledgeSetupPending: true,
    });
  });
  await expect(asOwner.mutation(completeMutation, {
    communityId: fixture.legacyCommunityId,
  })).rejects.toThrow("community_archived");
  } finally {
    vi.useRealTimers();
  }
});

test("Builder knowledge build lease is exclusive and completion requires canonical resource output", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: "builder-knowledge-owner" });
  const nowMs = Date.now();

  await expect(asOwner.mutation(
    internal.communityBuilderKnowledgeSetup.claimBuilderKnowledgeBuildInternal,
    {
      communityId: fixture.pendingCommunityId,
      leaseToken: "lease-one",
      nowMs,
    },
  )).resolves.toMatchObject({ ok: true, complete: false, stage: "architecture" });

  await expect(asOwner.mutation(
    internal.communityBuilderKnowledgeSetup.claimBuilderKnowledgeBuildInternal,
    {
      communityId: fixture.pendingCommunityId,
      leaseToken: "lease-two",
      nowMs: nowMs + 1,
    },
  )).resolves.toMatchObject({ ok: false, code: "builder_knowledge_build_in_progress" });

  await expect(asOwner.mutation(api.communityBuilderKnowledgeSetup.completeBuilderKnowledgeSetup, {
    communityId: fixture.pendingCommunityId,
  })).rejects.toThrow("builder_knowledge_build_in_progress");

  await expect(t.mutation(
    internal.communityBuilderKnowledgeSetup.applyBuilderKnowledgeArchitectureInternal,
    {
      communityId: fixture.pendingCommunityId,
      userId: fixture.ownerId,
      leaseToken: "lease-one",
      proposal: {
        run_type: "first",
        modules_created: [],
        modules_existing: [],
        drafts_created: [],
        drafts_updated: [],
        pages_left_unchanged: [],
        proposed_changes_to_existing: [],
        sources_assigned: [],
        sources_unassigned: [],
        gaps: [],
        deferred: [],
        recommended_next_uploads: [],
        needs_from_builder: [],
      },
      expectedSourceRevisions: [],
      nowMs: nowMs + 2,
    },
  )).resolves.toMatchObject({ ok: true, stage: "content" });
  await t.mutation(
    internal.communityBuilderKnowledgeSetup.releaseBuilderKnowledgeBuildInternal,
    {
      communityId: fixture.pendingCommunityId,
      leaseToken: "lease-one",
      nowMs: nowMs + 3,
    },
  );

  await expect(asOwner.mutation(
    internal.communityBuilderKnowledgeSetup.claimBuilderKnowledgeBuildInternal,
    {
      communityId: fixture.pendingCommunityId,
      leaseToken: "lease-three",
      nowMs: nowMs + 4,
    },
  )).resolves.toMatchObject({ ok: true, complete: false, stage: "content" });

  await expect(t.mutation(
    internal.communityBuilderKnowledgeSetup.completeBuilderKnowledgeBuildInternal,
    {
      communityId: fixture.pendingCommunityId,
      userId: fixture.ownerId,
      leaseToken: "lease-three",
      nowMs: nowMs + 5,
    },
  )).rejects.toThrow("builder_knowledge_resource_output_required");

  await expect(t.run(async (ctx) => {
    const community = await ctx.db.get(fixture.pendingCommunityId);
    const welcomeRoots = await ctx.db
      .query("communityInteractionRoots")
      .withIndex("by_community_idempotencyKey", (q) => q
        .eq("communityId", fixture.pendingCommunityId)
        .eq(
          "idempotencyKey",
          `community_canonical_agent:root:founder_welcome:v1:${fixture.pendingCommunityId}`,
        ))
      .collect();
    return { community, welcomeRoots };
  })).resolves.toMatchObject({
    community: {
      builderKnowledgeSetupPending: true,
      builderKnowledgeBuildLeaseToken: "lease-three",
    },
    welcomeRoots: [],
  });

  await t.run(async (ctx) => {
    const sourceId = await ctx.db.insert("communityResources", {
      communityId: fixture.pendingCommunityId,
      createdByUserId: fixture.ownerId,
      type: "link",
      role: "source",
      status: "review",
      title: "Founder source",
      bodyChars: 100,
      sourceIngestionStatus: "ready",
      sourceIngestionKind: "url",
      pinned: false,
      createdAt: nowMs + 5,
      updatedAt: nowMs + 5,
    });
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId: fixture.pendingCommunityId,
      createdByUserId: fixture.ownerId,
      status: "draft",
      name: "Getting started",
      sortOrder: 1000,
      createdAt: nowMs + 5,
      updatedAt: nowMs + 5,
    });
    await ctx.db.insert("communityResources", {
      communityId: fixture.pendingCommunityId,
      moduleId,
      createdByUserId: fixture.ownerId,
      type: "post",
      role: "page",
      status: "review",
      sourceResourceId: sourceId,
      title: "Founder guide",
      bodyChars: 200,
      pinned: false,
      sortOrder: 1000,
      createdAt: nowMs + 5,
      updatedAt: nowMs + 5,
    });
  });

  await expect(t.mutation(
    internal.communityBuilderKnowledgeSetup.completeBuilderKnowledgeBuildInternal,
    {
      communityId: fixture.pendingCommunityId,
      userId: fixture.ownerId,
      leaseToken: "lease-three",
      nowMs: nowMs + 6,
    },
  )).resolves.toMatchObject({ ok: true, changed: true });

  const completedCommunity = await t.run((ctx) => ctx.db.get(fixture.pendingCommunityId));
  expect(completedCommunity?.builderKnowledgeSetupPending).toBe(false);
  expect(completedCommunity?.builderKnowledgeBuildStage).toBeUndefined();
  expect(completedCommunity?.builderKnowledgeBuildLeaseToken).toBeUndefined();
  expect(completedCommunity?.builderKnowledgeBuildLeaseExpiresAt).toBeUndefined();
});
