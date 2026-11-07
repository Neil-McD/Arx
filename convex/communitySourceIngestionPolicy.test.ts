/// <reference types="vite/client" />
// Bringing sources into a community: only its owners and admins can, links are
// fetched only through Polynet's own fetcher, and PDFs are refused until a
// first-party parser exists.
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

// These two actions are typed `any`, so they are not in the generated api types.
const sources = api.communityResources as any;

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = 1_760_000_000_000;
const FETCHER = "https://fetcher.polynet.ai/extract";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function createFixture(t: ReturnType<typeof convexTest>, url = "https://example.com/guide") {
  return await t.run(async (ctx) => {
    const user = (subject: string) => ctx.db.insert("users", {
      authSubject: subject, displayName: subject, handle: subject, normalizedHandle: subject, createdAt: NOW, updatedAt: NOW,
    });
    const ownerId = await user("source-owner");
    const memberId = await user("source-member");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "source-policy", name: "Source policy", lifecycleStatus: "active", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW,
    });
    await ctx.db.insert("communityMemberships", {
      communityId, userId: memberId, role: "member", accessSource: "free_grant", active: true, createdAt: NOW, updatedAt: NOW,
    });
    const sourceId = await ctx.db.insert("communityResources", {
      communityId, createdByUserId: ownerId, type: "link", role: "source", status: "review", title: "Founder guide",
      url, sourceIngestionStatus: "queued", sourceIngestionKind: "url", pinned: false, createdAt: NOW, updatedAt: NOW,
    });
    return { ownerId, memberId, communityId, sourceId };
  });
}

const ingest = (t: ReturnType<typeof convexTest>, communityId: any) =>
  t.withIdentity({ subject: "source-owner" }).action(sources.ingestCommunitySources, { communityId });
const source = (t: ReturnType<typeof convexTest>, id: any) => t.run((ctx) => ctx.db.get(id)) as Promise<any>;

test("only owners and admins can upload or crawl sources", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const asMember = t.withIdentity({ subject: "source-member" });
  await expect(asMember.mutation(api.communityResources.generateCommunityResourceSourceUploadUrl, { communityId: f.communityId })).rejects.toThrow();
  await expect(asMember.action(sources.crawlCommunitySourceRoot, { communityId: f.communityId, rootUrl: "https://example.com" })).rejects.toThrow();
  await expect(asMember.action(sources.ingestCommunitySources, { communityId: f.communityId })).rejects.toThrow();
  await expect(t.withIdentity({ subject: "source-owner" }).mutation(api.communityResources.generateCommunityResourceSourceUploadUrl, { communityId: f.communityId }))
    .resolves.toBeTruthy();
});

test("without Polynet's fetcher configured, a link is never fetched and the source fails closed", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  await ingest(t, f.communityId);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(await source(t, f.sourceId)).toMatchObject({ sourceIngestionStatus: "failed" });
});

test("a link goes only to Polynet's fetcher, with its secret, never straight to the site", async () => {
  vi.stubEnv("ARX_SOURCE_URL_FETCHER_ENDPOINT", FETCHER);
  vi.stubEnv("ARX_SOURCE_URL_FETCHER_SECRET", "fetcher-secret");
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const calls: Array<{ url: string; init: any }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      ok: true, final_url: "https://example.com/guide", content_type: "text/html", title: "Founder guide",
      text: "How we run the community: show up, share what you learned, help the next person.",
    }), { status: 200, headers: { "content-type": "application/json" } });
  }));
  await ingest(t, f.communityId);
  expect(calls.map((call) => call.url)).toEqual([FETCHER]);
  expect(calls[0]!.init.headers.authorization).toBe("Bearer fetcher-secret");
  expect(JSON.parse(calls[0]!.init.body)).toMatchObject({ url: "https://example.com/guide" });
  expect(await source(t, f.sourceId)).toMatchObject({ sourceIngestionStatus: "ready" });
});

test("PDFs are refused, whether the link or the fetched content is one", async () => {
  vi.stubEnv("ARX_SOURCE_URL_FETCHER_ENDPOINT", FETCHER);
  vi.stubEnv("ARX_SOURCE_URL_FETCHER_SECRET", "fetcher-secret");
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    ok: true, final_url: "https://example.com/guide", content_type: "application/pdf", text: "%PDF-1.7",
  }), { status: 200, headers: { "content-type": "application/json" } })));
  await ingest(t, f.communityId);
  const row = await source(t, f.sourceId);
  expect(row).toMatchObject({ sourceIngestionStatus: "failed" });
  expect(String(row.sourceIngestionError)).toMatch(/pdf/i);
  expect(row.bodyMd ?? "").not.toContain("%PDF");
});
