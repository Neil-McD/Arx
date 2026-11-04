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
  // How many recent conversation turns (the current one included) a turn may
  // carry. Older turns stay stored; they just don't ride along.
  historyTurns: number;
  // Channel speech. "draft_only": the agent never posts, replies, edits or
  // deletes in a channel for anyone; it writes the draft in its answer and the
  // member sends it. "own_voice": the agent may post as itself.
  channelWrites: "draft_only" | "own_voice";
  // Community notes (memory/): "agent" lets the agent save what is worth
  // sharing with everyone; "none" keeps the turn from writing notes.
  notesWrites: "agent" | "none";
};

export const COMMUNITY_TURN_HISTORY_TURNS = 20;

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
    historyTurns: COMMUNITY_TURN_HISTORY_TURNS,
    // A member's Ask or tag never becomes a post: the answer (or the tag's
    // reply) is the agent's only speech. Only the steward speaks on its own.
    channelWrites: args.surface === "steward" ? "own_voice" : "draft_only",
    notesWrites: args.surface === "steward" ? "none" : "agent",
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
    history_turns: contract.historyTurns,
    channel_writes: contract.channelWrites,
    notes_writes: contract.notesWrites,
  };
}

const CHANNEL_WRITE_PATH = /^\/communities\/[^/]+\/channels(?:\/|$)/;
const NOTES_WRITE_PATH = /^\/communities\/[^/]+\/memory(?:\/|$)/;

export const PRIVATE_SOURCE_NOTE_REFUSAL_MESSAGE =
  "This turn read a private room or owner-only data, so it can't write a community note. Answer the member without saving one.";

// What a turn has seen so far: a tool result from a private room or owner-only
// data (private_room) locks community notes for the rest of the turn.
export type CommunityTurnToolState = { sawPrivateSource: boolean };

export function toolOutputSawPrivateSource(outputText: string): boolean {
  return /"private_room"\s*:\s*true/.test(String(outputText ?? ""));
}

export const DRAFT_ONLY_REFUSAL_MESSAGE =
  "You never post, reply, edit or delete in a channel for anyone. Write the post in your answer as a draft, say which channel it belongs in, and ask the member to post it themselves.";

// Checked before every tool call of a turn: what the contract forbids never
// reaches a tool.
export function checkCommunityTurnToolCall(
  contract: CommunityTurnContract | null,
  toolName: string,
  args: unknown,
  state: CommunityTurnToolState = { sawPrivateSource: false },
): { ok: true } | { ok: false; errorCode: "draft_only" | "notes_not_allowed" | "private_source_read"; errorMessage: string } {
  if (toolName !== "polynet_write") return { ok: true };
  const path = String((args as { path?: unknown } | null)?.path ?? "").trim().replace(/\/{2,}/g, "/");
  if (NOTES_WRITE_PATH.test(path)) {
    if (contract && contract.notesWrites !== "agent") {
      return { ok: false, errorCode: "notes_not_allowed", errorMessage: "This turn can't write community notes." };
    }
    if (state.sawPrivateSource) {
      return { ok: false, errorCode: "private_source_read", errorMessage: PRIVATE_SOURCE_NOTE_REFUSAL_MESSAGE };
    }
    return { ok: true };
  }
  if (!contract || contract.channelWrites !== "draft_only" || !CHANNEL_WRITE_PATH.test(path)) return { ok: true };
  return { ok: false, errorCode: "draft_only", errorMessage: DRAFT_ONLY_REFUSAL_MESSAGE };
}
