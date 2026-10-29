/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { COMMUNITY_BUILDER_ACCESS_SUBSCRIPTION_REQUIRED } from "../shared/founderPlan";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  registerCommunityAppRoutes,
  COMMUNITY_APP_RUNTIME_PATH,
  COMMUNITY_APP_HANDOFF_PATH,
  COMMUNITY_EDGE_EXCHANGE_PATH,
  COMMUNITY_APP_ACCOUNT_PATH,
  COMMUNITY_EDGE_PUBLIC_PATH,
  COMMUNITY_EDGE_DISCOVER_PATH,
  COMMUNITY_EDGE_REVOKE_PATH,
  COMMUNITY_APP_UPLOAD_PATH,
  COMMUNITY_APP_FILE_PATH,
  COMMUNITY_APP_MY_COMMUNITIES_PATH,
  COMMUNITY_APP_MY_SETTINGS_PATH,
  COMMUNITY_APP_MY_HANDLE_PATH,
  COMMUNITY_APP_MY_PROFILE_PATH,
  COMMUNITY_APP_MY_AVATAR_UPLOAD_PATH,
  COMMUNITY_APP_MY_AVATAR_PATH,
  COMMUNITY_APP_MY_NOTIFICATIONS_PATH,
  COMMUNITY_APP_MY_LEAVE_PATH,
  COMMUNITY_APP_MY_MESSAGES_PATH,
  COMMUNITY_APP_MY_CONVERSATION_PATH,
  COMMUNITY_APP_MY_MESSAGE_START_PATH,
  COMMUNITY_APP_MY_MESSAGE_SEND_PATH,
  COMMUNITY_APP_MY_MESSAGE_UPLOAD_PATH,
  COMMUNITY_APP_MY_MESSAGE_READ_PATH,
  COMMUNITY_APP_MY_MESSAGE_MUTE_PATH,
  COMMUNITY_APP_MY_MESSAGE_TYPING_PATH,
  COMMUNITY_APP_MY_MESSAGE_BLOCK_PATH,
  COMMUNITY_APP_MY_JOIN_PATH,
  COMMUNITY_APP_MY_JOIN_REQUEST_PATH,
  COMMUNITY_APP_MY_JOIN_CANCEL_PATH,
  COMMUNITY_APP_MY_JOIN_CHECKOUT_PATH,
  COMMUNITY_APP_MY_JOIN_FINISH_PATH,
  COMMUNITY_APP_MY_MODERATION_POST_PATH,
  COMMUNITY_APP_MY_MODERATION_REMOVE_PATH,
  COMMUNITY_APP_MY_REQUESTS_PATH,
  COMMUNITY_APP_MY_REQUEST_APPROVE_PATH,
  COMMUNITY_APP_MY_REQUEST_DENY_PATH,
} from "./httpCommunityApps";
import { twinCheckoutReturnUrls } from "./communityAppJoin";
import { deriveCommunityFunnelAction } from "../shared/communityJoinPolicy";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import {
  COMMUNITY_APP_SESSION_TTL_MS, deriveCommunityAppWatchToken, hashCommunityAppSessionToken, signCommunityAppSignoutTicket,
} from "../shared/communityAppSession";

const modules = import.meta.glob([
  "./communityApps.ts",
  "./communitySites.ts",
  "./communityLive.ts",
  "./communityAttachmentUploads.ts",
  "./communityAttachmentDownloads.ts",
  "./authSessions.ts",
  "./authSessionLifecycleCore.ts",
  "./authSessionMaintenanceCore.ts",
  "./secretCrypto.ts",
  "./platformDiagnostics.ts",
  "./communityAdmin.ts",
  "./communityPublic.ts",
  "./communityAccessQueries.ts",
  "./communityAgent.ts",
  "./communityMemberWorkflows.ts",
  "./authActor.ts",
  "./authIdentity.ts",
  "./communityActivity.ts",
  "./communityAttention.ts",
  "./communityCapabilityContext.ts",
  "./communityChat.ts",
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
  "./emailPreferences.ts",
  "./polynetCanonicalReceipts.ts",
  "./profiles.ts",
  "./directMessages.ts",
  "./directMessageEmails.ts",
  "./communityAppJoin.ts",
  "./communityCommerce.ts",
  "./creatorCommerce.ts",
  "./_generated/**/*.*s",
]);

const ORIGIN = "https://hello.example.com";
const COMMUNITY = "/communities/apps-community";
const STATE = "s".repeat(43);
const BRIDGE_SECRET = "test-bridge-secret";
const EDGE_SECRET = "test-edge-secret";

// Stripe, stood in for: Join's checkout runs Studio's own checkout, which talks
// to Stripe; the test sees what it was asked for and answers like test mode.
const stripe = vi.hoisted(() => ({ checkouts: [] as Array<{ params: any; options: any }> }));
vi.mock("./stripeCore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stripeCore")>()),
  requireStripeConnectWebhookConfiguration: () => {},
  getStripeClient: () => ({
    customers: {
      retrieve: async (id: string) => ({ id }),
      create: async () => ({ id: "cus_test_join" }),
    },
    checkout: { sessions: { create: async (params: any, options: any) => {
      stripe.checkouts.push({ params, options });
      return { id: `cs_test_${stripe.checkouts.length}`, url: `https://checkout.stripe.com/c/pay/cs_test_${stripe.checkouts.length}`, customer: "cus_test_join", subscription: null };
    } } },
  }),
}));

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
  expect(memberEntry).toMatchObject({ object_type: "root", reply_count: 1, reactions: [], reacted_by_me: [], by_me: true, can_edit: true, edited_at: null, snippet_truncated: false });
  expect(memberEntry.text).toBeUndefined();
  expect(listed.find((entry) => entry.ref === ownerPost)).toMatchObject({ by_me: false, can_edit: false });

  // Long posts: the snippet is cut, the flag says so, and text carries the whole post.
  const longText = `${"Long run notes. ".repeat(40)}The end.`;
  const longPost = await post(member, { text: longText }, "m-long");
  const longEntry = (await list(member)).find((entry) => entry.ref === longPost)!;
  expect(longEntry).toMatchObject({ snippet_truncated: true, text: longText });
  expect(longEntry.snippet.length).toBeLessThan(longText.length);
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
  expect(listed.body.value.entries.map((entry: any) => [entry.title, entry.type])).toEqual([["Async check-ins beat calls", "insight"]]);
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

test("a front-end post that mentions the community agent asks it to reply", async () => {
  const f = await fixture();
  await f.register();
  const token = await f.signIn();
  // The community folder names the community; its agent is mentioned as @<name>.
  const root = await f.call(token, { tool: "polynet_list", input: { path: `${COMMUNITY}/` } });
  expect(root.body.value.community).toEqual({ slug: "apps-community", name: "apps-community", agent_name: "apps-community" });
  // ...and says who is signed in.
  expect(root.body.value.viewer).toEqual({ display_name: "apps-member", handle: "apps-member", avatar_url: "https://example.com/apps-member.png", role: "member" });
  const posted = await f.call(token, { tool: "polynet_write", input: {
    path: `${COMMUNITY}/channels/general/`, mode: "create", idempotency_key: "ask-agent",
    content: { text: `@${root.body.value.community.name} what's on this week?`, mentions: [{ agentKey: "community_agent" }] },
  } });
  expect(posted.body).toMatchObject({ ok: true });
  const requests = await f.t.run((c) => c.db.query("communityAgentServeRequests").collect());
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ communityId: f.ids.communityId });
});

test("a community's site shows its public identity to anyone, through the edge only", async () => {
  const f = await fixture();
  await f.register();
  await f.t.run((c) => c.db.patch(f.ids.communityId, { oneLiner: "We build apps.", about: "Long about." } as any));
  const edgeHeaders = { "x-polynet-edge-secret": EDGE_SECRET };
  expect(await f.post(COMMUNITY_EDGE_PUBLIC_PATH, edgeHeaders, { origin: ORIGIN })).toEqual({ status: 200, body: { ok: true, community: {
    slug: "apps-community", name: "apps-community", one_liner: "We build apps.", about: "Long about.", member_count: 2,
  } } });
  expect((await f.post(COMMUNITY_EDGE_PUBLIC_PATH, {}, { origin: ORIGIN })).status).toBe(401);
  expect(await f.post(COMMUNITY_EDGE_PUBLIC_PATH, edgeHeaders, { origin: "https://unknown.example.com" })).toMatchObject({ status: 404, body: { code: "community_unavailable" } });
});

test("Discover on a site lists published communities' public cards through the edge only, linking each to its own site", async () => {
  const f = await fixture();
  const site = "https://apps-community-staging.polynet.page";
  await f.register(site);
  // Another community's site address can't be claimed for apps-community's card.
  await f.register("https://apps-other.polynet.page");
  await f.t.run(async (c) => {
    await c.db.patch(f.ids.communityId, { visibility: "published", oneLiner: "We build apps.", about: "Private-ish about.", updatedAt: 3 } as any);
    await c.db.patch(f.ids.otherCommunityId, { visibility: "published", updatedAt: 2 } as any);
    const base = { ownerId: f.ids.ownerId, inferenceFundingPolicy: "managed_required" as const, entryPolicy: "open" as const, activeMemberCount: 9, createdAt: 1, updatedAt: 1 };
    await c.db.insert("communities", { ...base, slug: "apps-hidden", name: "Hidden", visibility: "unlisted" } as any);
    await c.db.insert("communities", { ...base, slug: "apps-gone", name: "Gone", visibility: "published", lifecycleStatus: "archived", lifecycleGeneration: 1 } as any);
  });
  const edgeHeaders = { "x-polynet-edge-secret": EDGE_SECRET };
  const listed = await f.post(COMMUNITY_EDGE_DISCOVER_PATH, edgeHeaders, { sites_domain: "polynet.page", host_suffix: "-staging" });
  expect(listed).toEqual({ status: 200, body: { ok: true, communities: [
    { slug: "apps-community", name: "apps-community", one_liner: "We build apps.", avatar_url: null, member_count: 2, site_url: site },
    // Its registered address is production's, not this environment's: Studio, then.
    { slug: "apps-other", name: "apps-other", one_liner: null, avatar_url: null, member_count: 2, site_url: null },
  ] } });
  // No sites domain (or a malformed one): every card links to Studio.
  for (const body of [{}, { sites_domain: "polynet.page/../x", host_suffix: "-staging" }, { sites_domain: "polynet.page", host_suffix: "staging" }]) {
    const res = await f.post(COMMUNITY_EDGE_DISCOVER_PATH, edgeHeaders, body);
    expect(res.body.communities.map((c: any) => c.site_url)).toEqual([null, null]);
  }
  expect((await f.post(COMMUNITY_EDGE_DISCOVER_PATH, {}, {})).status).toBe(401);
  expect((await f.post(COMMUNITY_EDGE_DISCOVER_PATH, { "x-polynet-edge-secret": "wrong" }, {})).status).toBe(401);
});

