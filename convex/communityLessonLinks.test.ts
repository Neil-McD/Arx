/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { normalizeLessonLinks, LESSON_LINKS_MAX } from "./communityCore";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = 1_790_000_000_000;

test("a lesson's links are public http(s) addresses, named, de-duplicated and capped", () => {
  expect(normalizeLessonLinks([
    { title: "  The talk ", url: "https://example.com/talk" },
    { title: "", url: "example.org/guide" },
    { title: "again", url: "https://example.com/talk" },
    { title: "script", url: "javascript:alert(1)" },
    { title: "nothing" },
    "not a link",
  ])).toEqual([
    { title: "The talk", url: "https://example.com/talk" },
    { title: "example.org/guide", url: "https://example.org/guide" },
  ]);
  expect(normalizeLessonLinks(Array.from({ length: 40 }, (_, index) => ({ title: `L${index}`, url: `https://example.com/${index}` })))).toHaveLength(LESSON_LINKS_MAX);
  expect(normalizeLessonLinks(null)).toEqual([]);
});

test("a builder puts links on a lesson; a member gets them with a published lesson and nothing else", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx: any) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    const memberId = await ctx.db.insert("users", { authSubject: "member", displayName: "Member", createdAt: NOW, updatedAt: NOW });
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Kiln", slug: "kiln", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member", accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
    const liveId = await ctx.db.insert("communityResourceModules", { communityId, createdByUserId: ownerId, status: "live", name: "Core", sortOrder: 1000, createdAt: NOW, updatedAt: NOW });
    const draftId = await ctx.db.insert("communityResourceModules", { communityId, createdByUserId: ownerId, status: "draft", name: "Later", sortOrder: 2000, createdAt: NOW, updatedAt: NOW });
    return { communityId, liveId, draftId };
  });
  const asOwner = t.withIdentity({ subject: "owner" });
  const asMember = t.withIdentity({ subject: "member" });
  const page = (moduleId: any, title: string, extra: Record<string, unknown> = {}) => asOwner.mutation(api.communityResources.saveCommunityResource, {
    resourceId: null, isPatch: false,
    payload: { community_id: ids.communityId, type: "post", resource_role: "page", title, body_md: "Words.", url: null, pinned: false, module_id: moduleId, ...extra },
  });
  const live = await page(ids.liveId, "Finding the bottleneck") as any;
  await page(ids.draftId, "Not yet", { lesson_links: [{ title: "Secret", url: "https://example.com/secret" }] });
  // A link the guide was given, on no lesson: a source, builders only.
  await asOwner.mutation(api.communityResources.saveCommunityResource, { resourceId: null, isPatch: false,
    payload: { community_id: ids.communityId, type: "link", resource_role: "source", title: "Playbook", body_md: null, url: "https://example.com/playbook", pinned: false, module_id: null } });

  // The builder adds two links; a patch that doesn't mention them leaves them.
  await asOwner.mutation(api.communityResources.saveCommunityResource, { resourceId: live.id, isPatch: true,
    payload: { lesson_links: [{ title: "The talk", url: "https://example.com/talk" }, { title: "", url: "example.org/map" }] } });
  await asOwner.mutation(api.communityResources.saveCommunityResource, { resourceId: live.id, isPatch: true, payload: { title: "Finding the bottleneck, again" } });

  const seen = await asMember.query(api.communityResources.listCommunityResources, { communityId: ids.communityId }) as any[];
  expect(seen.map((row) => row.title)).toEqual(["Finding the bottleneck, again"]);
  expect(seen[0].lesson_links).toEqual([{ title: "The talk", url: "https://example.com/talk" }, { title: "example.org/map", url: "https://example.org/map" }]);
  // Not the draft course's lesson or its link, and not the guide's sources.
  expect(JSON.stringify(seen)).not.toContain("secret");
  expect(JSON.stringify(seen)).not.toContain("playbook");

  // A member can't put a link on a lesson.
  await expect(asMember.mutation(api.communityResources.saveCommunityResource, { resourceId: live.id, isPatch: true,
    payload: { lesson_links: [{ title: "Mine", url: "https://example.com/mine" }] } })).rejects.toThrow();
  // Clearing them clears them.
  await asOwner.mutation(api.communityResources.saveCommunityResource, { resourceId: live.id, isPatch: true, payload: { lesson_links: [] } });
  expect(((await asMember.query(api.communityResources.listCommunityResources, { communityId: ids.communityId })) as any[])[0].lesson_links).toEqual([]);
});
