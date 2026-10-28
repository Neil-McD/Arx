import type { ComponentProps } from "react";

import type { DiscoverCommunitySnapshot } from "../../../../shared/communityTypes";
import { DiscoverCommunityCard } from "../../../../shared/DiscoverCommunityCard";

type WebDiscoverPanelProps = {
  isLoadingDiscover: boolean;
  discoverCommunitiesCount: number;
  discoverError: string | null;
  discoverCommunities: DiscoverCommunitySnapshot[];
  formatPlanPrice: (plan: DiscoverCommunitySnapshot["active_plan"]) => string;
  onActivateCommunity: (community: DiscoverCommunitySnapshot) => void;
};

function buildDiscoverCommunityCardProps(args: {
  community: DiscoverCommunitySnapshot;
  formatPlanPrice: (
    plan: DiscoverCommunitySnapshot["active_plan"],
  ) => string;
  onActivateCommunity: (community: DiscoverCommunitySnapshot) => void;
}): ComponentProps<typeof DiscoverCommunityCard> {
  const { community } = args;
  return {
    name: community.name,
    communityId: community.id,
    visualIdentity: community.visual_identity,
    slug: community.slug,
    oneLiner: community.one_liner ?? "",
    avatarUrl: community.avatar_url,
    avatarFocusX: community.avatar_focus_x,
    avatarFocusY: community.avatar_focus_y,
    avatarZoom: community.avatar_zoom,
    bannerUrl: community.banner_url,
    bannerFocusX: community.banner_focus_x,
    bannerFocusY: community.banner_focus_y,
    bannerZoom: community.banner_zoom,
    priceLabel: args.formatPlanPrice(community.active_plan),
    clickable: true,
    ariaLabel: `Open ${community.name}`,
    onActivate: () => args.onActivateCommunity(community),
  };
}

export function WebDiscoverPanel(props: WebDiscoverPanelProps) {
  const {
    isLoadingDiscover,
    discoverCommunitiesCount,
    discoverError,
    discoverCommunities,
    formatPlanPrice,
    onActivateCommunity,
  } = props;

  return (
    <div className="community-panel discover-panel">
      <div className="discover-hero">
        <div className="discover-hero-copy">
          <div className="discover-title">Discover Communities</div>
          <div className="discover-subtitle">
            Find focused communities built around shared knowledge and practice.
          </div>
        </div>
      </div>
      <div className="workspace-body chat-feed">
        <div className="chat-messages discover-scroll">
          <div className="discover-grid">
            {isLoadingDiscover && discoverCommunitiesCount === 0 ? (
              <div className="discover-loading">Loading communities...</div>
            ) : null}
            {discoverError ? (
              <div className="discover-empty">{discoverError}</div>
            ) : null}
            {!isLoadingDiscover && !discoverError && discoverCommunities.length === 0 ? (
              <div className="discover-empty">No communities are available yet.</div>
            ) : null}
            {discoverCommunities.map((community) => (
              <DiscoverCommunityCard
                key={community.slug}
                {...buildDiscoverCommunityCardProps({
                  community,
                  formatPlanPrice,
                  onActivateCommunity,
                })}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
