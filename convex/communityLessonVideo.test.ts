/// <reference types="vite/client" />
// A lesson's video, the same rule through every door (docs/specs/lesson-video-v0.md):
// the app's own save, the guide's batch and (in mcpLenses.test.ts) an outside AI.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { lessonVideoProblem, lessonVideoProvider } from "../shared/videoEmbed";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = 1_790_000_000_000;

test("a lesson can play YouTube, Loom, Vimeo and Wistia links, and nothing else", () => {
  expect(lessonVideoProvider("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
  expect(lessonVideoProvider("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe("youtube");
  expect(lessonVideoProvider("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("youtube");
  expect(lessonVideoProvider("https://www.loom.com/share/abcdef123456")).toBe("loom");
  expect(lessonVideoProvider("https://vimeo.com/123456789")).toBe("vimeo");
  expect(lessonVideoProvider("https://home.wistia.com/medias/abc123xyz")).toBe("wistia");
  expect(lessonVideoProvider("https://example.com/watch?v=dQw4w9WgXcQ")).toBe(null);
  expect(lessonVideoProvider("")).toBe(null);
  expect(lessonVideoProvider(null)).toBe(null);
  // Only a new or changed link is checked; empty clears; an old page link stays.
  expect(lessonVideoProblem("https://example.com/page", null)).toBe("lesson_video_unplayable");
  expect(lessonVideoProblem("https://example.com/page", "https://example.com/page")).toBe(null);
  expect(lessonVideoProblem("", "https://example.com/page")).toBe(null);
  expect(lessonVideoProblem("https://vimeo.com/123456789", "https://example.com/page")).toBe(null);
});

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx: any) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Kiln", slug: "kiln", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 1, createdAt: NOW, updatedAt: NOW });
    const moduleId = await ctx.db.insert("communityResourceModules", { communityId, createdByUserId: ownerId, status: "draft", name: "Core", sortOrder: 1000, createdAt: NOW, updatedAt: NOW });
    // An older lesson whose link is a page to read, from before it was the video.
    const oldId = await ctx.db.insert("communityResources", { communityId, createdByUserId: ownerId, moduleId, type: "post", role: "page", status: "draft",
      title: "Old lesson", bodyMd: "Words.", url: "https://example.com/old-page", pinned: false, createdAt: NOW, updatedAt: NOW });
    return { ownerId, communityId, moduleId, oldId };
  });
  const lesson = (id: any) => t.run(async (ctx: any) => await ctx.db.get(id));
  return { t, ids, lesson, asOwner: t.withIdentity({ subject: "owner" }) };
}

test("the app's own save: a video that plays is kept; a page link is refused; an older lesson's page link survives other edits", async () => {
  const { ids, lesson, asOwner } = await fixture();
  const save = (resourceId: any, payload: Record<string, unknown>) => asOwner.mutation(api.communityResources.saveCommunityResource, { resourceId, isPatch: true, payload });
  const create = (extra: Record<string, unknown>) => asOwner.mutation(api.communityResources.saveCommunityResource, { resourceId: null, isPatch: false,
    payload: { community_id: ids.communityId, type: "post", resource_role: "page", title: "New", body_md: "Words.", pinned: false, module_id: ids.moduleId, ...extra } });

  const made: any = await create({ url: "https://youtu.be/dQw4w9WgXcQ" });
  expect((await lesson(made.id)).url).toBe("https://youtu.be/dQw4w9WgXcQ");
  await expect(create({ title: "Bad", url: "https://example.com/not-a-video" })).rejects.toThrow("lesson_video_unplayable");

  await expect(save(made.id, { url: "https://example.com/not-a-video" })).rejects.toThrow("lesson_video_unplayable");
  expect((await lesson(made.id)).url).toBe("https://youtu.be/dQw4w9WgXcQ");
  await save(made.id, { url: null });
  expect((await lesson(made.id)).url).toBeUndefined();

  // The editor sends the lesson's current url with every save: an old page link is not a change.
  await save(ids.oldId, { title: "Old lesson, renamed", url: "https://example.com/old-page", body_md: "Words." });
  expect(await lesson(ids.oldId)).toMatchObject({ title: "Old lesson, renamed", url: "https://example.com/old-page" });
});

test("the guide's batch: a video that plays is saved; a page link refuses the whole batch", async () => {
  const { t, ids, lesson } = await fixture();
  const send = (key: string, operations: unknown[]) => t.mutation(internal.communityResources.runCommunityResourceBuilderBatchInternal, {
    userId: ids.ownerId, communityId: ids.communityId, summary: `Send ${key}.`, operations, idempotencyKey: key });
  const titles = () => t.run(async (ctx: any) => (await ctx.db.query("communityResources").collect()).map((row: any) => row.title));

  await expect(send("ok", [{ op: "create_page", module_id: ids.moduleId, title: "With a video", url: "https://vimeo.com/123456789" }]))
    .resolves.toMatchObject({ applied: true });
  expect(await titles()).toContain("With a video");

  await expect(send("bad-new", [
    { op: "create_page", module_id: ids.moduleId, title: "Would be made first" },
    { op: "create_page", module_id: ids.moduleId, title: "Bad", url: "https://example.com/page" },
  ])).rejects.toThrow("lesson_video_unplayable");
  expect(await titles()).not.toContain("Would be made first");

  const old: any = await lesson(ids.oldId);
  await expect(send("bad-edit", [{ op: "edit_page", resource_id: ids.oldId, expected_updated_at: old.updatedAt, url: "https://example.com/other-page" }]))
    .rejects.toThrow("lesson_video_unplayable");
  // The same old link sent back unchanged is not a change, and an edit can replace it with a video.
  await expect(send("same", [{ op: "edit_page", resource_id: ids.oldId, expected_updated_at: old.updatedAt, url: "https://example.com/old-page", title: "Old, kept" }]))
    .resolves.toMatchObject({ applied: true });
  const kept: any = await lesson(ids.oldId);
  await expect(send("swap", [{ op: "edit_page", resource_id: ids.oldId, expected_updated_at: kept.updatedAt, url: "https://www.loom.com/share/abcdef123456" }]))
    .resolves.toMatchObject({ applied: true });
  expect((await lesson(ids.oldId)).url).toBe("https://www.loom.com/share/abcdef123456");
});
