// V1 capacity policy. General occupies one shared slot; archived rooms occupy none.
export const MAX_SHARED_COMMUNITY_CHANNELS = 10;
export const MAX_PRIVATE_COMMUNITY_CHANNELS = 100;
export const MAX_TOTAL_COMMUNITY_CHANNELS = MAX_SHARED_COMMUNITY_CHANNELS + MAX_PRIVATE_COMMUNITY_CHANNELS;

export function communityChannelCapacity(channels: Array<{ access_mode?: string; is_general?: boolean }>) {
  const privateCount = channels.filter(channel => channel.access_mode === "restricted").length;
  const sharedCount = channels.length - privateCount;
  return {
    sharedFull: sharedCount >= MAX_SHARED_COMMUNITY_CHANNELS,
    privateFull: privateCount >= MAX_PRIVATE_COMMUNITY_CHANNELS,
  };
}

export function communityChannelCapacityError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("community_shared_channel_limit_reached")) return "All 10 shared channel slots are in use.";
  if (message.includes("community_private_channel_limit_reached")) return "All 100 invite-only channel slots are in use.";
  if (message.includes("community_channel_refresh_required")) return "Refresh Polynet to load this community's channels.";
  return null;
}
