/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  registerCommunityAppRoutes,
  COMMUNITY_APP_RUNTIME_PATH,
  COMMUNITY_APP_HANDOFF_PATH,
  COMMUNITY_EDGE_EXCHANGE_PATH,
  COMMUNITY_EDGE_REVOKE_PATH,
  COMMUNITY_APP_UPLOAD_PATH,
  COMMUNITY_APP_FILE_PATH,
} from "./httpCommunityApps";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { COMMUNITY_APP_SESSION_TTL_MS, deriveCommunityAppWatchToken, hashCommunityAppSessionToken } from "../shared/communityAppSession";

const modules = import.meta.glob([
  "./communityApps.ts",
  "./communityLive.ts",
  "./communityAttachmentUploads.ts",
  "./communityAttachmentDownloads.ts",
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

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

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
  const register = (origin = ORIGIN, communityId = ids.communityId) =>
    t.mutation(internal.communityApps.registerCommunityDomainInternal, { communityId, origin });

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
  // As the edge forwards it: the edge secret, the community's origin and the cookie's token.
  const call = (token: string | null, body: unknown, origin = ORIGIN, secret = EDGE_SECRET) =>
    post(COMMUNITY_APP_RUNTIME_PATH, { origin, "x-polynet-edge-secret": secret, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body);
  const sessions = () => t.run((c) => c.db.query("communityAppSessions").collect());
  // Raw requests as the edge forwards them, for binary upload and download routes.
  const raw = (path: string, token: string, init: { headers?: Record<string, string>; body?: BodyInit } = {}) =>
    handlers.get(`POST ${path}`)!(ctx, new Request(`https://example.convex.site${path}`, {
      method: "POST", body: init.body,
      headers: { origin: ORIGIN, "x-polynet-edge-secret": EDGE_SECRET, authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    }));
  return { t, ids, register, handoff, exchange, signIn, call, post, sessions, raw };
}

test("a domain is an exact origin and belongs to one community", async () => {
  const f = await fixture();
  for (const origin of ["http://hello.example.com", "https://hello.example.com/path", "https://u:p@hello.example.com"]) {
    await expect(f.register(origin)).rejects.toThrow("community_domain_invalid");
  }
  expect(await f.register()).toMatchObject({ origin: ORIGIN });
  await expect(f.register(ORIGIN, f.ids.otherCommunityId)).rejects.toThrow("community_domain_taken");
  expect(await f.register("http://hello.localhost:8787")).toMatchObject({ origin: "http://hello.localhost:8787" });
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
  await f.t.mutation(internal.communityApps.removeCommunityDomainInternal, { origin: ORIGIN });
  expect(await f.handoff("apps-member")).toMatchObject({ status: 403, body: { code: "address_not_registered" } });
});

test("a code works once, for its own state and address, within its lifetime", async () => {
  const f = await fixture();
  await f.register();
  expect((await f.exchange("pnh_" + "a".repeat(43), {}, "wrong")).status).toBe(401);
  const first = (await f.handoff("apps-member")).body.code;
  expect(await f.exchange(first, { state: "t".repeat(43) })).toMatchObject({ status: 403, body: { code: "code_invalid" } });
  expect(await f.exchange(first)).toMatchObject({ status: 403, body: { code: "code_invalid" } });
  expect(await f.t.run((c) => c.db.query("communityAppHandoffs").collect())).toHaveLength(0);
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

test("a session lasts 30 days, answers only the edge, and ends on sign-out or domain removal", async () => {
  const f = await fixture();
  await f.register();
  const token = await f.signIn();
  const [created] = await f.sessions();
  expect(created.expiresAt - Date.now()).toBeGreaterThan(COMMUNITY_APP_SESSION_TTL_MS - 60_000);
  const list = { tool: "polynet_list", input: { path: `${COMMUNITY}/channels/` } };
  expect((await f.call(token, list)).body).toMatchObject({ ok: true });
  expect(await f.call(token, list, ORIGIN, "wrong")).toMatchObject({ status: 401, body: { code: "edge_unauthorized" } });
  await f.t.run((c) => c.db.patch(created._id, { expiresAt: Date.now() - 1 }));
  expect(await f.call(token, list)).toMatchObject({ status: 401, body: { code: "community_app_session_invalid" } });
  const second = await f.signIn();
  expect(await f.sessions()).toHaveLength(1);
  expect((await f.post(COMMUNITY_EDGE_REVOKE_PATH, { "x-polynet-edge-secret": EDGE_SECRET }, { token: second })).status).toBe(200);
  expect(await f.call(second, list)).toMatchObject({ status: 401 });
  const third = await f.signIn();
  await f.t.mutation(internal.communityApps.removeCommunityDomainInternal, { origin: ORIGIN });
  expect(await f.call(third, list)).toMatchObject({ status: 401 });
  expect(await f.sessions()).toHaveLength(0);
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

test("a front-end post is the member's own post, retried safely", async () => {
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
  expect((await write({ text: "Week three tip: switch check-ins to a short async form." }, "post-1")).body).toMatchObject({ ok: true });
  expect(await f.t.run((c) => c.db.query("communityInteractionRoots").collect())).toHaveLength(1);
});

test("a front end watches a channel it can read and sees every change, until access ends", async () => {
  const f = await fixture();
  await f.register();
  const restrictedId = await f.t.run((c) => c.db.insert("communityChannels", {
    communityId: f.ids.communityId, slug: "founders", name: "Founders", accessMode: "restricted",
    postingPolicy: "members", status: "active", position: 1, createdAt: Date.now(), updatedAt: Date.now(),
  } as any));
  const token = await f.signIn();
  const watchToken = await deriveCommunityAppWatchToken(token);
  const watch = (path: string, tokenValue = watchToken) => f.t.query(api.communityLive.watch, { token: tokenValue, path });
  const general = `${COMMUNITY}/channels/general/`;

  expect(await watch(general, `pnw_${"x".repeat(43)}`)).toEqual({ ok: false, code: "session_invalid" });
  expect(await watch(general, token)).toEqual({ ok: false, code: "session_invalid" });
  const before = await watch(general);
  expect(before).toMatchObject({ ok: true });

  await new Promise((resolve) => setTimeout(resolve, 5));
  await f.call(token, {
    tool: "polynet_write",
    input: { path: general, mode: "create", content: { text: "Live from the front end." }, idempotency_key: "live-1" },
  });
  const after = await watch(general);
  expect(after.ok && before.ok && after.version > before.version).toBe(true);

  for (const path of ["/communities/apps-other/channels/general/", `${COMMUNITY}/channels/founders/`, `${COMMUNITY}/channels/missing/`, `${COMMUNITY}/events/`, "/"]) {
    expect(await watch(path)).toEqual({ ok: false, code: "watch_unavailable" });
  }
  expect(restrictedId).toBeTruthy();

  await f.t.run((c) => c.db.patch(f.ids.membershipId, { active: false, revokedAt: Date.now() }));
  expect(await watch(general)).toEqual({ ok: false, code: "watch_unavailable" });
  await f.t.run((c) => c.db.patch(f.ids.membershipId, { active: true, revokedAt: undefined }));
  expect(await watch(general)).toMatchObject({ ok: true });

  await f.post(COMMUNITY_EDGE_REVOKE_PATH, { "x-polynet-edge-secret": EDGE_SECRET }, { token });
  expect(await watch(general)).toEqual({ ok: false, code: "session_invalid" });
});

test("a front end runs a full chat: names, threads, reactions, and edits or deletes only its member's own posts", async () => {
  const f = await fixture();
  await f.register();
  const member = await f.signIn("apps-member");
  const owner = await f.signIn("apps-owner");
  const general = `${COMMUNITY}/channels/general/`;
  const post = async (token: string, content: Record<string, unknown>, key: string) => {
    const mode = content.root_id ? "append" : "create";
    const result = await f.call(token, { tool: "polynet_write", input: { path: general, mode, content, idempotency_key: key } });
    expect(result.body).toMatchObject({ ok: true });
    return result.body.value.ref as string;
  };
  const write = (token: string, ref: string, mode: string, content: Record<string, unknown>, key: string) =>
    f.call(token, { tool: "polynet_write", input: { path: `${general}${ref}.md`, mode, content, idempotency_key: key } });
  const react = (token: string, ref: string, on: boolean, key: string) => f.call(token, {
    tool: "polynet_call",
    input: { target: `${COMMUNITY}/capabilities/community.interaction.react.json`, operation: "community.interaction.react",
      version: 1, idempotencyKey: key, input: { ref, emoji: "👍", on } },
  });
  const list = async (token: string, path = general) => {
    const result = await f.call(token, { tool: "polynet_list", input: { path, limit: 50 } });
    if (!result.body.ok) throw new Error(`list ${path} failed: ${JSON.stringify(result.body)}`);
    return result.body.value.entries as Array<Record<string, any>>;
  };

  const memberPost = await post(member, { text: "Member post" }, "m-1");
  const ownerPost = await post(owner, { text: "Owner post" }, "o-1");
  const rootId = memberPost.replace("interaction:root:", "");
  const reply = await post(owner, { text: "Owner reply", root_id: rootId }, "o-2");

  // Names and thread linkage in the channel listing.
  const listed = await list(member);
  const memberEntry = listed.find((entry) => entry.ref === memberPost)!;
  expect(memberEntry.actor).toMatchObject({ display_name: "apps-member", avatar_url: "https://example.com/apps-member.png" });
  expect(memberEntry).toMatchObject({ object_type: "root", reply_count: 1, reactions: [], reacted_by_me: [], by_me: true, edited_at: null });
  expect(listed.find((entry) => entry.ref === ownerPost)).toMatchObject({ by_me: false });
  expect(listed.find((entry) => entry.ref === reply)).toMatchObject({ object_type: "reply", root_ref: memberPost });
  expect(JSON.stringify(listed)).not.toContain('"root_id"');

  // Thread listing: the post, then its replies.
  const thread = await list(member, `${general}${memberPost}/`);
  expect(thread.map((entry) => entry.ref)).toEqual([memberPost, reply]);

  // Reactions set and unset, retry-safe, with the viewer's own marked.
  expect((await react(member, ownerPost, true, "r-1")).body).toMatchObject({ ok: true, value: { reacted: true } });
  expect((await react(member, ownerPost, true, "r-2")).body).toMatchObject({ ok: true, value: { reacted: true } });
  let ownerEntry = (await list(member)).find((entry) => entry.ref === ownerPost)!;
  expect(ownerEntry).toMatchObject({ reactions: [{ emoji: "👍", count: 1 }], reacted_by_me: ["👍"] });
  expect((await list(owner)).find((entry) => entry.ref === ownerPost)).toMatchObject({ reacted_by_me: [] });
  expect((await react(member, ownerPost, false, "r-3")).body).toMatchObject({ ok: true, value: { reacted: false } });
  ownerEntry = (await list(member)).find((entry) => entry.ref === ownerPost)!;
  expect(ownerEntry.reactions).toEqual([]);
  expect((await react(member, "interaction:root:missing", true, "r-4")).body).toMatchObject({ ok: false });

  // Edit and delete own posts only, even for the community owner.
  expect((await write(member, memberPost, "update", { text: "Member post, edited" }, "e-1")).body).toMatchObject({ ok: true });
  expect((await list(member)).find((entry) => entry.ref === memberPost)).toMatchObject({ snippet: "Member post, edited" });
  expect((await list(member)).find((entry) => entry.ref === memberPost)!.edited_at).toBeTruthy();
  expect((await write(member, ownerPost, "update", { text: "hijack" }, "e-2")).body)
    .toMatchObject({ ok: false, message: expect.stringContaining("interaction_edit_forbidden") });
  expect((await write(owner, memberPost, "delete", {}, "d-1")).body)
    .toMatchObject({ ok: false, message: expect.stringContaining("interaction_delete_forbidden") });
  expect((await write(owner, reply, "delete", {}, "d-2")).body).toMatchObject({ ok: true });
  expect((await list(member, `${general}${memberPost}/`)).map((entry) => entry.ref)).toEqual([memberPost]);
  expect((await write(member, memberPost, "delete", {}, "d-3")).body).toMatchObject({ ok: true });
  expect((await list(member)).some((entry) => entry.ref === memberPost)).toBe(false);
});

test("a front end uploads a file with a post, lists it, and serves it only within its community", async () => {
  const f = await fixture();
  await f.register();
  const token = await f.signIn();
  const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const general = `${COMMUNITY}/channels/general/`;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (!init?.body) return new Response(PNG, { headers: { "content-type": "image/png" } });
    const blob = await new Response(init?.body, { headers: init?.headers }).blob();
    const storageId = await f.t.run(async (c) => {
      const id = await c.storage.store(blob);
      await c.db.patch(id as any, { contentType: blob.type } as any);
      return id;
    });
    return Response.json({ storageId });
  });
  const upload = (headers: Record<string, string>, secretless = false) => f.raw(COMMUNITY_APP_UPLOAD_PATH, token, {
    body: PNG,
    headers: { "content-type": "image/png", "x-polynet-file-name": "photo.png", "x-polynet-channel": "general",
      "x-polynet-idempotency-key": "with-photo", ...headers, ...(secretless ? { "x-polynet-edge-secret": "wrong" } : {}) },
  });

  expect((await upload({}, true)).status).toBe(401);
  expect((await upload({ "x-polynet-channel": "missing" })).status).toBe(404);
  const uploaded = await upload({});
  expect(uploaded.status).toBe(200);
  const { attachment } = await uploaded.json();
  expect(attachment).toMatchObject({ name: "photo.png", mime: "image/png", type: "image" });

  const posted = await f.call(token, { tool: "polynet_write", input: {
    path: general, mode: "create", content: { text: "With a photo", attachments: [{ attachmentId: attachment.attachmentId }] },
    idempotency_key: "with-photo" } });
  expect(posted.body).toMatchObject({ ok: true });
  const listed = (await f.call(token, { tool: "polynet_list", input: { path: general, limit: 50 } })).body.value.entries;
  const entry = listed.find((item: any) => item.snippet === "With a photo");
  expect(entry.attachments).toEqual([{ ref: `attachment:${attachment.attachmentId}`, name: "photo.png", kind: "image", mime: "image/png", size: PNG.length }]);

  const served = await f.raw(COMMUNITY_APP_FILE_PATH, token, { headers: { "x-polynet-attachment-id": attachment.attachmentId } });
  expect(served.status).toBe(200);
  expect(Object.fromEntries(served.headers as unknown as Iterable<[string, string]>)).toMatchObject({
    "content-type": "image/png", "content-disposition": "inline; filename*=UTF-8''photo.png",
    "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox", "cache-control": "private, no-store",
  });
  expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);

  // A file in another community is never served to this front end.
  const foreign = await f.t.run(async (c) => {
    const channel = (await c.db.query("communityChannels").collect()).find((row) => row.communityId === f.ids.otherCommunityId)!;
    return c.db.insert("communityInteractionAttachments", {
      communityId: f.ids.otherCommunityId, channelId: channel._id, status: "uploaded", name: "x.png", mimeType: "image/png",
      attachmentKind: "image", sizeBytes: 1, createdByActorType: "human", createdAt: Date.now(), updatedAt: Date.now(),
    } as any);
  });
  expect((await f.raw(COMMUNITY_APP_FILE_PATH, token, { headers: { "x-polynet-attachment-id": foreign } })).status).toBe(404);
  expect((await f.raw(COMMUNITY_APP_FILE_PATH, token, { headers: { "x-polynet-attachment-id": "not-an-id" } })).status).toBe(404);
});

test("a front end browses, searches and reads community memory, never admin-only memory", async () => {
  const f = await fixture();
  await f.register();
  const token = await f.signIn();
  const node = (title: string, visibilityScope: "community" | "admin") => f.t.run((c) => c.db.insert("communityIntelligenceNodes", {
    communityId: f.ids.communityId, type: "insight", title, bodyMd: `${title} body.`, status: "promising",
    visibilityScope, sourceVisibility: "community", confidence: 0.7, evidenceStrength: "observed", workflowIds: [], tags: [],
    sourceTraceIds: [], outcomeObservationIds: [], stalenessScore: 0, retrievalUsefulnessScore: 0, outcomeImpactScore: 0,
    createdByActorType: "admin", createdByUserId: f.ids.ownerId, lastUpdatedByActorType: "admin", lastUpdatedByUserId: f.ids.ownerId,
    version: 1, createdAt: Date.now(), updatedAt: Date.now(),
  } as any));
  const shared = await node("Async check-ins beat calls", "community");
  await node("Founder-only pricing note", "admin");

  const listed = await f.call(token, { tool: "polynet_list", input: { path: `${COMMUNITY}/memory/` } });
  expect(listed.body).toMatchObject({ ok: true });
  const titles = listed.body.value.entries.map((entry: any) => entry.title);
  expect(titles).toEqual(["Async check-ins beat calls"]);
  expect(listed.body.value.retrieval_id).toBeTruthy();

  const searched = await f.call(token, { tool: "polynet_search", input: { path: `${COMMUNITY}/memory/`, query: "check-ins" } });
  expect(searched.body).toMatchObject({ ok: true });
  expect(searched.body.value.results.map((result: any) => result.title)).toEqual(["Async check-ins beat calls"]);
  const pricing = await f.call(token, { tool: "polynet_search", input: { path: `${COMMUNITY}/memory/`, query: "pricing" } });
  expect(JSON.stringify(pricing.body)).not.toContain("Founder-only");

  const read = await f.call(token, { tool: "polynet_read", input: { path: `${COMMUNITY}/memory/${shared}.md` } });
  expect(read.body).toMatchObject({ ok: true });
  expect(JSON.stringify(read.body.value)).toContain("Async check-ins beat calls body.");

  const outcome = await f.call(token, { tool: "polynet_call", input: {
    target: `${COMMUNITY}/capabilities/community.memory.record_outcome.json`, operation: "community.memory.record_outcome",
    version: 1, idempotencyKey: "outcome-1",
    input: { retrieval_log_id: searched.body.value.retrieval_id, node_id: String(shared), result_status: "worked" },
  } });
  // It reaches the memory rules (no identity error); outcomes count only for memory an agent used.
  expect(outcome.body).toMatchObject({ ok: false, code: "community_intelligence_retrieval_node_not_injected" });
});
