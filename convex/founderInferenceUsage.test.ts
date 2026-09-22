import { expect, test } from "vitest";
import { createFounderInferenceUsageTotals, founderProviderRequests, recordFounderProviderSuccess } from "./founderInferenceUsage";

const request = (id: string) => ({ requestId: id, modelId: "gpt-6-luna", serviceTier: "default",
  promptTokens: 1000, completionTokens: 20, cachedInputTokens: 0, cacheWriteTokens: 1000 });

test("member and workflow runs retain each provider request through a tool loop", () => {
  const usage = createFounderInferenceUsageTotals("gpt-6-luna");
  for (const id of ["resp_tool", "resp_answer"]) {
    recordFounderProviderSuccess(usage, { promptTokens: 1000, completionTokens: 20, providerRequestUsage: request(id) });
  }
  expect(usage).toMatchObject({ promptTokens: 2000, completionTokens: 40, complete: true });
  expect(founderProviderRequests(usage)?.map((entry) => entry.requestId)).toEqual(["resp_tool", "resp_answer"]);
});

test("Luna 6 remains incomplete when any provider call lacks its breakdown", () => {
  const usage = createFounderInferenceUsageTotals("gpt-6-luna");
  recordFounderProviderSuccess(usage, { promptTokens: 1000, completionTokens: 20, providerRequestUsage: request("resp_tool") });
  recordFounderProviderSuccess(usage, { promptTokens: 900, completionTokens: 10 });
  expect(usage).toMatchObject({ promptTokens: 1900, completionTokens: 30, complete: false });
  expect(founderProviderRequests(usage)).toHaveLength(1);
});

test("legacy Luna retains aggregate usage without a request breakdown", () => {
  const usage = createFounderInferenceUsageTotals("gpt-5.6-luna");
  recordFounderProviderSuccess(usage, { promptTokens: 100, completionTokens: 5 });
  expect(usage).toMatchObject({ promptTokens: 100, completionTokens: 5, complete: true });
  expect(founderProviderRequests(usage)).toBeUndefined();
});
