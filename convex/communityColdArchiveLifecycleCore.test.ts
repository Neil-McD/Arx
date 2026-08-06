import { describe, expect, test } from "vitest";

import {
  COMMUNITY_LIFECYCLE_STATUSES,
  archiveCommunityLifecycle,
  communityIsActive,
  communityLifecycleGenerationMatches,
  normalizeCommunityLifecycle,
  restoreCommunityLifecycle,
} from "../shared/communityLifecycle";

describe("cold archive community lifecycle kernel", () => {
  test("has exactly the active and archived states", () => {
    expect(COMMUNITY_LIFECYCLE_STATUSES).toEqual(["active", "archived"]);
  });

  test("treats legacy rows as active generation zero", () => {
    expect(normalizeCommunityLifecycle({})).toEqual({
      status: "active",
      generation: 0,
    });
    expect(communityIsActive({})).toBe(true);
    expect(communityLifecycleGenerationMatches({}, undefined)).toBe(true);
    expect(communityLifecycleGenerationMatches({}, 0)).toBe(true);
  });

  test("matches only the exact economic generation", () => {
    const community = {
      lifecycleStatus: "active" as const,
      lifecycleGeneration: 2,
    };
    expect(communityLifecycleGenerationMatches(community, 2)).toBe(true);
    expect(communityLifecycleGenerationMatches(community, 0)).toBe(false);
    expect(communityLifecycleGenerationMatches(community, undefined)).toBe(false);
  });

  test("normalizes explicit active and archived rows", () => {
    expect(
      normalizeCommunityLifecycle({
        lifecycleStatus: "active",
        lifecycleGeneration: 4,
      }),
    ).toEqual({ status: "active", generation: 4 });
    expect(
      normalizeCommunityLifecycle({
        lifecycleStatus: "archived",
        lifecycleGeneration: 5,
      }),
    ).toEqual({ status: "archived", generation: 5 });
    expect(
      communityIsActive({
        lifecycleStatus: "archived",
        lifecycleGeneration: 5,
      }),
    ).toBe(false);
  });

  test("archives exactly once", () => {
    const first = archiveCommunityLifecycle({});
    expect(first).toEqual({
      changed: true,
      previous: { status: "active", generation: 0 },
      next: { status: "archived", generation: 1 },
    });
    expect(
      archiveCommunityLifecycle({
        lifecycleStatus: first.next.status,
        lifecycleGeneration: first.next.generation,
      }),
    ).toEqual({
      changed: false,
      previous: { status: "archived", generation: 1 },
      next: { status: "archived", generation: 1 },
    });
  });

  test("restores exactly once", () => {
    const first = restoreCommunityLifecycle({
      lifecycleStatus: "archived",
      lifecycleGeneration: 1,
    });
    expect(first).toEqual({
      changed: true,
      previous: { status: "archived", generation: 1 },
      next: { status: "active", generation: 2 },
    });
    expect(
      restoreCommunityLifecycle({
        lifecycleStatus: first.next.status,
        lifecycleGeneration: first.next.generation,
      }),
    ).toEqual({
      changed: false,
      previous: { status: "active", generation: 2 },
      next: { status: "active", generation: 2 },
    });
  });

  test("keeps generation monotonic across repeated archive and restore cycles", () => {
    const archivedOne = archiveCommunityLifecycle({});
    const activeTwo = restoreCommunityLifecycle({
      lifecycleStatus: archivedOne.next.status,
      lifecycleGeneration: archivedOne.next.generation,
    });
    const archivedThree = archiveCommunityLifecycle({
      lifecycleStatus: activeTwo.next.status,
      lifecycleGeneration: activeTwo.next.generation,
    });
    expect([
      archivedOne.next.generation,
      activeTwo.next.generation,
      archivedThree.next.generation,
    ]).toEqual([1, 2, 3]);
  });

  test("fails closed on invalid state", () => {
    for (const lifecycleStatus of [null, "", "paused", "archive_scheduled"]) {
      expect(() => normalizeCommunityLifecycle({ lifecycleStatus })).toThrow(
        "community_lifecycle_status_invalid",
      );
    }
    for (const lifecycleGeneration of [null, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => normalizeCommunityLifecycle({ lifecycleGeneration })).toThrow(
        "community_lifecycle_generation_invalid",
      );
    }
    expect(() =>
      archiveCommunityLifecycle({
        lifecycleStatus: "active",
        lifecycleGeneration: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow("community_lifecycle_generation_exhausted");
  });
});
