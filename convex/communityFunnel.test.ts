/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityFunnel.ts",
  "./communityPublic.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "funnel-authority-owner";
const MEMBER_SUBJECT = "funnel-authority-member";

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
      activeFunnelSlot: "custom_1",
      settingsRevision: 3,
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
    // A historical row: founder intro video plus a published custom funnel.
    await ctx.db.insert("communityFunnels", {
      communityId,
      slot: "custom_1",
      heroMediaUrl: "https://www.youtube.com/watch?v=intro",
      heroMediaKind: "video",
      liveMode: "custom",
      publishedContentV2: {
        version: 2,
        headline: "Old custom headline",
        subheadline: "Old custom subheadline.",
        pillars: [
          { title: "One", body: "First." },
          { title: "Two", body: "Second." },
          { title: "Three", body: "Third." },
        ],
        long_form_markdown: "Old custom narrative.",
      },
      publishedDraftRevision: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    } as any);
    return { communityId };
  });
}

test("the join page is the plain default: no custom funnel content or intro media", async () => {
  const t = convexTest(schema, modules);
  await createFixture(t);
  const result = await t.query(api.communityPublic.resolvePublicFunnelBySlug, { communitySlug: "funnel-authority" });
  expect(result.ok).toBe(true);
  expect((result as any).community.funnel).toEqual({
    hero_media_url: null,
    hero_media_kind: "image",
    active_slot: "default",
    published_vsl_url: null,
    published_content_v2: null,
  });
  expect((result as any).community).not.toHaveProperty("external_funnel_url");
});

test("retired funnel stand-ins read the plain default and reject writes", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const config = await owner.query(api.communityFunnel.getCommunityFunnelConfig, { authSubject: OWNER_SUBJECT, communityId });
  expect(config).toMatchObject({
    active_slot: "default",
    published_content_v2: null,
    external_funnel_url: null,
    external_funnel_active: false,
    settings_revision: 3,
    custom_funnels: { custom_1: null, custom_2: null },
  });
  expect(await owner.query(api.communityFunnel.getCommunityFunnelDraftPreview, { authSubject: OWNER_SUBJECT, slug: "funnel-authority" }))
    .toEqual(config);
  await expect(owner.mutation(api.communityFunnel.setCommunityExternalFunnelUrl, {
    authSubject: OWNER_SUBJECT, communityId, expectedSettingsRevision: 3, url: "https://example.com",
  })).rejects.toThrow(/community_funnel_retired/);
  await expect(owner.mutation(api.communityFunnel.setCommunityExternalFunnelActive, {
    authSubject: OWNER_SUBJECT, communityId, expectedSettingsRevision: 3, expectedUrl: "https://example.com", active: true,
  })).rejects.toThrow(/community_funnel_retired/);
});

test("members cannot read the manager funnel stand-ins", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t);
  const member = t.withIdentity({ subject: MEMBER_SUBJECT });
  await expect(member.query(api.communityFunnel.getCommunityFunnelConfig, { authSubject: MEMBER_SUBJECT, communityId }))
    .rejects.toThrow();
  await expect(member.query(api.communityFunnel.getCommunityFunnelDraftPreview, { authSubject: MEMBER_SUBJECT, slug: "funnel-authority" }))
    .rejects.toThrow();
});