test("the shell shows the member's account: who they are, their role here, and links out, never their other communities", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://studio.example.com");
  const f = await fixture();
  await f.register();
  await f.register("https://other.example.com", f.ids.otherCommunityId);
  // The member also belongs to apps-other; this site must not learn that.
  await f.t.run((c) => c.db.insert("communityMemberships", {
    communityId: f.ids.otherCommunityId, userId: f.ids.memberId, role: "admin", accessSource: "free_grant", active: true,
    activationSequence: 1, activatedAt: 1, createdAt: 1, updatedAt: 1,
  }));
  const token = await f.signIn("apps-member");
  const account = await f.post(COMMUNITY_APP_ACCOUNT_PATH, { origin: ORIGIN, "x-polynet-edge-secret": EDGE_SECRET, authorization: `Bearer ${token}` }, {});
  expect(account).toEqual({ status: 200, body: { ok: true, account: {
    member: { name: "apps-member", handle: "apps-member", avatar_url: "https://example.com/apps-member.png" },
    community: { slug: "apps-community", name: "apps-community", role: "member", studio_url: "https://studio.example.com/c/apps-community/settings/community" },
    links: {
      communities: "https://studio.example.com/", discover: "https://studio.example.com/discover",
      settings: "https://studio.example.com/settings/profile", messages: "https://studio.example.com/?dm=inbox",
    },
  } } });
  expect(JSON.stringify(account)).not.toContain("apps-other");
  // Only the edge, with a session.
  expect((await f.post(COMMUNITY_APP_ACCOUNT_PATH, { origin: ORIGIN, authorization: `Bearer ${token}` }, {})).status).toBe(401);
  expect((await f.post(COMMUNITY_APP_ACCOUNT_PATH, { origin: ORIGIN, "x-polynet-edge-secret": EDGE_SECRET }, {})).status).toBe(401);
});

// A member action through the site's door: polynet_call on this community's capability.
const capability = (f: Awaited<ReturnType<typeof fixture>>, token: string, operation: string, input: unknown, key: string) =>
  f.call(token, { tool: "polynet_call", input: { target: `${COMMUNITY}/capabilities/${operation}.json`, operation, version: 1, idempotencyKey: key, input } });

test("a front end sees which channels are unread or mention its member, and marks them read without moving back", async () => {
  const f = await fixture();
  await f.register();
  const member = await f.signIn();
  const owner = await f.signIn("apps-owner");
  const general = async () => {
    const listed = await f.call(member, { tool: "polynet_list", input: { path: `${COMMUNITY}/channels/` } });
    return listed.body.value.entries.find((entry: any) => entry.slug === "general");
  };
  expect(await general()).toMatchObject({ unread: false, mentioned: false, latest_activity_at: null, seen_through_at: null });
  const say = (content: Record<string, unknown>, key: string) => f.call(owner, { tool: "polynet_write",
    input: { path: `${COMMUNITY}/channels/general/`, mode: "create", content, idempotency_key: key } });
  expect((await say({ text: "Morning all" }, "o-1")).body).toMatchObject({ ok: true });
  expect(await general()).toMatchObject({ unread: true, mentioned: false, latest_activity_at: expect.any(Number) });
  expect((await say({ text: "@apps-member you in?", mentions: [{ userId: String(f.ids.memberId) }] }, "o-2")).body).toMatchObject({ ok: true });
  expect(await general()).toMatchObject({ unread: true, mentioned: true });

  for (const input of [{}, { channel: "general", extra: 1 }, { channel: "general", through_at: -1 }, { channel: "general", through_at: 1.5 }, { channel: "general", through_at: "soon" }]) {
    expect((await capability(f, member, "community.channel.mark_read", input, "bad")).body).toMatchObject({ ok: false, code: "invalid_tool_args" });
  }
  expect((await capability(f, member, "community.channel.mark_read", { channel: "missing" }, "m-0")).body).toMatchObject({ ok: false, code: "channel_unavailable" });
  const latest = (await general()).latest_activity_at;
  expect((await capability(f, member, "community.channel.mark_read", { channel: "general" }, "m-1")).body)
    .toMatchObject({ ok: true, value: { channel: "general", advanced: true, seen_through_at: latest } });
  expect(await general()).toMatchObject({ unread: false, mentioned: false, seen_through_at: latest });
  expect((await capability(f, member, "community.channel.mark_read", { channel: "general", through_at: 1 }, "m-2")).body)
    .toMatchObject({ ok: true, value: { advanced: false, seen_through_at: latest } });
  // The owner's own read state is theirs.
  const ownerListed = await f.call(owner, { tool: "polynet_list", input: { path: `${COMMUNITY}/channels/` } });
  expect(ownerListed.body.value.entries.find((entry: any) => entry.slug === "general")).toMatchObject({ mentioned: false });
});

test("a front end keeps its member present, shows who is online, and marks members online", async () => {
  const f = await fixture();
  await f.register();
  const member = await f.signIn();
  const owner = await f.signIn("apps-owner");
  const online = async (token: string) => {
    const read = await f.call(token, { tool: "polynet_read", input: { path: `${COMMUNITY}/presence.json` } });
    if (!read.body.ok) return read.body;
    return JSON.parse(read.body.value.body);
  };
  const watchToken = await deriveCommunityAppWatchToken(member);
  const watchOnline = () => f.t.query(api.communityLive.watch, { token: watchToken, path: `${COMMUNITY}/presence.json` });
  expect(await online(member)).toEqual({ online_count: 0, online_count_capped: false, members: [] });
  expect(await watchOnline()).toEqual({ ok: true, version: "" });

  expect((await capability(f, member, "community.presence.heartbeat", { here: true }, "h-0")).body).toMatchObject({ ok: false, code: "invalid_tool_args" });
  expect((await capability(f, member, "community.presence.heartbeat", {}, "h-1")).body).toMatchObject({ ok: true, value: { active_until: expect.any(String) } });
  expect(await online(owner)).toEqual({ online_count: 1, online_count_capped: false, members: [
    { ref: `user:${f.ids.memberId}`, name: "apps-member", handle: "apps-member", avatar_url: "https://example.com/apps-member.png" },
  ] });
  expect(await watchOnline()).toEqual({ ok: true, version: String(f.ids.memberId) });
  await capability(f, owner, "community.presence.heartbeat", {}, "h-2");
  expect(await watchOnline()).toEqual({ ok: true, version: [String(f.ids.memberId), String(f.ids.ownerId)].sort().join(",") });

  const members = await f.call(member, { tool: "polynet_list", input: { path: `${COMMUNITY}/members/` } });
  const entries = members.body.value.entries as Array<Record<string, unknown>>;
  expect(entries.find((entry) => entry.ref === `user:${f.ids.memberId}`)).toMatchObject({
    type: "member", name: "apps-member", role: "member", handle: "apps-member", avatar_url: "https://example.com/apps-member.png", online: true,
  });
  expect(entries.find((entry) => entry.ref === `user:${f.ids.ownerId}`)).toMatchObject({ role: "owner", handle: "apps-owner", online: true });

  // The capabilities folder offers the site its member actions.
  const capabilities = await f.call(member, { tool: "polynet_list", input: { path: `${COMMUNITY}/capabilities/` } });
  expect(capabilities.body.value.entries.map((entry: any) => entry.operation)).toEqual(expect.arrayContaining([
    "community.channel.mark_read", "community.presence.heartbeat", "community.typing.set",
  ]));

  // Losing membership closes both the read and the watch.
  await f.t.run((c) => c.db.patch(f.ids.membershipId, { active: false, revokedAt: Date.now() }));
  expect(await online(member)).toMatchObject({ ok: false });
  expect(await watchOnline()).toEqual({ ok: false, code: "watch_unavailable" });
  expect((await capability(f, member, "community.presence.heartbeat", {}, "h-3")).body).toMatchObject({ ok: false });
});

test("a front end sets its member's typing; others see it live, the typist doesn't", async () => {
  const f = await fixture();
  await f.register();
  const member = await f.signIn();
  const owner = await f.signIn("apps-owner");
  const general = `${COMMUNITY}/channels/general/`;
  const watchAs = async (token: string) => f.t.query(api.communityLive.watch, { token: await deriveCommunityAppWatchToken(token), path: general });
  const typing = (input: unknown, key: string) => capability(f, owner, "community.typing.set", input, key);
  for (const input of [{ channel: "general" }, { channel: "general", on: "yes" }, { on: true },
    { channel: "general", on: true, thread_ref: "interaction:reply:abc" }, { channel: "general", on: true, extra: 1 }]) {
    expect((await typing(input, "bad")).body).toMatchObject({ ok: false, code: "invalid_tool_args" });
  }
  expect((await typing({ channel: "missing", on: true }, "t-0")).body).toMatchObject({ ok: false, code: "channel_unavailable" });

  expect((await typing({ channel: "general", on: true }, "t-1")).body).toMatchObject({ ok: true, value: { on: true } });
  expect((await typing({ channel: "general", on: true }, "t-2")).body).toMatchObject({ ok: true });
  expect(await f.t.run((c) => c.db.query("communityTypingPresence").collect())).toHaveLength(1);
  expect(await watchAs(member)).toMatchObject({ ok: true, typing: [{
    ref: `user:${f.ids.ownerId}`, name: "apps-owner", avatar_url: "https://example.com/apps-owner.png", thread_ref: null,
    lease_until: expect.any(Number),
    expires_in_ms: expect.any(Number),
  }] });
  expect(await watchAs(owner)).toMatchObject({ ok: true, typing: [] });

  const posted = await f.call(member, { tool: "polynet_write", input: { path: general, mode: "create", content: { text: "Run at 6?" }, idempotency_key: "p-1" } });
  const thread = posted.body.value.ref as string;
  expect((await typing({ channel: "general", on: true, thread_ref: thread }, "t-3")).body).toMatchObject({ ok: true });
  expect(await watchAs(member)).toMatchObject({ typing: [{ ref: `user:${f.ids.ownerId}`, thread_ref: thread }] });
  expect((await typing({ channel: "general", on: false, thread_ref: thread }, "t-4")).body).toMatchObject({ ok: true, value: { on: false } });
  expect((await typing({ channel: "general", on: false, thread_ref: thread }, "t-5")).body).toMatchObject({ ok: true, value: { on: false } });
  expect(await watchAs(member)).toMatchObject({ ok: true, typing: [] });
});

