import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { handleMcpPost, mcpTargetCommunitySlug } from "./httpMcp";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob("./**/*.*s");

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

// Cloudflare, recorded: upload pass (asks for every file), file upload, script, hostname map.
function fakeCloudflare() {
  for (const [key, value] of Object.entries({
    CLOUDFLARE_API_TOKEN: "cf-token", CLOUDFLARE_ACCOUNT_ID: "acct", POLYNET_SITES_NAMESPACE: "sites",
    POLYNET_SITES_ROUTES_KV_ID: "routes", POLYNET_SITES_DOMAIN: "polynet.page",
  })) vi.stubEnv(key, value);
  const calls: Array<{ method: string; url: string; body: any }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const method = init?.method ?? "GET";
    let body: any = init?.body ?? null;
    if (body instanceof FormData) {
      const fields: Record<string, string> = {};
      for (const [key, value] of (body as any).entries() as Iterable<[string, unknown]>) fields[key] = typeof value === "string" ? value : await (value as Blob).text();
      body = fields;
    } else if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { /* text */ }
    }
    calls.push({ method, url: String(url), body });
    if (String(url).endsWith("/assets-upload-session")) {
      const hashes = Object.values(body.manifest).map((entry: any) => entry.hash);
      return Response.json({ success: true, result: { jwt: "pass", buckets: [hashes] } });
    }
    if (String(url).includes("/workers/assets/upload")) return Response.json({ success: true, result: { jwt: "done" } }, { status: 201 });
    return Response.json({ success: true, result: {} });
  });
  return calls;
}

async function fixture() {
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
    const community = (slug: string, ownerId: any) => ctx.db.insert("communities", {
      ownerId, slug, name: slug, visibility: "unlisted", inferenceFundingPolicy: "managed_required",
      entryPolicy: "open", activeMemberCount: 2, createdAt: nowMs, updatedAt: nowMs,
    });
    const runClub = await community("run-club", owner);
    const otherClub = await community("other-club", outsider);
    for (const [communityId, userId] of [[runClub, member], [otherClub, owner]] as const) {
      await ctx.db.insert("communityMemberships", {
        communityId, userId, role: "member", accessSource: "free_grant", active: true,
        activationSequence: 1, activatedAt: nowMs, createdAt: nowMs, updatedAt: nowMs,
      });
    }
    return { owner, member, outsider };
  });
  const users: Record<string, any> = ids;
  const call = async (handle: string, name: string, args: Record<string, unknown>) => {
    // The verified sign-in travels with the request, as it does in production.
    const as = t.withIdentity({ subject: `${handle}-subject` });
    const res = await handleMcpPost({
      ctx: { runQuery: (ref: any, a: any) => as.query(ref, a), runMutation: (ref: any, a: any) => as.mutation(ref, a), runAction: (ref: any, a: any) => as.action(ref, a) },
      req: new Request("https://example.convex.site/runtime/mcp", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      }),
      jsonResponse: (_req, status, payload) => Response.json(payload, { status }),
      requireAuthenticatedActor: async () => ({ ok: true, actor: { authSubject: `${handle}-subject`, dbUserId: users[handle] } }) as any,
    });
    return (await res.json() as any).result;
  };
  return { call };
}

test("the Polynet MCP is for builders: members and outsiders are refused", async () => {
  const f = await fixture();
  // A member of run-club who builds nothing is told the MCP is for builders.
  const memberCall = await f.call("member", "polynet_list", { path: "/communities/run-club/" });
  expect(memberCall.isError).toBe(true);
  expect(memberCall.content[0].text).toContain("builder_only");
  // The outsider builds other-club, but run-club isn't theirs: it isn't even found.
  const outsiderCall = await f.call("outsider", "polynet_list", { path: "/communities/run-club/" });
  expect(outsiderCall.isError).toBe(true);
  expect(outsiderCall.content[0].text).toContain("semantic_not_found");
  const member = await f.call("member", "polynet_list", { path: "/communities/" });
  expect(member.content[0].text).toContain("builder_only");
});

test("a builder works on its own community and sees only the communities it builds", async () => {
  const f = await fixture();
  const own = await f.call("owner", "polynet_list", { path: "/communities/run-club/" });
  expect(own.isError).toBe(false);
  // The owner is only a member of other-club: that community is off limits and hidden.
  expect((await f.call("owner", "polynet_list", { path: "/communities/other-club/" })).content[0].text).toContain("builder_only");
  const listed = await f.call("owner", "polynet_list", { path: "/communities/" });
  expect(listed.structuredContent.entries.map((entry: any) => [entry.path, entry.role])).toEqual([["/communities/run-club/", "owner"]]);
});

