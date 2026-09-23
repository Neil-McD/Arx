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

test("retired builder rejects old writes while preserving a historical private draft", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  await t.run(async (ctx) => {
    await ctx.db.insert("communityFunnels", {
      communityId: fixture.communityId,
      slot: "custom_1",
      draftContentV2: content("Historical private draft"),
      draftRevision: 1,
      createdAt: 1,
      updatedAt: 1,
    });
  });
  const draftBefore = await t.query(internal.communityFunnel.getCommunityFunnelDraftInternal, {
    communityId: fixture.communityId,
    slot: "custom_1",
  });
  expect(draftBefore.selected_funnel?.draft_content_v2).toMatchObject({ headline: "Historical private draft" });
  await expect(asMember.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
    communityId: fixture.communityId, slot: "custom_1", expectedDraftRevision: 1, content: content(),
  })).rejects.toThrow("community_forbidden");
  await expect(asOwner.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
    communityId: fixture.communityId, slot: "custom_1", expectedDraftRevision: 1, content: content(),
  })).rejects.toThrow("community_funnel_builder_retired");
  await expect(t.mutation(internal.communityFunnel.saveCommunityFunnelDraftInternal, {
    userId: fixture.ownerId, communityId: fixture.communityId, slot: "custom_1", expectedDraftRevision: 1, content: content(),
  })).rejects.toThrow("community_funnel_builder_retired");
  await expect(asOwner.mutation(api.communityFunnel.setCommunityFunnelDraftVsl, {
    communityId: fixture.communityId, slot: "custom_1", expectedDraftRevision: 1, url: "https://www.youtube.com/watch?v=abcdefghijk",
  })).rejects.toThrow("community_funnel_builder_retired");
  await expect(asOwner.mutation(api.communityFunnel.publishCommunityFunnelDraft, {
    communityId: fixture.communityId, slot: "custom_1", expectedDraftRevision: 1,
  })).rejects.toThrow("community_funnel_builder_retired");
  await expect(asOwner.mutation(api.communityFunnel.setActiveCommunityFunnel, {
    communityId: fixture.communityId, target: { slot: "custom_1", expectedPublishedDraftRevision: 1 },
  })).rejects.toThrow("community_funnel_builder_retired");
  const draftAfter = await t.query(internal.communityFunnel.getCommunityFunnelDraftInternal, {
    communityId: fixture.communityId, slot: "custom_1",
  });
  expect(draftAfter.selected_funnel).toEqual(draftBefore.selected_funnel);
  const publicFunnel = await t.query(api.communityPublic.resolvePublicFunnelBySlug, {
    communitySlug: "funnel-authority",
  });
  expect(publicFunnel.community?.funnel).toMatchObject({ active_slot: "default", published_content_v2: null });
  expect(publicFunnel.community?.funnel).not.toHaveProperty("draft_content_v2");
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
    external_funnel_active: false,
    settings_revision: 1,
    active_slot: "default",
  });
  const publicFunnel = await t.query(api.communityPublic.resolvePublicFunnelBySlug, {
    communitySlug: "funnel-authority",
  });
  expect(publicFunnel.community).toMatchObject({
    external_funnel_url: null,
    entry_policy: "open",
    funnel: { active_slot: "default" },
  });
  const discover = await t.query(api.communityPublic.listPublicDiscoverCommunities, {});
  expect(discover.communities[0]).toMatchObject({
    slug: "funnel-authority",
    external_funnel_url: null,
  });
  await expect(asMember.mutation(api.communityFunnel.setCommunityExternalFunnelActive, {
    communityId: fixture.communityId,
    expectedSettingsRevision: 1,
    expectedUrl: "https://example.com/community",
    active: true,
  })).rejects.toThrow();
  await expect(asOwner.mutation(api.communityFunnel.setCommunityExternalFunnelActive, {
    communityId: fixture.communityId,
    expectedSettingsRevision: 1,
    expectedUrl: "https://different.example.com",
    active: true,
  })).rejects.toThrow("community_external_funnel_url_changed");
  const activated = await asOwner.mutation(api.communityFunnel.setCommunityExternalFunnelActive, {
    communityId: fixture.communityId,
    expectedSettingsRevision: 1,
    expectedUrl: "https://example.com/community",
    active: true,
  });
  expect(activated).toMatchObject({ external_funnel_active: true, settings_revision: 2 });
  const activeDiscover = await t.query(api.communityPublic.listPublicDiscoverCommunities, {});
  expect(activeDiscover.communities[0]).toMatchObject({
    external_funnel_url: "https://example.com/community",
  });
  const activePublicFunnel = await t.query(api.communityPublic.resolvePublicFunnelBySlug, {
    communitySlug: "funnel-authority",
  });
  expect(activePublicFunnel.community).toMatchObject({
    external_funnel_url: "https://example.com/community",
  });
  const changed = await asOwner.mutation(api.communityFunnel.setCommunityExternalFunnelUrl, {
    communityId: fixture.communityId,
    expectedSettingsRevision: 2,
    url: "https://example.com/new",
  });
  expect(changed).toMatchObject({ external_funnel_active: false, settings_revision: 3 });
  const changedDiscover = await t.query(api.communityPublic.listPublicDiscoverCommunities, {});
  expect(changedDiscover.communities[0]).toMatchObject({ external_funnel_url: null });
  await expect(asOwner.mutation(api.communityFunnel.setCommunityExternalFunnelUrl, {
    ...input, url: "https://second.example.com",
  })).rejects.toThrow("community_settings_conflict");
  const cleared = await asOwner.mutation(api.communityFunnel.setCommunityExternalFunnelUrl, {
    communityId: fixture.communityId, expectedSettingsRevision: 3, url: null,
  });
  expect(cleared).toMatchObject({ external_funnel_url: null, external_funnel_active: false, settings_revision: 4 });
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