test("a front end reads a fellow member's profile: only what Studio shows another member, only inside this community", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://studio.example.com");
  const f = await fixture();
  await f.register();
  const member = await f.signIn();
  const owner = await f.signIn("apps-owner");
  await f.t.run(async (c) => {
    const detail = (await c.db.query("userProfileDetails").withIndex("by_user", (q) => q.eq("userId", f.ids.memberId)).first())!;
    await c.db.patch(detail._id, { bio: "Runs at dawn", socialLinks: { youtube: "", x: "https://x.com/appsmember", instagram: "" },
      timezone: "America/New_York", onboardingCompletedAt: 1 } as any);
  });
  const read = async (token: string, path: string) => {
    const result = await f.call(token, { tool: "polynet_read", input: { path: `${COMMUNITY}/members/${path}` } });
    return result.body.ok ? JSON.parse(result.body.value.body) : result.body;
  };
  const expected = {
    ref: `user:${f.ids.memberId}`, name: "apps-member", handle: "apps-member", avatar_url: "https://example.com/apps-member.png",
    role: "member", online: false, bio: "Runs at dawn", links: { youtube: null, x: "https://x.com/appsmember", instagram: null },
  };
  expect(await read(owner, "apps-member.json")).toEqual(expected);
  expect(await read(owner, `by-user/${f.ids.memberId}.json`)).toEqual(expected);
  const raw = await f.call(owner, { tool: "polynet_read", input: { path: `${COMMUNITY}/members/apps-member.json` } });
  expect(JSON.stringify(raw.body)).not.toMatch(/America\/New_York|onboarding|timezone/);
  expect(await read(member, "apps-owner.json")).toMatchObject({ role: "owner", handle: "apps-owner" });
  // Not a member here, or no such person: not found, the same way.
  for (const path of ["apps-outsider.json", "nobody-here.json", `by-user/${f.ids.outsiderId}.json`]) {
    expect(await read(member, path)).toMatchObject({ ok: false, code: "semantic_not_found" });
  }
  // The .md view still works.
  expect((await f.call(member, { tool: "polynet_read", input: { path: `${COMMUNITY}/members/apps-owner.md` } })).body).toMatchObject({ ok: true });
  // A member who leaves disappears, and a reader who leaves reads nothing.
  await f.t.run((c) => c.db.patch(f.ids.membershipId, { active: false, revokedAt: Date.now() }));
  expect(await read(owner, "apps-member.json")).toMatchObject({ ok: false, code: "semantic_not_found" });
  expect(await read(member, "apps-owner.json")).toMatchObject({ ok: false });
});

test("a site's private twin: its sessions are private, and only they read the member's communities", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://studio.example.com");
  const f = await fixture();
  const site = "https://apps-community-staging.polynet.page";
  const twin = "https://apps-community--me-staging.polynet.page";
  // A deploy registers both origins; the twin's is private.
  expect(await f.t.mutation(internal.communitySites.recordCommunitySiteDeployInternal, {
    communityId: f.ids.communityId, userId: f.ids.ownerId, hostname: "apps-community-staging.polynet.page",
    sitesDomain: "polynet.page", hostSuffix: "-staging", fileCount: 1, totalBytes: 1,
  })).toEqual({ origin: site, privateOrigin: twin });
  await f.t.run(async (c) => {
    await c.db.insert("communityMemberships", {
      communityId: f.ids.otherCommunityId, userId: f.ids.memberId, role: "admin", accessSource: "free_grant", active: true,
      activationSequence: 1, activatedAt: 1, createdAt: 2, updatedAt: 2,
    });
    // Another community the member has left, and one that's archived: never listed.
    const gone = await c.db.insert("communities", {
      ownerId: f.ids.ownerId, slug: "apps-gone", name: "Gone", visibility: "unlisted", inferenceFundingPolicy: "managed_required",
      entryPolicy: "open", activeMemberCount: 1, lifecycleStatus: "archived", lifecycleGeneration: 1, createdAt: 1, updatedAt: 1,
    } as any);
    await c.db.insert("communityMemberships", {
      communityId: gone, userId: f.ids.memberId, role: "member", accessSource: "free_grant", active: true,
      activationSequence: 1, activatedAt: 1, createdAt: 3, updatedAt: 3,
    });
  });
  const signInAt = async (origin: string) => {
    const issued = await f.handoff("apps-member", { origin });
    expect(issued).toMatchObject({ status: 200, body: { ok: true } });
    const exchanged = await f.exchange(issued.body.code, { origin });
    expect(exchanged).toMatchObject({ status: 200, body: { ok: true } });
    return exchanged.body.token as string;
  };
  const siteToken = await signInAt(site);
  const twinToken = await signInAt(twin);
  expect((await f.sessions()).map((row) => row.kind).sort()).toEqual(["private", "site"]);
  const mine = (token: string, origin: string, body: unknown = { sites_domain: "polynet.page", host_suffix: "-staging" }, secret = EDGE_SECRET) =>
    f.post(COMMUNITY_APP_MY_COMMUNITIES_PATH, { origin, "x-polynet-edge-secret": secret, authorization: `Bearer ${token}` }, body);
  // The site's own session never reads them, whatever its page asks; nor does the twin's session from the site's origin.
  expect(await mine(siteToken, site)).toMatchObject({ status: 403, body: { code: "private_session_required" } });
  expect(await mine(twinToken, site)).toMatchObject({ status: 401 });
  expect(await mine(siteToken, twin)).toMatchObject({ status: 401 });
  expect((await mine(twinToken, twin, {}, "wrong")).status).toBe(401);
  // Oldest membership first, as Studio lists them.
  expect(await mine(twinToken, twin)).toEqual({ status: 200, body: { ok: true, communities: [
    { slug: "apps-other", name: "apps-other", role: "admin", avatar_url: null, site_url: null },
    { slug: "apps-community", name: "apps-community", role: "member", avatar_url: null, site_url: site },
  ] } });
  // The twin's session works for everything the site's does.
  expect((await f.call(twinToken, { tool: "polynet_list", input: { path: `${COMMUNITY}/channels/` } }, twin)).body).toMatchObject({ ok: true });
  // The site's account endpoint still never names the member's other communities, on either origin.
  const account = await f.post(COMMUNITY_APP_ACCOUNT_PATH, { origin: site, "x-polynet-edge-secret": EDGE_SECRET, authorization: `Bearer ${siteToken}` }, {});
  expect(JSON.stringify(account)).not.toContain("apps-other");
  // A twin origin that stops being private stops reading personal data, even with a session minted as private.
  await f.t.run(async (c) => {
    const row = await c.db.query("communityDomains").withIndex("by_origin", (q) => q.eq("origin", twin)).first();
    await c.db.patch(row!._id, { kind: "site" });
  });
  expect(await mine(twinToken, twin)).toMatchObject({ status: 403, body: { code: "private_session_required" } });
});

// A site and its private twin, both registered by a deploy, with a member signed in at each.
async function twinFixture() {
  const f = await fixture();
  const site = "https://apps-community-staging.polynet.page";
  const twin = "https://apps-community--me-staging.polynet.page";
  await f.t.mutation(internal.communitySites.recordCommunitySiteDeployInternal, {
    communityId: f.ids.communityId, userId: f.ids.ownerId, hostname: "apps-community-staging.polynet.page",
    sitesDomain: "polynet.page", hostSuffix: "-staging", fileCount: 1, totalBytes: 1,
  });
  const signInAt = async (origin: string, handle = "apps-member") => {
    const issued = await f.handoff(handle, { origin });
    expect(issued).toMatchObject({ status: 200, body: { ok: true } });
    const exchanged = await f.exchange(issued.body.code, { origin });
    expect(exchanged).toMatchObject({ status: 200, body: { ok: true } });
    return exchanged.body.token as string;
  };
  const me = (path: string, token: string, body: unknown = {}, origin = twin, secret = EDGE_SECRET) =>
    f.post(path, { origin, "x-polynet-edge-secret": secret, authorization: `Bearer ${token}` }, body);
  return { ...f, site, twin, signInAt, me };
}

test("twin settings: every route answers only a private session of a member here", async () => {
  const f = await twinFixture();
  const siteToken = await f.signInAt(f.site);
  const twinToken = await f.signInAt(f.twin);
  const routes: Array<[string, unknown]> = [
    [COMMUNITY_APP_MY_SETTINGS_PATH, {}], [COMMUNITY_APP_MY_HANDLE_PATH, { handle: "sam" }], [COMMUNITY_APP_MY_PROFILE_PATH, { bio: "x" }],
    [COMMUNITY_APP_MY_AVATAR_UPLOAD_PATH, {}], [COMMUNITY_APP_MY_AVATAR_PATH, { storage_id: null }],
    [COMMUNITY_APP_MY_NOTIFICATIONS_PATH, { muted: true }], [COMMUNITY_APP_MY_LEAVE_PATH, {}],
  ];
  for (const [path, body] of routes) {
    // The site's own session, whatever its page's code asks; the twin's session from the site's origin; no edge.
    expect(await f.me(path, siteToken, body, f.site), path).toMatchObject({ status: 403, body: { code: "private_session_required" } });
    expect((await f.me(path, twinToken, body, f.site)).status, path).toBe(401);
    expect((await f.me(path, twinToken, body, f.twin, "wrong")).status, path).toBe(401);
  }
  // Nothing changed.
  const member = await f.t.run((c) => c.db.get(f.ids.memberId));
  expect(member?.handle).toBe("apps-member");
  expect(await f.t.run((c) => c.db.get(f.ids.membershipId))).not.toBeNull();
  expect(await f.t.run((c) => c.db.query("communityMemberSettings").collect())).toEqual([]);
  // A session that outlives its member's membership changes nothing here.
  await f.t.run((c) => c.db.patch(f.ids.membershipId, { active: false, revokedAt: Date.now() }));
  for (const [path, body] of routes) {
    expect(await f.me(path, twinToken, body), path).toMatchObject({ status: 403, body: { code: "not_a_member" } });
  }
});

test("twin settings: the profile through Studio's own validation and write", async () => {
  const f = await twinFixture();
  const token = await f.signInAt(f.twin);
  expect(await f.me(COMMUNITY_APP_MY_SETTINGS_PATH, token)).toEqual({ status: 200, body: { ok: true,
    profile: { display_name: "apps-member", handle: "apps-member", bio: null, avatar_url: "https://example.com/apps-member.png",
      social_links: { youtube: "", x: "", instagram: "" } },
    community: { name: "apps-community", role: "member" },
    notifications: { muted: false, weekly_digest: true },
  } });
  // Handles: Studio's availability check (their own counts as free).
  const handle = async (value: string) => (await f.me(COMMUNITY_APP_MY_HANDLE_PATH, token, { handle: value })).body;
  expect(await handle("apps-owner")).toEqual({ ok: true, available: false, status: "taken", handle: "apps-owner" });
  expect(await handle("@Apps-Member")).toEqual({ ok: true, available: true, status: "available", handle: "apps-member" });
  expect(await handle("ab")).toMatchObject({ available: false, status: "too_short" });
  expect(await handle("admin")).toMatchObject({ available: false, status: "reserved" });
  // Every refusal is Studio's, and nothing is written.
  const save = (body: unknown) => f.me(COMMUNITY_APP_MY_PROFILE_PATH, token, body);
  for (const [body, code] of [
    [{ handle: "apps-owner" }, "profile_handle_taken"], [{ handle: "no spaces" }, "profile_handle_invalid_format"],
    [{ handle: "settings" }, "profile_handle_reserved"], [{ display_name: "x".repeat(121) }, "profile_display_name_too_long"],
    [{ bio: "x".repeat(501) }, "profile_bio_too_long"], [{ social_links: { youtube: "https://vimeo.com/sam" } }, "profile_link_invalid_youtube"],
    [{ social_links: { x: "x.com/" } }, "profile_link_invalid_x"],
  ] as const) {
    expect(await save(body), code).toEqual({ status: 400, body: { ok: false, code } });
  }
  for (const body of [{ display_name: 5 }, { social_links: "x" }, { social_links: { x: 1 } }, []]) {
    expect(await save(body)).toMatchObject({ status: 400, body: { code: "invalid_request" } });
  }
  expect((await f.t.run((c) => c.db.get(f.ids.memberId)))?.handle).toBe("apps-member");
  // A good save, normalized as Studio normalizes it.
  const saved = await save({ display_name: "  Sam Rivera ", handle: "@Sam_R", bio: "Climbs at dawn.", social_links: { youtube: "youtube.com/@samr", x: "twitter.com/samr", instagram: "" } });
  expect(saved).toEqual({ status: 200, body: { ok: true, profile: {
    display_name: "Sam Rivera", handle: "sam_r", bio: "Climbs at dawn.", avatar_url: "https://example.com/apps-member.png",
    social_links: { youtube: "https://youtube.com/@samr", x: "https://x.com/samr", instagram: "" },
  } } });
  expect(await f.t.run((c) => c.db.get(f.ids.memberId))).toMatchObject({ handle: "sam_r", normalizedHandle: "sam_r" });
  // Fields left out stay as they are; null clears.
  expect((await save({ bio: null })).body.profile).toMatchObject({ display_name: "Sam Rivera", bio: null, handle: "sam_r" });
});

