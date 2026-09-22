/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { validateCommunityFunnelContentV2 } from "../shared/communityFunnel";

const modules = import.meta.glob([
  "./communityFunnel.ts",
  "./communityPublic.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "funnel-authority-owner";
const MEMBER_SUBJECT = "funnel-authority-member";
const VSL_URL = "https://www.youtube.com/watch?v=abcdefghijk";

function content(headline = "Build a community that compounds") {
  return {
    version: 2 as const,
    headline,
    subheadline: "Turn shared context into coordinated action.",
    pillars: [
      { title: "Think together", body: "Bring the right people and context together." },
      { title: "Remember", body: "Carry useful knowledge forward." },
      { title: "Act", body: "Turn shared intelligence into outcomes." },
    ],
    long_form_markdown:
      "## Built for durable collaboration\n\nCommunities become more useful when their knowledge survives the conversation.",
  };
}

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_750_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: OWNER_SUBJECT,
      displayName: "Funnel owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: MEMBER_SUBJECT,
      displayName: "Funnel member",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "funnel-authority",
      name: "Funnel authority",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeFunnelSlot: "default",
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
    return { communityId, ownerId };
  });
}

test("default is immutable and public until an exact published custom slot is activated", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  const initial = await t.query(api.communityPublic.resolvePublicFunnelBySlug, {
    communitySlug: "funnel-authority",
  });
  expect(initial.community?.funnel).toMatchObject({
    active_slot: "default",
    published_content_v2: null,
  });

  const saved = await asOwner.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
    communityId: fixture.communityId,
    slot: "custom_1",
    expectedDraftRevision: 0,
    content: content("Custom one"),
  });
  expect(saved.active_slot).toBe("default");
  expect(saved.custom_funnels.custom_1).toMatchObject({
    slot: "custom_1",
    draft_revision: 1,
    draft_content_v2: { headline: "Custom one" },
  });

  const published = await asOwner.mutation(
    api.communityFunnel.publishCommunityFunnelDraft,
    {
      communityId: fixture.communityId,
      slot: "custom_1",
      expectedDraftRevision: 1,
    },
  );
  expect(published.active_slot).toBe("default");
  expect(published.custom_funnels.custom_1?.published_draft_revision).toBe(1);

  const activated = await asOwner.mutation(
    api.communityFunnel.setActiveCommunityFunnel,
    {
      communityId: fixture.communityId,
      target: { slot: "custom_1", expectedPublishedDraftRevision: 1 },
    },
  );
  expect(activated.active_slot).toBe("custom_1");
  const liveCustom = await t.query(api.communityPublic.resolvePublicFunnelBySlug, {
    communitySlug: "funnel-authority",
  });
  expect(liveCustom.community?.funnel).toMatchObject({
    active_slot: "custom_1",
    published_content_v2: { headline: "Custom one" },
  });
  expect(liveCustom.community?.funnel).not.toHaveProperty("draft_content_v2");
  expect(liveCustom.community?.funnel).not.toHaveProperty("custom_funnels");

  await asOwner.mutation(api.communityFunnel.setActiveCommunityFunnel, {
    communityId: fixture.communityId,
    target: { slot: "default" },
  });
  const restored = await t.query(api.communityPublic.resolvePublicFunnelBySlug, {
    communitySlug: "funnel-authority",
  });
  expect(restored.community?.funnel).toMatchObject({
    active_slot: "default",
    published_content_v2: null,
  });
});

test("manager website link is revisioned, public, and never a join or checkout authority", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  const input = { communityId: fixture.communityId, expectedSettingsRevision: 0 };

  await expect(asMember.mutation(api.communityFunnel.setCommunityExternalFunnelUrl, {
    ...input, url: "https://example.com/community",
  })).rejects.toThrow();
  await expect(asOwner.mutation(api.communityFunnel.setCommunityExternalFunnelUrl, {
    ...input, url: "javascript:alert(1)",
  })).rejects.toThrow("community_external_funnel_url_invalid");

  const saved = await asOwner.mutation(api.communityFunnel.setCommunityExternalFunnelUrl, {
    ...input, url: " https://example.com/community ",
  });
  expect(saved).toMatchObject({
    external_funnel_url: "https://example.com/community",
    settings_revision: 1,
    active_slot: "default",
  });
  const publicFunnel = await t.query(api.communityPublic.resolvePublicFunnelBySlug, {
    communitySlug: "funnel-authority",
  });
  expect(publicFunnel.community).toMatchObject({
    external_funnel_url: "https://example.com/community",
    entry_policy: "open",
    funnel: { active_slot: "default" },
  });
  const discover = await t.query(api.communityPublic.listPublicDiscoverCommunities, {});
  expect(discover.communities[0]).toMatchObject({
    slug: "funnel-authority",
    external_funnel_url: "https://example.com/community",
  });
  await expect(asOwner.mutation(api.communityFunnel.setCommunityExternalFunnelUrl, {
    ...input, url: "https://second.example.com",
  })).rejects.toThrow("community_settings_conflict");
  const cleared = await asOwner.mutation(api.communityFunnel.setCommunityExternalFunnelUrl, {
    communityId: fixture.communityId, expectedSettingsRevision: 1, url: null,
  });
  expect(cleared).toMatchObject({ external_funnel_url: null, settings_revision: 2 });
});

