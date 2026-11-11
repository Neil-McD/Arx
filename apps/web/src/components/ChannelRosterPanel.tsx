import { Fragment, useContext, useEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type CSSProperties } from "react";
import { ArrowRight, MessageCircle, MoreHorizontal, Pin, Search, X } from "lucide-react";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { MEMBER_FILTERS, memberPassesFilter, type MemberFilter } from "./communityMemberFilters";
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
import { createCloudCommunityChatLiveClient, type CloudCommunityChatLiveClient } from "../../../../shared/cloudCommunityChatGateway";
import { subscribeCommunityPages } from "../../../../shared/subscribeCommunityPages";
import { communityPresenceLeaseIsActive, COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS } from "../../../../shared/communityPresenceContract";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { formatRelativeTimeFromIso } from "../../../../shared/contentFormatting";
import { CommunityChannelSessionContext } from "./CommunityChannelSessionContext";
import { CommunityPresenceFacepile } from "./CommunityPresenceFacepile";
import { WebCommunityNotes } from "./WebCommunityNotes";
import { KitChannelRail } from "../v1/KitChannelRail";
import { KitMembersPage } from "../v1/KitMembersPage";
import { CommunityMembersBulkBar, type SelectedMember } from "./CommunityMembersBulkBar";
import type { CommunityPresenceSummary } from "../../../../shared/communityTypes";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";

type Page = FunctionReturnType<typeof api.communityChannelParticipants.listChannelRoster>;