test("twin settings: a new photo goes straight to storage and is confirmed; only a fresh image is taken", async () => {
  const f = await twinFixture();
  const token = await f.signInAt(f.twin);
  const issued = await f.me(COMMUNITY_APP_MY_AVATAR_UPLOAD_PATH, token);
  expect(issued.status).toBe(200);
  expect(typeof issued.body.upload_url).toBe("string");
  // As an upload with its Content-Type records it (the test store doesn't).
  const store = (type: string) => f.t.run(async (c) => {
    const id = await c.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type }));
    await (c.db as any).patch(id, { contentType: type });
    return id;
  });
  const photo = await store("image/png");
  const confirmed = await f.me(COMMUNITY_APP_MY_AVATAR_PATH, token, { storage_id: photo });
  expect(confirmed.status).toBe(200);
  const url = await f.t.run((c) => c.storage.getUrl(photo));
  expect(confirmed.body.profile.avatar_url).toBe(url);
  // Studio's framing reset, on the profile row.
  expect(await f.t.run((c) => c.db.query("userProfileDetails").withIndex("by_user", (q) => q.eq("userId", f.ids.memberId)).first()))
    .toMatchObject({ avatarStorageId: photo, avatarFocusX: 0.5, avatarFocusY: 0.5, avatarZoom: 1 });
  // Not an image, or not a storage id: refused, the photo unchanged.
  expect(await f.me(COMMUNITY_APP_MY_AVATAR_PATH, token, { storage_id: await store("text/html") })).toEqual({ status: 400, body: { ok: false, code: "profile_avatar_invalid" } });
  expect((await f.me(COMMUNITY_APP_MY_AVATAR_PATH, token, { storage_id: "../x" })).body).toMatchObject({ code: "invalid_request" });
  expect((await f.me(COMMUNITY_APP_MY_AVATAR_PATH, token, { storage_id: "notastorageid" })).body).toMatchObject({ code: "profile_avatar_invalid" });
  expect((await f.me(COMMUNITY_APP_MY_SETTINGS_PATH, token)).body.profile.avatar_url).toBe(url);
  // Removing it: no photo. The file stays in storage: a profile's photo isn't
  // proven to be the member's own upload, so it's never deleted on replace.
  expect((await f.me(COMMUNITY_APP_MY_AVATAR_PATH, token, { storage_id: null })).body.profile.avatar_url).toBeNull();
  expect(await f.t.run((c) => c.storage.getUrl(photo))).not.toBeNull();
});

test("twin settings: Studio's notification settings, this community's mute and the weekly digest", async () => {
  const f = await twinFixture();
  const token = await f.signInAt(f.twin);
  const set = (body: unknown) => f.me(COMMUNITY_APP_MY_NOTIFICATIONS_PATH, token, body);
  expect(await set({ muted: true })).toEqual({ status: 200, body: { ok: true, notifications: { muted: true } } });
  expect(await set({ weekly_digest: false })).toEqual({ status: 200, body: { ok: true, notifications: { weekly_digest: false } } });
  for (const body of [{}, { muted: "yes" }, { weekly_digest: 1 }]) expect((await set(body)).status).toBe(400);
  expect((await f.me(COMMUNITY_APP_MY_SETTINGS_PATH, token)).body.notifications).toEqual({ muted: true, weekly_digest: false });
  // The same rows Studio reads.
  expect(await f.t.run((c) => c.db.query("communityMemberSettings").collect())).toMatchObject([{ communityId: f.ids.communityId, userId: f.ids.memberId, muted: true }]);
  expect(await f.t.run((c) => c.db.query("emailPreferences").collect())).toMatchObject([{ userId: f.ids.memberId, weeklyDigestEnabled: false }]);
});

test("twin settings: a member leaves through Studio's leave; the owner can't", async () => {
  const f = await twinFixture();
  const ownerToken = await f.signInAt(f.twin, "apps-owner");
  expect((await f.me(COMMUNITY_APP_MY_SETTINGS_PATH, ownerToken)).body.community).toEqual({ name: "apps-community", role: "owner" });
  expect(await f.me(COMMUNITY_APP_MY_LEAVE_PATH, ownerToken)).toEqual({ status: 400, body: { ok: false, code: "community_owner_cannot_leave" } });
  const token = await f.signInAt(f.twin);
  await f.me(COMMUNITY_APP_MY_NOTIFICATIONS_PATH, token, { muted: true });
  expect(await f.me(COMMUNITY_APP_MY_LEAVE_PATH, token)).toEqual({ status: 200, body: { ok: true } });
  // Studio's leave: the membership, its member settings and the member count go with it.
  expect(await f.t.run((c) => c.db.get(f.ids.membershipId))).toBeNull();
  expect(await f.t.run((c) => c.db.query("communityMemberSettings").collect())).toEqual([]);
  expect((await f.t.run((c) => c.db.get(f.ids.communityId)))?.activeMemberCount).toBe(1);
  // Gone from here: nothing more to change, and the communities page no longer lists it.
  expect(await f.me(COMMUNITY_APP_MY_SETTINGS_PATH, token)).toMatchObject({ status: 403, body: { code: "not_a_member" } });
  expect((await f.me(COMMUNITY_APP_MY_COMMUNITIES_PATH, token, { sites_domain: "polynet.page", host_suffix: "-staging" })).body.communities).toEqual([]);
});

test("signing out of the twin ends the site's session in the same browser, and back; nothing else ends", async () => {
  const f = await twinFixture();
  const revoke = (body: unknown) => f.post(COMMUNITY_EDGE_REVOKE_PATH, { "x-polynet-edge-secret": EDGE_SECRET }, body);
  const alive = async (token: string, origin: string) =>
    (await f.call(token, { tool: "polynet_list", input: { path: `${COMMUNITY}/channels/` } }, origin)).status === 200;
  const twinToken = await f.signInAt(f.twin);
  const siteToken = await f.signInAt(f.site);
  const otherDevice = await f.signInAt(f.site);
  const ownerSite = await f.signInAt(f.site, "apps-owner");
  const first = await revoke({ token: twinToken });
  expect(first.status).toBe(200);
  const ticket = first.body.signout_ticket as string;
  expect(ticket).toMatch(/^[0-9]{13}\.[A-Za-z0-9_-]{43}$/);
  expect(await alive(twinToken, f.twin)).toBe(false);
  // The ticket ends only the same member's session: another member's is refused and kept.
  expect(await revoke({ token: ownerSite, ticket })).toEqual({ status: 403, body: { ok: false, code: "signout_ticket_invalid" } });
  expect(await alive(ownerSite, f.site)).toBe(true);
  // A forged or expired ticket ends nothing.
  expect((await revoke({ token: siteToken, ticket: `${Date.now() + 60_000}.${"a".repeat(43)}` })).status).toBe(403);
  const stale = await signCommunityAppSignoutTicket(EDGE_SECRET, String(f.ids.memberId), String(f.ids.communityId), Date.now() - 3 * 60_000);
  expect((await revoke({ token: siteToken, ticket: stale })).status).toBe(403);
  expect((await revoke({ token: siteToken, ticket: "nope" })).status).toBe(400);
  expect(await alive(siteToken, f.site)).toBe(true);
  // The real one ends this browser's site session, and hands back no further ticket.
  expect(await revoke({ token: siteToken, ticket })).toEqual({ status: 200, body: { ok: true } });
  expect(await alive(siteToken, f.site)).toBe(false);
  // The member's other devices stay signed in.
  expect(await alive(otherDevice, f.site)).toBe(true);
});

// Messages on the twin: the member and the owner share apps-community; the
// outsider shares nothing with either until a test lets them in.
async function messagesFixture() {
  const f = await twinFixture();
  const member = await f.signInAt(f.twin);
  const owner = await f.signInAt(f.twin, "apps-owner");
  const send = (token: string, body: Record<string, unknown>) =>
    f.me(COMMUNITY_APP_MY_MESSAGE_SEND_PATH, token, { text: "", ...body });
  const conversation = (token: string, id: string, extra: Record<string, unknown> = {}) =>
    f.me(COMMUNITY_APP_MY_CONVERSATION_PATH, token, { conversation_id: id, ...extra });
  const inbox = async (token: string) => (await f.me(COMMUNITY_APP_MY_MESSAGES_PATH, token)).body;
  const letIn = (handle: "apps-outsider") => f.t.run(async (c) => {
    const user = await c.db.query("users").withIndex("by_authSubject", (q) => q.eq("authSubject", `${handle}-subject`)).first();
    await c.db.insert("communityMemberships", {
      communityId: f.ids.communityId, userId: user!._id, role: "member", accessSource: "free_grant", active: true,
      activationSequence: 2, activatedAt: 1, createdAt: 1, updatedAt: 1,
    });
  });
  return { ...f, member, owner, send, conversation, inbox, letIn };
}

