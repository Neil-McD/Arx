/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityWikiArchitect.ts",
  "./_generated/**/*.*s",
]);

async function createWriterFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_775_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "wiki-writer-owner",
      displayName: "Wiki writer owner",
      handle: "wiki-writer-owner",
      normalizedHandle: "wiki-writer-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "wiki-writer-source-revision",
      name: "Wiki writer source revision",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId,
      createdByUserId: ownerId,
      status: "draft",
      name: "Operating system",
      sortOrder: 1000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const sourceId = await ctx.db.insert("communityResources", {
      communityId,
      createdByUserId: ownerId,
      type: "document",
      role: "source",
      status: "draft",
      title: "Founder operating manual",
      bodyMd: "Canonical founder operating manual v1.",
      bodyChars: 38,
      sourceIngestionStatus: "ready",
      sourceIngestionKind: "file",
      pinned: false,
      sortOrder: 1000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const pageId = await ctx.db.insert("communityResources", {
      communityId,
      moduleId,
      createdByUserId: ownerId,
      type: "post",
      role: "page",
      status: "draft",
      sourceResourceId: sourceId,
      title: "Decision process",
      bodyMd: "Draft scaffold. The page body still needs drafting from that source.",
      bodyChars: 70,
      pinned: false,
      sortOrder: 1000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const crawlJobId = await ctx.db.insert("communitySourceCrawlJobs", {
      communityId,
      createdByUserId: ownerId,
      provider: "simple",
      rootUrl: "https://example.com/manual",
      status: "ready",
      maxPages: 10,
      maxDepth: 2,
      pageCount: 1,
      readyPageCount: 1,
      failedPageCount: 0,
      savedSourceCount: 1,
      skippedSourceCount: 0,
      sourceResourceIds: [sourceId],
      completedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const sourceUnitId = await ctx.db.insert("communitySourceUnits", {
      communityId,
      crawlJobId,
      sourceResourceId: sourceId,
      rootUrl: "https://example.com/manual",
      unitKey: "decision-process",
      unitKind: "virtual_section",
      title: "Decision process",
      sourceUrl: "https://example.com/manual#decision-process",
      path: "decision-process",
      order: 0,
      depth: 1,
      status: "ready",
      bodyChars: 35,
      bodyOriginalChars: 35,
      bodyHash: "unit-body-v1",
      seenCount: 1,
      lastSeenAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const sourceUnitContentId = await ctx.db.insert("communitySourceUnitContents", {
      communityId,
      sourceUnitId,
      bodyMd: "Make reversible decisions quickly.",
      bodyChars: 35,
      bodyHash: "unit-body-v1",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return {
      communityId,
      ownerId,
      pageId,
      sourceId,
      sourceUnitContentId,
      sourceUnitId,
    };
  });
}

async function readWriterCandidate(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createWriterFixture>>,
) {
  const asOwner = t.withIdentity({ subject: "wiki-writer-owner" });
  const context = await asOwner.query(
    internal.communityWikiArchitect.buildCommunityResourceContentWriterRunContextInternal,
    {
      userId: fixture.ownerId,
      communityId: fixture.communityId,
      limit: 1,
    },
  ) as any;
  expect(context.candidates).toHaveLength(1);
  return context.candidates[0] as any;
}

async function patchWriterDraft(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createWriterFixture>>,
  candidate: any,
) {
  return await t.mutation(
    internal.communityWikiArchitect.patchCommunityResourceContentDraftInternal,
    {
      userId: fixture.ownerId,
      communityId: fixture.communityId,
      pageId: fixture.pageId,
      sourceResourceId: fixture.sourceId,
      expectedUpdatedAt: Number(candidate.expected_updated_at),
      expectedSourceRevisionHash: String(candidate.expected_source_revision_hash),
      bodyMd: "# Decision process\n\nMake reversible decisions quickly.",
    },
  );
}

test("resource Writer accepts an unchanged source revision", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createWriterFixture(t);
  const candidate = await readWriterCandidate(t, fixture);

  await expect(patchWriterDraft(t, fixture, candidate)).resolves.toMatchObject({
    id: String(fixture.pageId),
    status: "review",
    source_resource_id: String(fixture.sourceId),
  });
});

test("resource Writer rejects a changed canonical source body", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createWriterFixture(t);
  const candidate = await readWriterCandidate(t, fixture);

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.sourceId, {
      bodyMd: "Canonical founder operating manual v2.",
      bodyChars: 38,
    });
  });

  await expect(patchWriterDraft(t, fixture, candidate))
    .rejects.toThrow("community_resource_content_writer_source_changed");
  await expect(t.run((ctx) => ctx.db.get(fixture.pageId))).resolves.toMatchObject({
    status: "draft",
  });

  const freshCandidate = await readWriterCandidate(t, fixture);
  await expect(patchWriterDraft(t, fixture, freshCandidate)).resolves.toMatchObject({
    status: "review",
  });
});

test("resource Writer rejects changed selected source-unit content", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createWriterFixture(t);
  const candidate = await readWriterCandidate(t, fixture);

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.sourceUnitId, {
      bodyHash: "unit-body-v2",
    });
    await ctx.db.patch(fixture.sourceUnitContentId, {
      bodyMd: "Escalate every decision for review.",
      bodyChars: 35,
      bodyHash: "unit-body-v2",
    });
  });

  await expect(patchWriterDraft(t, fixture, candidate))
    .rejects.toThrow("community_resource_content_writer_source_changed");
  await expect(t.run((ctx) => ctx.db.get(fixture.pageId))).resolves.toMatchObject({
    status: "draft",
  });
});

