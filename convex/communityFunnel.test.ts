/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import {
  buildCommunityFunnelManagerConfig,
  buildCommunityFunnelPublicConfig,
  saveCommunityFunnelConfigInternal,
} from "./communityFunnel";
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
    return { communityId, memberId, ownerId };
  });
}

test("default remains public until a manager explicitly publishes and activates custom", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  const initial = await t.query(api.communityPublic.resolvePublicFunnelBySlug, {
    communitySlug: "funnel-authority",
  });
  expect(initial.community?.funnel).toMatchObject({
    live_mode: "default",
    published_content_v2: null,
  });

  const saved = await asOwner.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
    communityId: fixture.communityId,
    expectedDraftRevision: 0,
    content: content(),
  });
  expect(saved).toMatchObject({ draft_revision: 1, live_mode: "default" });

  const stillDefault = await t.query(api.communityPublic.resolvePublicFunnelBySlug, {
    communitySlug: "funnel-authority",
  });
  expect(stillDefault.community?.funnel.published_content_v2).toBeNull();

  const published = await asOwner.mutation(
    api.communityFunnel.publishCommunityFunnelDraft,
    { communityId: fixture.communityId, expectedDraftRevision: 1 },
  );
  expect(published).toMatchObject({
    live_mode: "default",
    published_draft_revision: 1,
    published_content_v2: content(),
  });

  const activated = await asOwner.mutation(
    api.communityFunnel.setCommunityFunnelLiveMode,
    {
      communityId: fixture.communityId,
      mode: "custom",
      expectedPublishedDraftRevision: 1,
    },
  );
  expect(activated.live_mode).toBe("custom");

  const custom = await t.query(api.communityPublic.resolvePublicFunnelBySlug, {
    communitySlug: "funnel-authority",
  });
  expect(custom.community?.funnel).toMatchObject({
    live_mode: "custom",
    published_content_v2: content(),
  });
  expect(custom.community?.funnel).not.toHaveProperty("draft_content_v2");
  expect(custom.community?.funnel).not.toHaveProperty("draft_revision");
});

test("manager authority, optimistic revisions, and publish idempotency fail closed", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await expect(
    asMember.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
      communityId: fixture.communityId,
      expectedDraftRevision: 0,
      content: content(),
    }),
  ).rejects.toThrow("community_forbidden");

  await asOwner.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
    communityId: fixture.communityId,
    expectedDraftRevision: 0,
    content: content(),
  });
  await expect(
    asOwner.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
      communityId: fixture.communityId,
      expectedDraftRevision: 0,
      content: content("A stale overwrite"),
    }),
  ).rejects.toThrow("community_funnel_draft_conflict");
  await expect(
    asOwner.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
      communityId: fixture.communityId,
      expectedDraftRevision: 1.5,
      content: content("An invalid revision"),
    }),
  ).rejects.toThrow("community_funnel_draft_revision_invalid");

  const first = await asOwner.mutation(
    api.communityFunnel.publishCommunityFunnelDraft,
    { communityId: fixture.communityId, expectedDraftRevision: 1 },
  );
  const second = await asOwner.mutation(
    api.communityFunnel.publishCommunityFunnelDraft,
    { communityId: fixture.communityId, expectedDraftRevision: 1 },
  );
  expect(second.published_at).toBe(first.published_at);

  await expect(
    asOwner.mutation(api.communityFunnel.setCommunityFunnelLiveMode, {
      communityId: fixture.communityId,
      mode: "custom",
      expectedPublishedDraftRevision: 0,
    }),
  ).rejects.toThrow("community_funnel_activation_conflict");
});

test("draft VSL is separate from published media and snapshots only on publish", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await asOwner.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
    communityId: fixture.communityId,
    expectedDraftRevision: 0,
    content: content(),
  });
  const withVsl = await asOwner.mutation(
    api.communityFunnel.setCommunityFunnelDraftVsl,
    {
      communityId: fixture.communityId,
      expectedDraftRevision: 1,
      url: VSL_URL,
    },
  );
  expect(withVsl).toMatchObject({
    draft_revision: 2,
    draft_vsl_url: VSL_URL,
    published_vsl_url: null,
  });
  await expect(
    asOwner.mutation(api.communityFunnel.saveCommunityFunnelDraft, {
      communityId: fixture.communityId,
      expectedDraftRevision: 1,
      content: content("A stale post-VSL overwrite"),
    }),
  ).rejects.toThrow("community_funnel_draft_conflict");

  const published = await asOwner.mutation(
    api.communityFunnel.publishCommunityFunnelDraft,
    { communityId: fixture.communityId, expectedDraftRevision: 2 },
  );
  expect(published.published_vsl_url).toBe(VSL_URL);
});

test("bounded content rejects unsafe or structurally ambiguous input", () => {
  expect(() =>
    validateCommunityFunnelContentV2({
      ...content(),
      extra: "second authority",
    }),
  ).toThrow("community_funnel_content_fields_invalid");
  expect(() =>
    validateCommunityFunnelContentV2({
      ...content(),
      long_form_markdown: "<script>alert(1)</script>",
    }),
  ).toThrow("community_funnel_long_form_html_forbidden");
  expect(() =>
    validateCommunityFunnelContentV2({
      ...content(),
      pillars: content().pillars.slice(0, 2),
    }),
  ).toThrow("community_funnel_content_requires_three_pillars");
});

test("a pre-selector published row remains live until default is chosen", () => {
  const legacyPublished = {
    _id: "legacy",
    communityId: "community",
    publishedContentV2: content(),
    publishedDraftRevision: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  expect(buildCommunityFunnelPublicConfig(legacyPublished)).toMatchObject({
    live_mode: "custom",
    published_content_v2: content(),
  });
  expect(
    buildCommunityFunnelPublicConfig({
      ...legacyPublished,
      liveMode: "default",
    }),
  ).toMatchObject({
    live_mode: "default",
    published_content_v2: null,
  });
});

test("legacy media removal preserves canonical funnel state", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("communityFunnels", {
      communityId: fixture.communityId,
      heroMediaUrl: VSL_URL,
      heroMediaKind: "video",
      liveMode: "custom",
      draftContentV2: content(),
      publishedContentV2: content(),
      draftRevision: 1,
      publishedDraftRevision: 1,
      createdAt: 1_750_000_000_000,
      updatedAt: 1_750_000_000_000,
    });
    await saveCommunityFunnelConfigInternal(
      ctx,
      fixture.communityId,
      { hero_media_url: null, hero_media_kind: "image" },
      1_750_000_000_100,
    );
    const row = await ctx.db
      .query("communityFunnels")
      .withIndex("by_community", (q) => q.eq("communityId", fixture.communityId))
      .first();
    expect(buildCommunityFunnelManagerConfig(row)).toMatchObject({
      hero_media_url: null,
      live_mode: "custom",
      published_content_v2: content(),
    });
    expect(buildCommunityFunnelPublicConfig(row).published_content_v2).toEqual(
      content(),
    );
  });
});

test("duplicate funnel rows fail closed instead of selecting one", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    const nowMs = 1_750_000_000_000;
    await ctx.db.insert("communityFunnels", {
      communityId: fixture.communityId,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityFunnels", {
      communityId: fixture.communityId,
      createdAt: nowMs + 1,
      updatedAt: nowMs + 1,
    });
  });

  await expect(
    t.query(api.communityPublic.resolvePublicFunnelBySlug, {
      communitySlug: "funnel-authority",
    }),
  ).rejects.toThrow("community_funnel_duplicate_rows");
});
