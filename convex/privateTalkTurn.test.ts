/// <reference types="vite/client" />
// A whole private talk with the guide (the Agent page's turn), end to end with
// a fake model: the request, the conversation, the tools, the funding, the run
// record and the saved reply. The safety net for moving this turn onto the one
// run entry (docs/specs/agent-system-end-state.md, one agent engine).
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.now();

function stubProviderEnv() {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS", "1000000");
  vi.stubEnv("POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", "2000000");
  vi.stubEnv("POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS", "1000000");
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet-staging.vercel.app");
}

async function world(t: any) {
  return await t.run(async (ctx: any) => {
    const user = (subject: string, handle: string) => ctx.db.insert("users", { authSubject: subject, displayName: handle, handle, normalizedHandle: handle,
      email: `${handle}@example.com`, createdAt: NOW, updatedAt: NOW });
    const ownerId = await user("owner-subject", "owner");
    const memberId = await user("member-subject", "maya");
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "club", name: "Club", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member", accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
    // Funded: the owner is the platform operator.
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityChannels", { communityId, systemRole: "general", slug: "general", name: "General", accessMode: "all_members",
      postingPolicy: "members", status: "active", position: 0, createdAt: NOW, updatedAt: NOW });
    return { ownerId, memberId, communityId };
  });
}

type Reply = Record<string, unknown>;
const usage = { input_tokens: 1200, output_tokens: 80, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } };
const toolCall = (name: string, args: Record<string, unknown>, id = "call-1"): Reply =>
  ({ id: `resp-${id}`, model: "gpt-6-luna", service_tier: "default", usage, output: [{ type: "function_call", call_id: id, name, arguments: JSON.stringify(args) }] });
const answer = (text: string): Reply => ({ id: "resp-final", model: "gpt-6-luna", service_tier: "default", usage, output_text: text });

// A streamed request gets the Responses API's events: each piece of output
// text, then the whole response.
function streamed(reply: Reply): Response {
  const text = typeof reply.output_text === "string" ? reply.output_text : "";
  const pieces = text ? [text.slice(0, Math.ceil(text.length / 2)), text.slice(Math.ceil(text.length / 2))] : [];
  const events = [...pieces.map((delta) => ({ type: "response.output_text.delta", delta })), { type: "response.completed", response: reply }];
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
}

function fakeModel(replies: Reply[], onRequest?: (index: number) => Promise<void>) {
  const requests: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: any, options: any) => {
    if (!String(url).includes("openai")) throw new Error(`unexpected fetch ${String(url)}`);
    const body = JSON.parse(options.body);
    requests.push(body);
    await onRequest?.(requests.length - 1);
    const reply = replies[Math.min(requests.length - 1, replies.length - 1)];
    if (reply.status) return new Response(JSON.stringify(reply.body ?? {}), { status: Number(reply.status) });
    return body.stream ? streamed(reply) : new Response(JSON.stringify(reply), { status: 200 });
  }));
  return requests;
}

const stateOf = (t: any) => t.run(async (ctx: any) => ({
  runs: await ctx.db.query("runtimeRuns").collect(),
  events: await ctx.db.query("runtimeRunEvents").collect(),
  receipts: await ctx.db.query("communityInferenceReceipts").collect(),
  messages: await ctx.db.query("cloudMessages").collect(),
}));

async function startTalk(t: any, w: any, text: string) {
  const member = t.withIdentity({ subject: "member-subject", email: "maya@example.com" });
  const conversation: any = await member.mutation(api.threads.ensureCommunityAgentConversation, { communityId: w.communityId });
  await member.mutation(api.threads.addCloudThreadMessage, { threadId: conversation.thread_id, messageKey: "user-1", role: "user", contentJson: { text } });
  return { member, conversation };
}