test("twin messages: every route answers only a private session of a member here", async () => {
  const f = await messagesFixture();
  const siteToken = await f.signInAt(f.site);
  const started = await f.send(f.member, { to: "apps-owner", text: "Hi" });
  const id = started.body.conversation_id as string;
  const routes: Array<[string, unknown]> = [
    [COMMUNITY_APP_MY_MESSAGES_PATH, {}], [COMMUNITY_APP_MY_CONVERSATION_PATH, { conversation_id: id }],
    [COMMUNITY_APP_MY_MESSAGE_START_PATH, { handle: "apps-owner" }], [COMMUNITY_APP_MY_MESSAGE_SEND_PATH, { conversation_id: id, text: "x" }],
    [COMMUNITY_APP_MY_MESSAGE_UPLOAD_PATH, { conversation_id: id }], [COMMUNITY_APP_MY_MESSAGE_READ_PATH, { conversation_id: id, through_seq: 1 }],
    [COMMUNITY_APP_MY_MESSAGE_MUTE_PATH, { conversation_id: id, muted: true }], [COMMUNITY_APP_MY_MESSAGE_TYPING_PATH, { conversation_id: id, typing: true }],
    [COMMUNITY_APP_MY_MESSAGE_BLOCK_PATH, { conversation_id: id, blocked: true }],
  ];
  for (const [path, body] of routes) {
    // The site's own session, whatever its page's code asks; the twin's session from the site's origin; no edge.
    expect(await f.me(path, siteToken, body, f.site), path).toMatchObject({ status: 403, body: { code: "private_session_required" } });
    expect((await f.me(path, f.member, body, f.site)).status, path).toBe(401);
    expect((await f.me(path, f.member, body, f.twin, "wrong")).status, path).toBe(401);
  }
  // Nothing changed: one message, nobody muted, blocked or typing.
  expect(await f.t.run((c) => c.db.query("dmMessages").collect())).toHaveLength(1);
  expect(await f.t.run((c) => c.db.query("dmBlocks").collect())).toEqual([]);
  expect(await f.t.run((c) => c.db.query("dmTypingPresence").collect())).toEqual([]);
  expect((await f.t.run((c) => c.db.query("dmParticipants").collect())).every((row) => !row.mutedAt)).toBe(true);
  // A session that outlives its member's membership reads and writes nothing here.
  await f.t.run((c) => c.db.patch(f.ids.membershipId, { active: false, revokedAt: Date.now() }));
  for (const [path, body] of routes) {
    expect(await f.me(path, f.member, body), path).toMatchObject({ status: 403, body: { code: "not_a_member" } });
  }
  // Malformed requests never reach a core.
  for (const [path, body] of [
    [COMMUNITY_APP_MY_CONVERSATION_PATH, { conversation_id: "../x" }], [COMMUNITY_APP_MY_MESSAGE_START_PATH, { handle: "no spaces" }],
    [COMMUNITY_APP_MY_MESSAGE_SEND_PATH, { conversation_id: id, to: "apps-owner", text: "both" }],
    [COMMUNITY_APP_MY_MESSAGE_SEND_PATH, { text: "neither" }], [COMMUNITY_APP_MY_MESSAGE_SEND_PATH, { conversation_id: id, text: 5 }],
    [COMMUNITY_APP_MY_MESSAGE_SEND_PATH, { conversation_id: id, text: "x", attachments: [{ storage_id: "a", name: "", type: "file" }] }],
    [COMMUNITY_APP_MY_MESSAGE_READ_PATH, { conversation_id: id, through_seq: -1 }], [COMMUNITY_APP_MY_MESSAGE_MUTE_PATH, { conversation_id: id, muted: "yes" }],
  ] as const) {
    expect(await f.me(path, f.owner, body), JSON.stringify(body)).toMatchObject({ status: 400, body: { code: "invalid_request" } });
  }
});

test("twin messages: start, send, read and mute through Studio's rules, with no user or storage ids", async () => {
  const f = await messagesFixture();
  // Message @handle: nobody to open yet, so who they are; nothing is created.
  expect(await f.me(COMMUNITY_APP_MY_MESSAGE_START_PATH, f.member, { handle: "@Apps-Owner" })).toEqual({ status: 200, body: {
    ok: true, conversation_id: null, peer: { name: "apps-owner", handle: "apps-owner", avatar_url: "https://example.com/apps-owner.png" },
  } });
  expect(await f.t.run((c) => c.db.query("dmConversations").collect())).toEqual([]);
  // Studio's rules for who may message whom: a shared community; never yourself; someone who exists.
  expect(await f.me(COMMUNITY_APP_MY_MESSAGE_START_PATH, f.member, { handle: "apps-outsider" })).toEqual({ status: 403, body: { ok: false, code: "dm_conversation_access_required" } });
  expect(await f.send(f.member, { to: "apps-outsider", text: "Hi" })).toEqual({ status: 403, body: { ok: false, code: "dm_conversation_access_required" } });
  expect(await f.me(COMMUNITY_APP_MY_MESSAGE_START_PATH, f.member, { handle: "apps-member" })).toEqual({ status: 400, body: { ok: false, code: "dm_target_self" } });
  expect(await f.me(COMMUNITY_APP_MY_MESSAGE_START_PATH, f.member, { handle: "nobody-here" })).toEqual({ status: 404, body: { ok: false, code: "dm_target_not_found" } });
  // The first message creates the conversation, from this community; a retry with its key doesn't send twice.
  const first = await f.send(f.member, { to: "apps-owner", text: "  Climbing Saturday? ", client_message_id: "key-1" });
  expect(first.status).toBe(200);
  const id = first.body.conversation_id as string;
  expect(first.body.message).toMatchObject({ seq: 1, from_me: true, text: "Climbing Saturday?", attachments: [], client_message_id: "key-1" });
  expect((await f.send(f.member, { to: "apps-owner", text: "Climbing Saturday?", client_message_id: "key-1" })).body.message.seq).toBe(1);
  expect((await f.t.run((c) => c.db.get(id as any))) as any).toMatchObject({ createdFromCommunityId: f.ids.communityId });
  expect((await f.me(COMMUNITY_APP_MY_MESSAGE_START_PATH, f.member, { handle: "apps-owner" })).body).toEqual({ ok: true, conversation_id: id, peer: null });
  // The owner's inbox: one unread conversation with the member, newest first.
  const ownerInbox = await f.inbox(f.owner);
  expect(ownerInbox).toEqual({ ok: true, conversations: [{
    id, peer: { name: "apps-member", handle: "apps-member", avatar_url: "https://example.com/apps-member.png" }, community_name: "apps-community",
    unread_count: 1, muted: false, blocked: false, last_seq: 1, read_seq: 0, peer_read_seq: 1,
    last_message: { preview: "Climbing Saturday?", from_me: false, at: expect.any(String) },
  }] });
  // Only names, handles and avatars: never anyone's user id or a storage id.
  expect(JSON.stringify(ownerInbox)).not.toContain("-subject");
  const read = await f.conversation(f.owner, id);
  expect(read.body).toMatchObject({ ok: true, has_more: false, messages: [{ seq: 1, from_me: false, text: "Climbing Saturday?" }] });
  expect(JSON.stringify(read.body)).not.toMatch(/-subject|sender_user_id|storage_id/);
  // A reply, then reading: unread goes to zero; the member sees it was read.
  expect((await f.send(f.owner, { conversation_id: id, text: "Yes! 7am." })).body.message).toMatchObject({ seq: 2, from_me: true });
  expect((await f.me(COMMUNITY_APP_MY_MESSAGE_READ_PATH, f.member, { conversation_id: id, through_seq: 2 })).body.conversation)
    .toMatchObject({ unread_count: 0, read_seq: 2, peer_read_seq: 2 });
  // Studio's read rule: never past what exists, never backwards.
  expect((await f.me(COMMUNITY_APP_MY_MESSAGE_READ_PATH, f.member, { conversation_id: id, through_seq: 99 })).body.conversation.read_seq).toBe(2);
  expect((await f.me(COMMUNITY_APP_MY_MESSAGE_READ_PATH, f.member, { conversation_id: id, through_seq: 1 })).body.conversation.read_seq).toBe(2);
  expect((await f.conversation(f.owner, id)).body.conversation).toMatchObject({ peer_read_seq: 2, last_message: { preview: "You: Yes! 7am.", from_me: true } });
  // Mute is the member's own.
  expect((await f.me(COMMUNITY_APP_MY_MESSAGE_MUTE_PATH, f.member, { conversation_id: id, muted: true })).body.conversation.muted).toBe(true);
  expect((await f.inbox(f.owner)).conversations[0].muted).toBe(false);
  // Older pages: 50 at a time, the newest first.
  for (let index = 0; index < 51; index += 1) await f.t.run(async (c) => {
    const row = await c.db.get(id as any) as any;
    await c.db.insert("dmMessages", { conversationId: id as any, seq: row.lastSeq + 1, senderType: "user", senderUserId: f.ids.ownerId,
      contentJson: { text: `m${index}` }, createdAt: Date.now(), updatedAt: Date.now() });
    await c.db.patch(id as any, { lastSeq: row.lastSeq + 1 });
  });
  const page = (await f.conversation(f.member, id)).body;
  expect([page.messages.length, page.has_more, page.messages[0].seq, page.messages.at(-1).seq]).toEqual([50, true, 4, 53]);
  const older = (await f.conversation(f.member, id, { before_seq: 4 })).body;
  expect([older.messages.map((m: any) => m.seq), older.has_more]).toEqual([[1, 2, 3], false]);
  // Studio's limit, said rather than cut.
  expect(await f.send(f.member, { conversation_id: id, text: "x".repeat(4001) })).toEqual({ status: 400, body: { ok: false, code: "dm_message_too_long" } });
  expect(await f.send(f.member, { conversation_id: id, text: "  " })).toEqual({ status: 400, body: { ok: false, code: "dm_message_payload_required" } });
});

test("twin messages: another member's conversation reads as no conversation at all", async () => {
  const f = await messagesFixture();
  const id = (await f.send(f.member, { to: "apps-owner", text: "Just us" })).body.conversation_id as string;
  await f.letIn("apps-outsider");
  const outsider = await f.signInAt(f.twin, "apps-outsider");
  expect((await f.inbox(outsider)).conversations).toEqual([]);
  for (const [path, body] of [
    [COMMUNITY_APP_MY_CONVERSATION_PATH, { conversation_id: id }], [COMMUNITY_APP_MY_MESSAGE_SEND_PATH, { conversation_id: id, text: "hi" }],
    [COMMUNITY_APP_MY_MESSAGE_UPLOAD_PATH, { conversation_id: id }], [COMMUNITY_APP_MY_MESSAGE_READ_PATH, { conversation_id: id, through_seq: 1 }],
    [COMMUNITY_APP_MY_MESSAGE_MUTE_PATH, { conversation_id: id, muted: true }], [COMMUNITY_APP_MY_MESSAGE_TYPING_PATH, { conversation_id: id, typing: true }],
    [COMMUNITY_APP_MY_MESSAGE_BLOCK_PATH, { conversation_id: id, blocked: true }],
  ] as const) {
    expect(await f.me(path, outsider, body), path).toEqual({ status: 404, body: { ok: false, code: "dm_conversation_not_found" } });
  }
  // An id of another kind, or none at all, the same.
  expect(await f.conversation(outsider, String(f.ids.communityId))).toEqual({ status: 404, body: { ok: false, code: "dm_conversation_not_found" } });
  expect(await f.t.run((c) => c.db.query("dmMessages").collect())).toHaveLength(1);
  expect(await f.t.run((c) => c.db.query("dmBlocks").collect())).toEqual([]);
});

test("twin messages: blocks and rate limits are Studio's", async () => {
  const f = await messagesFixture();
  const id = (await f.send(f.member, { to: "apps-owner", text: "Hi" })).body.conversation_id as string;
  // The member blocks the owner: neither can message the other; the owner isn't told it's a block.
  expect((await f.me(COMMUNITY_APP_MY_MESSAGE_BLOCK_PATH, f.member, { conversation_id: id, blocked: true })).body.conversation.blocked).toBe(true);
  expect((await f.inbox(f.owner)).conversations[0].blocked).toBe(false);
  expect(await f.send(f.owner, { conversation_id: id, text: "?" })).toEqual({ status: 403, body: { ok: false, code: "dm_conversation_access_required" } });
  expect(await f.send(f.member, { conversation_id: id, text: "?" })).toEqual({ status: 403, body: { ok: false, code: "dm_conversation_access_required" } });
  expect((await f.me(COMMUNITY_APP_MY_MESSAGE_TYPING_PATH, f.owner, { conversation_id: id, typing: true })).status).toBe(403);
  // History stays readable; unblocking lets both write again.
  expect((await f.conversation(f.owner, id)).body.messages).toHaveLength(1);
  expect((await f.me(COMMUNITY_APP_MY_MESSAGE_BLOCK_PATH, f.member, { conversation_id: id, blocked: false })).body.conversation.blocked).toBe(false);
  expect((await f.send(f.owner, { conversation_id: id, text: "Back" })).status).toBe(200);
  // Studio's rate limit: 25 messages a minute.
  for (let index = 0; index < 24; index += 1) expect((await f.send(f.member, { conversation_id: id, text: `n${index}` })).status).toBe(200);
  expect(await f.send(f.member, { conversation_id: id, text: "one too many" })).toEqual({ status: 429, body: { ok: false, code: "dm_rate_limited" } });
});

