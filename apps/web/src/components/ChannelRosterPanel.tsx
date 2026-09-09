import { Fragment, useContext, useEffect, useRef, useState, type ComponentProps } from "react";
import { MessageCircle, MoreHorizontal, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useWebMemberDirectorySearch } from "../controllers/useWebMemberDirectorySearch";
import { CommunityMemberSettingsDialog } from "./CommunityMemberSettingsDialog";
import { useMemberScrollPagination } from "./useMemberScrollPagination";
import { CommunityJoinRequestReview } from "./CommunityJoinRequestReview";
import { CommunityAutoJoinControl, type CommunityAdmissionControl } from "./CommunityAutoJoinControl";
import { ActorAvatar } from "./communityInteractionFeed";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { createCloudCommunityChatLiveClient } from "../../../../shared/cloudCommunityChatGateway";
import { subscribeCommunityPages } from "../../../../shared/subscribeCommunityPages";
import { communityPresenceLeaseIsActive, COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS } from "../../../../shared/communityPresenceContract";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { CommunityChannelSessionContext } from "./CommunityChannelSessionContext";
import { CommunityPresenceFacepile } from "./CommunityPresenceFacepile";
import { CommunityMemoryGraphPreview } from "./CommunityMemoryGraphPreview";
import type { CommunityPresenceSummary } from "../../../../shared/communityTypes";
import { createCloudCommunityPolynetLiveClient, subscribeCloudCommunityPolynetOverview, type CloudCommunityPolynetOverview } from "../../../../shared/cloudCommunityPolynetGateway";

type Page = FunctionReturnType<typeof api.communityChannelParticipants.listChannelRoster>;

type RosterProps = {
  memberDetailOpen?: boolean;
  narrowOpen?: boolean;
  onCloseNarrow?: () => void;
  joinReview?: ComponentProps<typeof CommunityJoinRequestReview>;
  admission?: CommunityAdmissionControl;
  communityName: string;
  presenceSummary?: CommunityPresenceSummary | null;
  isLoadingPresence?: boolean;
  channelId?: string;
  onOpenProfile?: (id: string) => void;
  onMessageUser?: (id: string) => void;
  currentUserId?: string | null;
  memberSettings: Omit<ComponentProps<typeof CommunityMemberSettingsDialog>, "member" | "onClose">;
  getAvatarColor: (id: string) => string;
  getInitials: (name: string) => string;
};

export function ChannelRosterPanel(props: RosterProps) {
  const scope = useContext(CommunityChannelSessionContext);
  const scopeKey = JSON.stringify([props.currentUserId, scope?.communityId, props.channelId]);
  return <ChannelRosterWorkspace key={scopeKey} {...props} />;
}

function ChannelRosterWorkspace(props: RosterProps) {
  const [membersOpen, setMembersOpen] = useState(false);
  return <>
    <RosterSurface {...props} onOpenMembers={() => setMembersOpen(true)} />
    {membersOpen ? <RosterSurface {...props} channelId={undefined} narrowOpen={false}
      onCloseNarrow={undefined} directory onCloseMembers={() => setMembersOpen(false)}
      onMessageUser={props.onMessageUser ? id => { setMembersOpen(false); props.onMessageUser?.(id); } : undefined} /> : null}
  </>;
}

