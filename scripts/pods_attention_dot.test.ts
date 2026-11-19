import { describe, expect, it } from "vitest";
import { podsAttentionDot, roomDot } from "../shared/podsAttentionDot";

const channels = [
  { slug: "general", access_mode: "all_members" },
  { slug: "wins", access_mode: "all_members" },
  { slug: "founders", access_mode: "restricted" },
  { slug: "makers", access_mode: "restricted" },
];
const quiet = { chat: false, mentions: false };

describe("the Pods dot", () => {
  it("is off when no pod has anything new, whatever the open channels have", () => {
    expect(podsAttentionDot({ channels, indicators: { general: { chat: true, mentions: true }, founders: quiet } })).toBe("none");
  });

  it("is the quiet dot when a pod has new messages", () => {
    expect(podsAttentionDot({ channels, indicators: { founders: { chat: true, mentions: false } } })).toBe("quiet");
  });

  it("is the accent dot when you were tagged in a pod, over another pod's quiet one", () => {
    expect(podsAttentionDot({ channels, indicators: { founders: { chat: true, mentions: false }, makers: { chat: false, mentions: true } } })).toBe("mention");
  });

  it("ignores the pod whose room is open (it is being read)", () => {
    expect(podsAttentionDot({ channels, indicators: { founders: { chat: true, mentions: true } }, openSlug: "founders" })).toBe("none");
    expect(podsAttentionDot({ channels, indicators: { founders: { chat: true, mentions: true }, makers: { chat: true, mentions: false } }, openSlug: "founders" })).toBe("quiet");
  });

  it("treats a pod with no attention row yet as nothing new", () => {
    expect(podsAttentionDot({ channels, indicators: {} })).toBe("none");
  });
});

describe("one pod's dot", () => {
  it("follows a channel row: a tag wins over new messages", () => {
    expect(roomDot(undefined)).toBe("none");
    expect(roomDot(quiet)).toBe("none");
    expect(roomDot({ chat: true, mentions: false })).toBe("quiet");
    expect(roomDot({ chat: true, mentions: true })).toBe("mention");
    expect(roomDot({ chat: false, mentions: true })).toBe("mention");
  });
});
