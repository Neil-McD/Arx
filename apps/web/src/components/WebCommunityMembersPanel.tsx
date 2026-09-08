import type { WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import { useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { copyTextToClipboard } from "../../../../shared/chatUi";
import { resolveCommunityJoinUrl } from "../../../../shared/CommunityNav";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import { WebPlatformRadioGroup } from "./WebPlatformChoiceControls";
import { useWebMemberDirectorySearch } from "../controllers/useWebMemberDirectorySearch";
import { WebCommunityMembersProfile } from "./WebCommunityMembersProfile";
import { CommunityInteractionContextPanelSurface } from "./WebCommunityInteractionProjection";

type WebCommunityMembersPanelProps = {
  chatPanelProps: WebCommunityChatPanelProps;
  communitySlug?: string | null;
  admission?: {
    mode: "open" | "approval" | null;
    canManage: boolean;
    pending: boolean;
    error: string | null;
    onChange: (mode: "open" | "approval") => Promise<void> | void;
  };
};

export function WebCommunityMembersPanel({
  chatPanelProps,
  admission,
  communitySlug,
}: WebCommunityMembersPanelProps) {
  const [inviteStatus, setInviteStatus] = useState("");
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
          <h1>Members <span>{interactionProjection.communityMemberCount ?? ""}</span></h1>
          {admission?.canManage && communitySlug ? <button type="button" className="secondary community-members-invite" aria-label="Copy community invite link" onClick={() => {
            const url = resolveCommunityJoinUrl(communitySlug);
            if (!url) return;
            void copyTextToClipboard(url).then(() => setInviteStatus("Invite link copied"), () => setInviteStatus("Could not copy invite link. Try again."));
          }}><UserPlus size={16} aria-hidden="true" /> Invite</button> : null}
        </header>
        {inviteStatus ? <div className="community-members-notice" role="status">{inviteStatus}</div> : null}
        <div className="community-members-toolbar">
          <label className="community-dm-recipient-search community-dm-inbox-search">
            <Search aria-hidden="true" />
            <input type="search" aria-label="Search members by name" placeholder="Search members by name" value={search} maxLength={128} onChange={event => setSearch(event.target.value)} />
          </label>
          {admission?.canManage && admission.mode ? <div className="community-members-admission" aria-busy={admission.pending}>
            <span title="Saves immediately. On allows free members to join and approves pending requests.">Auto-join</span>
            <WebPlatformRadioGroup options={[{id:"approval",label:"Off",disabled:admission.pending},{id:"open",label:"On",disabled:admission.pending}]}
              value={admission.mode} ariaLabel="Auto-join" style={buildPlatformSwitcherStyle(2, admission.mode === "open" ? 1 : 0)}
              onSelectValue={value => { if (!admission.pending && (value === "open" || value === "approval")) void admission.onChange(value); }} />
          </div> : null}
        </div>
        {admission?.error ? <div className="community-members-notice" role="alert">{admission.error}</div> : null}
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
          {searchResult.loading ? "Searching members…" : searchResult.error ?? `${searchResult.rows.length} ${searchResult.rows.length === 1 ? "match" : "matches"}${searchResult.hasMore ? " so far" : ""}`}
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
