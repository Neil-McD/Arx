/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  buildCommunityFunnelContentTestFixture,
  buildCommunityFunnelDocumentTestFixture,
} from "../scripts/community_funnel_test_fixture";
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
    const draft = buildCommunityFunnelContentTestFixture({
      headline: "Private draft one",
    });
    const funnelId = await ctx.db.insert("communityFunnels", {
      communityId,
      draftContentV2: draft,
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
  expect(before.community?.funnel.published_content_v2).toBeNull();

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
  expect(after.community?.funnel.published_content_v2).toEqual(fixture.draft);
  expect(after.community?.funnel.published_vsl_url).toBe(VSL_URL);
  expect(after.community?.funnel).not.toHaveProperty("draft_content_v2");
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
        published_content_v2: null,
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
  const nextDraft = buildCommunityFunnelContentTestFixture({
    headline: "Private draft two",
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.funnelId, {
      draftContentV2: nextDraft,
      draftRevision: 2,
      draftUpdatedAt: 1_750_000_000_100,
      updatedAt: 1_750_000_000_100,
    });
  });

  const publicResult = await t.query(
    api.communityPublic.resolvePublicFunnelBySlug,
    { communitySlug: "community-funnel-publish" },
  );
  expect(publicResult.community?.funnel.published_content_v2).toEqual(
    fixture.draft,
  );
  expect(publicResult.community?.funnel.published_content_v2).not.toEqual(
    nextDraft,
  );
});

test("overlong draft content fails without changing draft or published state", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  await asOwner.mutation(api.communityFunnel.publishCommunityFunnelDraft, {
    communityId: fixture.communityId,
    expectedDraftRevision: 1,
  });

  await expect(
    t.mutation(internal.communityFunnel.saveCommunityFunnelDraftInternal, {
      userId: fixture.ownerId,
      communityId: fixture.communityId,
      slot: "custom_1",
      expectedDraftRevision: 1,
      content: {
        ...fixture.draft,
        long_form_markdown: "x".repeat(12_001),
      },
    }),
  ).rejects.toThrow("community_funnel_long_form_too_long");

  const row = await t.run(async (ctx) => ctx.db.get(fixture.funnelId));
  expect(row).toMatchObject({
    draftRevision: 1,
    draftContentV2: fixture.draft,
    publishedDraftRevision: 1,
    publishedContentV2: fixture.draft,
  });
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
  expect(config.published_content_v2).toEqual(fixture.draft);
  const row = await t.run(async (ctx) => ctx.db.get(fixture.funnelId));
  expect(row?.publishedContentV2).toEqual(fixture.draft);
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
  const legacyBase = buildCommunityFunnelDocumentTestFixture();
  const legacyDocument = {
    ...legacyBase,
    sections: [
      legacyBase.sections[0],
      {
        id: "legacy-media",
        type: "media" as const,
        media_url: legacyVslUrl,
        caption: null,
      },
      ...legacyBase.sections.slice(1),
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

test("legacy singleton publication remains live and is promoted to custom one", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  const result = await asOwner.mutation(
    api.communityFunnel.publishCommunityFunnelDraft,
    {
      communityId: fixture.communityId,
      expectedDraftRevision: 1,
    },
  );

  expect(result.active_slot).toBe("custom_1");
  expect(result.custom_funnels.custom_1?.published_content_v2).toEqual(
    fixture.draft,
  );
  const community = await t.run(async (ctx) =>
    ctx.db.get(fixture.communityId),
  );
  expect(community?.activeFunnelSlot).toBe("custom_1");
});

test("slot-aware publication is private until the published slot is activated", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const customTwoDraft = buildCommunityFunnelContentTestFixture({
    headline: "Custom funnel two",
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, { activeFunnelSlot: "default" });
    await ctx.db.insert("communityFunnels", {
      communityId: fixture.communityId,
      slot: "custom_2",
      draftContentV2: customTwoDraft,
      draftRevision: 1,
      draftUpdatedAt: 1_750_000_000_010,
      draftUpdatedByUserId: fixture.ownerId,
      createdAt: 1_750_000_000_010,
      updatedAt: 1_750_000_000_010,
    });
  });

  const published = await asOwner.mutation(
    api.communityFunnel.publishCommunityFunnelDraft,
    {
      communityId: fixture.communityId,
      slot: "custom_2",
      expectedDraftRevision: 1,
    },
  );
  expect(published.active_slot).toBe("default");
  expect(published.custom_funnels.custom_2?.published_content_v2).toEqual(
    customTwoDraft,
  );
  const beforeActivation = await t.query(
    api.communityPublic.resolvePublicFunnelBySlug,
    { communitySlug: "community-funnel-publish" },
  );
  expect(beforeActivation.community?.funnel.published_content_v2).toBeNull();

  const activated = await asOwner.mutation(
    api.communityFunnel.setActiveCommunityFunnel,
    {
      communityId: fixture.communityId,
      target: {
        slot: "custom_2",
        expectedPublishedDraftRevision: 1,
      },
    },
  );
  expect(activated.active_slot).toBe("custom_2");
  const afterActivation = await t.query(
    api.communityPublic.resolvePublicFunnelBySlug,
    { communitySlug: "community-funnel-publish" },
  );
  expect(afterActivation.community?.funnel.published_content_v2).toEqual(
    customTwoDraft,
  );

  await asOwner.mutation(api.communityFunnel.setActiveCommunityFunnel, {
    communityId: fixture.communityId,
    target: { slot: "default" },
  });
  const afterDefault = await t.query(
    api.communityPublic.resolvePublicFunnelBySlug,
    { communitySlug: "community-funnel-publish" },
  );
  expect(afterDefault.community?.funnel.published_content_v2).toBeNull();
});

