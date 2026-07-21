import { describe, expect, test } from "vitest";

import { derivePublicCommunityAdmissionProjection } from "../apps/web/src/communityJoinPolicy";

const NOW_MS = Date.parse("2026-07-21T12:00:00.000Z");

describe("public community admission projection", () => {
  test("derives pending solely from the access bundle", () => {
    expect(
      derivePublicCommunityAdmissionProjection({
        access: {
          is_owner: false,
          can_enter_community: false,
          join_request_status: "pending",
        },
        nowMs: NOW_MS,
      }),
    ).toMatchObject({
      canEnterCommunity: false,
      joinRequestStatus: "pending",
      approvalPending: true,
      approvalDenied: false,
      canRequestAgain: false,
    });
  });

  test("derives denied cooldown and reapplication from the access bundle", () => {
    const future = derivePublicCommunityAdmissionProjection({
      access: {
        is_owner: false,
        join_request_status: "denied",
        join_request_reapply_at: "2026-07-22T12:00:00.000Z",
      },
      nowMs: NOW_MS,
    });
    expect(future).toMatchObject({
      joinRequestStatus: "denied",
      approvalPending: false,
      approvalDenied: true,
      canRequestAgain: false,
    });

    const elapsed = derivePublicCommunityAdmissionProjection({
      access: {
        is_owner: false,
        join_request_status: "denied",
        join_request_reapply_at: "2026-07-20T12:00:00.000Z",
      },
      nowMs: NOW_MS,
    });
    expect(elapsed.canRequestAgain).toBe(true);
  });

  test("entry authority overrides stale request projection", () => {
    expect(
      derivePublicCommunityAdmissionProjection({
        access: {
          is_owner: false,
          can_enter_community: true,
          join_request_status: "pending",
        },
        nowMs: NOW_MS,
      }),
    ).toMatchObject({
      canEnterCommunity: true,
      joinRequestStatus: null,
      approvalPending: false,
      approvalDenied: false,
    });
  });

  test("preview ignores both owner access and request state", () => {
    expect(
      derivePublicCommunityAdmissionProjection({
        access: {
          is_owner: true,
          can_enter_community: true,
          join_request_status: "pending",
        },
        isPreviewMode: true,
        nowMs: NOW_MS,
      }),
    ).toMatchObject({
      canEnterCommunity: false,
      joinRequestStatus: null,
      approvalPending: false,
      approvalDenied: false,
    });
  });

  test("unknown status and malformed cooldown fail closed", () => {
    const unknown = derivePublicCommunityAdmissionProjection({
      access: {
        is_owner: false,
        join_request_status: "approved",
      },
      nowMs: NOW_MS,
    });
    expect(unknown.joinRequestStatus).toBeNull();

    const malformed = derivePublicCommunityAdmissionProjection({
      access: {
        is_owner: false,
        join_request_status: "denied",
        join_request_reapply_at: "not-a-date",
      },
      nowMs: NOW_MS,
    });
    expect(malformed).toMatchObject({
      approvalDenied: true,
      approvalReapplyAtMs: null,
      canRequestAgain: false,
    });
  });
});
