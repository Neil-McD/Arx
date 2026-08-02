import { describe, expect, it } from "vitest";

import { shouldShowFirstResolutionSkeleton } from "../shared/shellLoadingPresentation";

describe("shell loading presentation", () => {
  it("shows a skeleton only while a scope has never resolved", () => {
    expect(shouldShowFirstResolutionSkeleton({
      isLoading: true,
      hasResolved: false,
    })).toBe(true);
    expect(shouldShowFirstResolutionSkeleton({
      isLoading: true,
      hasResolved: true,
    })).toBe(false);
  });

  it("retains scoped content during background refresh", () => {
    expect(shouldShowFirstResolutionSkeleton({
      isLoading: true,
      hasResolved: true,
      contentCount: 25,
    })).toBe(false);
    expect(shouldShowFirstResolutionSkeleton({
      isLoading: true,
      hasResolved: false,
      contentCount: 1,
    })).toBe(false);
  });

  it("does not turn a resolved empty or failed state back into loading", () => {
    expect(shouldShowFirstResolutionSkeleton({
      isLoading: false,
      hasResolved: true,
    })).toBe(false);
    expect(shouldShowFirstResolutionSkeleton({
      isLoading: false,
      hasResolved: false,
      hasError: true,
    })).toBe(false);
  });
});