test("custom funnel revisions and VSL state are isolated by slot", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  await t.run(async (ctx) => {
    await ctx.db.insert("communityFunnels", {
      communityId: fixture.communityId,
      slot: "custom_2",
      draftContentV2: buildCommunityFunnelContentTestFixture({
        headline: "Second isolated draft",
      }),
      draftRevision: 1,
      draftUpdatedAt: 1_750_000_000_010,
      draftUpdatedByUserId: fixture.ownerId,
      createdAt: 1_750_000_000_010,
      updatedAt: 1_750_000_000_010,
    });
  });

  const saved = await asOwner.mutation(
    api.communityFunnel.setCommunityFunnelDraftVsl,
    {
      communityId: fixture.communityId,
      slot: "custom_2",
      expectedDraftRevision: 1,
      url: "https://vimeo.com/123456789",
    },
  );
  expect(saved.custom_funnels.custom_1?.draft_revision).toBe(1);
  expect(saved.custom_funnels.custom_1?.draft_vsl_url).toBe(VSL_URL);
  expect(saved.custom_funnels.custom_2?.draft_revision).toBe(2);
  expect(saved.custom_funnels.custom_2?.draft_vsl_url).toBe(
    "https://vimeo.com/123456789",
  );

  await expect(
    asOwner.mutation(api.communityFunnel.setCommunityFunnelDraftVsl, {
      communityId: fixture.communityId,
      slot: "custom_2",
      expectedDraftRevision: 1,
      url: null,
    }),
  ).rejects.toThrow("community_funnel_draft_conflict");
});

test("activation requires manager authority and a published custom slot", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await expect(
    asMember.mutation(api.communityFunnel.setActiveCommunityFunnel, {
      communityId: fixture.communityId,
      target: { slot: "default" },
    }),
  ).rejects.toThrow("community_forbidden");
  await expect(
    asOwner.mutation(api.communityFunnel.setActiveCommunityFunnel, {
      communityId: fixture.communityId,
      target: {
        slot: "custom_1",
        expectedPublishedDraftRevision: 0,
      },
    }),
  ).rejects.toThrow("community_funnel_activation_requires_published");
});

test("activation rejects a stale published revision without moving the live slot", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const publishedDocument = buildCommunityFunnelContentTestFixture({
    headline: "Newer published funnel",
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, { activeFunnelSlot: "default" });
    await ctx.db.insert("communityFunnels", {
      communityId: fixture.communityId,
      slot: "custom_2",
      draftContentV2: publishedDocument,
      draftRevision: 2,
      draftUpdatedAt: 1_750_000_000_020,
      draftUpdatedByUserId: fixture.ownerId,
      publishedContentV2: publishedDocument,
      publishedDraftRevision: 2,
      publishedAt: 1_750_000_000_020,
      publishedByUserId: fixture.ownerId,
      createdAt: 1_750_000_000_010,
      updatedAt: 1_750_000_000_020,
    });
  });

  await expect(
    asOwner.mutation(api.communityFunnel.setActiveCommunityFunnel, {
      communityId: fixture.communityId,
      target: {
        slot: "custom_2",
        expectedPublishedDraftRevision: 1,
      },
    }),
  ).rejects.toThrow("community_funnel_activation_conflict");
  await expect(
    asOwner.mutation(api.communityFunnel.setActiveCommunityFunnel, {
      communityId: fixture.communityId,
      target: {
        slot: "custom_2",
        expectedPublishedDraftRevision: 2.5,
      },
    }),
  ).rejects.toThrow("community_funnel_activation_conflict");
  const afterConflict = await t.run(async (ctx) =>
    ctx.db.get(fixture.communityId),
  );
  expect(afterConflict?.activeFunnelSlot).toBe("default");

  const activated = await asOwner.mutation(
    api.communityFunnel.setActiveCommunityFunnel,
    {
      communityId: fixture.communityId,
      target: {
        slot: "custom_2",
        expectedPublishedDraftRevision: 2,
      },
    },
  );
  expect(activated.active_slot).toBe("custom_2");
});

test("duplicate persisted rows for one funnel slot fail closed", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  await t.run(async (ctx) => {
    await ctx.db.insert("communityFunnels", {
      communityId: fixture.communityId,
      slot: "custom_1",
      draftRevision: 0,
      createdAt: 1_750_000_000_010,
      updatedAt: 1_750_000_000_010,
    });
  });

  await expect(
    asOwner.query(api.communityFunnel.getCommunityFunnelConfig, {
      communityId: fixture.communityId,
    }),
  ).rejects.toThrow("community_funnel_slot_duplicate");
});
