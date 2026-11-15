/// <reference types="vite/client" />
// The run entry (convex/communityAgentRun.ts) with what a private talk adds:
// streamed text, its lens's tools, reads side by side, a check before the
// first request and a stop the person can press.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { runFundedCommunityAgent, type CommunityAgentRunRecorder } from "./communityAgentRun";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS", "1000000");
  vi.stubEnv("POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", "2000000");
  vi.stubEnv("POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS", "1000000");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function fundedCommunity(t: any) {
  return await t.run(async (ctx: any) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    // Funded: the owner is the platform operator.
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: NOW, updatedAt: NOW });
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "run-club", name: "Run club", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 1, createdAt: NOW, updatedAt: NOW });
    return { ownerId, communityId };
  });
}

// An action context over convex-test: the run entry only calls queries and mutations.
const actionCtx = (t: any) => ({ runQuery: (ref: any, args: any) => t.query(ref, args), runMutation: (ref: any, args: any) => t.mutation(ref, args) });

const recorder = (): CommunityAgentRunRecorder & { events: any[] } => {
  const events: any[] = [];
  return { events, record: async (event) => { events.push(event); }, recordRequired: async (event) => { events.push(event); }, flushAll: async () => {} };
};

const usage = { input_tokens: 1_000, output_tokens: 50, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } };
const sse = (events: any[]) => new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
  status: 200, headers: { "content-type": "text/event-stream" } });

// Streams when asked to, so the same replies serve both kinds of request.
function stubModel(replies: any[]) {
  const bodies: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: any, options: any) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    const reply = { id: `r${bodies.length}`, model: "gpt-6-luna", service_tier: "default", usage, ...(replies[bodies.length - 1] ?? replies[replies.length - 1]) };
    if (!body.stream) return new Response(JSON.stringify(reply), { status: 200 });
    const text = String(reply.output_text ?? "");
    return sse([
      ...(text ? [{ type: "response.output_text.delta", delta: text.slice(0, 5) }, { type: "response.output_text.delta", delta: text.slice(5) }] : []),
      { type: "response.completed", response: reply },
    ]);
  }));
  return bodies;
}

async function run(t: any, w: any, extra: Record<string, unknown>) {
  const ctx = actionCtx(t);
  const admission = await t.query(internal.founderInference.resolveCommunityInferenceFundingAdmissionInternal, { communityId: w.communityId });
  return await runFundedCommunityAgent({
    ctx, lens: "member_private", communityId: w.communityId, actorUserId: w.ownerId, surface: "member_agent_dock",
    receiptKey: `member_agent_dock:${Math.random()}`, sourceRunId: "run-1", admission,
    messages: [{ role: "user", content: "What do we have on tides?" }],
    maxOutputTokens: 500, maxToolSteps: 4, promptCacheKey: "pn:test", recorder: recorder(),
    executeTool: async () => ({ status: "ok", exitCode: 0, outputText: "{}", errorCode: null, errorMessage: null }),
    ...extra,
  } as any);
}

test("a private talk streams its answer and is offered its lens's tools, web research included", async () => {
  const t = convexTest(schema, modules);
  const w = await fundedCommunity(t);
  const bodies = stubModel([{ output_text: "High tide is at six." }]);
  const deltas: Array<[string, number]> = [];
  const result: any = await run(t, w, { onTextDelta: (delta: string, index: number) => deltas.push([delta, index]) });
  expect(result).toMatchObject({ ok: true, assistantText: "High tide is at six." });
  expect(result.kernel).toMatchObject({ ok: true, stopReason: "assistant_final" });
  expect(deltas).toEqual([["High ", 0], ["tide is at six.", 0]]);
  expect(bodies[0].stream).toBe(true);
  expect(bodies[0].tools.map((tool: any) => tool.name)).toEqual(
    ["polynet_list", "polynet_read", "polynet_search", "polynet_write", "polynet_call", "web_research"]);
  expect(bodies[0].parallel_tool_calls).toBe(false);
});

test("reads that change nothing run side by side when asked; the schedule is reported", async () => {
  const t = convexTest(schema, modules);
  const w = await fundedCommunity(t);
  // Listing is the read that changes nothing, so it may run side by side.
  const list = (id: string, path: string) => ({ type: "function_call", call_id: id, name: "polynet_list", arguments: JSON.stringify({ path }) });
  const bodies = stubModel([{ output: [list("a", "/communities/run-club/channels/"), list("b", "/communities/run-club/pods/")] }, { output_text: "Done." }]);
  let running = 0;
  let overlapped = false;
  const schedules: any[] = [];
  const result: any = await run(t, w, {
    parallelReads: true,
    onToolSchedule: async (schedule: any) => { schedules.push(schedule); },
    executeTool: async (_name: string, _args: any, call: any) => {
      running += 1;
      if (running > 1) overlapped = true;
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return { status: "ok", exitCode: 0, outputText: JSON.stringify({ read: call.providerCallId }), errorCode: null, errorMessage: null };
    },
  });
  expect(result.ok).toBe(true);
  expect(bodies[0].parallel_tool_calls).toBe(true);
  expect(schedules[0].executionMode).toBe("parallel_read_batch");
  expect(overlapped).toBe(true);
});

test("a tool outside the lens is refused before it runs", async () => {
  const t = convexTest(schema, modules);
  const w = await fundedCommunity(t);
  stubModel([{ output: [{ type: "function_call", call_id: "x", name: "web_research", arguments: JSON.stringify({ query: "tides" }) }] }]);
  const executeTool = vi.fn();
  const result: any = await run(t, w, { lens: "guide_public", executeTool });
  expect(result).toMatchObject({ ok: false, failureCode: "unsupported_concierge_tool" });
  expect(executeTool).not.toHaveBeenCalled();
});

test("the check before the first request can stop the run before anything is spent", async () => {
  const t = convexTest(schema, modules);
  const w = await fundedCommunity(t);
  const bodies = stubModel([{ output_text: "never" }]);
  const seen: any[] = [];
  const result: any = await run(t, w, {
    beforeFirstCompletion: async (messages: any[]) => {
      seen.push(messages);
      return { ok: false, status: 503, code: "runtime_provider_context_attestation_failed", stopReason: "model_error", message: "no receipt" };
    },
  });
  expect(result).toMatchObject({ ok: false, failureCode: "runtime_provider_context_attestation_failed", providerStarted: false });
  expect(seen[0][0]).toMatchObject({ role: "user" });
  expect(bodies).toHaveLength(0);
});

test("a stop the person presses ends the run as stopped, not as a crash", async () => {
  const t = convexTest(schema, modules);
  const w = await fundedCommunity(t);
  stubModel([{ output_text: "never" }]);
  class Stopped extends Error {}
  const result: any = await run(t, w, {
    abortable: async () => { throw new Stopped("stopped by the member"); },
    mapStopError: (error: unknown) => error instanceof Stopped
      ? { ok: false, status: 409, code: "user_cancelled", stopReason: "user_cancelled", message: (error as Error).message }
      : null,
  });
  expect(result).toMatchObject({ ok: false, failureCode: "user_cancelled" });
  expect(result.kernel).toMatchObject({ stopReason: "user_cancelled" });
});
