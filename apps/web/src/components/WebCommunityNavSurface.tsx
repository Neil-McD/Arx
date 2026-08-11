import { CommunityNav } from "../../../../shared/CommunityNav";
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

  return (
    <CommunityNav
      activeCommunity={communityShell.activeCommunity}
      hideIdentitySettings={isMobileHome}
      communityTab={communityShell.communityTab}
      tabIndicators={communityShell.communityTabIndicators}
      channels={communityShell.communityChannels}
      isLoadingChannels={communityShell.isLoadingCommunityChannels}
      selectedChannelSlug={isMobileHome ? null : communityShell.selectedCommunityChannelSlug}
      channelIndicators={communityShell.communityChannelIndicators}
      onSelectChannel={communityShell.onSelectCommunityChannel}
      onCreateChannel={communityShell.onCreateCommunityChannel}
      isCreatingChannel={communityShell.isCreatingCommunityChannel}
      createChannelError={communityShell.communityChannelCreateError}
      clearCreateChannelError={communityShell.clearCommunityChannelCreateError}
      isAtChannelLimit={communityShell.isAtCommunityChannelLimit}
      maxActiveChannels={communityShell.maxActiveCommunityChannels}
      onReorderChannels={isMobileHome ? undefined : communityShell.onReorderCommunityChannels}
      isReorderingChannels={communityShell.isReorderingCommunityChannels}
      reorderChannelsError={communityShell.communityChannelReorderError}
      clearReorderChannelsError={communityShell.clearCommunityChannelReorderError}
      canViewMembersActiveCommunity={communityShell.canViewMembersActiveCommunity}
      canViewActiveCommunitySettings={communityShell.canViewActiveCommunitySettings}
      canManageMembersActiveCommunity={communityShell.canManageMembersActiveCommunity}
      canViewActiveCommunityAnalytics={communityShell.canViewActiveCommunityAnalytics}
      memberCount={isMobileHome ? communityShell.activeCommunityMemberCount : null}
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
