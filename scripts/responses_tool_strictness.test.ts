import { expect, test } from "vitest";
import { buildOpenAiFunctionTools, buildResponsesApiFunctionTools } from "../shared/toolRegistry";
import { RETRIEVAL_TOOL_NAMES } from "../shared/retrievalTools";

// Regression: with polynet_call in strict mode, OpenAI returned an empty,
// incomplete response for every agent turn (Studio, front ends, @mentions).
test("polynet_call is sent non-strict; every other agent tool stays strict", () => {
  for (const tools of [
    buildResponsesApiFunctionTools(RETRIEVAL_TOOL_NAMES).map((tool) => [tool.name, tool.strict] as const),
    buildOpenAiFunctionTools(RETRIEVAL_TOOL_NAMES).map((tool) => [tool.function.name, tool.function.strict] as const),
  ]) {
    expect(tools.find(([name]) => name === "polynet_call")?.[1]).toBe(false);
    expect(tools.filter(([name]) => name !== "polynet_call").every(([, strict]) => strict === true)).toBe(true);
  }
});
