import { CommunityNav } from "../../../../shared/CommunityNav";
import { webDestinationHasCommunityNavSelection } from "../../../../shared/webAppRouteState";
import type { WebCommunityShellProps } from "./webShellChromeShared";

type WebCommunityNavSurfaceProps = {
  communityShell: WebCommunityShellProps;
  presentation: "desktop" | "mobile-home";
};

export function WebCommunityNavSurface({
  communityShell,
  presentation,
}: WebCommunityNavSurfaceProps) {
  const isMobileHome = presentation === "mobile-home";
  const hasDestinationSelection =
    !isMobileHome &&
    webDestinationHasCommunityNavSelection(communityShell.destination);

  return (
    <CommunityNav
      activeCommunity={communityShell.activeCommunity}
      communitySwitcher={
        isMobileHome
          ? null
          : {
              communities: communityShell.railCommunities,
              selectedCommunitySlug: communityShell.selectedActiveCommunitySlug,
              attentionByCommunityId: communityShell.communityRailAttentionById,
              isLoading: communityShell.isLoadingCommunities,
              onOpenDiscover: communityShell.onOpenDiscover,
              onOpenCreate: communityShell.onOpenCommunityCreateCta,
              onSelectCommunity: (community) => {
                const selected =
                  communityShell.onSelectActiveCommunity(community);
                if (!selected) return false;
                const communitySlug = String(community.slug ?? "").trim();
                if (communitySlug) {
                  communityShell.onOpenCommunityHome(communitySlug);
                }
                return true;
              },
            }
      }
      hideIdentitySettings={isMobileHome}
      communityTab={communityShell.communityTab}
      activeSelectionMode={hasDestinationSelection ? "route" : "none"}
      tabIndicators={communityShell.communityTabIndicators}
      channels={communityShell.communityChannels}
      isLoadingChannels={communityShell.isLoadingCommunityChannels}
      selectedChannelSlug={
        isMobileHome ? null : communityShell.selectedCommunityChannelSlug
      }
      channelIndicators={communityShell.communityChannelIndicators}
      onSelectChannel={communityShell.onSelectCommunityChannel}
      onCreateChannel={communityShell.onCreateCommunityChannel}
      isCreatingChannel={communityShell.isCreatingCommunityChannel}
      createChannelError={communityShell.communityChannelCreateError}
      clearCreateChannelError={communityShell.clearCommunityChannelCreateError}
      isAtChannelLimit={communityShell.isAtCommunityChannelLimit}
      maxActiveChannels={communityShell.maxActiveCommunityChannels}
      onReorderChannels={
        isMobileHome ? undefined : communityShell.onReorderCommunityChannels
      }
      isReorderingChannels={communityShell.isReorderingCommunityChannels}
      reorderChannelsError={communityShell.communityChannelReorderError}
      clearReorderChannelsError={
        communityShell.clearCommunityChannelReorderError
      }
      canViewMembersActiveCommunity={
        communityShell.canViewMembersActiveCommunity
      }
      canViewActiveCommunitySettings={
        communityShell.canViewActiveCommunitySettings
      }
      canManageMembersActiveCommunity={
        communityShell.canManageMembersActiveCommunity
      }
      canViewActiveCommunityAnalytics={
        communityShell.canViewActiveCommunityAnalytics
      }
      memberCount={
        isMobileHome ? communityShell.activeCommunityMemberCount : null
      }
      onOpenMembers={isMobileHome ? communityShell.onOpenMembers : undefined}
      isLoadingAccess={communityShell.isLoadingCommunityAccess}
      lockedTabs={communityShell.lockedCommunityNavTabs ?? undefined}
      onCopyCommunityJoinLink={communityShell.onCopyCommunityJoinLink}
      onSelectTab={
        isMobileHome
          ? communityShell.onSelectCommunityTabFromMobile
          : communityShell.onSelectCommunityTab
      }
    />
  );
}
