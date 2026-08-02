import { describe, expect, it } from "vitest";

import { shouldShowFirstResolutionSkeleton } from "../shared/shellLoadingPresentation";

describe("shell loading presentation", () => {
  it("shows a skeleton as soon as an expected scope is unresolved", () => {
    expect(shouldShowFirstResolutionSkeleton({
      isPresentationExpected: true,
      hasResolved: false,
    })).toBe(true);
  });

  it("renders nothing for a surface that is not expected", () => {
    expect(shouldShowFirstResolutionSkeleton({
      isPresentationExpected: false,
      hasResolved: false,
    })).toBe(false);
  });

  it("retains scoped content during background refresh", () => {
    expect(shouldShowFirstResolutionSkeleton({
      isPresentationExpected: true,
      hasResolved: true,
      contentCount: 25,
    })).toBe(false);
    expect(shouldShowFirstResolutionSkeleton({
      isPresentationExpected: true,
      hasResolved: false,
      contentCount: 1,
    })).toBe(false);
  });

  it("does not turn a resolved empty state back into loading", () => {
    expect(shouldShowFirstResolutionSkeleton({
      isPresentationExpected: true,
      hasResolved: true,
    })).toBe(false);
  });

  it("lets an initial failure replace the skeleton", () => {
    expect(shouldShowFirstResolutionSkeleton({
      isPresentationExpected: true,
      hasResolved: false,
      hasError: true,
    })).toBe(false);
  });
});
