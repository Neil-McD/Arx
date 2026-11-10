import { CommunityNav } from "../../../../shared/CommunityNav";
import { webDestinationHasCommunityNavSelection } from "../../../../shared/webAppRouteState";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { WebAccountMenu } from "./WebAccountMenu";
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
  const useV1Layout = !isMobileHome && isDesignV1Active();
  const hasDestinationSelection =
    !isMobileHome &&
    webDestinationHasCommunityNavSelection(communityShell.destination);

  return (
    <CommunityNav
      activeCommunity={communityShell.activeCommunity}
      hideIdentitySettings={isMobileHome}
      communityTab={communityShell.communityTab}
      activeSelectionMode={hasDestinationSelection ? "route" : "none"}
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
      isLoadingAccess={communityShell.isLoadingCommunityAccess}
      onCopyCommunityJoinLink={communityShell.onCopyCommunityJoinLink}
      onSelectTab={
        isMobileHome
          ? communityShell.onSelectCommunityTabFromMobile
          : communityShell.onSelectCommunityTab
      }
      layout={useV1Layout ? "v1" : "classic"}
      accountSlot={useV1Layout && communityShell.account ? <WebAccountMenu {...communityShell.account} /> : null}
    />
  );
}
