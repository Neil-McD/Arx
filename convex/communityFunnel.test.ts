/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { buildCommunityFunnelDocumentTestFixture } from "../scripts/community_funnel_test_fixture";
import { saveCommunityFunnelConfigInternal } from "./communityFunnel";

const modules = import.meta.glob([
  "./communityFunnel.ts",
  "./communityPublic.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "community-funnel-owner";
const MEMBER_SUBJECT = "community-funnel-member";
const VSL_URL = "https://www.youtube.com/watch?v=abcdefghijk";

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
    const draft = buildCommunityFunnelDocumentTestFixture({
      headline: "Private draft one",
    });
    const funnelId = await ctx.db.insert("communityFunnels", {
      communityId,
      draftDocumentV1: draft,
      draftVslUrl: VSL_URL,
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
  expect(after.community?.funnel.published_vsl_url).toBe(VSL_URL);
  expect(after.community?.funnel).not.toHaveProperty("draft_document_v1");
  expect(after.community?.funnel).not.toHaveProperty("published_at");
});

test("public funnel descriptor exposes only renderer and admission inputs", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("communityPricePoints", {
      communityId: fixture.communityId,
      billingPeriod: "monthly",
      name: "Monthly access",
      amountBaseUnits: 2900,
      currency: "usd",
      currencyDecimals: 2,
      isCurrent: true,
      createdAt: 1_750_000_000_000,
      updatedAt: 1_750_000_000_000,
    });
  });

  const result = await t.query(api.communityPublic.resolvePublicFunnelBySlug, {
    communitySlug: "community-funnel-publish",
  });

  expect(result).toMatchObject({
    ok: true,
    community: {
      slug: "community-funnel-publish",
      name: "Community funnel publish",
      visibility: "published",
      entry_policy: "open",
      host: {
        display_name: "Funnel owner",
      },
      funnel: {
        published_document_v1: null,
      },
    },
    active_plan: {
      billing_period: "monthly",
      amount_base_units: "2900",
      currency: "usd",
    },
  });
  expect(result.community).toHaveProperty("avatar_url");
  expect(result.community).toHaveProperty("banner_url");
  expect(result.community).not.toHaveProperty("featured_messages");
  expect(result.community).not.toHaveProperty("availability");
  expect(result.community).not.toHaveProperty("created_at");
  expect(result.community).not.toHaveProperty("updated_at");
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
  const nextDraft = buildCommunityFunnelDocumentTestFixture({
    headline: "Private draft two",
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

test("creator VSL writes are manager-only, provider-bounded, and revision-safe", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await expect(
    asMember.mutation(api.communityFunnel.setCommunityFunnelDraftVsl, {
      communityId: fixture.communityId,
      expectedDraftRevision: 1,
      url: "https://vimeo.com/123456789",
    }),
  ).rejects.toThrow("community_forbidden");
  await expect(
    asOwner.mutation(api.communityFunnel.setCommunityFunnelDraftVsl, {
      communityId: fixture.communityId,
      expectedDraftRevision: 1,
      url: "https://attacker.example/video",
    }),
  ).rejects.toThrow("community_funnel_vsl_url_unsupported");

  const saved = await asOwner.mutation(
    api.communityFunnel.setCommunityFunnelDraftVsl,
    {
      communityId: fixture.communityId,
      expectedDraftRevision: 1,
      url: "https://vimeo.com/123456789",
    },
  );
  expect(saved).toMatchObject({
    draft_revision: 2,
    draft_vsl_url: "https://vimeo.com/123456789",
  });
  await expect(
    asOwner.mutation(api.communityFunnel.setCommunityFunnelDraftVsl, {
      communityId: fixture.communityId,
      expectedDraftRevision: 1,
      url: null,
    }),
  ).rejects.toThrow("community_funnel_draft_conflict");
});

test("draft VSL remains private until atomic publication and explicit removal", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await asOwner.mutation(api.communityFunnel.setCommunityFunnelDraftVsl, {
    communityId: fixture.communityId,
    expectedDraftRevision: 1,
    url: "https://vimeo.com/123456789",
  });
  const beforePublish = await t.query(
    api.communityPublic.resolvePublicFunnelBySlug,
    { communitySlug: "community-funnel-publish" },
  );
  expect(beforePublish.community?.funnel.published_vsl_url).toBeNull();

  await asOwner.mutation(api.communityFunnel.publishCommunityFunnelDraft, {
    communityId: fixture.communityId,
    expectedDraftRevision: 2,
  });
  const published = await t.query(
    api.communityPublic.resolvePublicFunnelBySlug,
    { communitySlug: "community-funnel-publish" },
  );
  expect(published.community?.funnel.published_vsl_url).toBe(
    "https://vimeo.com/123456789",
  );

  const removed = await asOwner.mutation(
    api.communityFunnel.setCommunityFunnelDraftVsl,
    {
      communityId: fixture.communityId,
      expectedDraftRevision: 2,
      url: null,
    },
  );
  expect(removed.draft_vsl_url).toBeNull();
  const stillPublished = await t.query(
    api.communityPublic.resolvePublicFunnelBySlug,
    { communitySlug: "community-funnel-publish" },
  );
  expect(stillPublished.community?.funnel.published_vsl_url).toBe(
    "https://vimeo.com/123456789",
  );
});

test("legacy document media is read once, then removed by the canonical VSL path", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const legacyVslUrl = "https://youtu.be/abcdefghijk";
  const legacyDocument = {
    ...fixture.draft,
    sections: [
      fixture.draft.sections[0],
      {
        id: "legacy-media",
        type: "media" as const,
        media_url: legacyVslUrl,
        caption: null,
      },
      ...fixture.draft.sections.slice(1),
    ],
  };
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.funnelId, {
      draftVslUrl: undefined,
      publishedVslUrl: undefined,
      draftDocumentV1: legacyDocument,
      publishedDocumentV1: legacyDocument,
      publishedDraftRevision: 1,
    });
  });

  const managerConfig = await asOwner.query(
    api.communityFunnel.getCommunityFunnelConfig,
    { communityId: fixture.communityId },
  );
  expect(managerConfig.draft_vsl_url).toBe(legacyVslUrl);
  expect(managerConfig.published_vsl_url).toBe(legacyVslUrl);

  const removed = await asOwner.mutation(
    api.communityFunnel.setCommunityFunnelDraftVsl,
    {
      communityId: fixture.communityId,
      expectedDraftRevision: 1,
      url: null,
    },
  );
  expect(removed.draft_vsl_url).toBeNull();
  expect(
    removed.draft_document_v1?.sections.some(
      (section) => section.type === "media",
    ),
  ).toBe(false);

  await asOwner.mutation(api.communityFunnel.publishCommunityFunnelDraft, {
    communityId: fixture.communityId,
    expectedDraftRevision: 2,
  });
  const publicConfig = await t.query(
    api.communityPublic.resolvePublicFunnelBySlug,
    { communitySlug: "community-funnel-publish" },
  );
  expect(publicConfig.community?.funnel.published_vsl_url).toBeNull();
  expect(
    publicConfig.community?.funnel.published_document_v1?.sections.some(
      (section) => section.type === "media",
    ),
  ).toBe(false);
});
