/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { registerCommunityAppRoutes, COMMUNITY_APP_RUNTIME_PATH } from "./httpCommunityApps";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { hashCommunityAppSessionToken } from "../shared/communityAppSession";

const modules = import.meta.glob([
  "./communityApps.ts",
  "./communityAdmin.ts",
  "./communityPublic.ts",
  "./communityAccessQueries.ts",
  "./communityAgent.ts",
  "./communityMemberWorkflows.ts",
  "./authActor.ts",
  "./authIdentity.ts",
  "./communityActivity.ts",
  "./communityCapabilityContext.ts",
  "./communityChannels.ts",
  "./communityEvidenceAudit.ts",
  "./communityEvents.ts",
  "./communityFormRequests.ts",
  "./communityIntelligenceDirectory.ts",
  "./communityInteractionEvidence.ts",
  "./communityInteractions.ts",
  "./communityMentionLifecycle.ts",
  "./communityRepositorySearch.ts",
  "./communityResourceEvidence.ts",
  "./communityResources.ts",
  "./email.ts",
  "./polynetCanonicalReceipts.ts",
  "./_generated/**/*.*s",
]);

const ORIGIN = "https://portal.example.com";
const COMMUNITY = "/communities/apps-community";

async function fixture() {
  const t = convexTest(schema, modules);
  const nowMs = 1_760_000_000_000;
  const ids = await t.run(async (ctx) => {
    const user = async (handle: string) => {
      const userId = await ctx.db.insert("users", {
        authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: nowMs, updatedAt: nowMs,
      });
      await ctx.db.insert("userProfileDetails", {
        userId, displayName: handle, avatarUrl: `https://example.com/${handle}.png`, createdAt: nowMs, updatedAt: nowMs,
      });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", {
          userId, documentKey: document.key, documentVersion: document.version, acceptedAt: nowMs, source: "test", createdAt: nowMs,
        });
      }
      return userId;
    };
    const ownerId = await user("apps-owner");
    const memberId = await user("apps-member");
    const outsiderId = await user("apps-outsider");
    const community = (slug: string) => ctx.db.insert("communities", {
      ownerId, slug, name: slug, visibility: "unlisted", inferenceFundingPolicy: "managed_required",
      entryPolicy: "open", activeMemberCount: 2, createdAt: nowMs, updatedAt: nowMs,
    });
    const communityId = await community("apps-community");
    const otherCommunityId = await community("apps-other");
    for (const target of [communityId, otherCommunityId]) {
      await ctx.db.insert("communityChannels", {
        communityId: target, systemRole: "general", slug: "general", name: "General", accessMode: "all_members",
        postingPolicy: "members", status: "active", position: 0, createdAt: nowMs, updatedAt: nowMs,
      });
    }
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId, userId: memberId, role: "member", accessSource: "free_grant", active: true,
      activationSequence: 1, activatedAt: nowMs, createdAt: nowMs, updatedAt: nowMs,
    });
    return { ownerId, memberId, outsiderId, communityId, otherCommunityId, membershipId };
  });
  const as = (handle: string) => t.withIdentity({ subject: `${handle}-subject` });
  const register = (overrides: Record<string, unknown> = {}, handle = "apps-owner") =>
    as(handle).mutation(api.communityApps.registerCommunityApp, {
      communityId: ids.communityId, slug: "portal", name: "Coaching portal", origin: ORIGIN,
      allowedTools: ["polynet_list", "polynet_read", "polynet_search", "polynet_write", "polynet_call"],
      ...overrides,
    } as any);
  const mint = (handle = "apps-member", appSlug = "portal") =>
    as(handle).action(api.communityApps.mintCommunityAppSession, { communityId: ids.communityId, appSlug });

  // The real route handlers, registered on a capturing router and run without
  // any Convex session identity, exactly as an app request arrives.
  const handlers = new Map<string, (ctx: any, req: Request) => Promise<Response>>();
  registerCommunityAppRoutes({
    http: { route: ({ method, handler }) => { handlers.set(method, handler as any); } },
    httpAction: (handler) => handler as any,
  });
  const ctx = {
    runQuery: (ref: any, args: any) => t.query(ref, args),
    runMutation: (ref: any, args: any) => t.mutation(ref, args),
    runAction: (ref: any, args: any) => t.action(ref, args),
  };
  const call = async (token: string | null, body: unknown, origin = ORIGIN) => {
    const res = await handlers.get("POST")!(ctx, new Request(`https://example.convex.site${COMMUNITY_APP_RUNTIME_PATH}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }));
    return { status: res.status, cors: res.headers.get("access-control-allow-origin"), body: await res.json() as any };
  };
  const preflight = async (origin: string) => {
    const res = await handlers.get("OPTIONS")!(ctx, new Request(`https://example.convex.site${COMMUNITY_APP_RUNTIME_PATH}`, {
      method: "OPTIONS", headers: { origin },
    }));
    return { status: res.status, cors: res.headers.get("access-control-allow-origin") };
  };
  return { t, ids, as, register, mint, call, preflight };
}

test("only a community manager registers an app, with an exact origin and unique slug", async () => {
  const f = await fixture();
  await expect(f.register({}, "apps-member")).rejects.toThrow();
  for (const origin of ["http://portal.example.com", "https://portal.example.com/path", "https://u:p@portal.example.com", "not a url"]) {
    await expect(f.register({ origin, slug: "bad" })).rejects.toThrow("community_app_origin_invalid");
  }
  await expect(f.register({ allowedTools: [] })).rejects.toThrow("community_app_tools_required");
  expect(await f.register()).toMatchObject({ slug: "portal", origin: ORIGIN, status: "active" });
  await expect(f.register()).rejects.toThrow("community_app_slug_taken");
  expect(await f.register({ slug: "local-dev", origin: "http://localhost:5173" })).toMatchObject({ origin: "http://localhost:5173" });
});

