import { describe, expect, it } from "vitest";
import { isMemoryReviewCall, memoryReviewPlace } from "../shared/agentLens";
import { parseMemoryEvidenceRef } from "../shared/communityMemory";

// The guide's memory review sees open channels and memory, nothing else
// (docs/specs/agent-system-end-state.md §4). Which channels are open is
// checked against the database by the executor; this is the path grammar.
describe("the memory review lens", () => {
  it("mounts memory, the channel list, and inside a channel", () => {
    expect(memoryReviewPlace("/")).toEqual({ kind: "root" });
    expect(memoryReviewPlace("/memory.md")).toEqual({ kind: "memory_index" });
    expect(memoryReviewPlace("/memory/")).toEqual({ kind: "memory" });
    expect(memoryReviewPlace("/memory/refunds.md")).toEqual({ kind: "memory" });
    expect(memoryReviewPlace("/channels/")).toEqual({ kind: "channels" });
    expect(memoryReviewPlace("/channels/general/new.md")).toEqual({ kind: "channel_new", channel: "general" });
    expect(memoryReviewPlace("/channels/general/")).toEqual({ kind: "channel", channel: "general" });
    expect(memoryReviewPlace("/channels/general/interaction:root:abc123/")).toEqual({ kind: "channel", channel: "general" });
    expect(memoryReviewPlace("/channels/general/interaction:reply:abc123.md")).toEqual({ kind: "channel", channel: "general" });
  });

  it("mounts nothing else", () => {
    for (const path of ["/community.md", "/handbook.md", "/members/", "/members/jon.md", "/builder/", "/events/", "/resources/",
      "/capabilities/", "/presence.json", "/users/me/", "/channels/general/../builder/", "/memory/../builder/x.md", "/channels/General/"]) {
      expect(memoryReviewPlace(path), path).toEqual({ kind: "not_mounted" });
    }
  });

  it("writes only to memory", () => {
    expect(isMemoryReviewCall("memory.observe")).toBe(true);
    expect(isMemoryReviewCall("memory.write_index")).toBe(true);
    expect(isMemoryReviewCall("community.interaction.react")).toBe(false);
    expect(isMemoryReviewCall("community.members.ban")).toBe(false);
  });

  it("takes evidence as the folder names it", () => {
    expect(parseMemoryEvidenceRef("interaction:root:abc")).toEqual({ kind: "post", id: "abc", raw: "post:abc" });
    expect(parseMemoryEvidenceRef("interaction:reply:abc.md")).toEqual({ kind: "reply", id: "abc", raw: "reply:abc" });
    expect(parseMemoryEvidenceRef("post:abc")).toEqual({ kind: "post", id: "abc", raw: "post:abc" });
    expect(parseMemoryEvidenceRef("/communities/x/channels/general/")).toBeNull();
  });
});
