export type CommunityAttentionRecord = {
  chat: boolean;
  resources: boolean;
  events: boolean;
  mentions: boolean;
  channels: ReadonlyArray<{
    channel_slug: string;
    chat: boolean;
    mentions: boolean;
  }>;
};

const EMPTY_ATTENTION: CommunityAttentionRecord = {
  chat: false,
  resources: false,
  events: false,
  mentions: false,
  channels: [],
};

export function buildWebCommunityAttentionView(params: {
  activeCommunityId: string | null;
  attentionByCommunityId: Record<string, CommunityAttentionRecord>;
}) {
  const activeIndicators = params.activeCommunityId
    ? (params.attentionByCommunityId[params.activeCommunityId] ?? EMPTY_ATTENTION)
    : EMPTY_ATTENTION;

  const communityChannelIndicators: Record<string, { chat: boolean; mentions: boolean }> = {};
  if (params.activeCommunityId && params.attentionByCommunityId[params.activeCommunityId]) {
    for (const channel of activeIndicators.channels) {
      communityChannelIndicators[channel.channel_slug] = {
        chat: channel.chat,
        mentions: channel.mentions,
      };
    }
    if (!communityChannelIndicators.general && activeIndicators.channels.length === 0) {
      communityChannelIndicators.general = {
        chat: activeIndicators.chat,
        mentions: activeIndicators.mentions,
      };
    }
  }

  const activeCommunityAttentionCount =
    Number(Boolean(activeIndicators.chat)) +
    Number(Boolean(activeIndicators.resources)) +
    Number(Boolean(activeIndicators.events));

  const communityTabIndicators = {
    chat: Boolean(activeIndicators.chat),
    resources: Boolean(activeIndicators.resources),
    events: Boolean(activeIndicators.events),
    // An unseen mention-of-you upgrades the chat dot to the accent variant.
    mentions: Boolean(activeIndicators.mentions),
  };

  const communityRailAttentionById: Record<string, boolean> = {};
  for (const [communityId, indicators] of Object.entries(params.attentionByCommunityId)) {
    if (indicators.chat || indicators.resources || indicators.events || indicators.mentions) {
      communityRailAttentionById[communityId] = true;
    }
  }

  return {
    activeCommunityAttentionSummary: activeIndicators,
    activeCommunityAttentionCount,
    communityChannelIndicators,
    communityTabIndicators,
    communityRailAttentionById,
  };
}
