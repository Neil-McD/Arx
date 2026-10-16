/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  registerCommunityAppRoutes,
  COMMUNITY_APP_RUNTIME_PATH,
  COMMUNITY_APP_HANDOFF_PATH,
  COMMUNITY_EDGE_EXCHANGE_PATH,
  COMMUNITY_EDGE_REVOKE_PATH,
} from "./httpCommunityApps";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import {
  COMMUNITY_APP_SESSION_ABSOLUTE_MS,
  COMMUNITY_APP_SESSION_TTL_MS,
  hashCommunityAppSessionToken,
} from "../shared/communityAppSession";

const modules = import.meta.glob([
  "./communityApps.ts",
  "./authSessions.ts",
  "./authSessionLifecycleCore.ts",
  "./authSessionMaintenanceCore.ts",
  "./providerConnections.ts",
  "./platformDiagnostics.ts",
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

const ORIGIN = "https://hello.example.com";
const COMMUNITY = "/communities/apps-community";
const STATE = "s".repeat(43);
const BRIDGE_SECRET = "test-bridge-secret";
const EDGE_SECRET = "test-edge-secret";

afterEach(() => { vi.unstubAllEnvs(); });

async function fixture() {
  vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", BRIDGE_SECRET);
  vi.stubEnv("POLYNET_COMMUNITY_EDGE_SECRET", EDGE_SECRET);
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
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
      await ctx.db.insert("authSessions", {
        sessionId: `sess-${handle}`, authSubject: `${handle}-subject`, userId,
        encryptedSecretHex: "encrypted-placeholder", secretIvHex: "iv-placeholder", secretVersion: 1,
        idleExpiresAt: nowMs + 86_400_000, absoluteExpiresAt: nowMs + 86_400_000 * 30,
        createdAt: nowMs, updatedAt: nowMs,
      } as any);
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
      communityId: ids.communityId, slug: "hello", name: "Hello", origin: ORIGIN,
      allowedTools: ["polynet_list", "polynet_read", "polynet_search", "polynet_write", "polynet_call"],
      ...overrides,
    } as any);

  // The real route handlers, registered on a capturing router and run without
  // a Convex session identity, exactly as the bridge, edge and front end call them.
  const handlers = new Map<string, (ctx: any, req: Request) => Promise<Response>>();
  registerCommunityAppRoutes({
    http: { route: ({ path, method, handler }) => { handlers.set(`${method} ${path}`, handler as any); } },
    httpAction: (handler) => handler as any,
  });
  const ctx = {
    runQuery: (ref: any, args: any) => t.query(ref, args),
    runMutation: (ref: any, args: any) => t.mutation(ref, args),
    runAction: (ref: any, args: any) => t.action(ref, args),
  };
  const post = async (path: string, headers: Record<string, string>, body: unknown) => {
    const res = await handlers.get(`POST ${path}`)!(ctx, new Request(`https://example.convex.site${path}`, {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json() as any };
  };
  const handoff = (handle: string, overrides: Record<string, unknown> = {}, secret = BRIDGE_SECRET) =>
    post(COMMUNITY_APP_HANDOFF_PATH, { "x-arx-auth-bridge-secret": secret },
      { session_id: `sess-${handle}`, community_slug: "apps-community", origin: ORIGIN, state: STATE, ...overrides });
  const exchange = (code: string, overrides: Record<string, unknown> = {}, secret = EDGE_SECRET) =>
    post(COMMUNITY_EDGE_EXCHANGE_PATH, { "x-polynet-edge-secret": secret }, { code, state: STATE, origin: ORIGIN, ...overrides });
  const signIn = async (handle = "apps-member") => {
    const issued = await handoff(handle);
    expect(issued).toMatchObject({ status: 200, body: { ok: true } });
    const exchanged = await exchange(issued.body.code);
    expect(exchanged).toMatchObject({ status: 200, body: { ok: true } });
    return exchanged.body.token as string;
  };
  const call = (token: string | null, body: unknown, origin = ORIGIN) =>
    post(COMMUNITY_APP_RUNTIME_PATH, { origin, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body);
  const sessions = () => t.run((c) => c.db.query("communityAppSessions").collect());
  return { t, ids, as, register, handoff, exchange, signIn, call, post, sessions };
}

test("only a community manager registers an address, which must be exact", async () => {
  const f = await fixture();
  await expect(f.register({}, "apps-member")).rejects.toThrow();
  for (const origin of ["http://hello.example.com", "https://hello.example.com/path", "https://u:p@hello.example.com"]) {
    await expect(f.register({ origin, slug: "bad" })).rejects.toThrow("community_app_origin_invalid");
  }
  expect(await f.register()).toMatchObject({ slug: "hello", origin: ORIGIN, status: "active" });
  await expect(f.register()).rejects.toThrow("community_app_slug_taken");
  expect(await f.register({ slug: "dev", origin: "http://hello.localhost:8787" })).toMatchObject({ origin: "http://hello.localhost:8787" });
});

test("handoff requires the bridge secret, a live Polynet session, membership and a registered address", async () => {
  const f = await fixture();
  await f.register();
  expect((await f.handoff("apps-member", {}, "wrong")).status).toBe(401);
  expect(await f.handoff("apps-member", { session_id: "sess-missing" })).toMatchObject({ status: 401, body: { code: "sign_in_required" } });
  expect(await f.handoff("apps-outsider")).toMatchObject({ status: 403, body: { code: "not_a_member", community_slug: "apps-community" } });
  expect(await f.handoff("apps-member", { origin: "https://evil.example.com" })).toMatchObject({ status: 403, body: { code: "address_not_registered" } });
  expect(await f.handoff("apps-member", { community_slug: "apps-other" })).toMatchObject({ status: 403, body: { code: "address_not_registered" } });
  expect(await f.handoff("apps-member", { state: "short" })).toMatchObject({ status: 400 });
  const issued = await f.handoff("apps-member");
  expect(issued.body.code).toMatch(/^pnh_[A-Za-z0-9_-]{43}$/);
  const stored = await f.t.run((c) => c.db.query("communityAppHandoffs").collect());
  expect(stored[0].codeHash).toBe(await hashCommunityAppSessionToken(issued.body.code));
  expect(JSON.stringify(stored)).not.toContain(issued.body.code);
  await f.as("apps-owner").mutation(api.communityApps.setCommunityAppStatus, { communityId: f.ids.communityId, slug: "hello", status: "disabled" });
  expect(await f.handoff("apps-member")).toMatchObject({ status: 403, body: { code: "address_not_registered" } });
});

test("a code works once, for its own state and address, within its lifetime", async () => {
  const f = await fixture();
  await f.register();
  expect((await f.exchange("pnh_" + "a".repeat(43), {}, "wrong")).status).toBe(401);
  const first = (await f.handoff("apps-member")).body.code;
  expect(await f.exchange(first, { state: "t".repeat(43) })).toMatchObject({ status: 403, body: { code: "code_invalid" } });
  expect(await f.exchange(first)).toMatchObject({ status: 403, body: { code: "code_invalid" } });
  const second = (await f.handoff("apps-member")).body.code;
  expect(await f.exchange(second, { origin: "https://evil.example.com" })).toMatchObject({ status: 403, body: { code: "code_invalid" } });
  const third = (await f.handoff("apps-member")).body.code;
  await f.t.run(async (c) => { for (const row of await c.db.query("communityAppHandoffs").collect()) await c.db.patch(row._id, { expiresAt: 1 }); });
  expect(await f.exchange(third)).toMatchObject({ status: 403, body: { code: "code_invalid" } });
  const fourth = (await f.handoff("apps-member")).body.code;
  const ok = await f.exchange(fourth);
  expect(ok.body.token).toMatch(/^pna_[A-Za-z0-9_-]{43}$/);
  expect(await f.exchange(fourth)).toMatchObject({ status: 403, body: { code: "code_invalid" } });
  expect(await f.sessions()).toHaveLength(1);
});

test("membership lost between handoff and exchange denies the session", async () => {
  const f = await fixture();
  await f.register();
  const code = (await f.handoff("apps-member")).body.code;
  await f.t.run((c) => c.db.patch(f.ids.membershipId, { active: false, revokedAt: Date.now() }));
  expect(await f.exchange(code)).toMatchObject({ status: 403, body: { code: "not_a_member" } });
  expect(await f.sessions()).toHaveLength(0);
});

test("sessions slide for 7 days, never past 30, and revoke immediately", async () => {
  const f = await fixture();
  await f.register();
  const token = await f.signIn();
  const [created] = await f.sessions();
  expect(created.expiresAt - created.createdAt).toBe(COMMUNITY_APP_SESSION_TTL_MS);
  expect(created.absoluteExpiresAt! - created.createdAt).toBe(COMMUNITY_APP_SESSION_ABSOLUTE_MS);
  const list = { tool: "polynet_list", input: { path: `${COMMUNITY}/channels/` } };
  await f.t.run((c) => c.db.patch(created._id, { expiresAt: Date.now() + 2 * 86_400_000 }));
  expect((await f.call(token, list)).body).toMatchObject({ ok: true });
  const [extended] = await f.sessions();
  expect(extended.expiresAt).toBeGreaterThan(Date.now() + COMMUNITY_APP_SESSION_TTL_MS - 60_000);
  await f.t.run((c) => c.db.patch(created._id, { expiresAt: Date.now() + 86_400_000, absoluteExpiresAt: Date.now() + 2 * 86_400_000 }));
  await f.call(token, list);
  const [capped] = await f.sessions();
  expect(capped.expiresAt).toBeLessThanOrEqual(capped.absoluteExpiresAt!);
  expect((await f.post(COMMUNITY_EDGE_REVOKE_PATH, { "x-polynet-edge-secret": EDGE_SECRET }, { token })).status).toBe(200);
  expect(await f.call(token, list)).toMatchObject({ status: 401, body: { code: "community_app_session_invalid" } });
});

test("a signed-in front end reads its own community and nothing else", async () => {
  const f = await fixture();
  await f.register();
  const token = await f.signIn();
  const listed = await f.call(token, { tool: "polynet_list", input: { path: `${COMMUNITY}/channels/` } });
  expect(listed.body).toMatchObject({ ok: true });
  expect(JSON.stringify(listed.body)).toContain(`${COMMUNITY}/channels/general/`);
  for (const path of ["/", "/communities/", "/users/"]) {
    expect((await f.call(token, { tool: "polynet_list", input: { path } })).body).toMatchObject({ ok: false, code: "community_path_required" });
  }
  expect((await f.call(token, { tool: "polynet_list", input: { path: "/communities/apps-other/" } })).body).toMatchObject({ ok: false });
  expect(await f.call(token, { tool: "polynet_list", input: { path: `${COMMUNITY}/` } }, "https://evil.example.com"))
    .toMatchObject({ status: 401 });
});

test("an owner's front-end session never receives builder authority", async () => {
  const f = await fixture();
  await f.register();
  const token = await f.signIn("apps-owner");
  expect((await f.call(token, { tool: "polynet_list", input: { path: `${COMMUNITY}/builder/` } })).body).toMatchObject({ ok: false });
  const capabilities = await f.call(token, { tool: "polynet_list", input: { path: `${COMMUNITY}/capabilities/` } });
  expect(capabilities.body).toMatchObject({ ok: true });
  expect(JSON.stringify(capabilities.body)).not.toMatch(/community\.admission\.|approve_milestone/);
});

test("losing membership denies the very next API call", async () => {
  const f = await fixture();
  await f.register();
  const token = await f.signIn();
  const list = { tool: "polynet_list", input: { path: `${COMMUNITY}/channels/` } };
  expect((await f.call(token, list)).body).toMatchObject({ ok: true });
  await f.t.run((c) => c.db.patch(f.ids.membershipId, { active: false, revokedAt: Date.now() }));
  expect((await f.call(token, list)).body).toMatchObject({ ok: false });
});

test("a front-end post is the member's own post, retried safely, without files", async () => {
  const f = await fixture();
  await f.register();
  const token = await f.signIn();
  const write = (content: Record<string, unknown>, key: string) => f.call(token, {
    tool: "polynet_write",
    input: { path: `${COMMUNITY}/channels/general/`, mode: "create", content, idempotency_key: key },
  });
  const posted = await write({ text: "Week three tip: switch check-ins to a short async form." }, "post-1");
  expect(posted.body).toMatchObject({ ok: true, value: { receipt: { principal_kind: "community_app" } } });
  const rootId = String(posted.body.value.result.interaction.root_id);
  const root = await f.t.run(async (c) => c.db.get(c.db.normalizeId("communityInteractionRoots", rootId)!));
  expect(root).toMatchObject({ actorType: "human", actorUserId: f.ids.memberId, communityId: f.ids.communityId });
  expect((await write({ text: "with a file", attachments: [{ storageId: "x" }] }, "post-2")).body).toMatchObject({ ok: false, code: "invalid_tool_args" });
  expect((await write({ text: "Week three tip: switch check-ins to a short async form." }, "post-1")).body).toMatchObject({ ok: true });
  expect(await f.t.run((c) => c.db.query("communityInteractionRoots").collect())).toHaveLength(1);
});
