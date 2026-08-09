/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityAdmin.ts",
  "./communityBuilderKnowledgeSetup.ts",
  "./communityInteractions.ts",
  "./communityInteractionEvidence.ts",
  "./communityAgentConcierge.ts",
  "./communityAgentServeWorker.ts",
  "./communityOnboarding.ts",
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
