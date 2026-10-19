/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  registerCommunityAppRoutes,
  COMMUNITY_APP_HANDOFF_PATH,
  COMMUNITY_EDGE_EXCHANGE_PATH,
  COMMUNITY_APP_AGENT_PATH,
  COMMUNITY_APP_AGENT_MESSAGES_PATH,
  COMMUNITY_APP_RUNTIME_PATH as COMMUNITY_APP_RUNTIME_PATH_FOR_TEST,
} from "./httpCommunityApps";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { POLYNET_FOUNDER_PLAN_PRICING_VERSION } from "../shared/founderPlan";
import { syncFounderUsageCycle } from "./founderPlanCore";

// A whole personal-agent turn from a community front end, with a fake model.
const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);

const ORIGIN = "https://hello.example.com";
const STATE = "s".repeat(43);
const BRIDGE_SECRET = "test-bridge-secret";
const EDGE_SECRET = "test-edge-secret";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function fixture() {
  vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", BRIDGE_SECRET);
  vi.stubEnv("POLYNET_COMMUNITY_EDGE_SECRET", EDGE_SECRET);
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
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
    const ownerId = await user("agent-owner");
    const memberId = await user("agent-member");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "agent-community", name: "Agent Community", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: nowMs, updatedAt: nowMs,
    });
    await ctx.db.insert("communityChannels", {
      communityId, systemRole: "general", slug: "general", name: "General", accessMode: "all_members",
      postingPolicy: "members", status: "active", position: 0, createdAt: nowMs, updatedAt: nowMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId, userId: memberId, role: "member", accessSource: "free_grant", active: true,
      activationSequence: 1, activatedAt: nowMs, createdAt: nowMs, updatedAt: nowMs,
    });
    const founderSubscriptionId = await ctx.db.insert("founderSubscriptions", {
      ownerUserId: ownerId, communityId, provider: "stripe", providerCustomerId: "cus_agent", providerSubscriptionId: "sub_agent",
      providerPriceId: "price_founder_79_monthly", status: "active", currentPeriodStartAt: nowMs - 60_000,
      currentPeriodEndAt: nowMs + 2_592_000_000, cancelAtPeriodEnd: false, lastProviderEventCreatedAt: nowMs,
      createdAt: nowMs, updatedAt: nowMs,
    });
    await syncFounderUsageCycle({
      ctx, subscription: (await ctx.db.get(founderSubscriptionId)) as any,
      cycleStartAt: nowMs - 60_000, cycleEndAt: nowMs + 2_592_000_000,
      pricing: {
        pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION, includedCostMicros: 20_000_000,
        inputCostMicrosPerMillionTokens: 1_000_000, outputCostMicrosPerMillionTokens: 2_000_000, maxRunReservationCostMicros: 1_000_000,
      },
      nowMs,
    });
    return { ownerId, memberId, communityId };
  });
  await t.mutation(internal.communityApps.registerCommunityDomainInternal, { communityId: ids.communityId, origin: ORIGIN });

  const handlers = new Map<string, (ctx: any, req: Request) => Promise<Response>>();
  registerCommunityAppRoutes({
    http: { route: ({ path, method, handler }) => { handlers.set(`${method} ${path}`, handler as any); } },
    httpAction: (handler) => handler as any,
  });
  const ctx = {
    runQuery: (ref: any, args: any) => t.query(ref, args),
    runMutation: (ref: any, args: any) => t.mutation(ref, args),
    runAction: (ref: any, args: any) => t.action(ref, args),
    scheduler: { runAfter: async () => null, runAt: async () => null },
  };
  const post = (path: string, headers: Record<string, string>, body: unknown) =>
    handlers.get(`POST ${path}`)!(ctx, new Request(`https://example.convex.site${path}`, {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
    }));
  const signIn = async (handle: string) => {
    const issued = await (await post(COMMUNITY_APP_HANDOFF_PATH, { "x-arx-auth-bridge-secret": BRIDGE_SECRET },
      { session_id: `sess-${handle}`, community_slug: "agent-community", origin: ORIGIN, state: STATE })).json() as any;
    const exchanged = await (await post(COMMUNITY_EDGE_EXCHANGE_PATH, { "x-polynet-edge-secret": EDGE_SECRET },
      { code: issued.code, state: STATE, origin: ORIGIN })).json() as any;
    return exchanged.token as string;
  };
  const asEdge = (token: string) => ({ origin: ORIGIN, "x-polynet-edge-secret": EDGE_SECRET, authorization: `Bearer ${token}` });
  return { t, ids, post, signIn, asEdge };
}

