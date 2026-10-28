import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { registerCommunitySiteRoutes } from "./httpCommunitySites";
import { siteHostname, validateSiteManifest } from "./communitySites";
import { readSitesConfig } from "./communitySiteDeploy";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob([
  "./communitySites.ts",
  "./communityCapabilityContext.ts",
  "./communityAccessQueries.ts",
  "./authActor.ts",
  "./authIdentity.ts",
  "./_generated/**/*.*s",
]);

const ENV = {
  CLOUDFLARE_API_TOKEN: "cf-test-token",
  CLOUDFLARE_ACCOUNT_ID: "acct",
  POLYNET_SITES_NAMESPACE: "sites-ns",
  POLYNET_SITES_ROUTES_KV_ID: "routes-kv",
  POLYNET_SITES_DOMAIN: "polynet.page",
};
const HASH = "a".repeat(32);
const CF = "https://api.cloudflare.com/client/v4/accounts/acct";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function fixture() {
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const ids = await t.run(async (ctx) => {
    const user = async (handle: string) => {
      const userId = await ctx.db.insert("users", {
        authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: nowMs, updatedAt: nowMs,
      });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", {
          userId, documentKey: document.key, documentVersion: document.version, acceptedAt: nowMs, source: "test", createdAt: nowMs,
        });
      }
      return userId;
    };
    const owner = await user("owner");
    const member = await user("member");
    const outsider = await user("outsider");
    const community = (slug: string, ownerId = owner) => ctx.db.insert("communities", {
      ownerId, slug, name: slug, visibility: "unlisted", inferenceFundingPolicy: "managed_required",
      entryPolicy: "open", activeMemberCount: 2, createdAt: nowMs, updatedAt: nowMs,
    });
    const runClub = await community("run-club");
    const admin = await community("admin");
    const other = await community("other-club", outsider);
    await ctx.db.insert("communityMemberships", {
      communityId: runClub, userId: member, role: "member", accessSource: "free_grant", active: true,
      activationSequence: 1, activatedAt: nowMs, createdAt: nowMs, updatedAt: nowMs,
    });
    return { owner, member, outsider, runClub, admin, other };
  });
  const users: Record<string, any> = { owner: ids.owner, member: ids.member, outsider: ids.outsider };
  const handlers = new Map<string, (ctx: any, req: Request) => Promise<Response>>();
  registerCommunitySiteRoutes({
    http: { route: ({ path, method, handler }) => { handlers.set(`${method} ${path}`, handler as any); } },
    httpAction: (handler) => handler as any,
    // The founder's signed-in tool: "Bearer <handle>" stands in for a verified token.
    requireAuthenticatedActor: async (_ctx, req) => {
      const handle = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
      return users[handle]
        ? { ok: true, actor: { authSubject: `${handle}-subject`, dbUserId: users[handle] } }
        : { ok: false, response: Response.json({ ok: false, code: "auth_missing_bearer_token" }, { status: 401 }) };
    },
  });
  const ctx = {
    runQuery: (ref: any, args: any) => t.query(ref, args),
    runMutation: (ref: any, args: any) => t.mutation(ref, args),
  };
  const post = async (path: "start" | "publish", handle: string | null, body: unknown) => {
    const res = await handlers.get(`POST /runtime/sites/deploy/${path}`)!(ctx, new Request(`https://example.convex.site/runtime/sites/deploy/${path}`, {
      method: "POST", headers: { "content-type": "application/json", ...(handle ? { authorization: `Bearer ${handle}` } : {}) },
      body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json() as any };
  };
  return { t, ids, post };
}

// Cloudflare, recorded: the upload pass, the script upload and the hostname map.
function fakeCloudflare() {
  const calls: Array<{ method: string; url: string; body: any }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const method = init?.method ?? "GET";
    let body: any = init?.body ?? null;
    if (body instanceof FormData) {
      body = { metadata: JSON.parse(await (body.get("metadata") as Blob).text()), module: await (body.get("index.js") as Blob).text() };
    } else if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { /* text */ }
    }
    calls.push({ method, url: String(url), body });
    expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer cf-test-token");
    if (String(url).endsWith("/assets-upload-session")) {
      return Response.json({ success: true, result: { jwt: "upload-jwt", buckets: [[HASH]] } });
    }
    return Response.json({ success: true, result: {} });
  });
  return calls;
}

const manifest = { "/index.html": { hash: HASH, size: 120 }, "/app.js": { hash: "b".repeat(32), size: 3000 } };

