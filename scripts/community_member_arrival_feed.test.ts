import { describe, expect, test } from "vitest";

import type { CommunityInteractionRootBundle } from "../shared/cloudCommunityInteractionsGateway";
import type { CommunityActivityEvent } from "../shared/communityTypes";
import {
  groupInteractionFeed,
  MEMBER_ARRIVAL_GROUP_GAP_MS,
} from "../apps/web/src/components/groupInteractionFeed";

const BASE_MS = Date.parse("2026-08-14T12:00:00.000Z");

function arrival(id: string, userId: string, offsetMs: number): CommunityActivityEvent {
  return {
    id,
    community_id: "community-1",
    type: "member_joined",
    actor_user_id: userId,
    target_type: "membership",
    target_id: `membership-${id}`,
    target_title: null,
    created_at: new Date(BASE_MS + offsetMs).toISOString(),
  };
}

function root(id: string, offsetMs: number): CommunityInteractionRootBundle {
  return {
    root: {
      id,
      actor_type: "human",
      actor_user_id: `actor-${id}`,
      actor_agent_key: null,
      kind: "discussion",
      created_at: new Date(BASE_MS + offsetMs).toISOString(),
    },
  } as unknown as CommunityInteractionRootBundle;
}

describe("groupInteractionFeed member arrivals", () => {
  test("groups only adjacent arrivals inside the bounded window", () => {
    const segments = groupInteractionFeed(
      [],
      [
        arrival("a", "user-a", 0),
        arrival("b", "user-b", MEMBER_ARRIVAL_GROUP_GAP_MS),
        arrival("c", "user-c", MEMBER_ARRIVAL_GROUP_GAP_MS * 2 + 1),
      ],
      BASE_MS,
    );
    const arrivals = segments.filter((segment) => segment.type === "member_arrivals");
    expect(arrivals).toHaveLength(2);
    expect(arrivals[0]).toMatchObject({ events: [{ id: "a" }, { id: "b" }] });
    expect(arrivals[1]).toMatchObject({ events: [{ id: "c" }] });
  });

  test("a canonical interaction breaks an arrival group and preserves chronology", () => {
    const segments = groupInteractionFeed(
      [root("root-1", 5 * 60 * 1000)],
      [
        arrival("a", "user-a", 0),
        arrival("b", "user-b", 10 * 60 * 1000),
      ],
      BASE_MS,
    );
    expect(segments.map((segment) => segment.type)).toEqual([
      "day",
      "member_arrivals",
      "group",
      "member_arrivals",
    ]);
  });

  test("ignores non-arrival activity rows", () => {
    const resource = {
      ...arrival("resource", "user-a", 0),
      type: "resource_added" as const,
      target_type: "resource" as const,
    };
    expect(groupInteractionFeed([], [resource], BASE_MS)).toEqual([]);
  });
});
