/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { DEFAULT_COMMUNITY_THEME } from "../shared/communityTheme";

const modules = import.meta.glob([
  "./communityThemes.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "theme-owner";
const MEMBER_SUBJECT = "theme-member";

const STOPWATCH = {
  version: 1,
  schemes: {
    dark: {
      background: "#0B0B0B", surface: "#151515", text: "#F2F2EF", muted: "#9C9C96", border: "#2B2B2B",
      accent: "#3FD15A", on_accent: "#0B0B0B", button: "#3FD15A", on_button: "#0B0B0B",
    },
  },
  font_heading: "Barlow Condensed",
  heading_case: "upper",
  numerals: "tabular",
};

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_750_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { authSubject: OWNER_SUBJECT, displayName: "Owner", createdAt: nowMs, updatedAt: nowMs });
    const memberId = await ctx.db.insert("users", { authSubject: MEMBER_SUBJECT, displayName: "Member", createdAt: nowMs, updatedAt: nowMs });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "the-2-hour-club",
      name: "The 2-Hour Club",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeFunnelSlot: "default",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId, userId: memberId, role: "member", accessSource: "manual_grant", active: true, createdAt: nowMs, updatedAt: nowMs,
    });
    return { communityId };
  });
}

test("members see Polynet's look until a draft is published", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  expect(await t.query(api.communityThemes.getPublishedCommunityTheme, { communityId })).toBeNull();
  const empty = await asOwner.query(api.communityThemes.getCommunityThemeDraft, { communityId });
  expect(empty).toMatchObject({ draft: DEFAULT_COMMUNITY_THEME, draftRevision: 0, published: null, hasUnpublishedChanges: false });

  const saved = await asOwner.mutation(api.communityThemes.saveCommunityThemeDraft, { communityId, expectedDraftRevision: 0, theme: STOPWATCH });
  expect(saved).toMatchObject({ draftRevision: 1, published: null, hasUnpublishedChanges: true });
  expect(await t.query(api.communityThemes.getPublishedCommunityTheme, { communityId })).toBeNull();

  const published = await asOwner.mutation(api.communityThemes.publishCommunityThemeDraft, { communityId, expectedDraftRevision: 1 });
  expect(published.hasUnpublishedChanges).toBe(false);
  const live = await t.query(api.communityThemes.getPublishedCommunityTheme, { communityId });
  expect(live?.font_heading).toBe("Barlow Condensed");
  expect(live?.schemes.dark?.accent).toBe("#3FD15A");
});

test("invalid themes are rejected with every problem", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const error = await asOwner
    .mutation(api.communityThemes.saveCommunityThemeDraft, {
      communityId,
      expectedDraftRevision: 0,
      theme: { ...STOPWATCH, schemes: { dark: { ...STOPWATCH.schemes.dark, muted: "#3A3A3A" } }, radius: 99 },
    })
    .catch((caught) => caught);
  expect(error.data.code).toBe("community_theme_invalid");
  expect(error.data.problems.map((p: { path: string }) => p.path).sort()).toEqual(["radius", "schemes.dark.muted"]);
});

test("a stale editor cannot overwrite a newer draft", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  await asOwner.mutation(api.communityThemes.saveCommunityThemeDraft, { communityId, expectedDraftRevision: 0, theme: STOPWATCH });
  const error = await asOwner
    .mutation(api.communityThemes.saveCommunityThemeDraft, { communityId, expectedDraftRevision: 0, theme: {} })
    .catch((caught) => caught);
  expect(error.data).toEqual({ code: "community_theme_revision_conflict", currentRevision: 1 });
});

test("discarding returns the draft to the published theme", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  await asOwner.mutation(api.communityThemes.saveCommunityThemeDraft, { communityId, expectedDraftRevision: 0, theme: STOPWATCH });
  await asOwner.mutation(api.communityThemes.publishCommunityThemeDraft, { communityId, expectedDraftRevision: 1 });
  await asOwner.mutation(api.communityThemes.saveCommunityThemeDraft, { communityId, expectedDraftRevision: 1, theme: { ...STOPWATCH, radius: 12 } });
  const discarded = await asOwner.mutation(api.communityThemes.discardCommunityThemeDraft, { communityId, expectedDraftRevision: 2 });
  expect(discarded).toMatchObject({ draftRevision: 3, hasUnpublishedChanges: false });
  expect(discarded.draft.radius).toBe(discarded.published?.radius);
});

test("members cannot edit the theme", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t);
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  await expect(asMember.query(api.communityThemes.getCommunityThemeDraft, { communityId })).rejects.toThrow();
  await expect(
    asMember.mutation(api.communityThemes.saveCommunityThemeDraft, { communityId, expectedDraftRevision: 0, theme: STOPWATCH }),
  ).rejects.toThrow();
});
