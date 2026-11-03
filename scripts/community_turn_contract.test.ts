import { expect, test } from "vitest";
import { buildCommunityTurnContract, summarizeCommunityTurnContract } from "../shared/communityTurnContract";

// Who speaks, who sees the answer, and what that allows.
test("a private Ask: the member asks and sees the answer; their profile and the shared layers are in", () => {
  const ask = buildCommunityTurnContract({ surface: "ask", communityId: "c1", speakerUserId: "u1" });
  expect(ask).toMatchObject({ speaker: { kind: "member", userId: "u1" }, audience: { kind: "asker" }, uses: { communityCard: true, handbook: true, askerProfile: true }, cacheKey: "pn:c1:ask" });
});

test("an Ask inside a community conversation keeps the shared layers but never the asker's global profile", () => {
  const ask = buildCommunityTurnContract({ surface: "ask_in_conversation", communityId: "c1", speakerUserId: "u1" });
  expect(ask.uses).toEqual({ communityCard: true, handbook: true, askerProfile: false });
  expect(ask.cacheKey).toBe("pn:c1:ask");
});

test("a public tag answers to the channel: shared layers only, no one's private context", () => {
  const tag = buildCommunityTurnContract({ surface: "tag", communityId: "c1", speakerUserId: "u1", channelId: "ch1" });
  expect(tag.audience).toEqual({ kind: "channel", channelId: "ch1" });
  expect(tag.uses.askerProfile).toBe(false);
  expect(tag.cacheKey).toBe("pn:c1:tag");
});

test("the steward runs on a schedule for the founder", () => {
  const steward = buildCommunityTurnContract({ surface: "steward", communityId: "c1", speakerUserId: "u1" });
  expect(steward.speaker).toEqual({ kind: "schedule" });
  expect(steward.audience).toEqual({ kind: "founder" });
  expect(steward.uses.askerProfile).toBe(false);
});

test("an Ask needs a member and every turn needs a community; the receipt summary has no ids", () => {
  expect(() => buildCommunityTurnContract({ surface: "ask", communityId: "c1" })).toThrow("community_turn_contract_ask_requires_member");
  expect(() => buildCommunityTurnContract({ surface: "tag", communityId: " " })).toThrow("community_turn_contract_requires_community");
  const summary = summarizeCommunityTurnContract(buildCommunityTurnContract({ surface: "ask", communityId: "c1", speakerUserId: "u1" }));
  expect(JSON.stringify(summary)).not.toMatch(/u1|c1/);
});