// Both presentations share the same authorized readers, row rendering and actions.
function RosterSurface(props: RosterProps & {
  directory?: boolean;
  onOpenMembers?: () => void;
  onCloseMembers?: () => void;
}) {
  const scope = useContext(CommunityChannelSessionContext);
  const dialogRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!props.directory || props.memberDetailOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    searchRef.current?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, [props.directory, props.memberDetailOpen]);
  const [search, setSearch] = useState("");
  const searching = Boolean(search.trim());
  const searchResult = useWebMemberDirectorySearch({
    session: scope?.session,
    sessionUserId: props.currentUserId ?? null,
    activeCommunity: scope ? { id: scope.communityId, name: props.communityName } : null,
  }, search);
  useEffect(() => { setSearch(""); }, [scope?.communityId, props.channelId]);
  const backRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (props.narrowOpen && backRef.current?.getClientRects().length) backRef.current.focus();
  }, [props.narrowOpen]);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(false);
  const paginationRef = useRef<ReturnType<typeof subscribeCommunityPages<Page>> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [memory, setMemory] = useState<CloudCommunityPolynetOverview | null>(null);
  const [memoryError, setMemoryError] = useState(false);
  const [memoryRetry, setMemoryRetry] = useState(0);
  useEffect(() => {
    setMemory(null); setMemoryError(false);
    if (!scope || props.directory) return;
    let disposed = false;
    let close: (() => void) | undefined;
    let stop: (() => void) | undefined;
    try {
      const liveClient = createCloudCommunityPolynetLiveClient({ session: scope.session });
      close = liveClient.close;
      stop = subscribeCloudCommunityPolynetOverview({
        liveClient, communityId: scope.communityId, nodeLimit: 24,
        onUpdate: value => { if (!disposed) { setMemory(value); setMemoryError(false); } },
        onError: () => { if (!disposed) { setMemory(null); setMemoryError(true); } },
      });
    } catch { setMemoryError(true); }
    return () => { disposed = true; stop?.(); close?.(); };
  }, [scope?.session, scope?.communityId, memoryRetry, props.directory]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setPages([]); setComplete(false); setError(false); setLoadingMore(false);
    if (!scope) return;
    let close: (() => void) | undefined;
    let stop: (() => void) | undefined;
    try {
      const live = createCloudCommunityChatLiveClient({ session: scope.session });
      close = live.close;
      const pagination = subscribeCommunityPages<Page>({
        sections: ["shared"], maxPages: 1,
        watch: (_section, cursor) => live.client.watchQuery(api.communityChannelParticipants.listChannelRoster, {
          authSubject: live.authSubject, communityId: scope.communityId as Id<"communities">,
          channelId: props.channelId as Id<"communityChannels"> | undefined,
          paginationOpts: { numItems: 50, cursor },
        }),
        onUpdate: (next, done) => { setPages(next); setComplete(done); setError(false); setLoadingMore(false); },
        onError: () => { setPages([]); setError(true); setLoadingMore(false); },
      });
      paginationRef.current = pagination;
      stop = pagination;
    } catch { setError(true); }
    return () => { paginationRef.current = null; stop?.(); close?.(); };
  }, [scope?.session, scope?.communityId, props.channelId, retry]);
  const { membersViewportRef, loadMoreSentinelRef, handleMembersScroll } = useMemberScrollPagination({
    membersHasMore: searching ? searchResult.hasMore && !searchResult.paused : !complete,
    isLoadingMembers: searching ? false : !pages.length,
    isLoadingMoreMembers: searching ? searchResult.loading : loadingMore,
    membersLoadError: searching ? searchResult.error : error,
    onLoadMoreMembers: () => { if (searching) searchResult.loadMore(); else { setLoadingMore(true); paginationRef.current?.loadMore(); } },
  }, searching ? searchResult.progress : pages.length);
  const rosterMembers = [...new Map(pages.flatMap(page => page.page).map(member => [member.user_id, member])).values()];
  const members = searching ? searchResult.rows.map(member => ({
    user_id: member.user_id, role: member.role,
    membership_id: member.id.startsWith("owner:") ? undefined : member.id,
    membership_created_at: member.created_at,
    profile: member, last_seen_at: null, active_until: null,
  })) : rosterMembers;
  const selectedMember = props.memberSettings.canManageMembers
    ? members.find(member => member.membership_id === selectedMembershipId && member.role !== "owner") : undefined;
  useEffect(() => {
    if (selectedMembershipId && !selectedMember) setSelectedMembershipId(null);
  }, [selectedMembershipId, selectedMember]);
  const status = (member: typeof members[number]) => member.last_seen_at === null ? "unknown"
    : communityPresenceLeaseIsActive({ lastSeenAt: member.last_seen_at, activeUntil: member.active_until ?? undefined }, now) ? "online" : "offline";
  const ready = pages.length > 0;
  const settings = <CommunityMemberSettingsDialog {...props.memberSettings}
    member={selectedMember ? { ...selectedMember.profile, id: selectedMember.membership_id!, user_id: selectedMember.user_id, role: selectedMember.role, created_at: selectedMember.membership_created_at } : null}
    onClose={() => setSelectedMembershipId(null)} />;
  const content = <><aside className={props.directory ? "members-directory-content" : "community-context-panel channel-roster-panel"} aria-label={props.directory ? "Community members" : "Channel people and agents"}
    style={!props.directory && props.memberDetailOpen ? { display: "none" } : undefined}
    onKeyDown={event => {
      if (event.key === "Escape" && !event.defaultPrevented && props.narrowOpen) {
        event.preventDefault(); props.onCloseNarrow?.();
      }
    }}>
    {props.onCloseNarrow ? <div className="community-interaction-drawer-back channel-people-back">
      <button ref={backRef} className="back-to-workspace" type="button" onClick={props.onCloseNarrow}>
        <svg viewBox="0 0 24 24" className="back-icon" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        <span className="back-path">Back to channel</span>
      </button>
    </div> : null}
    {!props.directory ? <><div className="community-context-rail-head"><span className="community-context-rail-name">{props.communityName}</span></div>
    <CommunityPresenceFacepile faces={props.presenceSummary?.online_faces} onlineCount={props.presenceSummary?.online_count}
      onlineCountCapped={Boolean(props.presenceSummary?.online_count_capped)} isLoading={props.isLoadingPresence} />
    <div className="community-context-memory">
      <div className="community-context-memory-head"><div className="community-context-section">Memory{memory ? ` — ${memory.memory.total_visible_nodes}${memory.memory.node_counts_are_lower_bound ? "+" : ""}` : ""}</div></div>
      {memoryError ? <div role="status">Could not load memory. <button type="button" onClick={() => setMemoryRetry(value => value + 1)}>Retry</button></div>
        : memory ? <div className="community-context-memory-summary">
          <div className="community-context-memory-preview"><CommunityMemoryGraphPreview overview={memory} /></div>
          <div className="community-context-memory-status"><span>{(memory.agent.activity_state || memory.agent.status).replace(/_/g, " ").replace(/\b\w/g, value => value.toUpperCase())}</span></div>
        </div> : <div className="community-context-memory-summary" aria-label="Loading memory"><div className="community-context-memory-preview web-skeleton-block" /><div className="community-context-memory-loading-status web-skeleton-row" /></div>}
    </div></> : null}
    <div className="community-context-members" ref={membersViewportRef} onScroll={handleMembersScroll}>
      {error ? <p role="status">Channel roster unavailable. <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p>
        : !ready ? <p role="status">Loading channel roster…</p> : <>
          {!props.directory ? <><h3 className="community-context-section">Agents — {pages[0].agents.length}</h3>
          {pages[0].agents.length ? <div className="community-context-agent-list">
            {pages[0].agents.map(agent => <div className="community-context-member" key={agent.key}>
              <ActorAvatar seed={agent.key} label="Community agent" className="community-context-member-avatar"
                getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
              <span className="community-context-member-copy"><span className="community-context-member-name">Community agent</span></span>
            </div>)}
          </div> : <p className="community-context-members-status">No agents in this channel.</p>}</> : null}
        </>}
          <div className="community-context-members-total">
            <h3 className="community-context-section">People{!error && ready && complete ? ` — ${rosterMembers.length}` : ""}</h3>
            {props.directory ? <CommunityAutoJoinControl admission={props.admission} />
              : <button type="button" className="members-view-all" onClick={props.onOpenMembers}>View all</button>}
          </div>
          {props.directory ? <>{props.admission?.canManage && props.admission.error ? <div role="alert" className="community-context-admission-status">{props.admission.error}</div> : null}
          {props.joinReview ? <CommunityJoinRequestReview {...props.joinReview} /> : null}
          <label className="community-dm-recipient-search community-dm-inbox-search">
            <Search aria-hidden="true" />
            <input ref={searchRef} type="search" aria-label="Search community members" placeholder="Search community members" value={search} maxLength={128} onChange={event => setSearch(event.target.value)} />
          </label>
          </> : null}
      {(searching || (!error && ready)) ? <>
          {(["online", "offline", "unknown"] as const).map(group => {
            const rows = members.filter(member => status(member) === group);
            if (!rows.length) return null;
            return <Fragment key={group}>
              <h4 className="community-context-section" title="Online status reflects activity in this community">{searching ? "Community matches" : group === "unknown" ? "Presence unavailable" : group === "online" ? "Online" : "Offline"} — {rows.length}{!searching && !complete ? " loaded" : ""}</h4>
              {rows.map(member => {
                const name = member.profile.display_name || "Member";
                return <div key={member.user_id} className={`community-context-member${group === "offline" ? " is-offline" : ""}`}>
                  <button type="button" className="community-context-member-trigger" aria-label={`Open ${name}'s profile`} onClick={() => props.onOpenProfile?.(member.user_id)}>
                    <span className="community-context-member-avatar" style={!member.profile.avatar_url ? { color: props.getAvatarColor(member.user_id) } : undefined}>
                      <UserAvatar className="community-context-member-avatar-media" readyClassName="has-image"
                        name={name} imageUrl={member.profile.avatar_url}
                        focusX={member.profile.avatar_focus_x} focusY={member.profile.avatar_focus_y} zoom={member.profile.avatar_zoom}
                        alt="" aria-hidden={true} fallback={<span>{props.getInitials(name)}</span>} />
                      {group === "online" ? <span className="community-context-member-dot" aria-hidden="true" /> : null}
                    </span>
                    <span className="community-context-member-copy"><span className={`community-context-member-name${member.role === "owner" || member.role === "admin" ? " is-admin" : ""}`}>{name}</span></span>
                  </button>
                  {props.onMessageUser && member.user_id !== props.currentUserId ? <button type="button" className="community-context-member-action" aria-label={`Message ${name}`} title="Direct message" onClick={() => props.onMessageUser?.(member.user_id)}><MessageCircle size={16} strokeWidth={1.9} aria-hidden="true" /></button> : null}
                  {props.memberSettings.canManageMembers && member.membership_id && member.role !== "owner" ? <button type="button" className="community-context-member-action" aria-label={`Open settings for ${name}`} title="Member settings" onClick={() => setSelectedMembershipId(member.membership_id!)}><MoreHorizontal size={16} strokeWidth={1.9} aria-hidden="true" /></button> : null}
                </div>;
              })}
            </Fragment>;
          })}
          {!searching && !members.length && complete ? <p>No people in this channel.</p> : null}
          {searching ? <div className="community-context-members-footer" role="status" ref={loadMoreSentinelRef}>
            {searchResult.loading ? "Searching members…" : searchResult.error ?? `${members.length} matches${searchResult.hasMore ? " so far" : ""}`}
            {!searchResult.loading && searchResult.error ? <button type="button" className="btn-secondary" onClick={searchResult.loadMore}>Retry search</button> : null}
            {!searchResult.loading && !searchResult.error && searchResult.paused ? <><span> Search paused to limit scanning.</span> <button type="button" className="btn-secondary" onClick={searchResult.continueSearch}>Continue search</button></> : null}
          </div> : <div className="community-context-members-footer" ref={loadMoreSentinelRef}>
            {complete ? `Showing ${members.length} of ${members.length}` : "Loading more..."}
          </div>}
        </> : null}
    </div>
  </aside>
  </>;
  if (!props.directory) return <>{content}{settings}</>;
  // Keep search and pagination mounted while the existing profile inspector is open.
  if (props.memberDetailOpen) return null;
  return createPortal(<><div className="modal-overlay" onMouseDown={props.onCloseMembers}>
    <section ref={dialogRef} className="modal members-directory-modal" role="dialog" aria-modal="true"
      aria-labelledby="members-directory-title" onMouseDown={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.defaultPrevented) return;
        if (selectedMember) {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setSelectedMembershipId(null); searchRef.current?.focus(); }
          return;
        }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); props.onCloseMembers?.(); }
        if (event.key !== "Tab") return;
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') ?? [])
          .filter(element => element.getClientRects().length > 0);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="modal-header">
        <div><h2 className="modal-title" id="members-directory-title">Members</h2><div className="members-directory-community">{props.communityName}</div></div>
        <button type="button" className="modal-close" aria-label="Close members" onClick={props.onCloseMembers}><X size={20} /></button>
      </div>
      {content}
    </section>
  </div><div onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setSelectedMembershipId(null); searchRef.current?.focus(); }
  }}>{settings}</div></>, document.body);
}
