/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { buildDefaultCommunityFunnelDocumentV1 } from "../shared/communityFunnel";
import { saveCommunityFunnelConfigInternal } from "./communityFunnel";

const modules = import.meta.glob([
  "./communityFunnel.ts",
  "./communityPublic.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "community-funnel-owner";
const MEMBER_SUBJECT = "community-funnel-member";

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_750_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: OWNER_SUBJECT,
      displayName: "Funnel owner",
      handle: "community-funnel-owner",
      normalizedHandle: "community-funnel-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: MEMBER_SUBJECT,
      displayName: "Funnel member",
      handle: "community-funnel-member",
      normalizedHandle: "community-funnel-member",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "community-funnel-publish",
      name: "Community funnel publish",
      lifecycleStatus: "active",
      builderAccessMode: "grandfathered",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
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
    const draft = buildDefaultCommunityFunnelDocumentV1({
      communityName: "Community funnel publish",
      oneLiner: "Private draft one",
    });
    const funnelId = await ctx.db.insert("communityFunnels", {
      communityId,
      draftDocumentV1: draft,
      draftRevision: 1,
      draftUpdatedAt: nowMs,
      draftUpdatedByUserId: ownerId,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { communityId, draft, funnelId, ownerId };
  });
}

test("manager publication snapshots one exact draft revision for public use", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  const before = await t.query(api.communityPublic.resolvePublicFunnelBySlug, {
    communitySlug: "community-funnel-publish",
  });
  expect(before.community?.funnel.published_document_v1).toBeNull();

  const published = await asOwner.mutation(
    api.communityFunnel.publishCommunityFunnelDraft,
    {
      communityId: fixture.communityId,
      expectedDraftRevision: 1,
    },
  );
  expect(published).toMatchObject({
    draft_revision: 1,
    published_draft_revision: 1,
  });
  expect(published.published_at).toEqual(expect.any(Number));

  const after = await t.query(api.communityPublic.resolvePublicFunnelBySlug, {
    communitySlug: "community-funnel-publish",
  });
  expect(after.community?.funnel.published_document_v1).toEqual(fixture.draft);
  expect(after.community?.funnel).not.toHaveProperty("draft_document_v1");
  expect(after.community?.funnel).not.toHaveProperty("published_at");
});

test("publication is manager-only, revision-safe, and idempotent", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await expect(
    asMember.mutation(api.communityFunnel.publishCommunityFunnelDraft, {
      communityId: fixture.communityId,
      expectedDraftRevision: 1,
    }),
  ).rejects.toThrow("community_forbidden");
  await expect(
    asOwner.mutation(api.communityFunnel.publishCommunityFunnelDraft, {
      communityId: fixture.communityId,
      expectedDraftRevision: 0,
    }),
  ).rejects.toThrow("community_funnel_publish_conflict");

  const first = await asOwner.mutation(
    api.communityFunnel.publishCommunityFunnelDraft,
    { communityId: fixture.communityId, expectedDraftRevision: 1 },
  );
  const second = await asOwner.mutation(
    api.communityFunnel.publishCommunityFunnelDraft,
    { communityId: fixture.communityId, expectedDraftRevision: 1 },
  );
  expect(second.published_at).toBe(first.published_at);
});

test("a newer private draft cannot mutate the published snapshot", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  await asOwner.mutation(api.communityFunnel.publishCommunityFunnelDraft, {
    communityId: fixture.communityId,
    expectedDraftRevision: 1,
  });
  const nextDraft = buildDefaultCommunityFunnelDocumentV1({
    communityName: "Community funnel publish",
    oneLiner: "Private draft two",
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.funnelId, {
      draftDocumentV1: nextDraft,
      draftRevision: 2,
      draftUpdatedAt: 1_750_000_000_100,
      updatedAt: 1_750_000_000_100,
    });
  });

  const publicResult = await t.query(
    api.communityPublic.resolvePublicFunnelBySlug,
    { communitySlug: "community-funnel-publish" },
  );
  expect(publicResult.community?.funnel.published_document_v1).toEqual(
    fixture.draft,
  );
  expect(publicResult.community?.funnel.published_document_v1).not.toEqual(
    nextDraft,
  );
});

test("removing legacy hero media cannot delete or hide a published V1 snapshot", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  await asOwner.mutation(api.communityFunnel.publishCommunityFunnelDraft, {
    communityId: fixture.communityId,
    expectedDraftRevision: 1,
  });
  const config = await t.run(async (ctx) =>
    saveCommunityFunnelConfigInternal(
      ctx,
      fixture.communityId,
      { hero_media_url: null, hero_media_kind: "image" },
      1_750_000_000_200,
    ),
  );
  expect(config.published_document_v1).toEqual(fixture.draft);
  const row = await t.run(async (ctx) => ctx.db.get(fixture.funnelId));
  expect(row?.publishedDocumentV1).toEqual(fixture.draft);
});
