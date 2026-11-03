import { afterEach, expect, test, vi } from "vitest";
import { parseFounderProviderRequestUsage, runOpenAiNativeToolCompletion } from "./openAiNativeToolCompletion";
afterEach(() => vi.unstubAllGlobals());
const payload = {
  id: "resp_luna6", model: "gpt-6-luna", service_tier: "default", output_text: "Confirmed.",
  usage: { input_tokens: 1500, output_tokens: 100,
    input_tokens_details: { cached_tokens: 500, cache_write_tokens: 200 } },
};
test("Responses adapter preserves per-request usage and explicitly requests Standard processing", async () => {
  const fetch = vi.fn(async (_url: any, _options: any) => new Response(JSON.stringify(payload), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const result = await runOpenAiNativeToolCompletion({ modelId: "gpt-6-luna", apiKeyOverride: "test-key",
    messages: [{ role: "user", content: "Synthetic test" }], maxTokens: 200, tools: [] });
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({ model: "gpt-6-luna", service_tier: "default", reasoning: { effort: "low" } });
  expect(result).toMatchObject({ ok: true, providerRequestUsage: { requestId: "resp_luna6", modelId: "gpt-6-luna", serviceTier: "default",
    promptTokens: 1500, completionTokens: 100, cachedInputTokens: 500, cacheWriteTokens: 200 } });
});
test("missing, null, or inconsistent usage is not silently converted to free tokens", () => {
  for (const change of [undefined, null, { ...payload.usage, input_tokens: null },
    { ...payload.usage, input_tokens_details: { cached_tokens: 0 } },
    { ...payload.usage, input_tokens_details: { cached_tokens: 1499, cache_write_tokens: 2 } }]) {
    expect(parseFounderProviderRequestUsage({ ...payload, usage: change })).toBeUndefined();
  }
  expect(parseFounderProviderRequestUsage({ ...payload, service_tier: "priority" })).toBeUndefined();
});

test("a billed response keeps its usage when tool arguments are malformed", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    ...payload,
    output: [{ type: "function_call", call_id: "call_bad", name: "write", arguments: "{" }],
  }), { status: 200 })));
  const result = await runOpenAiNativeToolCompletion({ modelId: "gpt-6-luna", apiKeyOverride: "test-key",
    messages: [{ role: "user", content: "Synthetic test" }], maxTokens: 200, tools: [] });
  expect(result).toMatchObject({ ok: false, code: "invalid_model_output",
    promptTokens: 1500, completionTokens: 100,
    providerRequestUsage: { requestId: "resp_luna6", modelId: "gpt-6-luna" } });
});

test("a billed response keeps its usage when the function-call envelope is invalid", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    ...payload,
    output: [{ type: "function_call", name: "write", arguments: "{}" }],
  }), { status: 200 })));
  const result = await runOpenAiNativeToolCompletion({ modelId: "gpt-6-luna", apiKeyOverride: "test-key",
    messages: [{ role: "user", content: "Synthetic test" }], maxTokens: 200, tools: [] });
  expect(result).toMatchObject({ ok: false, code: "invalid_model_output",
    providerRequestUsage: { requestId: "resp_luna6" } });
});

test("a prompt cache key groups requests that share a prefix; none is sent without one", async () => {
  const fetch = vi.fn(async (_url: any, _options: any) => new Response(JSON.stringify(payload), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const base = { modelId: "gpt-6-luna", apiKeyOverride: "test-key", messages: [{ role: "user" as const, content: "Synthetic test" }], maxTokens: 200, tools: [] };
  await runOpenAiNativeToolCompletion({ ...base, promptCacheKey: "pn:community_1:member_agent_dock" });
  await runOpenAiNativeToolCompletion(base);
  expect(JSON.parse(fetch.mock.calls[0]![1].body).prompt_cache_key).toBe("pn:community_1:member_agent_dock");
  expect(JSON.parse(fetch.mock.calls[1]![1].body)).not.toHaveProperty("prompt_cache_key");
});

test("a marked cache breakpoint sends the shared prompt as a developer message ending at an explicit breakpoint, and turn context in place", async () => {
  const fetch = vi.fn(async (_url: any, _options: any) => new Response(JSON.stringify(payload), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  await runOpenAiNativeToolCompletion({ modelId: "gpt-6-luna", apiKeyOverride: "test-key", maxTokens: 200, tools: [], messages: [
    { role: "system", content: "Shared community prompt.", cacheBreakpoint: true },
    { role: "user", content: "Earlier question" },
    { role: "assistant", content: "Earlier answer" },
    { role: "user", content: "Latest question" },
    { role: "system", content: "This turn's context.", inPlace: true },
  ] });
  const body = JSON.parse(fetch.mock.calls[0]![1].body);
  expect(body).not.toHaveProperty("instructions");
  expect(body.prompt_cache_options).toEqual({ mode: "implicit" });
  expect(body.input.map((item: any) => item.role)).toEqual(["developer", "user", "assistant", "user", "developer"]);
  expect(body.input[0].content[0]).toEqual({ type: "input_text", text: "Shared community prompt.", prompt_cache_breakpoint: { mode: "explicit" } });
  expect(body.input[4].content[0]).toEqual({ type: "input_text", text: "This turn's context." });
});

test("without a marked breakpoint, system text stays in instructions with no cache options", async () => {
  const fetch = vi.fn(async (_url: any, _options: any) => new Response(JSON.stringify(payload), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  await runOpenAiNativeToolCompletion({ modelId: "gpt-6-luna", apiKeyOverride: "test-key", maxTokens: 200, tools: [], messages: [
    { role: "system", content: "Whole prompt." }, { role: "user", content: "Hi" },
  ] });
  const body = JSON.parse(fetch.mock.calls[0]![1].body);
  expect(body.instructions).toBe("Whole prompt.");
  expect(body).not.toHaveProperty("prompt_cache_options");
  expect(body.input.map((item: any) => item.role)).toEqual(["user"]);
});
