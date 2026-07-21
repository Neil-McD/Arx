import { describe, expect, test } from "vitest";

import { parsePendingAuthIntentInput } from "../shared/authResumeState";

describe("public funnel auth resume intent", () => {
  test("keeps one canonical slug-owned join intent", () => {
    expect(
      parsePendingAuthIntentInput({
        reason: "join_public_community",
        payload: {
          community_slug: "  polynet  ",
          community_id: "legacy-id-must-not-survive",
        },
      }),
    ).toEqual({
      reason: "join_public_community",
      payload: { community_slug: "polynet" },
    });
  });

  test("rejects the legacy id-only resume representation", () => {
    expect(
      parsePendingAuthIntentInput({
        reason: "join_public_community",
        payload: { community_id: "legacy-id" },
      }),
    ).toBeNull();
  });

  test("rejects malformed or empty slug intent", () => {
    expect(
      parsePendingAuthIntentInput({
        reason: "join_public_community",
        payload: { community_slug: "   " },
      }),
    ).toBeNull();
    expect(
      parsePendingAuthIntentInput({
        reason: "join_public_community",
        payload: null,
      }),
    ).toBeNull();
  });
});