test("resource Writer preserves the existing page-edit conflict fence", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createWriterFixture(t);
  const candidate = await readWriterCandidate(t, fixture);

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.pageId, {
      title: "Updated decision process",
      updatedAt: 1_775_000_000_001,
    });
  });

  await expect(patchWriterDraft(t, fixture, candidate))
    .rejects.toThrow("community_resource_content_writer_update_conflict");
  await expect(t.run((ctx) => ctx.db.get(fixture.pageId))).resolves.toMatchObject({
    status: "draft",
    title: "Updated decision process",
  });
});

test("Wiki Architect refuses to apply structure from a stale source revision", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createWriterFixture(t);
  const asOwner = t.withIdentity({ subject: "wiki-writer-owner" });
  const context = await asOwner.query(
    internal.communityWikiArchitect.buildCommunityWikiArchitectRunContextInternal,
    {
      userId: fixture.ownerId,
      communityId: fixture.communityId,
      builderIntent: null,
    },
  ) as any;
  const sourceRevisions = context.current_resource_state.visible_source_revisions;
  expect(sourceRevisions).toHaveLength(1);

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.sourceUnitId, { bodyHash: "architect-unit-v2" });
    await ctx.db.patch(fixture.sourceUnitContentId, {
      bodyMd: "Escalate every decision for review.",
      bodyChars: 35,
      bodyHash: "architect-unit-v2",
    });
  });

  await expect(asOwner.mutation(
    (api as any).communityWikiArchitect.applyCommunityWikiArchitectProposal,
    {
      communityId: fixture.communityId,
      proposal: {
        run_type: "rerun",
        modules_created: [],
        modules_existing: ["Operating system"],
        drafts_created: [{
          title: "Escalation policy",
          module: "Operating system",
          purpose: "Explain when decisions require escalation.",
          source_resource_id: String(fixture.sourceId),
        }],
        drafts_updated: [],
        pages_left_unchanged: [],
        proposed_changes_to_existing: [],
        sources_assigned: [String(fixture.sourceId)],
        sources_unassigned: [],
        gaps: [],
        deferred: [],
        recommended_next_uploads: [],
        needs_from_builder: [],
      },
      expectedSourceRevisions: sourceRevisions,
    },
  )).rejects.toThrow("community_wiki_architect_source_changed");

  const pages = await t.run((ctx) => ctx.db
    .query("communityResources")
    .withIndex("by_community", (q) => q.eq("communityId", fixture.communityId))
    .collect());
  expect(pages.some((page) => page.title === "Escalation policy")).toBe(false);
});