test("twin messages: attachments go straight to storage; only a fresh upload is sent, as storage recorded it", async () => {
  const f = await messagesFixture();
  const id = (await f.send(f.member, { to: "apps-owner", text: "Hi" })).body.conversation_id as string;
  const issued = await f.me(COMMUNITY_APP_MY_MESSAGE_UPLOAD_PATH, f.member, { conversation_id: id });
  expect([issued.status, typeof issued.body.upload_url]).toEqual([200, "string"]);
  // Before the first message too, by handle, under the same rule as sending.
  expect((await f.me(COMMUNITY_APP_MY_MESSAGE_UPLOAD_PATH, f.member, { to: "apps-outsider" })).status).toBe(403);
  const store = (type: string) => f.t.run(async (c) => {
    const storageId = await c.storage.store(new Blob([new Uint8Array([1, 2, 3, 4])], { type }));
    await (c.db as any).patch(storageId, { contentType: type });
    return storageId;
  });
  const photo = await store("image/png");
  const sent = await f.send(f.member, { conversation_id: id, text: "", attachments: [{ storage_id: photo, name: "wall.png", type: "image" }] });
  expect(sent.status).toBe(200);
  const url = await f.t.run((c) => c.storage.getUrl(photo));
  expect(sent.body.message.attachments).toEqual([{ id: expect.any(String), name: "wall.png", kind: "image", mime: "image/png", size: 4, url }]);
  expect((await f.inbox(f.owner)).conversations[0].last_message.preview).toBe("Sent an image");
  // Studio's type rules on what storage recorded; not a storage id; an old file.
  expect(await f.send(f.member, { conversation_id: id, attachments: [{ storage_id: await store("text/html"), name: "x.png", type: "image" }] }))
    .toEqual({ status: 400, body: { ok: false, code: "dm_attachment_type_not_supported" } });
  expect(await f.send(f.member, { conversation_id: id, attachments: [{ storage_id: "notastorageid", name: "x.png", type: "image" }] }))
    .toEqual({ status: 400, body: { ok: false, code: "dm_attachment_invalid" } });
  const old = await store("image/png");
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2 * 60 * 60 * 1000);
  expect(await f.send(f.member, { conversation_id: id, attachments: [{ storage_id: old, name: "old.png", type: "image" }] }))
    .toEqual({ status: 400, body: { ok: false, code: "dm_attachment_invalid" } });
});

test("twin pages follow Studio's access: a lapsed paid membership or a community that can't run gets nothing", async () => {
  const f = await messagesFixture();
  const watch = async (token: string) => f.t.query(api.communityLive.watchMessages, { token: await deriveCommunityAppWatchToken(token) });
  const shut = async (token: string) => {
    expect(await f.me(COMMUNITY_APP_MY_SETTINGS_PATH, token)).toMatchObject({ status: 403, body: { code: "not_a_member" } });
    expect(await f.me(COMMUNITY_APP_MY_MESSAGES_PATH, token)).toMatchObject({ status: 403, body: { code: "not_a_member" } });
    expect(await watch(token)).toEqual({ ok: false, code: "watch_unavailable" });
  };
  const open = async (token: string) => {
    expect((await f.me(COMMUNITY_APP_MY_SETTINGS_PATH, token)).status).toBe(200);
    expect((await f.me(COMMUNITY_APP_MY_MESSAGES_PATH, token)).status).toBe(200);
    expect(await watch(token)).toMatchObject({ ok: true });
  };
  await open(f.member);
  // Paid to join, and the member's paid access has lapsed (no live subscription): the row is still active.
  await f.t.run(async (c) => {
    await c.db.patch(f.ids.communityId, { entryPolicy: "paid_subscription" } as any);
    await c.db.patch(f.ids.membershipId, { accessSource: "paid_subscription" });
  });
  await shut(f.member);
  await open(f.owner);
  await f.t.run((c) => c.db.patch(f.ids.membershipId, { accessSource: "free_grant" }));
  await open(f.member);
  // The community can't run (its builder plan is required and missing): nobody's twin pages work.
  await f.t.run((c) => c.db.patch(f.ids.communityId, { builderAccessMode: COMMUNITY_BUILDER_ACCESS_SUBSCRIPTION_REQUIRED } as any));
  await shut(f.member);
  await shut(f.owner);
});

test("twin messages live: only a private session's watch token, versions and typing only", async () => {
  const f = await messagesFixture();
  const siteToken = await f.signInAt(f.site);
  const watch = async (token: string, conversation?: string) =>
    f.t.query(api.communityLive.watchMessages, { token: await deriveCommunityAppWatchToken(token), ...(conversation ? { conversation } : {}) });
  // The site's own session (whose watch token the site's code holds) gets nothing.
  expect(await watch(siteToken)).toEqual({ ok: false, code: "private_session_required" });
  expect(await f.t.query(api.communityLive.watchMessages, { token: "pnw_nope" })).toEqual({ ok: false, code: "session_invalid" });
  const empty = await watch(f.member);
  expect(empty).toMatchObject({ ok: true, typing: null });
  const id = (await f.send(f.owner, { to: "apps-member", text: "Secret plans" })).body.conversation_id as string;
  // A new message moves the member's inbox version; the conversation has its own.
  const inbox = await watch(f.member);
  expect(inbox.ok && inbox.version).not.toBe(empty.ok && empty.version);
  const before = await watch(f.member, id);
  expect(before).toMatchObject({ ok: true, typing: null });
  // The owner types: the member sees that someone is, never who (the page knows who it's talking to).
  await f.me(COMMUNITY_APP_MY_MESSAGE_TYPING_PATH, f.owner, { conversation_id: id, typing: true });
  const typing = await watch(f.member, id);
  expect(typing).toMatchObject({ ok: true, typing: { lease_until: expect.any(Number), expires_in_ms: expect.any(Number) } });
  // ...and not their own.
  expect((await watch(f.owner, id) as any).typing).toBeNull();
  // Reading moves the other side's version too ("Seen").
  const ownerBefore = await watch(f.owner, id);
  await f.me(COMMUNITY_APP_MY_MESSAGE_READ_PATH, f.member, { conversation_id: id, through_seq: 1 });
  expect((await watch(f.owner, id) as any).version).not.toBe((ownerBefore as any).version);
  // Never content, names or ids.
  expect(JSON.stringify([inbox, typing])).not.toMatch(/Secret|apps-owner|-subject/);
  // Someone else's conversation, or a non-id: nothing.
  await f.letIn("apps-outsider");
  const outsider = await f.signInAt(f.twin, "apps-outsider");
  expect(await watch(outsider, id)).toEqual({ ok: false, code: "watch_unavailable" });
  expect(await watch(f.member, "nope")).toEqual({ ok: false, code: "watch_unavailable" });
  // Leaving the community ends the watch live.
  await f.t.run((c) => c.db.patch(f.ids.membershipId, { active: false, revokedAt: Date.now() }));
  expect(await watch(f.member)).toEqual({ ok: false, code: "watch_unavailable" });
  // A twin origin that stops being private stops answering too.
  await f.t.run(async (c) => {
    const row = await c.db.query("communityDomains").withIndex("by_origin", (q) => q.eq("origin", f.twin)).first();
    await c.db.patch(row!._id, { kind: "site" });
  });
  expect(await watch(f.owner)).toEqual({ ok: false, code: "private_session_required" });
});

// Join on the twin: the community's own join page, deciding exactly as Studio's funnel does.
async function joinFixture() {
  const f = await twinFixture();
  const read = (token: string | null = null, origin = f.twin, secret = EDGE_SECRET) =>
    f.post(COMMUNITY_APP_MY_JOIN_PATH, { origin, "x-polynet-edge-secret": secret, ...(token ? { authorization: `Bearer ${token}` } : {}) }, {});
  const policy = (entryPolicy: string) => f.t.run((c) => c.db.patch(f.ids.communityId, { entryPolicy } as any));
  const membership = (userId = f.ids.outsiderId) => f.t.run((c) => c.db.query("communityMemberships")
    .withIndex("by_community_user", (q) => q.eq("communityId", f.ids.communityId).eq("userId", userId)).first());
  const studioJoin = () => f.t.withIdentity({ subject: "apps-outsider-subject" })
    .mutation(api.communityPublic.joinPublicCommunityBySlug, { communitySlug: "apps-community" });
  return { ...f, read, policy, membership, studioJoin };
}

test("twin join: anyone reads the pitch and the gate signed out, decided exactly as Studio's funnel decides it", async () => {
  const f = await joinFixture();
  await f.t.run((c) => c.db.patch(f.ids.communityId, { name: "Apps Club", oneLiner: "We build.", about: "About us." } as any));
  expect(await f.read()).toEqual({ status: 200, body: { ok: true, signed_in: false,
    community: { slug: "apps-community", name: "Apps Club", one_liner: "We build.", about: "About us.", member_count: 2, avatar_url: null },
    gate: "join", available: true, action_label: "Join free", plans: [], viewer: null } });
  for (const entryPolicy of ["open", "approval", "paid_subscription"]) {
    await f.policy(entryPolicy);
    const funnel = await f.t.query(api.communityPublic.resolvePublicFunnelBySlug, { communitySlug: "apps-community" }) as any;
    expect((await f.read()).body.gate, entryPolicy).toBe(deriveCommunityFunnelAction({ entry_policy: funnel.community.entry_policy }));
  }
  // Only the twin's origin, only through the edge.
  expect(await f.read(null, f.site)).toMatchObject({ status: 404, body: { code: "community_unavailable" } });
  expect((await f.read(null, f.twin, "wrong")).status).toBe(401);
});