test("custom drafts, revisions, VSLs, and agent-facing selection are isolated by slot", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await asOwner.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
    communityId: fixture.communityId,
    slot: "custom_1",
    expectedDraftRevision: 0,
    content: content("Custom one"),
  });
  await asOwner.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
    communityId: fixture.communityId,
    slot: "custom_2",
    expectedDraftRevision: 0,
    content: content("Custom two"),
  });
  const withVsl = await asOwner.mutation(
    api.communityFunnel.setCommunityFunnelDraftVsl,
    {
      communityId: fixture.communityId,
      slot: "custom_2",
      expectedDraftRevision: 1,
      url: VSL_URL,
    },
  );
  expect(withVsl.custom_funnels.custom_1).toMatchObject({
    draft_revision: 1,
    draft_vsl_url: null,
    draft_content_v2: { headline: "Custom one" },
  });
  expect(withVsl.custom_funnels.custom_2).toMatchObject({
    draft_revision: 2,
    draft_vsl_url: VSL_URL,
    draft_content_v2: { headline: "Custom two" },
  });

  const selected = await t.query(internal.communityFunnel.getCommunityFunnelDraftInternal, {
    communityId: fixture.communityId,
    slot: "custom_2",
  });
  expect(selected).toMatchObject({
    selected_slot: "custom_2",
    selected_funnel: {
      draft_revision: 2,
      draft_vsl_url: VSL_URL,
      draft_content_v2: { headline: "Custom two" },
    },
  });
});

test("manager authority and optimistic activation fail closed", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await expect(
    asMember.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
      communityId: fixture.communityId,
      slot: "custom_1",
      expectedDraftRevision: 0,
      content: content(),
    }),
  ).rejects.toThrow("community_forbidden");
  await expect(
    asOwner.mutation(api.communityFunnel.setActiveCommunityFunnel, {
      communityId: fixture.communityId,
      target: { slot: "custom_2", expectedPublishedDraftRevision: 0 },
    }),
  ).rejects.toThrow("community_funnel_activation_requires_published");

  await asOwner.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
    communityId: fixture.communityId,
    slot: "custom_1",
    expectedDraftRevision: 0,
    content: content(),
  });
  await asOwner.mutation(api.communityFunnel.publishCommunityFunnelDraft, {
    communityId: fixture.communityId,
    slot: "custom_1",
    expectedDraftRevision: 1,
  });
  await expect(
    asOwner.mutation(api.communityFunnel.setActiveCommunityFunnel, {
      communityId: fixture.communityId,
      target: { slot: "custom_1", expectedPublishedDraftRevision: 0 },
    }),
  ).rejects.toThrow("community_funnel_activation_conflict");
  const community = await t.run(async (ctx) => ctx.db.get(fixture.communityId));
  expect(community?.activeFunnelSlot).toBe("default");
});

test("manager preview exposes both private slots while public output exposes only the active snapshot", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  await asOwner.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
    communityId: fixture.communityId,
    slot: "custom_2",
    expectedDraftRevision: 0,
    content: content("Private two"),
  });

  await expect(
    asOwner.query(api.communityFunnel.getCommunityFunnelDraftPreview, {
      slug: "FUNNEL-AUTHORITY",
    }),
  ).resolves.toMatchObject({
    active_slot: "default",
    custom_funnels: {
      custom_1: null,
      custom_2: { draft_content_v2: { headline: "Private two" } },
    },
  });
  await expect(
    asMember.query(api.communityFunnel.getCommunityFunnelDraftPreview, {
      slug: "funnel-authority",
    }),
  ).rejects.toThrow("community_forbidden");
});

test("bounded content and duplicate rows fail closed", async () => {
  expect(() => validateCommunityFunnelContentV2({ ...content(), extra: true })).toThrow(
    "community_funnel_content_fields_invalid",
  );
  expect(() =>
    validateCommunityFunnelContentV2({
      ...content(),
      long_form_markdown: "<script>alert(1)</script>",
    }),
  ).toThrow("community_funnel_long_form_html_forbidden");

  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("communityFunnels", {
      communityId: fixture.communityId,
      slot: "custom_1",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("communityFunnels", {
      communityId: fixture.communityId,
      slot: "custom_1",
      createdAt: 2,
      updatedAt: 2,
    });
  });
  await expect(
    t.query(api.communityPublic.resolvePublicFunnelBySlug, {
      communitySlug: "funnel-authority",
    }),
  ).rejects.toThrow("community_funnel_slot_duplicate");
});