type Step = { text: string } | { tool: string; args: Record<string, unknown> };

// Answers each model request with the next step: a tool call or a final reply.
function scriptedModel(steps: Step[]) {
  const calls: Array<Record<string, any>> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (!String(url).startsWith("https://api.openai.com/v1/responses")) throw new Error(`unexpected fetch ${String(url)}`);
    calls.push(JSON.parse(String(init?.body ?? "{}")));
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    const output = "tool" in step
      ? [{ type: "function_call", id: `fc_${calls.length}`, call_id: `call_${calls.length}`, name: step.tool, arguments: JSON.stringify(step.args) }]
      : [{ type: "message", role: "assistant", content: [{ type: "output_text", text: step.text }] }];
    return Response.json({
      id: `resp_${calls.length}`, model: "gpt-6-luna", service_tier: "default", status: "completed",
      ...("text" in step ? { output_text: step.text } : {}), output,
      usage: { input_tokens: 40, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens: 8, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 48 },
    });
  });
  return calls;
}

function fakeModel(reply: string) {
  const calls: Array<Record<string, any>> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (!String(url).startsWith("https://api.openai.com/v1/responses")) throw new Error(`unexpected fetch ${String(url)}`);
    calls.push(JSON.parse(String(init?.body ?? "{}")));
    return Response.json({
      id: `resp_${calls.length}`, model: "gpt-6-luna", service_tier: "default", status: "completed", output_text: reply,
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: reply }] }],
      usage: { input_tokens: 40, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens: 8, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 48 },
    });
  });
  return calls;
}

test("a member talks to their personal agent from a community front end", async () => {
  const f = await fixture();
  const token = await f.signIn("agent-member");
  const calls = fakeModel("Hi! I'm your agent in Agent Community.");

  const response = await f.post(COMMUNITY_APP_AGENT_PATH, f.asEdge(token), { text: "Hello agent", message_key: "first-message" });
  const stream = await response.text();
  if (!stream.includes("event: done")) throw new Error(`turn did not finish: ${response.status} ${stream.slice(-1500)}`);
  expect(stream).toContain("Hi! I'm your agent in Agent Community.");
  expect(calls.length).toBeGreaterThan(0);

  const history = await (await f.post(COMMUNITY_APP_AGENT_MESSAGES_PATH, f.asEdge(token), {})).json() as any;
  expect(history.messages.map((message: any) => [message.role, message.text])).toEqual([
    ["user", "Hello agent"],
    ["assistant", "Hi! I'm your agent in Agent Community."],
  ]);
});

async function turn(f: Awaited<ReturnType<typeof fixture>>, token: string, text: string, key: string) {
  const response = await f.post(COMMUNITY_APP_AGENT_PATH, f.asEdge(token), { text, message_key: key });
  return { status: response.status, stream: await response.text() };
}

test("the front-end conversation is the member's own Studio conversation for this community", async () => {
  const f = await fixture();
  const token = await f.signIn("agent-member");
  fakeModel("Noted.");
  expect((await turn(f, token, "Remember I like async check-ins", "studio-shared")).stream).toContain("event: done");
  const studio = f.t.withIdentity({ subject: "agent-member-subject" });
  const conversation = await studio.mutation(api.threads.ensureCommunityAgentConversation, { communityId: f.ids.communityId });
  const messages = await studio.query(api.threads.listNewestCloudThreadMessages, { threadId: conversation.thread_id as any });
  expect(messages.map((message: any) => message.contentJson?.text ?? message.contentJson)).toContain("Remember I like async check-ins");
});