test("twin join: someone who isn't a member signs in on the twin only, joins an open community through Studio's join, and is in", async () => {
  const f = await joinFixture();
  // The site still refuses them; its twin signs them in, for Join.
  expect(await f.handoff("apps-outsider", { origin: f.site })).toMatchObject({ status: 403, body: { code: "not_a_member" } });
  const token = await f.signInAt(f.twin, "apps-outsider");
  // That session reads nothing of the community and none of the member pages; it isn't ended for it.
  expect((await f.call(token, { tool: "polynet_list", input: { path: `${COMMUNITY}/channels/` } }, f.twin)).body).toMatchObject({ ok: false });
  expect(await f.me(COMMUNITY_APP_MY_SETTINGS_PATH, token)).toMatchObject({ status: 403, body: { code: "not_a_member" } });
  expect(await f.me(COMMUNITY_APP_MY_MESSAGES_PATH, token)).toMatchObject({ status: 403, body: { code: "not_a_member" } });
  expect(await f.me(COMMUNITY_APP_ACCOUNT_PATH, token)).toMatchObject({ status: 403, body: { code: "not_a_member" } });
  expect((await f.read(token)).body).toMatchObject({ signed_in: true, gate: "join",
    viewer: { state: "visitor", can_request_again: false, reapply_at: null, setup_required: false } });
  // A site's own session (which the site's code holds) never acts here.
  const siteToken = await f.signInAt(f.site);
  for (const path of [COMMUNITY_APP_MY_JOIN_REQUEST_PATH, COMMUNITY_APP_MY_JOIN_CANCEL_PATH, COMMUNITY_APP_MY_JOIN_CHECKOUT_PATH, COMMUNITY_APP_MY_JOIN_FINISH_PATH]) {
    expect(await f.me(path, siteToken, {}, f.site), path).toMatchObject({ status: 403, body: { code: "private_session_required" } });
    expect((await f.me(path, token, {}, f.twin, "wrong")).status, path).toBe(401);
  }
  expect(await f.read(siteToken, f.site)).toMatchObject({ status: 403, body: { code: "private_session_required" } });
  const joined = await f.me(COMMUNITY_APP_MY_JOIN_REQUEST_PATH, token);
  expect(joined).toMatchObject({ status: 200, body: { ok: true, outcome: "joined", viewer: { state: "member" }, action_label: "Enter community" } });
  expect(await f.membership()).toMatchObject({ active: true, role: "member", accessSource: "free_grant" });
  // Joining twice is still one membership; and now the site signs them in.
  expect((await f.me(COMMUNITY_APP_MY_JOIN_REQUEST_PATH, token)).body.outcome).toBe("joined");
  expect(await f.handoff("apps-outsider", { origin: f.site })).toMatchObject({ status: 200, body: { ok: true } });
});

test("twin join: approval asks, waits, can be withdrawn, and a denial waits out its cooldown, exactly as Studio's join decides", async () => {
  const f = await joinFixture();
  await f.policy("approval");
  const token = await f.signInAt(f.twin, "apps-outsider");
  const asked = await f.me(COMMUNITY_APP_MY_JOIN_REQUEST_PATH, token);
  expect(asked).toMatchObject({ status: 200, body: { outcome: "approval_pending", viewer: { state: "pending" }, action_label: "Request pending" } });
  // Studio's own join says the same for the same person.
  expect((await f.studioJoin()).outcome).toBe("approval_pending");
  expect(await f.membership()).toBeNull();
  const withdrawn = await f.me(COMMUNITY_APP_MY_JOIN_CANCEL_PATH, token);
  expect(withdrawn).toMatchObject({ status: 200, body: { viewer: { state: "visitor" } } });
  expect(await f.t.run((c) => c.db.query("communityJoinRequests").collect())).toEqual([]);
  // Denied, with a week to wait: the page says until when, and asking again changes nothing.
  await f.me(COMMUNITY_APP_MY_JOIN_REQUEST_PATH, token);
  const reapplyAt = Date.now() + 86_400_000;
  await f.t.run(async (c) => {
    const row = (await c.db.query("communityJoinRequests").collect())[0];
    await c.db.patch(row._id, { status: "denied", deniedAt: Date.now(), reapplyAt });
  });
  expect((await f.read(token)).body.viewer).toEqual({ state: "denied", can_request_again: false, reapply_at: new Date(reapplyAt).toISOString(), setup_required: false });
  expect((await f.me(COMMUNITY_APP_MY_JOIN_REQUEST_PATH, token)).body).toMatchObject({ outcome: "approval_denied", viewer: { state: "denied" }, action_label: "Request denied" });
  expect((await f.studioJoin()).outcome).toBe("approval_denied");
  // Once it's over, they may ask again.
  await f.t.run(async (c) => {
    const row = (await c.db.query("communityJoinRequests").collect())[0];
    await c.db.patch(row._id, { deniedAt: Date.now() - 2 * 86_400_000, reapplyAt: Date.now() - 1 });
  });
  expect((await f.read(token)).body).toMatchObject({ viewer: { state: "denied", can_request_again: true }, action_label: "Request again" });
  expect((await f.me(COMMUNITY_APP_MY_JOIN_REQUEST_PATH, token)).body).toMatchObject({ outcome: "approval_pending", viewer: { state: "pending" } });
});

test("twin join: someone the community has blocked can't join, in Studio's words", async () => {
  const f = await joinFixture();
  const token = await f.signInAt(f.twin, "apps-outsider");
  await f.t.run((c) => c.db.insert("communityBlocks", {
    communityId: f.ids.communityId, userId: f.ids.outsiderId, createdByUserId: f.ids.ownerId, createdAt: Date.now(), updatedAt: Date.now(),
  }));
  expect((await f.read(token)).body.viewer).toMatchObject({ state: "blocked" });
  expect(await f.me(COMMUNITY_APP_MY_JOIN_REQUEST_PATH, token)).toEqual({ status: 403, body: { ok: false, code: "community_user_blocked" } });
  expect(await f.membership()).toBeNull();
});

test("twin join: a paid plan goes to Studio's checkout, back only to this twin's /join; the return grants nothing until Stripe's verified notice does", async () => {
  stripe.checkouts.length = 0;
  const f = await joinFixture();
  const nowMs = Date.now();
  await f.policy("paid_subscription");
  await f.t.run(async (c) => {
    await c.db.insert("communityPricePoints", {
      communityId: f.ids.communityId, billingPeriod: "monthly", name: "Monthly", amountBaseUnits: 1000, currency: "usd", currencyDecimals: 2,
      isCurrent: true, providerAccountId: "acct_test_owner", providerPriceId: "price_test_monthly", createdAt: nowMs, updatedAt: nowMs,
    });
    await c.db.insert("userStripeConnectAccounts", {
      userId: f.ids.ownerId, stripeAccountId: "acct_test_owner", accountType: "express", transfersEnabled: true, status: "ready",
      detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, requirementsCurrentlyDue: [], requirementsEventuallyDue: [], createdAt: nowMs, updatedAt: nowMs,
    });
  });
  const token = await f.signInAt(f.twin, "apps-outsider");
  const price = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(10);
  expect((await f.read(token)).body).toMatchObject({ gate: "checkout", action_label: `Join ${price}/month`,
    plans: [{ billing_period: "monthly", name: "Monthly", label: `Join ${price}/month` }], viewer: { state: "visitor" } });
  // Joining for free isn't a way around it: Studio's join says a plan is required.
  expect((await f.me(COMMUNITY_APP_MY_JOIN_REQUEST_PATH, token)).body.outcome).toBe("paid_plan_required");
  expect((await f.me(COMMUNITY_APP_MY_JOIN_CHECKOUT_PATH, token, { billing_period: "weekly" })).status).toBe(400);
  const started = await f.me(COMMUNITY_APP_MY_JOIN_CHECKOUT_PATH, token, { billing_period: "monthly" });
  expect(started).toMatchObject({ status: 200, body: { ok: true, checkout_url: "https://checkout.stripe.com/c/pay/cs_test_1" } });
  const sessionId = started.body.session_id as string;
  expect(sessionId).toMatch(/^chk_[a-f0-9]{32}$/);
  // Studio's checkout, on the founder's Stripe account, returning only to this twin's own /join.
  expect(stripe.checkouts).toHaveLength(1);
  expect(stripe.checkouts[0].params).toMatchObject({
    mode: "subscription", success_url: `${f.twin}/join?checkout=${sessionId}`, cancel_url: `${f.twin}/join?checkout=canceled`,
    line_items: [{ price: "price_test_monthly", quantity: 1 }], client_reference_id: sessionId,
  });
  expect(stripe.checkouts[0].options).toMatchObject({ stripeAccount: "acct_test_owner" });
  // Back from Stripe before Stripe's notice: still not a member, however often it's asked.
  const finish = (body: unknown, as = token) => f.me(COMMUNITY_APP_MY_JOIN_FINISH_PATH, as, body);
  for (let i = 0; i < 2; i += 1) expect((await finish({ session_id: sessionId })).body).toMatchObject({ status: "pending", viewer: { state: "visitor" } });
  expect(await f.membership()).toBeNull();
  expect((await finish({ session_id: "chk_../x" })).status).toBe(400);
  // Someone else's checkout reads as none at all.
  const memberTwin = await f.signInAt(f.twin);
  expect((await finish({ session_id: sessionId }, memberTwin)).body).toMatchObject({ status: "not_found" });
  // Stripe's verified notice (the webhook) completes it; then the return makes them a member, once.
  await f.t.mutation(internal.communityCommerce.syncPendingCommunityCheckoutSubscriptionInternal, {
    sessionId, providerAccountId: "acct_test_owner", providerCheckoutSessionId: "cs_test_1", providerCustomerId: "cus_test_join",
    providerSubscriptionId: "sub_test_1", providerPriceId: "price_test_monthly", subscriptionStatus: "active",
    currentPeriodStartAt: nowMs, currentPeriodEndAt: nowMs + 30 * 86_400_000, markComplete: true,
  });
  expect((await finish({ session_id: sessionId })).body).toMatchObject({ status: "joined", viewer: { state: "member" } });
  expect((await finish({ session_id: sessionId })).body).toMatchObject({ status: "joined", viewer: { state: "member" } });
  expect(await f.membership()).toMatchObject({ active: true });
  expect(await f.t.run((c) => c.db.query("communityMemberships").withIndex("by_community_user", (q) => q.eq("communityId", f.ids.communityId).eq("userId", f.ids.outsiderId)).collect())).toHaveLength(1);
  // A member doesn't start another checkout.
  expect(await f.me(COMMUNITY_APP_MY_JOIN_CHECKOUT_PATH, token, { billing_period: "monthly" })).toMatchObject({ status: 409, body: { code: "already_member" } });
  expect(stripe.checkouts).toHaveLength(1);
});

test("twin join: in an open community, someone a manager removed asks to come back and waits, as Studio's join decides", async () => {
  const f = await joinFixture();
  await f.policy("open");
  await f.t.run((c) => c.db.insert("communityMemberships", {
    communityId: f.ids.communityId, userId: f.ids.outsiderId, role: "member", accessSource: "free_grant", active: false,
    activationSequence: 1, activatedAt: 1, revokedAt: Date.now(), revokedReason: "removed_by_manager", createdAt: 1, updatedAt: 1,
  }));
  const token = await f.signInAt(f.twin, "apps-outsider");
  const asked = await f.me(COMMUNITY_APP_MY_JOIN_REQUEST_PATH, token);
  expect(asked).toMatchObject({ status: 200, body: { outcome: "approval_pending", viewer: { state: "pending" } } });
  expect((await f.read(token)).body.viewer).toMatchObject({ state: "pending" });
  expect((await f.membership())?.active).toBe(false);
});

