import { describe, expect, test } from "vitest";
import { derivePublicCommunityAdmissionProjection } from "../apps/web/src/communityJoinPolicy";

const NOW_MS = Date.parse("2026-08-09T12:00:00.000Z");

describe("public community admission projection", () => {
  test("derives pending solely from the access bundle", () => {
    expect(derivePublicCommunityAdmissionProjection({
      access: {
        is_owner: false,
        can_enter_community: false,
        join_request_status: "pending",
      },
      nowMs: NOW_MS,
    })).toMatchObject({
      canEnterCommunity: false,
      joinRequestStatus: "pending",
      approvalPending: true,
      approvalDenied: false,
      canRequestAgain: false,
    });
  });

  test("derives denial cooldown and elapsed reapplication", () => {
    expect(derivePublicCommunityAdmissionProjection({
      access: {
        is_owner: false,
        join_request_status: "denied",
        join_request_reapply_at: "2026-08-10T12:00:00.000Z",
      },
      nowMs: NOW_MS,
    }).canRequestAgain).toBe(false);
    expect(derivePublicCommunityAdmissionProjection({
      access: {
        is_owner: false,
        join_request_status: "denied",
        join_request_reapply_at: "2026-08-08T12:00:00.000Z",
      },
      nowMs: NOW_MS,
    }).canRequestAgain).toBe(true);
  });

  test("membership authority overrides stale request state", () => {
    expect(derivePublicCommunityAdmissionProjection({
      access: {
        is_owner: false,
        can_enter_community: true,
        join_request_status: "pending",
      },
      nowMs: NOW_MS,
    })).toMatchObject({
      canEnterCommunity: true,
      joinRequestStatus: null,
      approvalPending: false,
    });
  });

  test("malformed values fail closed", () => {
    expect(derivePublicCommunityAdmissionProjection({
      access: {
        is_owner: false,
        join_request_status: "approved",
        join_request_reapply_at: "not-a-date",
      },
      nowMs: NOW_MS,
    })).toMatchObject({
      joinRequestStatus: null,
      canRequestAgain: false,
    });
  });
});
