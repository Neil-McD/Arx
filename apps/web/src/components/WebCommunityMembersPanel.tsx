import type { WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import { useState } from "react";
import { useWebMemberDirectorySearch } from "../controllers/useWebMemberDirectorySearch";
import { WebCommunityMembersProfile } from "./WebCommunityMembersProfile";
import { CommunityInteractionContextPanelSurface } from "./WebCommunityInteractionProjection";

type WebCommunityMembersPanelProps = {
  chatPanelProps: WebCommunityChatPanelProps;
};

export function WebCommunityMembersPanel({
  chatPanelProps,
}: WebCommunityMembersPanelProps) {
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchResult = useWebMemberDirectorySearch(chatPanelProps, search);
  const searching = Boolean(search.trim());
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
        <>
        {selectedProfile ? (
          <WebCommunityMembersProfile key={selectedProfile} userId={selectedProfile} chat={chatPanelProps} onBack={() => setSelectedProfile(null)} />
        ) : null}
        <div className="community-members-directory" hidden={Boolean(selectedProfile)}>
        <header className="community-members-directory-header">
          <h1 className="resources-title">Members <span>{interactionProjection.communityMemberCount ?? ""}</span></h1>
          <input type="search" className="input-styled" aria-label="Search members by name" placeholder="Search members by name" value={search} maxLength={128} onChange={event => setSearch(event.target.value)} />
        </header>
        <CommunityInteractionContextPanelSurface
          {...interactionProjection}
          {...(searching ? {
            communityMembers: searchResult.rows,
            communityMemberCount: searchResult.rows.length,
            communityMembersHasMore: false,
            isLoadingCommunityMembers: searchResult.loading,
            isLoadingMoreCommunityMembers: false,
            communityMembersLoadError: null,
          } : {})}
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
        {searching ? <div className="community-members-search-status" role="status">
          {searchResult.loading ? "Searching members…" : searchResult.error ?? `${searchResult.rows.length} matches${searchResult.hasMore ? " so far" : ""}`}
          {!searchResult.loading && (searchResult.hasMore || searchResult.error) ? <button type="button" className="btn-secondary" onClick={searchResult.loadMore}>{searchResult.error ? "Retry search" : "Search further"}</button> : null}
        </div> : null}
        </div>
        </>
      ) : (
        <div className="community-members-page-state">
          {activeCommunity ? "Loading community members..." : "Select a community to view members."}
        </div>
      )}
    </div>
  );
}
