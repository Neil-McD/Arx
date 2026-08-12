import { describe, expect, it } from "vitest";

import {
  classifyCommunityFunnelDraftPreviewFailure,
  formatCommunityFunnelDraftPreviewFailure,
} from "../apps/web/src/controllers/useWebCommunityFunnelDraftPreviewController";

describe("community funnel draft preview failures", () => {
  it.each([
    "community_forbidden",
    "community_not_found",
    "community_archived",
  ])("fails closed for %s", (code) => {
    expect(classifyCommunityFunnelDraftPreviewFailure(new Error(code))).toBe(
      "denied",
    );
  });

  it.each([
    "Sign in as a community manager",
    "auth_session_probe_failed",
    "unauthenticated",
  ])("classifies %s as a refreshable session failure", (message) => {
    expect(
      classifyCommunityFunnelDraftPreviewFailure(new Error(message)),
    ).toBe("session");
  });

  it.each([
    "Failed to fetch",
    "Network error",
    "Request timeout",
    "community_temporarily_unavailable",
  ])("keeps %s recoverable", (message) => {
    expect(
      classifyCommunityFunnelDraftPreviewFailure(new Error(message)),
    ).toBe("retryable");
  });

  it("does not expose provider error details in the UI", () => {
    expect(
      formatCommunityFunnelDraftPreviewFailure(
        new Error("Network error containing internal provider detail"),
      ),
    ).toBe("The draft preview could not connect. Try again.");
    expect(
      formatCommunityFunnelDraftPreviewFailure(
        new Error("auth_session_probe_failed with internal provider detail"),
      ),
    ).toBe("Your session could not be verified. Try again.");
    expect(
      formatCommunityFunnelDraftPreviewFailure(
        new Error("Uncaught internal provider detail"),
      ),
    ).toBe("The draft preview could not be opened. Try again.");
  });
});
