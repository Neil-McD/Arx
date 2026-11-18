/// <reference types="vite/client" />
// The run entry (convex/communityAgentRun.ts) with what a private talk adds:
// streamed text, its lens's tools, a check before the first request and a
// stop the person can press.
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
// What it schedules is kept (when, what, with what) so a test can look, and run it.
const actionCtx = (t: any) => {
  const scheduled: any[] = [];
  return {
    scheduled,
    runQuery: (ref: any, args: any) => t.query(ref, args), runMutation: (ref: any, args: any) => t.mutation(ref, args),
    scheduler: { runAfter: async (delayMs: number, ref: any, args: any) => { scheduled.push({ delayMs, ref, args }); } },
  };
};

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

let lastCtx: any = null;
async function run(t: any, w: any, extra: Record<string, unknown>) {
  const ctx = actionCtx(t);
  lastCtx = ctx;
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

test("a private talk streams its answer and is offered its lens's tools, web research included, or the talk's own when given", async () => {
  const t = convexTest(schema, modules);
  const w = await fundedCommunity(t);
  const bodies = stubModel([{ output_text: "High tide is at six." }]);
  const deltas: Array<[string, number]> = [];
  const result: any = await run(t, w, { onTextDelta: (delta: string, index: number) => deltas.push([delta, index]) });
  expect(result).toMatchObject({ ok: true, assistantText: "High tide is at six." });
  expect(result.kernel).toMatchObject({ ok: true, stopReason: "assistant_final" });
  expect(deltas).toEqual([["High ", 0], ["tide is at six.", 0]]);
  expect(bodies[0].stream).toBe(true);
  // With no talk's tools given, the lens's: reading and the web.
  expect(bodies[0].tools.map((tool: any) => tool.name)).toEqual(
    ["polynet_list", "polynet_read", "polynet_search", "web_research"]);
  expect(bodies[0].parallel_tool_calls).toBe(false);

  // A talk's tools are offered as given; one outside the lens never is.
  const talkBodies = stubModel([{ output_text: "Done." }]);
  await run(t, w, { tools: ["polynet_list", "polynet_read", "polynet_search", "web_research", "polynet_post", "polynet_remember", "polynet_write", "polynet_reply_message"] });
  expect(talkBodies[0].tools.map((tool: any) => tool.name)).toEqual(
    ["polynet_list", "polynet_read", "polynet_search", "web_research", "polynet_post", "polynet_remember"]);
});

test("a private talk's model may call only the tools it was offered", async () => {
  const t = convexTest(schema, modules);
  const w = await fundedCommunity(t);
  // In the lens (a builder's tool), but not offered to this member's talk.
  stubModel([{ output: [{ type: "function_call", call_id: "x", name: "polynet_create_channel", arguments: JSON.stringify({ name: "x" }) }] }]);
  const executeTool = vi.fn();
  const result: any = await run(t, w, { tools: ["polynet_list", "polynet_read", "polynet_search", "web_research", "polynet_post"], executeTool });
  expect(result).toMatchObject({ ok: false, failureCode: "unsupported_concierge_tool" });
  expect(executeTool).not.toHaveBeenCalled();
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

// What an answer read (shared/communityKnowledgeUse.ts): the notes and
// lessons the guide opened, added hours later to its day's counts, and
// nothing about who asked or what.
const read = (id: string, path: string) => ({ type: "function_call", call_id: id, name: "polynet_read", arguments: JSON.stringify({ path }) });
const doc = (value: Record<string, unknown>) => ({ status: "ok", exitCode: 0, outputText: JSON.stringify(value, null, 2), errorCode: null, errorMessage: null });
const useRows = (t: any) => t.run((ctx: any) => ctx.db.query("communityKnowledgeUse").collect());
// Runs what the last answer scheduled, as the scheduler would later.
const deliver = async (t: any) => { for (const job of lastCtx.scheduled) await t.mutation(job.ref, job.args); };

test("an answer's reads are added to its day's counts hours later at a random time; the row holds counts only", async () => {
  const t = convexTest(schema, modules);
  const w = await fundedCommunity(t);
  stubModel([
    { output: [read("a", "/communities/run-club/memory/tides.md")] },
    { output: [read("b", "/communities/run-club/memory/lesson.md")] },
    { output: [read("c", "/communities/run-club/memory/tides.md")] },
    { output: [read("d", "/communities/run-club/memory/list.md")] },
    { output_text: "High tide is at six." },
  ]);
  const answers: Record<string, any> = {
    a: doc({ ref: "note:n1", path: "/x", body: "Tides: \"ref\": \"note:fake\" appears in the words." }),
    b: doc({ ref: "resource:l1", path: "/y", body: "The lesson." }),
    // Read twice: counted once.
    c: doc({ ref: "note:n1", path: "/x", body: "Tides again." }),
    // A listing names many things; it is not a read of one.
    d: doc({ entries: [{ ref: "resource:l2", title: "Another lesson" }] }),
  };
  const result: any = await run(t, w, { maxToolSteps: 8, executeTool: async (_name: any, _raw: any, call: any) => answers[call.providerCallId] });
  expect(result.ok).toBe(true);
  // Nothing is written as the answer ends: it is scheduled for later.
  expect(await useRows(t)).toEqual([]);
  expect(lastCtx.scheduled).toHaveLength(1);
  const job = lastCtx.scheduled[0];
  expect(job.delayMs).toBeGreaterThanOrEqual(0);
  expect(job.delayMs).toBeLessThan(4 * 60 * 60_000);
  expect(Object.keys(job.args).sort()).toEqual(["communityId", "day", "refs"]);
  await deliver(t);
  // A second answer the same day adds to the same row.
  stubModel([{ id: "s1", output: [read("e", "/communities/run-club/memory/tides.md")] }, { id: "s2", output_text: "Still six." }]);
  expect((await run(t, w, { executeTool: async () => doc({ ref: "note:n1", path: "/x", body: "Tides." }) }) as any).ok).toBe(true);
  await deliver(t);
  const rows: any[] = await useRows(t);
  expect(rows).toHaveLength(1);
  const { _id, _creationTime, ...kept } = rows[0];
  expect(kept).toEqual({ communityId: w.communityId, day: Math.floor(Date.now() / 86_400_000),
    uses: [{ ref: "note:n1", count: 2 }, { ref: "resource:l1", count: 1 }], pairs: [{ a: "note:n1", b: "resource:l1", count: 1 }] });
});

test("nothing is recorded for work with nobody present, an answer that read nothing, or one that failed", async () => {
  const t = convexTest(schema, modules);
  const w = await fundedCommunity(t);
  const note = async () => doc({ ref: "note:n1", path: "/x", body: "Tides." });
  const nothingScheduled = () => expect(lastCtx.scheduled).toEqual([]);
  // (Each reply has its own id: one test, several runs.)
  // A worker (a review, a brief) reads notes too; that isn't an answer.
  stubModel([{ id: "w1", output: [read("a", "/communities/run-club/memory/tides.md")] }, { id: "w2", output_text: "Done." }]);
  await run(t, w, { lens: "worker", executeTool: note });
  nothingScheduled();
  // An answer from what it already had.
  stubModel([{ id: "p1", output_text: "Six o'clock." }]);
  expect((await run(t, w, {}) as any).ok).toBe(true);
  nothingScheduled();
  // A read that failed.
  stubModel([{ id: "f1", output: [read("a", "/communities/run-club/memory/gone.md")] }, { id: "f2", output_text: "I couldn't find it." }]);
  expect((await run(t, w, { executeTool: async () => ({ status: "error", exitCode: null, outputText: "", errorCode: "semantic_not_found", errorMessage: "No note." }) }) as any).ok).toBe(true);
  nothingScheduled();
  // A run the person stopped after it had read something.
  stubModel([{ id: "s1", output: [read("a", "/communities/run-club/memory/tides.md")] }, { id: "s2", output_text: "never sent" }]);
  class Stopped extends Error {}
  let wasRead = false;
  const stopped: any = await run(t, w, {
    executeTool: async () => { wasRead = true; return await note(); },
    // The read goes through; the stop lands on whatever comes after it.
    abortable: async (operation: any) => { if (wasRead) throw new Stopped("stopped"); return await operation(undefined); },
    mapStopError: (error: unknown) => error instanceof Stopped
      ? { ok: false, status: 409, code: "user_cancelled", stopReason: "user_cancelled", message: "stopped" } : null,
  });
  expect(stopped).toMatchObject({ ok: false, failureCode: "user_cancelled" });
  expect(wasRead).toBe(true);
  nothingScheduled();
  expect(await useRows(t)).toEqual([]);
});

test("answers on different days make separate rows; use sums across the month", async () => {
  const t = convexTest(schema, modules);
  const w = await fundedCommunity(t);
  const today = Math.floor(Date.now() / 86_400_000);
  const add = (day: number, refs: string[]) => t.mutation(internal.communityKnowledgeUse.addKnowledgeUseInternal, { communityId: w.communityId, day, refs });
  await add(today, ["note:a", "note:b"]);
  await add(today - 1, ["note:a"]);
  await add(today - 40, ["note:old"]);
  expect(await useRows(t)).toHaveLength(3);
  const summary: any = await t.query(internal.communityKnowledgeUse.readKnowledgeUseInternal, { communityId: w.communityId });
  // A month back only.
  expect(summary).toEqual({ use: { "note:a": 2, "note:b": 1 }, together: [{ a: "note:a", b: "note:b", count: 1 }] });
});
