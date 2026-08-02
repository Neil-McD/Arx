import { CommunityNav } from "../../../../shared/CommunityNav";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { shouldShowFirstResolutionSkeleton } from "../../../../shared/shellLoadingPresentation";
import { WebMobileBottomRail } from "./WebMobileBottomRail";
import { WebMobileDrawer } from "./WebMobileDrawer";
import type { WebCommunityShellProps } from "./webShellChromeShared";

type WebMobileCommunityShellProps = {
  communityShell: WebCommunityShellProps;
};

export function WebMobileCommunityShell(props: WebMobileCommunityShellProps) {
  const { communityShell } = props;
  const showCommunitySelectorSkeleton = shouldShowFirstResolutionSkeleton({
    isLoading: communityShell.isLoadingCommunities,
    hasResolved: communityShell.hasResolvedCommunities,
    contentCount: communityShell.railCommunities.length,
  });

  if (!communityShell.showMobileShell) return null;

  return (
    <>
      <WebMobileDrawer
        isOpen={communityShell.mobileOverlay === "community"}
        ariaLabel="Community navigation"
        className="mobile-community-drawer"
        hideHeader
        footer={
          <div className="mobile-agent-drawer-footer">
            <button
              type="button"
              className="mobile-agent-drawer-settings-link"
              onClick={communityShell.onOpenMobileAgentSettings}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </button>
          </div>
        }
        onClose={() => communityShell.setMobileOverlay(null)}
      >
        <CommunityNav
          activeCommunity={communityShell.activeCommunity}
          communityTab={communityShell.communityTab}
          tabIndicators={communityShell.communityTabIndicators}
          channels={communityShell.communityChannels}
          hasResolvedChannels={communityShell.hasResolvedCommunityChannels}
          isLoadingChannels={communityShell.isLoadingCommunityChannels}
          isResolvingInitialAccess={communityShell.isResolvingInitialCommunityAccess}
          selectedChannelSlug={communityShell.selectedCommunityChannelSlug}
          channelIndicators={communityShell.communityChannelIndicators}
          onSelectChannel={(channel) => {
            communityShell.setMobileOverlay(null);
            communityShell.onSelectCommunityChannel(channel);
          }}
          onCreateChannel={async (name) => {
            const created = await communityShell.onCreateCommunityChannel(name);
            if (created) communityShell.setMobileOverlay(null);
            return created;
          }}
          isCreatingChannel={communityShell.isCreatingCommunityChannel}
          createChannelError={communityShell.communityChannelCreateError}
          clearCreateChannelError={communityShell.clearCommunityChannelCreateError}
          isAtChannelLimit={communityShell.isAtCommunityChannelLimit}
          maxActiveChannels={communityShell.maxActiveCommunityChannels}
          canViewMembersActiveCommunity={communityShell.canViewMembersActiveCommunity}
          canViewActiveCommunitySettings={communityShell.canViewActiveCommunitySettings}
          canViewActiveCommunityPolynet={communityShell.canViewActiveCommunityPolynet}
          canManageMembersActiveCommunity={communityShell.canManageMembersActiveCommunity}
          canPresentManageMembersActiveCommunity={communityShell.canPresentManageMembersActiveCommunity}
          canViewActiveCommunityAnalytics={communityShell.canViewActiveCommunityAnalytics}
          lockedTabs={communityShell.lockedCommunityNavTabs ?? undefined}
          buttonType="button"
          includeButtonTitles
          showPolynetItem={false}
          onCopyCommunityJoinLink={communityShell.onCopyCommunityJoinLink}
          onSelectTab={communityShell.onSelectCommunityTabFromMobile}
        />
      </WebMobileDrawer>

      {communityShell.mobileOverlay === "community_selector" ? (
        <div className="mobile-community-menu-shell" aria-hidden={false}>
          <button
            type="button"
            className="mobile-community-menu-backdrop"
            aria-label="Close communities menu"
            onClick={() => communityShell.setMobileOverlay(null)}
          />
          <div className="mobile-community-menu" role="menu" aria-label="Communities">
            <div className="mobile-community-selector">
              <div className="mobile-community-selector-actions">
                <button
                  type="button"
                  className="mobile-community-selector-item mobile-community-selector-item-action"
                  onClick={() => {
                    communityShell.setMobileOverlay(null);
                    communityShell.onOpenDiscover();
                  }}
                >
                  <span className="mobile-community-selector-action-avatar" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M16.5 7.5l-3.2 8.1-8.1 3.2 3.2-8.1 8.1-3.2z" />
                      <circle
                        cx="12"
                        cy="12"
                        r="1.6"
                        className="mobile-community-selector-action-dot"
                      />
                    </svg>
                  </span>
                  <span className="mobile-community-selector-name">Discover</span>
                </button>
                <button
                  type="button"
                  className="mobile-community-selector-item mobile-community-selector-item-action"
                  onClick={communityShell.onOpenMobileCreateCommunity}
                >
                  <span className="mobile-community-selector-action-avatar" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                  <span className="mobile-community-selector-name">Create</span>
                </button>
              </div>
              <div className="mobile-community-selector-section">
                <div className="mobile-community-selector-divider" aria-hidden="true" />
                <div className="mobile-community-selector-section-label">My communities</div>
              </div>
              {showCommunitySelectorSkeleton ? (
                <div
                  className="mobile-community-selector-list mobile-community-selector-skeleton"
                  aria-hidden="true"
                >
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="mobile-community-selector-item">
                      <span className="mobile-community-selector-avatar web-skeleton-block" />
                      <span className="mobile-community-selector-skeleton-name web-skeleton-row" />
                    </div>
                  ))}
                </div>
              ) : communityShell.communities.length > 0 ? (
                <div className="mobile-community-selector-list">
                  {communityShell.railCommunities.map((community) => {
                    const isActive =
                      String(community.slug ?? "").trim() ===
                      communityShell.selectedActiveCommunitySlug;
                    return (
                      <button
                        key={community.id}
                        type="button"
                        className={`mobile-community-selector-item${
                          isActive ? " active" : ""
                        }`}
                        onClick={() => {
                          communityShell.setMobileOverlay(null);
                          const changed =
                            communityShell.onSelectActiveCommunity(community);
                          if (!changed) return;
                          const nextCommunitySlug = String(
                            community.slug ?? "",
                          ).trim();
                          if (nextCommunitySlug) {
                            communityShell.onOpenCommunityChat(nextCommunitySlug);
                          }
                        }}
                      >
                        <CommunityAvatar
                          className="mobile-community-selector-avatar"
                          imageUrl={community.avatar_url}
                          focusX={community.avatar_focus_x}
                          focusY={community.avatar_focus_y}
                          zoom={community.avatar_zoom}
                          name={community.name}
                          fallback={communityShell.communityInitials(community.name)}
                          fallbackClassName="mobile-community-selector-initials"
                        />
                        <span className="mobile-community-selector-name">
                          {community.name}
                        </span>
                        {isActive ? (
                          <span
                            className="mobile-community-selector-check"
                            aria-hidden="true"
                          >
                            <svg viewBox="0 0 24 24">
                              <path d="m5 13 4 4L19 7" />
                            </svg>
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mobile-community-selector-empty">
                  Your communities will show here after you join one.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <WebMobileBottomRail communityShell={communityShell} />
    </>
  );
}
