import { describe, expect, test } from "vitest";

import {
  derivePublicCommunityAdmissionProjection,
  isPublicCommunityLoadSnapshotCurrent,
  type PublicCommunityAccessResolution,
} from "../apps/web/src/communityJoinPolicy";

const NOW_MS = Date.parse("2026-07-21T12:00:00.000Z");
const READY_RESOLUTION: PublicCommunityAccessResolution = {
  status: "ready",
  communitySlug: "polynet",
  authSubject: "user_a",
};

function deriveSignedIn(
  access: Parameters<typeof derivePublicCommunityAdmissionProjection>[0]["access"],
  overrides: Partial<Parameters<typeof derivePublicCommunityAdmissionProjection>[0]> = {},
) {
  return derivePublicCommunityAdmissionProjection({
    access,
    accessResolution: READY_RESOLUTION,
    authSubject: "user_a",
    communitySlug: "polynet",
    isSignedIn: true,
    nowMs: NOW_MS,
    ...overrides,
  });
}

describe("public community admission projection", () => {
  test("derives pending solely from the access bundle", () => {
    expect(
      deriveSignedIn({
        is_owner: false,
        is_blocked: false,
        can_enter_community: false,
        join_request_status: "pending",
      }),
    ).toMatchObject({
      status: "ready",
      canEnterCommunity: false,
      joinRequestStatus: "pending",
      approvalPending: true,
      approvalDenied: false,
      canRequestAgain: false,
    });
  });

  test("derives denied cooldown and reapplication from the access bundle", () => {
    const future = deriveSignedIn({
      is_owner: false,
      is_blocked: false,
      join_request_status: "denied",
      join_request_reapply_at: "2026-07-22T12:00:00.000Z",
    });
    expect(future).toMatchObject({
      joinRequestStatus: "denied",
      approvalPending: false,
      approvalDenied: true,
      canRequestAgain: false,
    });

    const elapsed = deriveSignedIn({
      is_owner: false,
      is_blocked: false,
      join_request_status: "denied",
      join_request_reapply_at: "2026-07-20T12:00:00.000Z",
    });
    expect(elapsed.canRequestAgain).toBe(true);
  });

  test("entry authority overrides stale request projection", () => {
    expect(
      deriveSignedIn({
        is_owner: false,
        is_blocked: false,
        can_enter_community: true,
        join_request_status: "pending",
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
          is_blocked: false,
          can_enter_community: true,
          join_request_status: "pending",
        },
        accessResolution: READY_RESOLUTION,
        authSubject: "user_a",
        communitySlug: "polynet",
        isSignedIn: true,
        isPreviewMode: true,
        nowMs: NOW_MS,
      }),
    ).toMatchObject({
      status: "ready",
      canEnterCommunity: false,
      joinRequestStatus: null,
      approvalPending: false,
      approvalDenied: false,
    });
  });

  test("unknown status and malformed cooldown fail closed", () => {
    const unknown = deriveSignedIn({
      is_owner: false,
      is_blocked: false,
      join_request_status: "approved",
    });
    expect(unknown.joinRequestStatus).toBeNull();

    const malformed = deriveSignedIn({
      is_owner: false,
      is_blocked: false,
      join_request_status: "denied",
      join_request_reapply_at: "not-a-date",
    });
    expect(malformed).toMatchObject({
      approvalDenied: true,
      approvalReapplyAtMs: null,
      canRequestAgain: false,
    });
  });

  test("blocked access suppresses every admission and request state", () => {
    expect(
      deriveSignedIn({
        is_owner: false,
        is_blocked: true,
        can_enter_community: false,
        join_request_status: "pending",
      }),
    ).toMatchObject({
      status: "blocked",
      canEnterCommunity: false,
      joinRequestStatus: null,
      approvalPending: false,
      approvalDenied: false,
      canRequestAgain: false,
    });
  });

  test("signed-in access verifies before it can project authority", () => {
    const verifying = deriveSignedIn(null, {
      accessResolution: {
        status: "verifying",
        communitySlug: "polynet",
        authSubject: "user_a",
      },
    });
    expect(verifying.status).toBe("verifying");

    const unavailable = deriveSignedIn(null, {
      accessResolution: {
        status: "unavailable",
        communitySlug: "polynet",
        authSubject: "user_a",
      },
    });
    expect(unavailable.status).toBe("unavailable");
  });

  test("stale route, subject, and malformed access all fail closed", () => {
    expect(
      deriveSignedIn({ is_owner: true, is_blocked: false }, { communitySlug: "other" }),
    ).toMatchObject({ status: "verifying", canEnterCommunity: false });
    expect(
      deriveSignedIn({ is_owner: true, is_blocked: false }, { authSubject: "user_b" }),
    ).toMatchObject({ status: "verifying", canEnterCommunity: false });
    expect(
      deriveSignedIn({ is_owner: true }),
    ).toMatchObject({ status: "unavailable", canEnterCommunity: false });
  });

  test("anonymous admission ignores stale authenticated access", () => {
    expect(
      derivePublicCommunityAdmissionProjection({
        access: { is_owner: true, is_blocked: false, can_enter_community: true },
        accessResolution: READY_RESOLUTION,
        authSubject: null,
        communitySlug: "polynet",
        isSignedIn: false,
        nowMs: NOW_MS,
      }),
    ).toMatchObject({ status: "ready", canEnterCommunity: false });
  });
});

describe("public community load snapshot", () => {
  const snapshot = {
    generation: 7,
    communitySlug: "polynet",
    authSubject: "user_a",
  };

  test("accepts only the current generation, route, and principal", () => {
    expect(
      isPublicCommunityLoadSnapshotCurrent({ snapshot, current: snapshot }),
    ).toBe(true);
    expect(
      isPublicCommunityLoadSnapshotCurrent({
        snapshot,
        current: { ...snapshot, generation: 8 },
      }),
    ).toBe(false);
    expect(
      isPublicCommunityLoadSnapshotCurrent({
        snapshot,
        current: { ...snapshot, communitySlug: "other" },
      }),
    ).toBe(false);
    expect(
      isPublicCommunityLoadSnapshotCurrent({
        snapshot,
        current: { ...snapshot, authSubject: "user_b" },
      }),
    ).toBe(false);
  });

  test("same-subject token refresh leaves the snapshot current", () => {
    expect(
      isPublicCommunityLoadSnapshotCurrent({
        snapshot,
        current: { ...snapshot },
      }),
    ).toBe(true);
  });
});
