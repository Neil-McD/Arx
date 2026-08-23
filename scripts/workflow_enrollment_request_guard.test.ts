import { describe, expect, it } from "vitest";

import { isCurrentWorkflowEnrollmentRequest } from "../apps/web/src/controllers/workflowEnrollmentRequestGuard";

describe("workflow enrollment request guard", () => {
  it("rejects an earlier member response after a later member is selected", () => {
    expect(
      isCurrentWorkflowEnrollmentRequest({
        requestGeneration: 1,
        currentGeneration: 2,
        requestedCommunityId: "community-a",
        requestedEnrollmentId: "enrollment-a",
        selection: {
          communityId: "community-a",
          enrollmentId: "enrollment-b",
        },
      }),
    ).toBe(false);
  });

  it("accepts only the response for the current community and enrollment", () => {
    expect(
      isCurrentWorkflowEnrollmentRequest({
        requestGeneration: 2,
        currentGeneration: 2,
        requestedCommunityId: "community-a",
        requestedEnrollmentId: "enrollment-b",
        selection: {
          communityId: "community-a",
          enrollmentId: "enrollment-b",
        },
      }),
    ).toBe(true);
    expect(
      isCurrentWorkflowEnrollmentRequest({
        requestGeneration: 2,
        currentGeneration: 2,
        requestedCommunityId: "community-a",
        requestedEnrollmentId: "enrollment-b",
        selection: {
          communityId: "community-b",
          enrollmentId: "enrollment-b",
        },
      }),
    ).toBe(false);
  });

  it("rejects a response after the selection is cleared", () => {
    expect(
      isCurrentWorkflowEnrollmentRequest({
        requestGeneration: 3,
        currentGeneration: 3,
        requestedCommunityId: "community-a",
        requestedEnrollmentId: "enrollment-a",
        selection: null,
      }),
    ).toBe(false);
  });
});
