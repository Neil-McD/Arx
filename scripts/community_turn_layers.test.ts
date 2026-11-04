import { expect, test } from "vitest";
import { buildCommunityTurnContract } from "../shared/communityTurnContract";
import { loadCommunityTurnLayers } from "../shared/communityTurnLayers";

// Every surface loads the card and handbook through one loader with its own
// checked reader: the same paths, the same parsing, failures left out.
const body = (text: string) => ({ status: "ok", outputText: JSON.stringify({ body: text }) });

test("the Ask and a tag load the same layers through their own readers", async () => {
  for (const surface of ["ask", "tag"] as const) {
    const contract = buildCommunityTurnContract({ surface, communityId: "c1", speakerUserId: "u1", channelId: "ch" });
    const asked: string[] = [];
    const layers = await loadCommunityTurnLayers({
      contract, communitySlug: "sunrise",
      read: async (path, layer) => { asked.push(`${layer}:${path}`); return body(layer === "community_card" ? "# Sunrise" : "## Who runs what"); },
    });
    expect(asked).toEqual(["community_card:/communities/sunrise/community.md", "community_handbook:/communities/sunrise/handbook.md"]);
    expect(layers).toEqual({ communityCardMd: "# Sunrise", communityHandbookMd: "## Who runs what", cardStatus: "loaded" });
  }
});

test("a missing handbook or a failing read is left out, never fatal; no contract or slug loads nothing", async () => {
  const contract = buildCommunityTurnContract({ surface: "ask", communityId: "c1", speakerUserId: "u1" });
  const missingHandbook = await loadCommunityTurnLayers({
    contract, communitySlug: "sunrise",
    read: async (path) => (path.endsWith("handbook.md") ? { status: "error", outputText: "" } : body("# Sunrise")),
  });
  expect(missingHandbook).toEqual({ communityCardMd: "# Sunrise", communityHandbookMd: null, cardStatus: "loaded" });
  const throwing = await loadCommunityTurnLayers({ contract, communitySlug: "sunrise", read: async () => { throw new Error("down"); } });
  expect(throwing).toEqual({ communityCardMd: null, communityHandbookMd: null, cardStatus: "error" });
  expect((await loadCommunityTurnLayers({ contract: null, communitySlug: "sunrise", read: async () => body("x") })).cardStatus).toBe("skipped");
  expect((await loadCommunityTurnLayers({ contract, communitySlug: " ", read: async () => body("x") })).cardStatus).toBe("skipped");
});
