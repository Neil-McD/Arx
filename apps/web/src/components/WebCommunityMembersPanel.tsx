import type { WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import { useState } from "react";
import { WebCommunityMembersProfile } from "./WebCommunityMembersProfile";
import { CommunityInteractionContextPanelSurface } from "./WebCommunityInteractionProjection";

type WebCommunityMembersPanelProps = {
  chatPanelProps: WebCommunityChatPanelProps;
};

export function WebCommunityMembersPanel({
  chatPanelProps,
}: WebCommunityMembersPanelProps) {
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const {
    activeCommunity,
    hasAuthenticatedPresentation,
    isAuthRecoveringSignedIn,
    profilesByUserId,
    sessionUserId,
    displayName,
    getAvatarColor,
    getInitials,
    formatChatTime,
    renderTextWithLinks,
    onOpenDirectMessageFromCommunity,
    interactionProjection,
  } = chatPanelProps;

  const canMessageMember = Boolean(
    activeCommunity?.id &&
    onOpenDirectMessageFromCommunity,
  );

  return (
    <div className="community-members-page">
      {hasAuthenticatedPresentation &&
      !isAuthRecoveringSignedIn &&
      activeCommunity &&
      interactionProjection ? (
        selectedProfile ? (
          <WebCommunityMembersProfile key={selectedProfile} userId={selectedProfile} chat={chatPanelProps} onBack={() => setSelectedProfile(null)} />
        ) : <CommunityInteractionContextPanelSurface
          {...interactionProjection}
          onOpenProfile={setSelectedProfile}
          activeCommunityName={activeCommunity.name ?? "Community"}
          profilesByUserId={profilesByUserId}
          displayName={displayName}
          getAvatarColor={getAvatarColor}
          getInitials={getInitials}
          formatChatTime={formatChatTime}
          renderTextWithLinks={renderTextWithLinks}
          onMessageUser={canMessageMember
            ? (targetUserId) => {
                if (!activeCommunity.id || targetUserId === sessionUserId) return;
                onOpenDirectMessageFromCommunity?.(targetUserId, activeCommunity.id);
              }
            : undefined}
          containerClassName="community-interaction-drawer community-context-panel community-members-page-panel"
          ariaLabel={`${activeCommunity.name ?? "Community"} members`}
          sectionMode="members"
        />
      ) : (
        <div className="community-members-page-state">
          {activeCommunity ? "Loading community members..." : "Select a community to view members."}
        </div>
      )}
    </div>
  );
}
