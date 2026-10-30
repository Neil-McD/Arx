/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { normalizeCommunityTheme } from "../shared/communityTheme";
import { COMMUNITY_THEME_PALETTES } from "../shared/communityThemePalettes";

const modules = import.meta.glob([
  "./communityThemes.ts",
  "./communitySavedThemes.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "saved-theme-owner";
const MEMBER_SUBJECT = "saved-theme-member";

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_750_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { authSubject: OWNER_SUBJECT, displayName: "Owner", createdAt: nowMs, updatedAt: nowMs });
    const memberId = await ctx.db.insert("users", { authSubject: MEMBER_SUBJECT, displayName: "Member", createdAt: nowMs, updatedAt: nowMs });
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "ai-employee-builders", name: "AI Employee Builders", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeFunnelSlot: "default", createdAt: nowMs, updatedAt: nowMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId, userId: memberId, role: "member", accessSource: "manual_grant", active: true, createdAt: nowMs, updatedAt: nowMs,
    });
    return { communityId };
  });
}

const maroon = COMMUNITY_THEME_PALETTES.find((palette) => palette.id === "maroon-gold")!;

test("palettes are valid in both schemes and have unique ids", () => {
  expect(COMMUNITY_THEME_PALETTES.length).toBeGreaterThanOrEqual(15);
  expect(new Set(COMMUNITY_THEME_PALETTES.map((palette) => palette.id)).size).toBe(COMMUNITY_THEME_PALETTES.length);
  for (const palette of COMMUNITY_THEME_PALETTES) {
    expect(normalizeCommunityTheme({ version: 1, schemes: palette.schemes }).ok, palette.id).toBe(true);
  }
});

test("an owner saves, renames, applies and deletes named themes; members can't", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  const look = { version: 1, schemes: { light: maroon.schemes.light }, font_heading: "Fraunces" };

  await expect(asMember.mutation(api.communitySavedThemes.saveCommunitySavedTheme, { communityId, name: "Mine", theme: look })).rejects.toThrow();

  const first = await asOwner.mutation(api.communitySavedThemes.saveCommunitySavedTheme, { communityId, name: "  Autumn   launch ", theme: look });
  expect(first.savedThemes.map((saved: { name: string }) => saved.name)).toEqual(["Autumn launch"]);
  await expect(asOwner.mutation(api.communitySavedThemes.saveCommunitySavedTheme, { communityId, name: "autumn LAUNCH", theme: look }))
    .rejects.toThrow(/saved_theme_name_taken/);
  await expect(asOwner.mutation(api.communitySavedThemes.saveCommunitySavedTheme, { communityId, name: "Bad", theme: { version: 1, radius: 99 } }))
    .rejects.toThrow(/community_theme_invalid/);

  const renamed = await asOwner.mutation(api.communitySavedThemes.renameCommunitySavedTheme, { communityId, savedThemeId: first.savedThemeId as any, name: "Maroon launch" });
  expect(renamed[0].name).toBe("Maroon launch");

  const applied = await asOwner.mutation(api.communitySavedThemes.applyCommunitySavedThemeToDraft, { communityId, savedThemeId: first.savedThemeId as any, expectedDraftRevision: 0 });
  expect(applied.draft.font_heading).toBe("Fraunces");
  expect(applied.draft.schemes).toEqual({ light: maroon.schemes.light });
  expect(applied.published).toBeNull();

  const left = await asOwner.mutation(api.communitySavedThemes.deleteCommunitySavedTheme, { communityId, savedThemeId: first.savedThemeId as any });
  expect(left).toEqual([]);
  // Deleting the saved copy leaves the draft alone.
  const draft = await asOwner.query(api.communityThemes.getCommunityThemeDraft, { communityId });
  expect(draft.draft.font_heading).toBe("Fraunces");
});

test("a palette changes the draft's colours only and keeps its schemes", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const saved = await asOwner.mutation(api.communityThemes.saveCommunityThemeDraft, {
    communityId, expectedDraftRevision: 0,
    theme: { version: 1, schemes: { dark: COMMUNITY_THEME_PALETTES[0].schemes.dark }, radius: 4, font_heading: "Barlow Condensed" },
  });
  const forest = COMMUNITY_THEME_PALETTES.find((palette) => palette.id === "forest-gold")!;
  const next = await asOwner.mutation(api.communitySavedThemes.applyCommunityThemePaletteToDraft, {
    communityId, paletteId: "forest-gold", expectedDraftRevision: saved.draftRevision,
  });
  expect(next.draft.schemes).toEqual({ dark: forest.schemes.dark });
  expect(next.draft.radius).toBe(4);
  expect(next.draft.font_heading).toBe("Barlow Condensed");
  await expect(asOwner.mutation(api.communitySavedThemes.applyCommunityThemePaletteToDraft, {
    communityId, paletteId: "nope", expectedDraftRevision: next.draftRevision,
  })).rejects.toThrow(/theme_palette_not_found/);
});
