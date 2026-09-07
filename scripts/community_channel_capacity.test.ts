import { expect, test } from "vitest";
import { communityChannelCapacity, communityChannelCapacityError, MAX_TOTAL_COMMUNITY_CHANNELS } from "../shared/communityChannelCapacity";

test("a full shared directory still permits private creation", () => {
  const shared = Array.from({ length: 10 }, () => ({ access_mode: "all_members" }));
  expect(communityChannelCapacity(shared)).toEqual({ sharedFull: true, privateFull: false });
  const privateRooms = Array.from({ length: 100 }, () => ({ access_mode: "restricted" }));
  expect(communityChannelCapacity(privateRooms)).toEqual({ sharedFull: false, privateFull: true });
  expect(communityChannelCapacity([...shared, ...privateRooms])).toEqual({ sharedFull: true, privateFull: true });
  expect(MAX_TOTAL_COMMUNITY_CHANNELS).toBe(110);
});

test("capacity failures explain which audience is full", () => {
  expect(communityChannelCapacityError(new Error("community_shared_channel_limit_reached"))).toContain("10 shared");
  expect(communityChannelCapacityError(new Error("community_private_channel_limit_reached"))).toContain("100 invite-only");
  expect(communityChannelCapacityError(new Error("community_channel_refresh_required"))).toContain("Refresh");
});