test("minting needs current community access and an active app, and stores only a hash", async () => {
  const f = await fixture();
  await f.register();
  const session = await f.mint();
  expect(session.token).toMatch(/^pna_[A-Za-z0-9_-]{43}$/);
  expect(session.origin).toBe(ORIGIN);
  const stored = await f.t.run((ctx) => ctx.db.query("communityAppSessions").collect());
  expect(stored).toHaveLength(1);
  expect(stored[0].tokenHash).toBe(await hashCommunityAppSessionToken(session.token));
  expect(JSON.stringify(stored)).not.toContain(session.token);
  await expect(f.mint("apps-outsider")).rejects.toThrow();
  await f.as("apps-owner").mutation(api.communityApps.setCommunityAppStatus, { communityId: f.ids.communityId, slug: "portal", status: "disabled" });
  await expect(f.mint()).rejects.toThrow("community_app_not_found");
});

test("CORS preflight is granted only to an active app's exact origin", async () => {
  const f = await fixture();
  await f.register();
  expect(await f.preflight(ORIGIN)).toEqual({ status: 204, cors: ORIGIN });
  expect(await f.preflight("https://evil.example.com")).toEqual({ status: 403, cors: null });
});

test("an app session reads its own community as the member", async () => {
  const f = await fixture();
  await f.register();
  const { token } = await f.mint();
  const listed = await f.call(token, { tool: "polynet_list", input: { path: `${COMMUNITY}/channels/` } });
  expect(listed).toMatchObject({ status: 200, cors: ORIGIN, body: { ok: true } });
  expect(JSON.stringify(listed.body)).toContain(`${COMMUNITY}/channels/general/`);
});

test("missing, foreign-origin, expired and disallowed sessions fail closed", async () => {
  const f = await fixture();
  await f.register({ allowedTools: ["polynet_list", "polynet_read"] });
  const { token } = await f.mint();
  const list = { tool: "polynet_list", input: { path: `${COMMUNITY}/channels/` } };
  expect(await f.call(null, list)).toMatchObject({ status: 401, cors: null });
  expect(await f.call(token, list, "https://evil.example.com")).toMatchObject({ status: 401, cors: null });
  expect(await f.call(token, { tool: "polynet_search", input: { path: `${COMMUNITY}/`, query: "x" } }))
    .toMatchObject({ status: 403, body: { code: "community_app_tool_not_allowed" } });
  await f.t.run(async (ctx) => {
    for (const row of await ctx.db.query("communityAppSessions").collect()) await ctx.db.patch(row._id, { expiresAt: 1 });
  });
  expect(await f.call(token, list)).toMatchObject({ status: 401, body: { code: "community_app_session_invalid" } });
});

test("an app is confined to its community: no platform root, users or other communities", async () => {
  const f = await fixture();
  await f.register();
  const { token } = await f.mint();
  for (const path of ["/", "/communities/", "/users/"]) {
    expect((await f.call(token, { tool: "polynet_list", input: { path } })).body)
      .toMatchObject({ ok: false, code: "community_path_required" });
  }
  expect((await f.call(token, { tool: "polynet_list", input: { path: "/communities/apps-other/" } })).body)
    .toMatchObject({ ok: false });
});

test("an owner's app session never receives builder authority", async () => {
  const f = await fixture();
  await f.register();
  const { token } = await f.mint("apps-owner");
  expect((await f.call(token, { tool: "polynet_list", input: { path: `${COMMUNITY}/builder/` } })).body)
    .toMatchObject({ ok: false });
  const capabilities = await f.call(token, { tool: "polynet_list", input: { path: `${COMMUNITY}/capabilities/` } });
  expect(capabilities.body).toMatchObject({ ok: true });
  expect(JSON.stringify(capabilities.body)).not.toMatch(/community\.admission\.|approve_milestone/);
});

test("revoking membership denies the very next request", async () => {
  const f = await fixture();
  await f.register();
  const { token } = await f.mint();
  const list = { tool: "polynet_list", input: { path: `${COMMUNITY}/channels/` } };
  expect((await f.call(token, list)).body).toMatchObject({ ok: true });
  await f.t.run((ctx) => ctx.db.patch(f.ids.membershipId, { active: false, revokedAt: Date.now() }));
  expect((await f.call(token, list)).body).toMatchObject({ ok: false });
});

test("an app post is the member's own post, with a community_app receipt and no files", async () => {
  const f = await fixture();
  await f.register();
  const { token } = await f.mint();
  const write = (content: Record<string, unknown>, key: string) => f.call(token, {
    tool: "polynet_write",
    input: { path: `${COMMUNITY}/channels/general/`, mode: "create", content, idempotency_key: key },
  });
  const posted = await write({ text: "Week three tip: switch check-ins to a short async form." }, "app-post-1");
  expect(posted.body).toMatchObject({ ok: true, value: { receipt: { principal_kind: "community_app" } } });
  const rootId = String(posted.body.value.result.interaction.root_id);
  const root = await f.t.run(async (ctx) => ctx.db.get(ctx.db.normalizeId("communityInteractionRoots", rootId)!));
  expect(root).toMatchObject({ actorType: "human", actorUserId: f.ids.memberId, communityId: f.ids.communityId });
  expect((await write({ text: "with a file", attachments: [{ storageId: "x" }] }, "app-post-2")).body)
    .toMatchObject({ ok: false, code: "invalid_tool_args" });
  const replay = await write({ text: "Week three tip: switch check-ins to a short async form." }, "app-post-1");
  expect(replay.body).toMatchObject({ ok: true });
  expect(await f.t.run((ctx) => ctx.db.query("communityInteractionRoots").collect())).toHaveLength(1);
});
