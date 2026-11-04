import type { CommunityTurnContract } from "./communityTurnContract";

// The turn contract's shared layers (the community card and the approved
// handbook), loaded the same way on every surface. Each surface passes its own
// checked reader (the Ask's or a tag's door), so access stays the surface's;
// a failed read leaves that layer out and never blocks the turn.

export const COMMUNITY_TURN_LAYER_MAX_CHARS = 6_000;

export type CommunityTurnLayerReader = (
  path: string,
  layer: "community_card" | "community_handbook",
) => Promise<{ status: string; outputText: string }>;

export type CommunityTurnLayers = {
  communityCardMd: string | null;
  communityHandbookMd: string | null;
  cardStatus: "loaded" | "empty" | "error" | "skipped";
};

// A canonical read returns { path, body }; a layer is its body, bounded.
export function parseCommunityTurnLayerBody(outputText: string): string | null {
  try {
    const value = JSON.parse(outputText) as Record<string, unknown>;
    const body = typeof value?.body === "string" ? value.body.trim() : "";
    return body ? body.slice(0, COMMUNITY_TURN_LAYER_MAX_CHARS) : null;
  } catch {
    return null;
  }
}

export async function loadCommunityTurnLayers(args: {
  contract: CommunityTurnContract | null;
  communitySlug: string | null | undefined;
  read: CommunityTurnLayerReader;
}): Promise<CommunityTurnLayers> {
  const slug = String(args.communitySlug ?? "").trim();
  if (!args.contract || !slug) return { communityCardMd: null, communityHandbookMd: null, cardStatus: "skipped" };
  const load = async (file: "community.md" | "handbook.md", layer: "community_card" | "community_handbook") => {
    try {
      const read = await args.read(`/communities/${slug}/${file}`, layer);
      return read.status === "ok" ? { ok: true, body: parseCommunityTurnLayerBody(read.outputText) } : { ok: false, body: null };
    } catch {
      return { ok: false, body: null };
    }
  };
  const card = args.contract.uses.communityCard ? await load("community.md", "community_card") : { ok: false, body: null };
  const handbook = args.contract.uses.handbook ? await load("handbook.md", "community_handbook") : { ok: false, body: null };
  return {
    communityCardMd: card.body,
    communityHandbookMd: handbook.body,
    cardStatus: !args.contract.uses.communityCard ? "skipped" : card.body ? "loaded" : card.ok ? "empty" : "error",
  };
}