test("twin join: a community that went from approval to paid shows its checkout, whatever was asked before", async () => {
  stripe.checkouts.length = 0;
  const f = await joinFixture();
  const nowMs = Date.now();
  await f.policy("approval");
  const token = await f.signInAt(f.twin, "apps-outsider");
  expect((await f.me(COMMUNITY_APP_MY_JOIN_REQUEST_PATH, token)).body).toMatchObject({ viewer: { state: "pending" } });
  await f.policy("paid_subscription");
  await f.t.run(async (c) => {
    await c.db.insert("communityPricePoints", {
      communityId: f.ids.communityId, billingPeriod: "monthly", name: "Monthly", amountBaseUnits: 1000, currency: "usd", currencyDecimals: 2,
      isCurrent: true, providerAccountId: "acct_test_owner", providerPriceId: "price_test_monthly", createdAt: nowMs, updatedAt: nowMs,
    });
    await c.db.insert("userStripeConnectAccounts", {
      userId: f.ids.ownerId, stripeAccountId: "acct_test_owner", accountType: "express", transfersEnabled: true, status: "ready",
      detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, requirementsCurrentlyDue: [], requirementsEventuallyDue: [], createdAt: nowMs, updatedAt: nowMs,
    });
  });
  // The old pending request doesn't hide the plan.
  expect((await f.read(token)).body).toMatchObject({ gate: "checkout", viewer: { state: "visitor" } });
  // Nor does an old denial with a cooldown.
  await f.t.run(async (c) => {
    const row = (await c.db.query("communityJoinRequests").collect())[0];
    await c.db.patch(row._id, { status: "denied", deniedAt: Date.now(), reapplyAt: Date.now() + 86_400_000 });
  });
  expect((await f.read(token)).body).toMatchObject({ gate: "checkout", viewer: { state: "visitor" } });
  expect(await f.me(COMMUNITY_APP_MY_JOIN_CHECKOUT_PATH, token, { billing_period: "monthly" })).toMatchObject({ status: 200, body: { ok: true } });
});

test("twin join: checkout returns only to this community's own twin", async () => {
  const f = await joinFixture();
  expect(twinCheckoutReturnUrls(f.twin)).toEqual({ successUrl: `${f.twin}/join?checkout={CHECKOUT_SESSION_ID}`, cancelUrl: `${f.twin}/join?checkout=canceled` });
  for (const origin of [`${f.twin}/x`, "http://apps-community--me-staging.polynet.page", "https://u:p@x.example.com", "javascript:alert(1)"]) {
    expect(twinCheckoutReturnUrls(origin), origin).toBeNull();
  }
  const own = (communityId: any, origin: string) => f.t.query(internal.communityAppJoin.isCommunityPrivateOriginInternal, { communityId, origin });
  expect(await own(f.ids.communityId, f.twin)).toBe(true);
  expect(await own(f.ids.communityId, f.site)).toBe(false);
  expect(await own(f.ids.otherCommunityId, f.twin)).toBe(false);
});

// Moderation on the twin: a moderator removes a post and reviews join requests
// with Studio's cores; a member, a site's own session and another community's
// post get nothing.
test("twin moderation: a moderator removes a post of this community; a member and a site session can't", async () => {
  const f = await twinFixture();
  const siteToken = await f.signInAt(f.site);
  const posted = await f.call(siteToken, { tool: "polynet_write", input: { path: `${COMMUNITY}/channels/general/`, mode: "create", content: { text: "Selling my old rope, DM me" }, idempotency_key: "mod-1" } }, f.site);
  const rootId = String(posted.body.value.result.interaction.root_id);
  const ref = `interaction:root:${rootId}`;
  // Removing someone else's post: the owner can, as a moderator here.
  const ownerTwin = await f.signInAt(f.twin, "apps-owner");
  const memberTwin = await f.signInAt(f.twin);
  // A member who isn't a moderator: refused, and the post isn't described.
  await f.t.run(async (c) => {
    const other = await c.db.insert("users", { authSubject: "apps-mod-subject", displayName: "apps-mod", handle: "apps-mod", normalizedHandle: "apps-mod", createdAt: 1, updatedAt: 1 });
    for (const document of PLATFORM_LEGAL_DOCUMENTS) {
      await c.db.insert("legalAcceptances", { userId: other, documentKey: document.key, documentVersion: document.version, acceptedAt: 1, source: "test", createdAt: 1 });
    }
    await c.db.insert("authSessions", { sessionId: "sess-apps-mod", authSubject: "apps-mod-subject", userId: other, encryptedSecretHex: "x", secretIvHex: "x", secretVersion: 1,
      idleExpiresAt: Date.now() + 86_400_000, absoluteExpiresAt: Date.now() + 86_400_000, createdAt: 1, updatedAt: 1 } as any);
    await c.db.insert("communityMemberships", { communityId: f.ids.communityId, userId: other, role: "member", accessSource: "free_grant", active: true, activationSequence: 1, activatedAt: 1, createdAt: 1, updatedAt: 1 });
  });
  const modTwin = await f.signInAt(f.twin, "apps-mod");
  expect(await f.me(COMMUNITY_APP_MY_MODERATION_POST_PATH, modTwin, { ref })).toMatchObject({ status: 403, body: { code: "not_a_moderator" } });
  expect(await f.me(COMMUNITY_APP_MY_MODERATION_REMOVE_PATH, modTwin, { ref })).toMatchObject({ status: 403, body: { code: "not_a_moderator" } });
  // The site's own session never reaches moderation, even the owner's.
  const ownerSite = await f.signInAt(f.site, "apps-owner");
  expect(await f.me(COMMUNITY_APP_MY_MODERATION_REMOVE_PATH, ownerSite, { ref }, f.site)).toMatchObject({ status: 403, body: { code: "private_session_required" } });
  // Made a moderator: the post as it will go, then gone, recorded as theirs.
  await f.t.run(async (c) => {
    const user = await c.db.query("users").withIndex("by_authSubject", (q) => q.eq("authSubject", "apps-mod-subject")).first();
    const row = await c.db.query("communityMemberships").withIndex("by_community_user", (q) => q.eq("communityId", f.ids.communityId).eq("userId", user!._id)).first();
    await c.db.patch(row!._id, { role: "moderator" });
  });
  expect(await f.me(COMMUNITY_APP_MY_MODERATION_POST_PATH, modTwin, { ref })).toMatchObject({ status: 200, body: { ok: true, post: { ref, author: "apps-member", text: "Selling my old rope, DM me", mine: false } } });
  expect(await f.me(COMMUNITY_APP_MY_MODERATION_REMOVE_PATH, modTwin, { ref })).toEqual({ status: 200, body: { ok: true } });
  const root = await f.t.run((c) => c.db.get(c.db.normalizeId("communityInteractionRoots", rootId)!));
  expect(root?.status).toBe("deleted");
  const events = await f.t.run((c) => c.db.query("communityInteractionModerationEvents").collect());
  const moderator = await f.t.run((c) => c.db.query("users").withIndex("by_authSubject", (q) => q.eq("authSubject", "apps-mod-subject")).first());
  expect(events).toEqual([expect.objectContaining({ eventType: "tombstone", actorUserId: moderator!._id, nextStatus: "deleted" })]);
  // Gone: nothing more to describe or remove.
  expect(await f.me(COMMUNITY_APP_MY_MODERATION_POST_PATH, modTwin, { ref })).toMatchObject({ status: 404, body: { code: "post_not_found" } });
  // Another community's post, or a malformed ref: nothing at all.
  const foreign = await f.t.run(async (c) => {
    const id = await c.db.insert("communityInteractionRoots", { ...(root as any), _id: undefined, _creationTime: undefined, communityId: f.ids.otherCommunityId, status: "live", idempotencyKey: "foreign" } as any);
    return `interaction:root:${id}`;
  });
  expect(await f.me(COMMUNITY_APP_MY_MODERATION_REMOVE_PATH, modTwin, { ref: foreign })).toMatchObject({ status: 404, body: { code: "post_not_found" } });
  expect(await f.me(COMMUNITY_APP_MY_MODERATION_REMOVE_PATH, modTwin, { ref: "interaction:root:../x" })).toMatchObject({ status: 400 });
  void ownerTwin; void memberTwin;
});

test("twin join review: a moderator lists, approves and denies this community's requests; a member can't; a paid community has none to approve", async () => {
  const f = await twinFixture();
  await f.t.run((c) => c.db.patch(f.ids.communityId, { entryPolicy: "approval" } as any));
  const outsider = await f.signInAt(f.twin, "apps-outsider");
  expect((await f.me(COMMUNITY_APP_MY_JOIN_REQUEST_PATH, outsider)).body).toMatchObject({ outcome: "approval_pending" });
  const member = await f.signInAt(f.twin);
  expect(await f.me(COMMUNITY_APP_MY_REQUESTS_PATH, member)).toMatchObject({ status: 403, body: { code: "not_a_moderator" } });
  const owner = await f.signInAt(f.twin, "apps-owner");
  const listed = await f.me(COMMUNITY_APP_MY_REQUESTS_PATH, owner);
  expect(listed).toMatchObject({ status: 200, body: { ok: true, paid: false, requests: [{ name: "apps-outsider", handle: "apps-outsider" }] } });
  const requestId = listed.body.requests[0].id as string;
  // A member can't decide it; the site's own session can't either.
  expect(await f.me(COMMUNITY_APP_MY_REQUEST_APPROVE_PATH, member, { request_id: requestId })).toMatchObject({ status: 403 });
  const ownerSite = await f.signInAt(f.site, "apps-owner");
  expect(await f.me(COMMUNITY_APP_MY_REQUEST_APPROVE_PATH, ownerSite, { request_id: requestId }, f.site)).toMatchObject({ status: 403, body: { code: "private_session_required" } });
  // Approved: they're in, and the request is gone from the list.
  expect(await f.me(COMMUNITY_APP_MY_REQUEST_APPROVE_PATH, owner, { request_id: requestId })).toEqual({ status: 200, body: { ok: true } });
  const membership = await f.t.run((c) => c.db.query("communityMemberships").withIndex("by_community_user", (q) => q.eq("communityId", f.ids.communityId).eq("userId", f.ids.outsiderId)).first());
  expect(membership).toMatchObject({ active: true, role: "member" });
  expect((await f.me(COMMUNITY_APP_MY_REQUESTS_PATH, owner)).body.requests).toEqual([]);
  expect(await f.me(COMMUNITY_APP_MY_REQUEST_APPROVE_PATH, owner, { request_id: requestId })).toMatchObject({ status: 200 });
  // Denied: the next asker waits out Studio's cooldown.
  await f.t.run(async (c) => { await c.db.delete(membership!._id); });
  expect((await f.me(COMMUNITY_APP_MY_JOIN_REQUEST_PATH, outsider)).body).toMatchObject({ outcome: "approval_pending" });
  const again = (await f.me(COMMUNITY_APP_MY_REQUESTS_PATH, owner)).body.requests[0].id as string;
  expect(await f.me(COMMUNITY_APP_MY_REQUEST_DENY_PATH, owner, { request_id: again })).toEqual({ status: 200, body: { ok: true } });
  expect((await f.me(COMMUNITY_APP_MY_JOIN_REQUEST_PATH, outsider)).body).toMatchObject({ outcome: "approval_denied" });
  // A request of another community, or a malformed id: nothing.
  expect(await f.me(COMMUNITY_APP_MY_REQUEST_APPROVE_PATH, owner, { request_id: "../x" })).toMatchObject({ status: 400 });
  // Paid: admission is checkout only.
  await f.t.run((c) => c.db.patch(f.ids.communityId, { entryPolicy: "paid_subscription" } as any));
  expect((await f.me(COMMUNITY_APP_MY_REQUESTS_PATH, owner)).body).toMatchObject({ ok: true, paid: true });
});
