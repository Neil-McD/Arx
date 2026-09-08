import { CommunityNav } from "../../../../shared/CommunityNav";
import { Settings } from "lucide-react";
import { WebCommunitySwitcher } from "./WebCommunitySwitcher";
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
      identityControl={!isMobileHome ? <WebCommunitySwitcher shell={communityShell} /> : undefined}
      footerControl={!isMobileHome ? <button type="button" className="nav-item" onClick={communityShell.onOpenGlobalSettings}>
        <span className="nav-icon"><Settings size={16} aria-hidden="true" /></span><span className="nav-item-label">Account settings</span>
      </button> : undefined}
      memberNextStep={communityShell.memberNextStep}
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
      memberCount={isMobileHome ? communityShell.activeCommunityMemberCount : null}
      onOpenMembers={communityShell.onOpenMembers}
      isMembersActive={communityShell.destination.kind === "community_members"}
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
