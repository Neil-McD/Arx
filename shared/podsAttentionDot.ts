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

export const NAV_PODS_MAX = 3;

function combinedDot(
  channels: Array<{ slug: string }>,
  indicators: Record<string, RoomAttention>,
  openSlug?: string | null,
): PodsDot {
  let dot: PodsDot = "none";
  for (const channel of channels) {
    if (channel.slug === openSlug) continue;
    const room = roomDot(indicators[channel.slug]);
    if (room === "mention") return "mention";
    if (room === "quiet") dot = "quiet";
  }
  return dot;
}

// The pods' rooms are the restricted channels; the room open now is being
// read, so it lights nothing (as a selected channel's row shows no dot).
export function podsAttentionDot(args: {
  channels: Array<{ slug: string; access_mode?: string | null }>;
  indicators: Record<string, RoomAttention>;
  openSlug?: string | null;
}): PodsDot {
  const restricted = args.channels.filter((channel) => channel.access_mode === "restricted");
  return combinedDot(restricted, args.indicators, args.openSlug);
}

// Linear-style left-nav pods list: up to 3 pods the viewer is in, plus the
// rolled-up dot for all pods (when collapsed) and for overflow pods #4+ (when
// expanded so visible pod rows carry their own dots without duplication).
export function selectNavPods<T extends { slug: string; access_mode?: string | null }>(args: {
  channels: T[];
  indicators: Record<string, RoomAttention>;
  openSlug?: string | null;
  max?: number;
}): { shown: T[]; overflowDot: PodsDot; allDot: PodsDot } {
  const max = args.max ?? NAV_PODS_MAX;
  const restricted = args.channels.filter((channel) => channel.access_mode === "restricted");
  const shown = restricted.slice(0, max);
  const overflow = restricted.slice(max);
  return {
    shown,
    overflowDot: combinedDot(overflow, args.indicators, args.openSlug),
    allDot: combinedDot(restricted, args.indicators, args.openSlug),
  };
}
