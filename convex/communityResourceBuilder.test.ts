/// <reference types="vite/client" />
// The builder lens on a community's resources: the directory owners and admins
// read, and the changesets an AI stages and a person applies or rejects.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = 1_760_000_000_000;

async function createFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const user = (subject: string) => ctx.db.insert("users", {
      authSubject: subject, displayName: subject, handle: subject, normalizedHandle: subject, createdAt: NOW, updatedAt: NOW,
    });
    const ownerId = await user("builder-owner");
    const adminId = await user("builder-admin");
    const memberId = await user("builder-member");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "builder-lens", name: "Builder lens", lifecycleStatus: "active", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 3, createdAt: NOW, updatedAt: NOW,
    });
    for (const [userId, role] of [[adminId, "admin"], [memberId, "member"]] as const) {
      await ctx.db.insert("communityMemberships", {
        communityId, userId, role, accessSource: "free_grant", active: true, createdAt: NOW, updatedAt: NOW,
      });
    }
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId, createdByUserId: ownerId, status: "live", name: "Start here", sortOrder: 1, createdAt: NOW, updatedAt: NOW,
    });
    const page = (title: string, bodyMd: string) => ctx.db.insert("communityResources", {
      communityId, createdByUserId: ownerId, moduleId, type: "post", role: "page", status: "draft",
      title, bodyMd, pinned: false, createdAt: NOW, updatedAt: NOW,
    });
    const pageId = await page("Welcome", `${"A long welcome. ".repeat(200)}END-OF-BODY-MARKER`);
    const secondPageId = await page("Rhythm", "We meet on Tuesdays.");
    const emptyModuleId = await ctx.db.insert("communityResourceModules", {
      communityId, createdByUserId: ownerId, status: "draft", name: "Later", sortOrder: 2, createdAt: NOW, updatedAt: NOW,
    });
    return { ownerId, adminId, memberId, communityId, moduleId, emptyModuleId, pageId, secondPageId };
  });
}

const stage = (t: ReturnType<typeof convexTest>, f: Awaited<ReturnType<typeof createFixture>>, key: string, operations: unknown[]) =>
  t.mutation(internal.communityResources.stageCommunityResourceBuilderChangesetInternal, {
    userId: f.ownerId, communityId: f.communityId, summary: `Stage ${key}.`, operations, idempotencyKey: key,
  });

test("the builder directory and resource reads are for owners and admins only, and the list never carries page bodies", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const asMember = t.withIdentity({ subject: "builder-member" });
  const asAdmin = t.withIdentity({ subject: "builder-admin" });
  await expect(asMember.query(api.communityResources.listCommunityResourceBuilderDirectory, { communityId: f.communityId })).rejects.toThrow();
  await expect(asMember.query(api.communityResources.readCommunityResourceBuilderResource, { communityId: f.communityId, resourceId: f.pageId })).rejects.toThrow();

  const list: any = await asAdmin.query(api.communityResources.listCommunityResourceBuilderDirectory, { communityId: f.communityId, limit: 1 });
  expect(list).toMatchObject({ ok: true, total_resources: 2, truncated: true });
  expect(list.resources).toHaveLength(1);
  expect(JSON.stringify(list.resources)).not.toMatch(/body_md|bodyMd|END-OF-BODY-MARKER/);
  await expect(asAdmin.query(api.communityResources.readCommunityResourceBuilderResource, { communityId: f.communityId, resourceId: f.pageId }))
    .resolves.toMatchObject({ ok: true });
});

test("only owners and admins decide a staged changeset; a rejected one can no longer be applied", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const staged: any = await stage(t, f, "decide", [{ op: "create_module", module_key: "new", name: "New section" }]);
  expect(staged).toMatchObject({ status: "staged" });
  await expect(stage(t, { ...f, ownerId: f.memberId }, "member-stage", [{ op: "create_module", name: "Nope" }])).rejects.toThrow();

  const decide = (subject: string, fn: "applyCommunityResourceBuilderChangeset" | "rejectCommunityResourceBuilderChangeset") =>
    t.withIdentity({ subject }).mutation(api.communityResources[fn] as any, { communityId: f.communityId, changesetId: staged.changeset_id });
  await expect(decide("builder-member", "applyCommunityResourceBuilderChangeset")).rejects.toThrow();
  await expect(decide("builder-member", "rejectCommunityResourceBuilderChangeset")).rejects.toThrow();
  await expect(decide("builder-admin", "rejectCommunityResourceBuilderChangeset")).resolves.toMatchObject({ status: "rejected" });
  await expect(decide("builder-owner", "applyCommunityResourceBuilderChangeset")).rejects.toThrow();
  const sections = await t.run((ctx) => ctx.db.query("communityResourceModules").collect());
  expect(sections.map((row: any) => row.name)).not.toContain("New section");
});

test("a changeset made against an older version of a page is refused when applied", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const staged: any = await stage(t, f, "stale", [{ op: "edit_page", resource_id: f.pageId, expected_updated_at: NOW, title: "Welcome, everyone" }]);
  await t.run((ctx) => ctx.db.patch(f.pageId, { title: "Edited by hand", updatedAt: NOW + 1 }));
  await expect(t.withIdentity({ subject: "builder-owner" }).mutation(api.communityResources.applyCommunityResourceBuilderChangeset, {
    communityId: f.communityId, changesetId: staged.changeset_id,
  })).rejects.toThrow("community_resource_edit_conflict");
  const page: any = await t.run((ctx) => ctx.db.get(f.pageId));
  expect(page.title).toBe("Edited by hand");
});

test("a changeset can't publish a page, and can't delete a section that still has pages", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  await expect(stage(t, f, "publish", [{ op: "create_page", module_id: f.moduleId, title: "Launch", body_md: "Hi", resource_status: "published" }]))
    .rejects.toThrow("community_resource_changeset_publish_deferred");
  await expect(stage(t, f, "delete-full", [{ op: "delete_category", module_id: f.moduleId, expected_updated_at: NOW }]))
    .rejects.toThrow("community_resource_changeset_category_not_empty");
  await expect(stage(t, f, "delete-empty", [{ op: "delete_category", module_id: f.emptyModuleId, expected_updated_at: NOW }]))
    .resolves.toMatchObject({ status: "staged" });
});

test("the health report counts every issue even when it shows only a sample", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  await t.run(async (ctx) => {
    for (let i = 0; i < 55; i += 1) {
      await ctx.db.insert("communityResources", {
        communityId: f.communityId, createdByUserId: f.ownerId, moduleId: f.moduleId, type: "post", role: "page", status: "draft",
        title: `Stub ${i}`, bodyMd: "Short.", pinned: false, createdAt: NOW, updatedAt: NOW,
      });
    }
  });
  const list: any = await t.withIdentity({ subject: "builder-owner" }).query(api.communityResources.listCommunityResourceBuilderDirectory, { communityId: f.communityId });
  const { summary, issues } = list.health;
  // The 56 short pages are under the sparse threshold (the long welcome isn't); none of the 57 cites a source.
  expect(summary.issue_counts).toMatchObject({ sparsePages: 56, pagesWithoutSourceLineage: 57, emptyModules: 1 });
  expect(issues.sparsePages).toHaveLength(summary.issue_sample_limit);
  expect(summary.issues_truncated).toBe(true);
  // Every draft page is old enough to be stale.
  expect(summary.issue_counts.staleDrafts).toBe(57);
});