const turn = (member: any, threadKey: string, extra: Record<string, unknown> = {}) => member.fetch("/runtime/runtime_turn", {
  method: "POST",
  headers: { authorization: "Bearer test", "content-type": "application/json" },
  body: JSON.stringify({
    thread_id: threadKey, invocation_surface: "member_agent_dock", requested_agentic_tools: true,
    surface_context: { version: 1, kind: "community", community_slug: "club", section: "agent" },
    user_message_key: "user-1", idempotency_key: "turn-1", ...extra,
  }),
});

test("a private talk: the guide uses a tool through the canonical door, answers, and the turn is funded, recorded and saved", async () => {
  stubProviderEnv();
  const t = convexTest(schema, modules);
  const w = await world(t);
  const requests = fakeModel([toolCall("polynet_list", { path: "/" }), answer("The club meets on Saturdays.")]);
  const { member, conversation } = await startTalk(t, w, "When does the club meet?");
  const response = await turn(member, conversation.thread_key);
  const text = await response.text();
  expect(response.status, text).toBe(200);
  // Every turn streams; the done event carries the whole reply.
  expect(text).toContain("event: done");
  expect(text).toContain("The club meets on Saturdays.");

  // The model saw the member's message and the tools of this lens.
  expect(requests.length).toBe(2);
  expect(JSON.stringify(requests[0].input)).toContain("When does the club meet?");
  const tools = (requests[0].tools ?? []).map((tool: any) => tool.name).sort();
  expect(tools).toEqual(expect.arrayContaining(["polynet_list", "polynet_read", "polynet_search", "polynet_call", "polynet_write"]));
  expect(tools).not.toContain("search_product_docs");
  // The tool's answer went back to the model.
  expect(JSON.stringify(requests[1].input)).toContain("/communities/club/");

  const state = await t.run(async (ctx: any) => ({
    runs: await ctx.db.query("runtimeRuns").collect(),
    events: await ctx.db.query("runtimeRunEvents").collect(),
    receipts: await ctx.db.query("communityInferenceReceipts").collect(),
    messages: await ctx.db.query("cloudMessages").collect(),
  }));
  expect(state.runs).toHaveLength(1);
  expect(state.runs[0]).toMatchObject({ status: "ok" });
  const eventTypes = state.events.map((event: any) => event.eventType);
  // The run's record, in order: started, the prompt it was given, the tool
  // call and its result, finished.
  for (const step of ["run_started", "turn_contract", "runtime_prompt_bundle_resolved", "runtime_input_budget_planned",
    "runtime_provider_context_attested", "tool_call_started", "tool_call_finished", "agent_loop_stopped", "run_finished"]) {
    expect(eventTypes, step).toContain(step);
  }
  expect(eventTypes.indexOf("tool_call_started")).toBeLessThan(eventTypes.indexOf("tool_call_finished"));
  expect(eventTypes[eventTypes.length - 1]).toBe("run_finished");
  // Funded once, by the owner, and settled.
  expect(state.receipts).toHaveLength(1);
  expect(state.receipts[0]).toMatchObject({ status: "settled", communityId: w.communityId });
  expect(state.messages.some((message: any) => message.role === "assistant" && JSON.stringify(message.contentJson).includes("Saturdays"))).toBe(true);
});

test("streamed: the answer arrives in pieces as it is written, then the whole reply is saved", async () => {
  stubProviderEnv();
  const t = convexTest(schema, modules);
  const w = await world(t);
  const requests = fakeModel([answer("Saturdays at the north wall.")]);
  const { member, conversation } = await startTalk(t, w, "When do we climb?");
  const response = await turn(member, conversation.thread_key);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const body = await response.text();
  expect(requests[0].stream).toBe(true);
  const deltas = [...body.matchAll(/"delta":"([^"]*)"/g)].map((match) => match[1]);
  expect(deltas.length).toBeGreaterThanOrEqual(2);
  expect(deltas.join("")).toBe("Saturdays at the north wall.");
  const state = await stateOf(t);
  expect(state.runs[0]).toMatchObject({ status: "ok" });
  expect(state.receipts[0]).toMatchObject({ status: "settled" });
  expect(state.messages.some((message: any) => message.role === "assistant" && JSON.stringify(message.contentJson).includes("north wall"))).toBe(true);
});

