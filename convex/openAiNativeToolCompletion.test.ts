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
