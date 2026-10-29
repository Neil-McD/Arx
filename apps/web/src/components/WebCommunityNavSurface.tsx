import { CommunityNav } from "../../../../shared/CommunityNav";
import { webDestinationHasCommunityNavSelection } from "../../../../shared/webAppRouteState";
import type { WebCommunityShellProps } from "./webShellChromeShared";
import { podsAwaitingPeople } from "./WebCommunityPods";

type WebCommunityNavSurfaceProps = {
  communityShell: WebCommunityShellProps;
  presentation: "desktop" | "mobile-home";
  personalPodIds?: string[];
  // Test members' personal pods stay out of the list (open one by link if needed).
  hiddenPodIds?: string[];
};

export function WebCommunityNavSurface({
  communityShell,
  presentation,
  personalPodIds,
  hiddenPodIds,
}: WebCommunityNavSurfaceProps) {
  const isMobileHome = presentation === "mobile-home";
  const hasDestinationSelection =
    !isMobileHome &&
    webDestinationHasCommunityNavSelection(communityShell.destination);

  return (
    <CommunityNav
      memberNextStep={communityShell.memberNextStep}
      activeCommunity={communityShell.activeCommunity}
      // The banner gear moved to Settings at the top right (WebAccountSettingsButton).
      hideIdentitySettings
      communityTab={communityShell.communityTab}
      activeSelectionMode={hasDestinationSelection ? "route" : "none"}
      tabIndicators={communityShell.communityTabIndicators}
      channels={hiddenPodIds?.length ? communityShell.communityChannels.filter((channel) => !hiddenPodIds.includes(channel.id) || channel.slug === communityShell.selectedCommunityChannelSlug) : communityShell.communityChannels}
      personalPodIds={personalPodIds}
      isLoadingChannels={communityShell.isLoadingCommunityChannels}
      selectedChannelSlug={isMobileHome ? null : communityShell.selectedCommunityChannelSlug}
      channelIndicators={communityShell.communityChannelIndicators}
      onSelectChannel={communityShell.onSelectCommunityChannel}
      onCreateChannel={async (name, accessMode) => {
        const created = await communityShell.onCreateCommunityChannel(name, accessMode);
        // A new pod opens straight onto choosing who's in it.
        const id = (created as { id?: unknown } | null)?.id;
        if (accessMode === "restricted" && typeof id === "string") podsAwaitingPeople.add(id);
        return created;
      }}
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
    />
  );
}