test("the community agent posts for the member through the door", async () => {
  const f = await fixture();
  const token = await f.signIn("agent-member");
  scriptedModel([
    { tool: "polynet_write", args: { path: "/communities/agent-community/channels/general/", mode: "create",
      content: { text: "Posted by my agent." }, idempotency_key: "agent-post-1" } },
    { text: "Done, I posted it." },
  ]);
  const result = await turn(f, token, "Post 'Posted by my agent.' in general", "agent-post");
  expect(result.stream).toContain("event: done");
  const roots = await f.t.run((c) => c.db.query("communityInteractionRoots").collect());
  expect(roots).toHaveLength(1);
  expect(roots[0]).toMatchObject({
    communityId: f.ids.communityId, actorUserId: f.ids.memberId, actorType: "community_agent", actorAgentKey: "community_agent", contentSummary: "Posted by my agent.",
  });

  // Studio shows the agent as the author and the member as who it acted for.
  const studio = f.t.withIdentity({ subject: "agent-member-subject" });
  const page = await studio.query(api.communityInteractions.listCommunityInteractionRoots, { communityId: f.ids.communityId, limit: 10 }) as any;
  const studioRoot = (page.roots ?? page.page ?? page).find((entry: any) => (entry.root ?? entry).id === String(roots[0]._id));
  expect(studioRoot.root ?? studioRoot).toMatchObject({ actor_type: "community_agent", actor_user_id: null, on_behalf_of_user_id: expect.any(String) });

  // The member can't rewrite the agent's words in a post made for them.
  const ref = `interaction:root:${roots[0]._id}`;
  const edited = await f.post(COMMUNITY_APP_RUNTIME_PATH_FOR_TEST, f.asEdge(token), { tool: "polynet_write", input: {
    path: `/communities/agent-community/channels/general/${ref}.md`, mode: "update", content: { text: "rewritten" }, idempotency_key: "edit-agent-post" } });
  expect(await edited.json()).toMatchObject({ ok: false, message: expect.stringContaining("interaction_edit_forbidden") });
});

test("an owner's agent in a front end stays in the member lane", async () => {
  const f = await fixture();
  const token = await f.signIn("agent-owner");
  const calls = scriptedModel([
    { tool: "polynet_list", args: { path: "/communities/agent-community/builder/" } },
    { text: "I can't open that here." },
  ]);
  expect((await turn(f, token, "Open the builder folder", "owner-builder")).stream).toContain("event: done");
  const outputItem = (calls[1]?.input ?? []).find((item: any) => item?.type === "function_call_output");
  expect(JSON.parse(String(outputItem?.output))).toMatchObject({ tool_name: "polynet_list", success: false, error_code: "semantic_not_found" });
});

test("front-end agent turns are refused without the edge, without input, or without membership", async () => {
  const f = await fixture();
  const token = await f.signIn("agent-member");
  fakeModel("unused");
  const noEdge = await f.post(COMMUNITY_APP_AGENT_PATH, { ...f.asEdge(token), "x-polynet-edge-secret": "wrong" }, { text: "hi", message_key: "no-edge-1" });
  expect(noEdge.status).toBe(401);
  expect((await f.post(COMMUNITY_APP_AGENT_PATH, f.asEdge(token), { text: "hi" })).status).toBe(400);
  await f.t.run(async (c) => {
    const membership = (await c.db.query("communityMemberships").collect()).find((row) => row.userId === f.ids.memberId)!;
    await c.db.patch(membership._id, { active: false, revokedAt: Date.now() });
  });
  const lost = await f.post(COMMUNITY_APP_AGENT_PATH, f.asEdge(token), { text: "hi", message_key: "lost-member-1" });
  expect(lost.status).toBe(403);
});
