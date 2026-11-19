// The dot on Pods (the left column) and on each pod on the Pods page. A pod is
// a channel for these signals: a quiet dot when someone posted since you last
// read it, the accent dot when someone tagged you there, the tag winning, just
// as a channel's row shows. Which pods give a quiet dot (only the ones you are
// in) is decided by the attention query; this only combines its rows.
export type RoomAttention = { chat: boolean; mentions: boolean };
export type PodsDot = "none" | "quiet" | "mention";

export function roomDot(indicator: RoomAttention | null | undefined): PodsDot {
  if (indicator?.mentions) return "mention";
  return indicator?.chat ? "quiet" : "none";
}

// The pods' rooms are the restricted channels; the room open now is being
// read, so it lights nothing (as a selected channel's row shows no dot).
export function podsAttentionDot(args: {
  channels: Array<{ slug: string; access_mode?: string | null }>;
  indicators: Record<string, RoomAttention>;
  openSlug?: string | null;
}): PodsDot {
  let dot: PodsDot = "none";
  for (const channel of args.channels) {
    if (channel.access_mode !== "restricted" || channel.slug === args.openSlug) continue;
    const room = roomDot(args.indicators[channel.slug]);
    if (room === "mention") return "mention";
    if (room === "quiet") dot = "quiet";
  }
  return dot;
}