test("the owner deploys: upload pass, publish, address mapped and registered, redeploys work", async () => {
  const f = await fixture();
  const calls = fakeCloudflare();

  const started = await f.post("start", "owner", { community: "run-club", manifest });
  expect(started).toMatchObject({ status: 200, body: {
    ok: true, hostname: "run-club.polynet.page",
    upload: { url: `${CF}/workers/assets/upload?base64=true`, jwt: "upload-jwt", buckets: [[HASH]] },
  } });
  expect(calls[0]).toMatchObject({ method: "POST", url: `${CF}/workers/dispatch/namespaces/sites-ns/scripts/site-run-club/assets-upload-session`, body: { manifest } });

  const published = await f.post("publish", "owner", { community: "run-club", completion_jwt: "done-jwt", files: 2, bytes: 3120 });
  expect(published).toEqual({ status: 200, body: { ok: true, url: "https://run-club.polynet.page" } });
  expect(calls[1]).toMatchObject({ method: "PUT", url: `${CF}/workers/dispatch/namespaces/sites-ns/scripts/site-run-club` });
  expect(calls[1].body.metadata).toMatchObject({ main_module: "index.js", assets: { jwt: "done-jwt", config: { not_found_handling: "single-page-application" } } });
  expect(calls[1].body.module).toContain("Not found");
  expect(calls[2]).toEqual({ method: "PUT", url: `${CF}/storage/kv/namespaces/routes-kv/values/${encodeURIComponent("host:run-club.polynet.page")}`, body: { script: "site-run-club", community: "run-club" } });

  const records = await f.t.run(async (ctx) => ({
    domains: (await ctx.db.query("communityDomains").collect()).map((row) => [row.origin, row.communityId]),
    deploys: (await ctx.db.query("communitySiteDeploys").collect()).map((row) => [row.hostname, row.fileCount, row.totalBytes, row.userId]),
  }));
  expect(records.domains).toEqual([["https://run-club.polynet.page", f.ids.runClub]]);
  expect(records.deploys).toEqual([["run-club.polynet.page", 2, 3120, f.ids.owner]]);

  // A redeploy keeps the address and adds a record.
  expect((await f.post("publish", "owner", { community: "run-club", completion_jwt: "done-2" })).status).toBe(200);
  expect(await f.t.run(async (ctx) => (await ctx.db.query("communityDomains").collect()).length)).toBe(1);
  expect(await f.t.run(async (ctx) => (await ctx.db.query("communitySiteDeploys").collect()).length)).toBe(2);
});

test("only the community's owner or admins can deploy; signing in is required", async () => {
  const f = await fixture();
  const calls = fakeCloudflare();
  expect((await f.post("start", null, { community: "run-club", manifest })).status).toBe(401);
  for (const handle of ["member", "outsider"]) {
    expect(await f.post("start", handle, { community: "run-club", manifest })).toMatchObject({ status: 403, body: { code: "not_a_builder" } });
    expect(await f.post("publish", handle, { community: "run-club", completion_jwt: "x" })).toMatchObject({ status: 403, body: { code: "not_a_builder" } });
  }
  expect(await f.post("start", "owner", { community: "other-club", manifest })).toMatchObject({ status: 403 });
  expect(await f.post("start", "owner", { community: "missing-club", manifest })).toMatchObject({ status: 403 });
  expect(calls).toEqual([]);
});

test("sites are bounded static files at a safe address", async () => {
  const f = await fixture();
  fakeCloudflare();
  expect(await f.post("start", "owner", { community: "admin", manifest })).toMatchObject({ status: 400, body: { code: "site_name_unavailable" } });
  for (const [bad, code] of [
    [{}, "site_empty"],
    [{ "/../secret": { hash: HASH, size: 1 } }, "manifest_path_invalid"],
    [{ "no-slash.html": { hash: HASH, size: 1 } }, "manifest_path_invalid"],
    [{ "/_worker.js": { hash: HASH, size: 1 } }, "site_server_code"],
    [{ "/a.html": { hash: "nothex", size: 1 } }, "manifest_entry_invalid"],
    [{ "/big.mp4": { hash: HASH, size: 26 * 1024 * 1024 } }, "site_file_too_large"],
  ] as const) {
    expect(await f.post("start", "owner", { community: "run-club", manifest: bad })).toMatchObject({ status: 400, body: { code } });
  }
  expect(siteHostname("polynet", "polynet.page")).toBe("polynet.polynet.page");
  expect(siteHostname("www", "polynet.page")).toBeNull();
  // Staging shares the domain with a suffix; production can't claim staging's names.
  expect(siteHostname("run-club", "polynet.page", "-staging")).toBe("run-club-staging.polynet.page");
  expect(siteHostname("run-club-staging", "polynet.page")).toBeNull();
  expect(validateSiteManifest({ "/a/b/c.css": { hash: HASH, size: 10 } })).toMatchObject({ ok: true, fileCount: 1, totalBytes: 10 });
});

test("an address that belongs to another community is refused; unconfigured hosting says so", async () => {
  const f = await fixture();
  fakeCloudflare();
  await f.t.run((ctx) => ctx.db.insert("communityDomains", { communityId: f.ids.other, origin: "https://run-club.polynet.page", createdAt: 1 }));
  expect(await f.post("publish", "owner", { community: "run-club", completion_jwt: "x" })).toMatchObject({ status: 409, body: { code: "site_address_taken" } });
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
  expect(await f.post("start", "owner", { community: "run-club", manifest })).toMatchObject({ status: 503, body: { code: "sites_unconfigured" } });
});

test("the sites config reads the staging host suffix and refuses a malformed one", () => {
  const base = { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a", POLYNET_SITES_NAMESPACE: "n", POLYNET_SITES_ROUTES_KV_ID: "k", POLYNET_SITES_DOMAIN: "polynet.page" };
  expect(readSitesConfig(base)).toMatchObject({ domain: "polynet.page", hostSuffix: "" });
  expect(readSitesConfig({ ...base, POLYNET_SITES_HOST_SUFFIX: "-staging" })).toMatchObject({ hostSuffix: "-staging" });
  expect(readSitesConfig({ ...base, POLYNET_SITES_HOST_SUFFIX: ".evil" })).toBeNull();
  expect(readSitesConfig({ ...base, POLYNET_SITES_DOMAIN: "" })).toBeNull();
});