function trapTab(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== "Tab") return;
  const controls = Array.from(container?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') ?? [])
    .filter(element => element.getClientRects().length > 0);
  const first = controls[0], last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

type RosterProps = {
  memberDetailOpen?: boolean;
  // Design system v1: the channel's pinned post, shown as one row that opens it.
  pinned?: { label: string; onOpen: () => void } | null;
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
  const scopeKey = JSON.stringify([props.currentUserId, resolveAuthSubject(scope?.session as AuthSessionLike), scope?.communityId]);
  return <ChannelRosterWorkspace key={scopeKey} {...props} />;
}

function ChannelRosterWorkspace(props: RosterProps) {
  const [membersOpen, setMembersOpen] = useState(false);
  const [askedNarrow, setAskedNarrow] = useState(false);
  const [channel, setChannel] = useState(props.channelId);
  if (channel !== props.channelId) {
    setChannel(props.channelId);
    setMembersOpen(false);
  }
  // Design system v1: the member list opens in the right column, in the
  // panel's place, instead of in a pop-up. The Members row in the left column
  // asks for it through narrowOpen, as the people button does on a phone.
  // Once open it stays open (hidden while a profile or thread has the column)
  // until it is closed, so looking at one member never loses the list.
  if (isDesignV1Active() && Boolean(props.narrowOpen) !== askedNarrow) {
    setAskedNarrow(Boolean(props.narrowOpen));
    if (props.narrowOpen) setMembersOpen(true);
  }
  // The page is a desktop layout. A narrow window keeps the list it had, with
  // its own way back.
  const wideEnoughForPage = typeof window === "undefined" || typeof window.matchMedia !== "function"
    || window.matchMedia("(min-width: 721px)").matches;
  if (isDesignV1Active() && membersOpen && wideEnoughForPage) {
    const close = () => { setMembersOpen(false); props.onCloseNarrow?.(); };
    return <><MembersPageLeaver onLeave={close} /><RosterSurface {...props} channelId={undefined} narrowOpen={false}
      onCloseNarrow={undefined} directory inline onCloseMembers={close}
      onMessageUser={props.onMessageUser ? id => { close(); props.onMessageUser?.(id); } : undefined} /></>;
  }
  return <>
    <RosterSurface {...props} onOpenMembers={() => setMembersOpen(true)} />
    {membersOpen ? <RosterSurface {...props} channelId={undefined} narrowOpen={false}
      onCloseNarrow={undefined} directory onCloseMembers={() => setMembersOpen(false)}
      onMessageUser={props.onMessageUser ? id => { setMembersOpen(false); props.onMessageUser?.(id); } : undefined} /> : null}
  </>;
}

function memberRoleTag(role: string): string | null {
  return role === "owner" ? "host" : role === "admin" ? "admin" : role === "moderator" ? "moderator" : null;
}

// Members is a page while it is open (design v1). It has no address yet, so
// choosing anything else in the left column is what leaves it.
function MembersPageLeaver(props: { onLeave: () => void }) {
  const onLeaveRef = useRef(props.onLeave);
  onLeaveRef.current = props.onLeave;
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const row = target?.closest(".community-nav .nav-item, .community-switcher-item");
      if (row && !row.closest(".nav-item-members")) onLeaveRef.current();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}

// Both presentations share the same authorized readers, row rendering and actions.
function RosterSurface(props: RosterProps & {
  directory?: boolean;
  // With directory: render in the right column instead of a pop-up (v1).
  inline?: boolean;
  onOpenMembers?: () => void;
  onCloseMembers?: () => void;
}) {
  const scope = useContext(CommunityChannelSessionContext);
  const dialogRef = useRef<HTMLElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!props.directory || props.memberDetailOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    searchRef.current?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, [props.directory, props.memberDetailOpen]);
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("everyone");
  const [recordEl, setRecordEl] = useState<HTMLElement | null>(null);
  const [openedUserId, setOpenedUserId] = useState<string | null>(null);
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
  // Credential leases update the shared transport without rebuilding query watches.
  const [liveState, setLiveState] = useState<{ live: CloudCommunityChatLiveClient | null; failed: boolean }>({ live: null, failed: false });
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(false);
  const paginationRef = useRef<ReturnType<typeof subscribeCommunityPages<Page>> | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);
  // Reset channel-private state before commit, not in an effect after old rows paint.
  const [rosterChannel, setRosterChannel] = useState(props.channelId);
  if (rosterChannel !== props.channelId) {
    setRosterChannel(props.channelId);
    setPages([]); setComplete(false); setError(false); setLoadingMore(false);
    setSelectedMembershipId(null); setSearch(""); setRebuilding(false);
  }
  useEffect(() => {
    if (!scope) return;
    try {
      const lease = createCloudCommunityChatLiveClient({ session: scope.session });
      setLiveState(previous => previous.live?.client === lease.client && !previous.failed
        ? previous : { live: lease, failed: false });
      return lease.close;
    } catch { setLiveState({ live: null, failed: true }); }
  }, [scope?.session, retry]);
  useEffect(() => {
    // Watch identity follows the authenticated transport, not the session object.
    setError(liveState.failed); setLoadingMore(false);
    if (liveState.failed) { setRebuilding(false); setPages([]); }
    if (!scope || !liveState.live) return;
    const live = liveState.live;
    let stop: (() => void) | undefined;
    let disposed = false;
    try {
      const pagination = subscribeCommunityPages<Page>({
        sections: ["shared"], maxPages: 1, preserveStablePages: true,
        watch: (_section, cursor) => live.client.watchQuery(api.communityChannelParticipants.listChannelRoster, {
          authSubject: live.authSubject, communityId: scope.communityId as Id<"communities">,
          channelId: props.channelId as Id<"communityChannels"> | undefined,
          paginationOpts: { numItems: 50, cursor },
        }),
        onUpdate: (next, done, pending) => { if (disposed) return; setRebuilding(Boolean(pending)); setPages(next); setComplete(done); setError(false); setLoadingMore(false); },
        onError: () => { if (disposed) return; setRebuilding(false); setPages([]); setError(true); setLoadingMore(false); },
      });
      paginationRef.current = pagination;
      stop = pagination;
    } catch { setRebuilding(false); setPages([]); setError(true); }
    return () => { disposed = true; paginationRef.current = null; stop?.(); };
  }, [liveState, scope?.communityId, props.channelId, retry]);
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
  // Join dates are only sent to people who manage members, so only they are
  // offered "New this week".
  const knowsJoinDates = members.some(member => Boolean((member as { membership_created_at?: unknown }).membership_created_at));
  const selectedMember = props.memberSettings.canManageMembers
    ? members.find(member => member.membership_id === selectedMembershipId && member.role !== "owner") : undefined;
  // In the members list, owners and admins select people and act on them together.
  const canSelect = Boolean(props.directory && props.memberSettings.canManageMembers);
  const [picked, setPicked] = useState<Map<string, SelectedMember>>(() => new Map());
  const togglePicked = (member: typeof members[number], name: string) => setPicked(current => {
    const next = new Map(current);
    if (next.has(member.user_id)) next.delete(member.user_id);
    else next.set(member.user_id, { userId: member.user_id, membershipId: member.membership_id, role: member.role, name });
    return next;
  });
  useEffect(() => {
    if (selectedMembershipId && !selectedMember && !rebuilding) setSelectedMembershipId(null);
  }, [selectedMembershipId, selectedMember, rebuilding]);
  useEffect(() => {
    if (!props.directory || !selectedMembershipId) return;
    settingsRef.current?.querySelector<HTMLElement>('button')?.focus();
    return () => searchRef.current?.focus();
  }, [props.directory, selectedMembershipId]);
  const status = (member: typeof members[number]) => member.last_seen_at === null ? "unknown"
    : communityPresenceLeaseIsActive({ lastSeenAt: member.last_seen_at, activeUntil: member.active_until ?? undefined }, now) ? "online" : "offline";
  const ready = pages.length > 0;
  const firstPresenceGroup = (["online", "offline", "unknown"] as const).find(group => members.some(member => status(member) === group));
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
    {!props.directory ? <><div className="community-context-rail-head">
      {props.onCloseNarrow ? <div className="channel-people-back">
        <button ref={backRef} className="back-to-workspace" type="button" aria-label="Back to channel" onClick={props.onCloseNarrow}>
          <svg viewBox="0 0 24 24" className="back-icon" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
      </div> : null}
      <span className="community-context-rail-name">{props.communityName}</span>
    </div>
    <CommunityPresenceFacepile faces={props.presenceSummary?.online_faces} onlineCount={props.presenceSummary?.online_count}
      onlineCountCapped={Boolean(props.presenceSummary?.online_count_capped)} isLoading={props.isLoadingPresence} />
    <div className="community-context-memory">
      <div className="community-context-memory-head"><div className="community-context-section">Community notes</div></div>
      {scope ? <WebCommunityNotes communityId={scope.communityId} session={scope.session} compact /> : null}
    </div></> : null}
    <div className="community-context-members" ref={membersViewportRef} onScroll={handleMembersScroll}>
      {rebuilding ? <p role="status">Updating members…</p> : null}
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
          {props.directory ? <div className="community-context-members-total">
            <h3 className="community-context-section">People{!error && ready && complete ? ` — ${rosterMembers.length}` : ""}</h3>
            <CommunityAutoJoinControl admission={props.admission} />
          </div> : !ready || error || !firstPresenceGroup ? <div className="community-context-members-total">
            <button type="button" className="members-view-all" onClick={props.onOpenMembers}>View all</button>
          </div> : null}
          {props.directory ? <>{props.admission?.canManage && props.admission.error ? <div role="alert" className="community-context-admission-status">{props.admission.error}</div> : null}
          {props.joinReview ? <CommunityJoinRequestReview {...props.joinReview} /> : null}
          {canSelect && scope ? <CommunityMembersBulkBar session={scope.session} communityId={scope.communityId}
            canManage={canSelect} isOwner={props.memberSettings.isActiveCommunityOwner}
            selected={[...picked.values()]} onClear={() => setPicked(new Map())} /> : null}
          <label className="community-dm-recipient-search community-dm-inbox-search">
            <Search aria-hidden="true" />
            <input ref={searchRef} type="search" aria-label="Search community members" placeholder="Search community members" value={search} maxLength={128} onChange={event => setSearch(event.target.value)} />
          </label>
          {props.inline && !searching ? <div className="members-page-filters" role="group" aria-label="Show">
            {MEMBER_FILTERS.filter(filter => filter.id !== "new" || knowsJoinDates).map(filter => <button key={filter.id} type="button"
              className={`members-page-chip${memberFilter === filter.id ? " is-selected" : ""}`}
              aria-pressed={memberFilter === filter.id} onClick={() => setMemberFilter(filter.id)}>{filter.label}</button>)}
          </div> : null}
          </> : null}
      {(searching || (!error && ready)) ? <>
          {(["online", "offline", "unknown"] as const).map(group => {
            const rows = members.filter(member => status(member) === group
              && (!props.inline || searching || memberPassesFilter(member, status(member), memberFilter, now)));
            if (!rows.length) return null;
            const heading = <h4 className="community-context-section" title="Online status reflects activity in this community">{searching ? "Community matches" : group === "unknown" ? "Presence unavailable" : group === "online" ? "Online" : "Offline"} — {rows.length}{!searching && !complete ? " loaded" : ""}</h4>;
            return <Fragment key={group}>
              {!props.directory && group === firstPresenceGroup ? <div className="community-context-presence-heading">
                {heading}<button type="button" className="members-view-all" onClick={props.onOpenMembers}>View all</button>
              </div> : heading}
              {rows.map(member => {
                const name = member.profile.display_name || "Member";
                const lastActive = group === "online" ? "Last active: now"
                  : member.last_seen_at === null ? "Last active: unavailable"
                  : `Last active: ${formatRelativeTimeFromIso(new Date(member.last_seen_at).toISOString())}`;
                return <div key={member.user_id} data-member-user-id={member.user_id}
                  className={`community-context-member${group === "offline" ? " is-offline" : ""}${props.inline && props.memberDetailOpen && openedUserId === member.user_id ? " is-selected" : ""}`}>
                  {canSelect && member.membership_id && member.role !== "owner" ? <input type="checkbox" className="community-context-member-select"
                    aria-label={`Select ${name}`} checked={picked.has(member.user_id)} onChange={() => togglePicked(member, name)} /> : null}
                  <button type="button" className="community-context-member-trigger" aria-label={`Open ${name}'s profile`} aria-description={lastActive} onClick={() => props.onOpenProfile?.(member.user_id)}>
                    <span className="community-context-member-avatar" style={!member.profile.avatar_url ? ({ "--member-avatar-color": props.getAvatarColor(member.user_id) } as CSSProperties) : undefined}>
                      <UserAvatar className="community-context-member-avatar-media" readyClassName="has-image"
                        name={name} imageUrl={member.profile.avatar_url}
                        focusX={member.profile.avatar_focus_x} focusY={member.profile.avatar_focus_y} zoom={member.profile.avatar_zoom}
                        alt="" aria-hidden={true} fallback={<span>{props.getInitials(name)}</span>} />
                      {group === "online" ? <span className="community-context-member-dot" aria-hidden="true" /> : null}
                    </span>
                    <span className="community-context-member-copy"><span className={`community-context-member-name${member.role === "owner" || member.role === "admin" ? " is-admin" : ""}`}>{name}</span>{props.inline && memberRoleTag(member.role) ? <span className="community-interaction-badge is-host">{memberRoleTag(member.role)}</span> : null}</span>
                  </button>
                  <span className="community-context-member-last-active" aria-hidden="true">{lastActive.replace("Last active: ", "")}</span>
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
  // Design system v1 (docs/specs/design-system-v1.md, section 6): beside a
  // channel the panel is short. What is pinned, the community's notes, and who
  // is here as faces; the full list, with its member tools, is one click away.
  const onlineCount = props.presenceSummary?.online_count;
  const kitRail = !props.onCloseNarrow || !props.narrowOpen;
  const v1Rail = !props.directory && isDesignV1Active() ? <aside className={`community-context-panel channel-roster-panel is-v1${kitRail ? " is-kit" : ""}`} aria-label="About this channel"
    style={props.memberDetailOpen ? { display: "none" } : undefined}
    onKeyDown={event => {
      if (event.key === "Escape" && !event.defaultPrevented && props.narrowOpen) {
        event.preventDefault(); props.onCloseNarrow?.();
      }
    }}>
    {props.onCloseNarrow ? <div className="channel-people-back">
      <button ref={backRef} className="back-to-workspace" type="button" aria-label="Back to channel" onClick={props.onCloseNarrow}>
        <svg viewBox="0 0 24 24" className="back-icon" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
      </button>
    </div> : null}
    {kitRail ? (
      // Design v1 beside a channel on a wide window: the mock's column, from the kit.
      <KitChannelRail
        communityId={scope?.communityId ?? null}
        session={scope?.session ?? null}
        pinned={props.pinned ?? null}
        presenceSummary={props.presenceSummary ?? null}
        onOpenMembers={props.onOpenMembers}
      />
    ) : <>
    {props.pinned ? <section className="channel-rail-section">
      <h3 className="channel-rail-label">Pinned</h3>
      <button type="button" className="channel-rail-row" onClick={props.pinned.onOpen}>
        <Pin size={15} aria-hidden="true" /><span>{props.pinned.label}</span>
      </button>
    </section> : null}
    <section className="channel-rail-section">
      <h3 className="channel-rail-label">Community notes</h3>
      {scope ? <WebCommunityNotes communityId={scope.communityId} session={scope.session} compact /> : null}
    </section>
    <section className="channel-rail-section">
      {/* No count here yet: the roster loads a page at a time as the full list
          scrolls, so this short panel has no honest total to show. */}
      <h3 className="channel-rail-label">In this channel</h3>
      <div className="channel-rail-here">
        <CommunityPresenceFacepile faces={props.presenceSummary?.online_faces} onlineCount={onlineCount}
          onlineCountCapped={Boolean(props.presenceSummary?.online_count_capped)} isLoading={props.isLoadingPresence} decorative />
        {typeof onlineCount === "number" ? <span>{onlineCount}{props.presenceSummary?.online_count_capped ? "+" : ""} here now</span> : null}
      </div>
      <button type="button" className="channel-rail-link" onClick={props.onOpenMembers}>
        View all <ArrowRight size={14} aria-hidden="true" />
      </button>
    </section>
    </>}
  </aside> : null;
  // The chat shell isolates its stacking context beneath the community rail.
  // Keep overlays outside that shell, as the directory already does below.
  if (v1Rail) return v1Rail;
  if (!props.directory) return <>{content}{selectedMember ? createPortal(settings, document.body) : null}</>;
  // Design system v1, for the people who run it: the members table and one
  // member's record (docs/design/members-invariants.md).
  if (props.inline && isDesignV1Active() && props.memberSettings.canManageMembers) return <>
    <KitMembersPage communityName={props.communityName}
      joinRequests={props.joinReview?.canReviewJoinRequests ? props.joinReview.pendingJoinRequests ?? [] : []}
      decidingJoinRequestId={props.joinReview?.decidingJoinRequestId ?? null}
      onApprove={id => void props.joinReview?.onApproveJoinRequest?.(id)}
      onDecline={id => void props.joinReview?.onDenyJoinRequest?.(id)}
      onMessage={props.onMessageUser} onManage={id => setSelectedMembershipId(id)}
      currentUserId={props.currentUserId ?? null} recordContainer={recordEl}
      getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
    <aside ref={setRecordEl} className="community-context-panel members-page-record" aria-label="Member record" />
    {selectedMember ? createPortal(<div ref={settingsRef} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setSelectedMembershipId(null); }
      trapTab(event, settingsRef.current);
    }}>{settings}</div>, document.body) : null}
  </>;
  // Design system v1: Members is a page. The list fills the main area under
  // the standard header line; the person you open is the right column.
  if (props.inline) return <>
    <section className="members-page" aria-label="Community members"
      onClickCapture={event => {
        const row = (event.target as HTMLElement).closest<HTMLElement>("[data-member-user-id]");
        if (row) setOpenedUserId(row.dataset.memberUserId ?? null);
      }}
      data-opened-user-id={props.memberDetailOpen ? openedUserId ?? undefined : undefined}>
      <header className="community-channel-header members-page-header">
        <div className="community-channel-header-identity">
          <h1>Members{!error && ready && complete && !searching ? <small> {rosterMembers.length === 1 ? "1 person" : `${rosterMembers.length} people`}</small> : null}</h1>
        </div>
      </header>
      {content}
    </section>
    {!props.memberDetailOpen ? <aside className="community-context-panel members-page-empty" aria-label="No one selected">
      <p>Choose someone to see their profile.</p>
    </aside> : null}
    {selectedMember ? createPortal(<div ref={settingsRef} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setSelectedMembershipId(null); searchRef.current?.focus(); }
      trapTab(event, settingsRef.current);
    }}>{settings}</div>, document.body) : null}
  </>;
  // Keep search and pagination mounted while the existing profile inspector is open.
  return createPortal(<><div className="modal-overlay" style={props.memberDetailOpen ? { display: "none" } : undefined} onMouseDown={props.onCloseMembers}>
    <section ref={dialogRef} className="modal members-directory-modal" role="dialog" aria-modal="true"
      aria-labelledby="members-directory-title" onMouseDown={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.defaultPrevented) return;
        if (selectedMember) {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setSelectedMembershipId(null); searchRef.current?.focus(); }
          return;
        }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); props.onCloseMembers?.(); }
        trapTab(event, dialogRef.current);
      }}>
      <div className="modal-header">
        <div><h2 className="modal-title" id="members-directory-title">Members</h2><div className="members-directory-community">{props.communityName}</div></div>
        <button type="button" className="modal-close" aria-label="Close members" onClick={props.onCloseMembers}><X size={20} /></button>
      </div>
      {content}
    </section>
  </div><div ref={settingsRef} onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setSelectedMembershipId(null); searchRef.current?.focus(); }
    trapTab(event, settingsRef.current);
  }}>{settings}</div></>, document.body);
}
