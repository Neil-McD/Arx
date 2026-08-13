import { describe, expect, it } from "vitest";

import { classifyCloudFunctionErrorCategoryCore } from "../shared/cloudFunctionErrorCore";

describe("community inference error classification", () => {
  it("classifies an exhausted founder-funded allowance as quota", () => {
    expect(
      classifyCloudFunctionErrorCategoryCore({
        status: 403,
        code: "community_ai_usage_exhausted",
        message: "The included community AI allowance is exhausted.",
      }),
    ).toBe("quota");
  });

  it.each([
    "community_ai_unavailable",
    "community_inference_accounting_unavailable",
  ])("classifies %s as unavailable", (code) => {
    expect(
      classifyCloudFunctionErrorCategoryCore({
        status: 503,
        code,
        message: "Community AI is temporarily unavailable.",
      }),
    ).toBe("unavailable");
  });
});