test("the provider failing: the turn ends in an error, the run says so, and the owner isn't charged as if it answered", async () => {
  stubProviderEnv();
  const t = convexTest(schema, modules);
  const w = await world(t);
  fakeModel([{ status: 500, body: { error: { message: "boom" } } }]);
  const { member, conversation } = await startTalk(t, w, "Hello?");
  const response = await turn(member, conversation.thread_key);
  const text = await response.text();
  expect(JSON.stringify(text)).not.toContain("Saturdays");
  const state = await stateOf(t);
  expect(state.runs[0]?.status).toBe("error");
  for (const receipt of state.receipts) expect(receipt.status).not.toMatch(/settled|reserved/);
});

test("a tool this turn wasn't offered stops the run before anything runs (fail closed)", async () => {
  stubProviderEnv();
  const t = convexTest(schema, modules);
  const w = await world(t);
  const requests = fakeModel([toolCall("search_product_docs", { query: "pricing" }), answer("Should never be asked.")]);
  const { member, conversation } = await startTalk(t, w, "How much is Polynet?");
  await (await turn(member, conversation.thread_key)).text();
  const state = await stateOf(t);
  const types = state.events.map((event: any) => event.eventType);
  expect(requests).toHaveLength(1);
  expect(types).not.toContain("tool_call_started");
  const stopped: any = state.events.find((event: any) => event.eventType === "agent_loop_stopped");
  expect(JSON.stringify(stopped)).toContain("invalid_model_output");
  expect(state.runs[0]?.status).toBe("error");
});

test("the tools a member's private talk is offered today", async () => {
  stubProviderEnv();
  const t = convexTest(schema, modules);
  const w = await world(t);
  const requests = fakeModel([answer("Hi.")]);
  const { member, conversation } = await startTalk(t, w, "Hi");
  await (await turn(member, conversation.thread_key)).text();
  // The five Polynet tools and web research (web_crawl was deleted).
  expect((requests[0].tools ?? []).map((tool: any) => tool.name).sort())
    .toEqual(["polynet_call", "polynet_list", "polynet_read", "polynet_search", "polynet_write", "web_research"]);
});

test("the same turn sent twice is answered once", async () => {
  stubProviderEnv();
  const t = convexTest(schema, modules);
  const w = await world(t);
  const requests = fakeModel([answer("Once.")]);
  const { member, conversation } = await startTalk(t, w, "Say it once.");
  const first = await (await turn(member, conversation.thread_key)).text();
  const second = await (await turn(member, conversation.thread_key)).text();
  expect(first).toContain("Once.");
  expect(second).toContain("Once.");
  expect(requests).toHaveLength(1);
  const state = await stateOf(t);
  expect(state.runs).toHaveLength(1);
  expect(state.receipts).toHaveLength(1);
});

test("cancelled mid-turn: the run stops as cancelled and no finished answer is saved", async () => {
  stubProviderEnv();
  const t = convexTest(schema, modules);
  const w = await world(t);
  const { member, conversation } = await startTalk(t, w, "Take your time.");
  // The member cancels while the guide is waiting on its first tool call's answer.
  fakeModel([toolCall("polynet_list", { path: "/" }), answer("Too late.")], async (index) => {
    if (index !== 1) return;
    const response = await member.fetch("/runtime/runtime_cancel", { method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ thread_id: conversation.thread_key, run_id: "turn-1" }) });
    expect(response.status).toBeLessThan(300);
  });
  await (await turn(member, conversation.thread_key)).text();
  const state = await stateOf(t);
  expect(state.runs[0]?.status).toBe("cancelled");
  // What the member already saw stream in is kept, marked as a cancelled,
  // incomplete reply; it is never saved as a finished answer.
  const replies = state.messages.filter((message: any) => message.role === "assistant");
  for (const reply of replies) {
    expect(reply.contentJson?.meta?.partial_run).toMatchObject({ status: "cancelled", incomplete: true });
  }
  for (const receipt of state.receipts) expect(receipt.status).not.toBe("reserved");
});