test("the targeted community comes from the path or the call target", () => {
  expect(mcpTargetCommunitySlug({ path: "/communities/run-club/channels/general/" })).toBe("run-club");
  expect(mcpTargetCommunitySlug({ target: "/communities/run-club/capabilities/community.site.deploy.json" })).toBe("run-club");
  expect(mcpTargetCommunitySlug({ path: "/communities/" })).toBeNull();
  expect(mcpTargetCommunitySlug({ path: "/users/me" })).toBeNull();
});

// A page that passes the site checks: language, title, zoomable viewport.
const PAGE = '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Run club</title>' +
  '<script type="module" src="/__polynet/ui.js"></script><polynet-account></polynet-account></html>';

const deploy = (files: Record<string, unknown>, key = "deploy-1") => ({
  target: "/communities/run-club/capabilities/community.site.deploy.json", operation: "community.site.deploy",
  version: 1, idempotencyKey: key, input: { files },
});

test("a builder's agent deploys the community's site by handing over its files", async () => {
  const f = await fixture();
  const calls = fakeCloudflare();
  const listed = await f.call("owner", "polynet_list", { path: "/communities/run-club/capabilities/" });
  expect(JSON.stringify(listed.structuredContent)).toContain("community.site.deploy");

  const files = {
    "/index.html": { content: PAGE },
    "/logo.png": { content: btoa("\x89PNG fake"), encoding: "base64" },
  };
  const done = await f.call("owner", "polynet_call", deploy(files));
  expect(done.isError).toBe(false);
  expect(done.structuredContent).toMatchObject({ ok: true, result: { url: "https://run-club.polynet.page", files: 2 } });
  expect(calls.map((call) => `${call.method} ${call.url.replace("https://api.cloudflare.com/client/v4/accounts/acct", "")}`)).toEqual([
    "POST /workers/dispatch/namespaces/sites/scripts/site-run-club/assets-upload-session",
    "POST /workers/assets/upload?base64=true",
    "PUT /workers/dispatch/namespaces/sites/scripts/site-run-club",
    `PUT /storage/kv/namespaces/routes/values/${encodeURIComponent("host:run-club.polynet.page")}`,
  ]);
  // Files go up as base64 under their content hash, with their type.
  expect(Object.values(calls[1].body)).toContain(btoa(PAGE));

  // The same request again replays the receipt without touching Cloudflare.
  const again = await f.call("owner", "polynet_call", deploy(files));
  expect(again.structuredContent).toMatchObject({ deduped: true, result: { url: "https://run-club.polynet.page" } });
  expect(calls).toHaveLength(4);
});

test("site deploys through the MCP are bounded static sites", async () => {
  const f = await fixture();
  const calls = fakeCloudflare();
  const error = async (files: Record<string, unknown>, key: string) => (await f.call("owner", "polynet_call", deploy(files, key))).content[0].text;
  expect(await error({ "/about.html": { content: "x" } }, "k1")).toContain("needs /index.html");
  expect(await error({ "/index.html": { content: "x" }, "/_worker.js": { content: "x" } }, "k2")).toContain("site_server_code");
  expect(await error({ "/index.html": { content: "x".repeat(5 * 1024 * 1024 + 1) } }, "k3")).toContain("site_too_large");
  expect(await error({ "/index.html": { content: 42 } }, "k4")).toContain("invalid_tool_args");
  expect(await error({ "/index.html": { content: "x" }, "/../x": { content: "x" } }, "k5")).toContain("manifest_path_invalid");
  // The site checks run too: errors stop the deploy and say what to fix.
  const failed = await f.call("owner", "polynet_call", deploy({ "/index.html": { content: "<html><title>Run club</title></html>" } }, "k7"));
  expect(failed.content[0].text).toContain("site_checks_failed");
  expect(failed.content[0].text).toContain("viewport");
  expect(failed.content[0].text).toContain("lang");
  expect(calls).toEqual([]);
  // A member's agent can't deploy: the MCP is builder-only.
  expect((await f.call("member", "polynet_call", deploy({ "/index.html": { content: "x" } }, "k6"))).content[0].text).toContain("builder_only");
});
