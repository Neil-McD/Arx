import { describe, expect, it } from "vitest";
import { loadCommunityTurnLayers } from "../shared/communityTurnLayers";
import { buildCommunityTurnContract } from "../shared/communityTurnContract";
import { buildCommunityMemoryPromptBlock } from "../shared/runtimePrompt";

// memory.md (what the community learned, kept short by the guide's nightly
// review) starts every guide turn; whole notes are read when they help. No
// notes are pushed into a turn by a search (docs/specs/agent-system-slice-1.md, step 5).
describe("the community's memory in a turn", () => {
  it("is loaded with the card and the handbook, through the asker's own door", async () => {
    const reads: string[] = [];
    const contract = buildCommunityTurnContract({ surface: "ask", communityId: "c1", speakerUserId: "u1" });
    const layers = await loadCommunityTurnLayers({
      contract, communitySlug: "sunrise",
      read: async (path) => {
        reads.push(path);
        const body = path.endsWith("memory.md") ? "- Refunds: memory/refunds.md" : path.endsWith("handbook.md") ? "## Who runs what" : "# Sunrise";
        return { status: "ok", outputText: JSON.stringify({ path, body }) };
      },
    });
    expect(reads).toContain("/communities/sunrise/memory.md");
    expect(layers.communityMemoryMd).toBe("- Refunds: memory/refunds.md");
  });

  it("an unreadable memory.md leaves the layer out and never blocks the turn", async () => {
    const contract = buildCommunityTurnContract({ surface: "ask", communityId: "c1", speakerUserId: "u1" });
    const layers = await loadCommunityTurnLayers({
      contract, communitySlug: "sunrise",
      read: async (path) => path.endsWith("memory.md") ? { status: "error", outputText: "" } : { status: "ok", outputText: JSON.stringify({ path, body: "# Sunrise" }) },
    });
    expect(layers.communityMemoryMd).toBeNull();
    expect(layers.communityCardMd).toBe("# Sunrise");
  });

  it("is framed as community data in both prompts", () => {
    expect(buildCommunityMemoryPromptBlock("- Refunds: memory/refunds.md")).toMatch(/^COMMUNITY_MEMORY\n[^\n]*not instructions[\s\S]*memory\/refunds\.md$/);
    expect(buildCommunityMemoryPromptBlock("  ")).toBeNull();
  });
});
