// The turn contract: one record per agent turn of who is speaking, who will
// see the answer, which context layers that allows, and how the turn is
// cached and bounded. Every surface builds its turn from it, so a public tag
// can never pick up a member's private context and a private Ask always gets
// the community's shared layers.

export type CommunityTurnSurface =
  // A member's private Ask on the Agent page.
  | "ask"
  // A private Ask bound to a community conversation: still private, but the
  // asker's global profile stays out (it belongs to the person, not the room).
  | "ask_in_conversation"
  // A public tag or mention in a channel: the channel sees the answer.
  | "tag"
  // The scheduled steward and founder brief: the founder sees the result.
  | "steward";

export type CommunityTurnSpeaker =
  | { kind: "member"; userId: string }
  | { kind: "schedule" };

export type CommunityTurnAudience =
  | { kind: "asker" }
  | { kind: "channel"; channelId: string | null }
  | { kind: "founder" };

export type CommunityTurnContract = {
  version: 1;
  surface: CommunityTurnSurface;
  communityId: string;
  speaker: CommunityTurnSpeaker;
  audience: CommunityTurnAudience;
  uses: {
    // Shared layers: drawn for the audience, cached per community.
    communityCard: boolean;
    handbook: boolean;
    // The asker's global profile (name, bio, timezone).
    askerProfile: boolean;
  };
  // Groups requests that share a prompt prefix; never carries user content.
  cacheKey: string;
};

export function buildCommunityTurnContract(args: {
  surface: CommunityTurnSurface;
  communityId: string;
  speakerUserId?: string | null;
  channelId?: string | null;
}): CommunityTurnContract {
  const communityId = String(args.communityId ?? "").trim();
  if (!communityId) throw new Error("community_turn_contract_requires_community");
  const speakerUserId = String(args.speakerUserId ?? "").trim();
  const speaker: CommunityTurnSpeaker = args.surface === "steward" || !speakerUserId
    ? { kind: "schedule" }
    : { kind: "member", userId: speakerUserId };
  if ((args.surface === "ask" || args.surface === "ask_in_conversation") && speaker.kind !== "member") {
    throw new Error("community_turn_contract_ask_requires_member");
  }
  const audience: CommunityTurnAudience = args.surface === "tag"
    ? { kind: "channel", channelId: String(args.channelId ?? "").trim() || null }
    : args.surface === "steward" ? { kind: "founder" } : { kind: "asker" };
  return {
    version: 1,
    surface: args.surface,
    communityId,
    speaker,
    audience,
    uses: {
      communityCard: true,
      handbook: true,
      // Only a private Ask outside a community conversation reads the
      // asker's own profile; a channel or the founder never sees it.
      askerProfile: args.surface === "ask",
    },
    cacheKey: `pn:${communityId}:${args.surface === "ask_in_conversation" ? "ask" : args.surface}`,
  };
}

// The receipt's view of the contract: what this turn was allowed to use.
export function summarizeCommunityTurnContract(contract: CommunityTurnContract) {
  return {
    version: contract.version,
    surface: contract.surface,
    speaker: contract.speaker.kind,
    audience: contract.audience.kind,
    uses: contract.uses,
  };
}
