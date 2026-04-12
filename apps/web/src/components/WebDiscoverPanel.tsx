import type { DiscoverCommunitySnapshot } from "../../../../shared/communityTypes";
import { DiscoverCommunityCard } from "../../../../shared/DiscoverCommunityCard";

type WebDiscoverPanelProps = {
  showMobileShell: boolean;
  discoverQuery: string;
  onChangeDiscoverQuery: (value: string) => void;
  isLoadingDiscover: boolean;
  onRefreshDiscover: () => void;
  discoverCommunitiesCount: number;
  discoverError: string | null;
  filteredDiscoverCommunities: DiscoverCommunitySnapshot[];
  formatPlanPrice: (plan: DiscoverCommunitySnapshot["active_plan"]) => string;
  formatCommunityVisibilityLabel: (visibility: DiscoverCommunitySnapshot["visibility"]) => string;
  isPublishedCommunityVisibility: (visibility: DiscoverCommunitySnapshot["visibility"]) => boolean;
  onActivateCommunity: (slug: string) => void;
};

export function WebDiscoverPanel(props: WebDiscoverPanelProps) {
  const {
    showMobileShell,
    discoverQuery,
    onChangeDiscoverQuery,
    isLoadingDiscover,
    onRefreshDiscover,
    discoverCommunitiesCount,
    discoverError,
    filteredDiscoverCommunities,
    formatPlanPrice,
    formatCommunityVisibilityLabel,
    isPublishedCommunityVisibility,
    onActivateCommunity,
  } = props;

  return (
    <div className="community-panel discover-panel">
      <div className="discover-hero">
        <div className="discover-hero-copy">
          <div className="discover-title">Discover communities</div>
          <div className="discover-subtitle">
            Find focused crews to build, learn, and ship faster.
          </div>
        </div>
        {!showMobileShell ? (
          <div className="discover-controls">
            <input
              className="discover-search"
              type="text"
              placeholder="Search communities…"
              value={discoverQuery}
              onChange={(event) => onChangeDiscoverQuery(event.target.value)}
            />
            <button
              className="discover-refresh"
              type="button"
              disabled={isLoadingDiscover}
              onClick={onRefreshDiscover}
            >
              {isLoadingDiscover ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        ) : null}
      </div>
      <div className="workspace-body chat-feed">
        <div className="chat-messages discover-scroll">
          <div className="discover-grid">
            {isLoadingDiscover && discoverCommunitiesCount === 0 ? (
              <>
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={`discover-skeleton-${idx}`}
                    className="discover-card discover-card-skeleton"
                    aria-hidden="true"
                  >
                    <div className="discover-card-banner web-skeleton-block" />
                    <div className="discover-card-body">
                      <div className="discover-card-header">
                        <div className="discover-card-avatar web-skeleton-block" />
                        <div className="discover-card-meta">
                          <div className="discover-card-name-row">
                            <div className="web-skeleton-row discover-skeleton-name" />
                            <div className="web-skeleton-pill discover-skeleton-price" />
                            <div className="discover-visibility-icon discover-skeleton-visibility web-skeleton-block" />
                          </div>
                          <div className="web-skeleton-row discover-skeleton-slug" />
                        </div>
                      </div>
                      <div className="web-skeleton-row discover-skeleton-desc" />
                      <div className="web-skeleton-row discover-skeleton-desc discover-skeleton-desc-short" />
                    </div>
                  </div>
                ))}
              </>
            ) : null}
            {!isLoadingDiscover && discoverError ? <div className="auth-error">{discoverError}</div> : null}
            {!isLoadingDiscover && !discoverError && filteredDiscoverCommunities.length === 0 ? (
              <div className="discover-empty">
                <div className="discover-empty-title">No communities yet.</div>
                <div className="discover-empty-text">Create one to make discovery meaningful.</div>
              </div>
            ) : null}
            {filteredDiscoverCommunities.map((community) => {
              const priceLabel = community.active_plan ? formatPlanPrice(community.active_plan) : "Free";
              const visibilityLabel = formatCommunityVisibilityLabel(community.visibility);
              const visibilityClass = isPublishedCommunityVisibility(community.visibility)
                ? "published"
                : "unlisted";
              const oneLiner =
                community.one_liner && community.one_liner.trim().length > 0
                  ? community.one_liner
                  : "No one-liner yet.";
              const canActivate = Boolean(community.slug);
              return (
                <DiscoverCommunityCard
                  key={community.slug}
                  name={community.name}
                  slug={community.slug}
                  oneLiner={oneLiner}
                  avatarUrl={community.avatar_url}
                  bannerUrl={community.banner_url}
                  bannerFocusX={community.banner_focus_x}
                  bannerFocusY={community.banner_focus_y}
                  bannerZoom={community.banner_zoom}
                  priceLabel={priceLabel}
                  visibilityClass={visibilityClass}
                  visibilityLabel={visibilityLabel}
                  isPublishedVisibility={isPublishedCommunityVisibility(community.visibility)}
                  clickable={canActivate}
                  ariaLabel={canActivate ? `View ${community.name}` : undefined}
                  onActivate={canActivate ? () => onActivateCommunity(community.slug) : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>
      {showMobileShell ? (
        <div className="discover-bottom-bar">
          <div className="discover-controls">
            <input
              className="discover-search"
              type="text"
              placeholder="Search communities…"
              value={discoverQuery}
              onChange={(event) => onChangeDiscoverQuery(event.target.value)}
            />
            <button
              className="discover-refresh"
              type="button"
              disabled={isLoadingDiscover}
              onClick={onRefreshDiscover}
            >
              {isLoadingDiscover ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
