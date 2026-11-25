import { CommunityChannelSessionContext } from "./CommunityChannelSessionContext";
import { CommunityMembersPagePanel } from "./ChannelRosterPanel";
import type { CommunityAdmissionControl } from "./communityAdmissionTypes";
import type { WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import { communityRosterProps } from "./WebCommunityInteractionProjection";

// Members, a page of the community (/c/:slug/members; Nov 17). It used to be
// the channel's people panel taking over the feed, so a channel always loaded
// underneath it. It draws in the feed's frame (the same grid its styles use),
// with no channel, no feed and no composer.
export function WebCommunityMembersPage(props: {
  chatPanelProps: WebCommunityChatPanelProps;
  admission?: CommunityAdmissionControl;
}) {
  const panel = props.chatPanelProps;
  const projection = panel.interactionProjection;
  const community = panel.activeCommunity;
  if (!panel.session || !community || !projection) return null;
  const roster = communityRosterProps({
    ...projection,
    admission: props.admission,
    communityId: community.id,
    activeCommunityName: community.name,
    displayName: panel.displayName,
    getAvatarColor: panel.getAvatarColor,
    getInitials: panel.getInitials,
    onMessageUser: panel.onOpenDirectMessageFromCommunity
      ? (userId: string) => {
          if (!userId || userId === panel.sessionUserId) return;
          panel.onOpenDirectMessageFromCommunity?.(userId, community.id);
        }
      : undefined,
    profilesByUserId: {},
    formatChatTime: () => "",
    renderTextWithLinks: (text: string) => text,
  });
  return (
    <CommunityChannelSessionContext.Provider value={{ session: panel.session, communityId: community.id }}>
      <div className="community-chat community-member-chat community-members-page-host">
        <div className="workspace-body chat-feed">
          <div className="community-interaction-scroll">
            <div className="community-interaction-projection is-members-page">
              <CommunityMembersPagePanel key={community.id} {...roster} />
            </div>
          </div>
        </div>
      </div>
    </CommunityChannelSessionContext.Provider>
  );
}
