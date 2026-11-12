import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { CommunityNav } from "../../../../shared/CommunityNav";
import { webDestinationHasCommunityNavSelection } from "../../../../shared/webAppRouteState";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { WebAccountMenu } from "./WebAccountMenu";
import { WebCommunitySwitcher } from "./WebCommunitySwitcher";
import type { WebCommunityShellProps } from "./webShellChromeShared";
import { WebCommunityCommandPalette } from "./WebCommunityCommandPalette";

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
    <>
    {useV1Layout ? <WebCommunityCommandPalette communityShell={communityShell} /> : null}
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
      identityIsCover={useV1Layout}
      accountSlot={useV1Layout && communityShell.account
        ? (communityItems) => <WebAccountMenu {...communityShell.account!} communityItems={communityItems} />
        : null}
      identitySlot={
        useV1Layout && communityShell.account && communityShell.activeCommunity ? (
          <WebCommunitySwitcher
            activeCommunityName={communityShell.activeCommunity.name}
            mark={
              <CommunityAvatar
                communityId={communityShell.activeCommunity.id}
                visualIdentity={communityShell.activeCommunity.visual_identity}
                className="community-switcher-mark-avatar"
                imageUrl={communityShell.activeCommunity.avatar_url}
                focusX={communityShell.activeCommunity.avatar_focus_x}
                focusY={communityShell.activeCommunity.avatar_focus_y}
                zoom={communityShell.activeCommunity.avatar_zoom}
                name={communityShell.activeCommunity.name}
              />
            }
            communities={communityShell.railCommunities}
            selectedCommunitySlug={communityShell.selectedActiveCommunitySlug}
            attentionById={communityShell.communityRailAttentionById}
            onSelectCommunity={communityShell.onSelectActiveCommunity}
            onOpenDiscover={communityShell.onOpenDiscover}
            onCreateCommunity={communityShell.onOpenCommunityCreateCta}
            cover={{
              bannerUrl: communityShell.activeCommunity.banner_url ?? null,
              focusX: communityShell.activeCommunity.banner_focus_x,
              focusY: communityShell.activeCommunity.banner_focus_y,
            }}
          />
        ) : null
      }
      onOpenInbox={useV1Layout && communityShell.canOpenDirectMessages ? communityShell.onToggleDirectMessages : undefined}
      isInboxOpen={communityShell.isDirectMessagesOpen}
      inboxUnreadCount={communityShell.directMessagesUnreadCount}
      onOpenMembers={useV1Layout ? communityShell.onOpenMembers : undefined}
      memberCount={communityShell.activeCommunityMemberCount}
      onOpenGuide={useV1Layout && communityShell.onOpenCommunitySettingsPane
        ? () => communityShell.onOpenCommunitySettingsPane?.("agent")
        : undefined}
    />
    </>
  );
}
