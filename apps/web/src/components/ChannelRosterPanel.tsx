import { Fragment, useContext, useEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { MessageCircle, MoreHorizontal, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useWebMemberDirectorySearch } from "../controllers/useWebMemberDirectorySearch";
import { CommunityMemberSettingsDialog } from "./CommunityMemberSettingsDialog";
import { WebCommunityCreators } from "./WebCommunityCreators";
import { useMemberScrollPagination } from "./useMemberScrollPagination";
import { CommunityJoinRequestReview } from "./CommunityJoinRequestReview";
import { CommunityAutoJoinControl, type CommunityAdmissionControl } from "./CommunityAutoJoinControl";
import { ActorAvatar } from "./communityInteractionFeed";
import { useCommunityAgentProfile } from "../../../../shared/CommunityAgentIcon";
import { AVATAR_INITIALS_INK } from "../../../../shared/chatUi";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { createCloudCommunityChatLiveClient, type CloudCommunityChatLiveClient } from "../../../../shared/cloudCommunityChatGateway";
import { subscribeCommunityPages } from "../../../../shared/subscribeCommunityPages";
import { communityPresenceLeaseIsActive, COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS } from "../../../../shared/communityPresenceContract";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { formatRelativeTimeFromIso } from "../../../../shared/contentFormatting";
import { CommunityChannelSessionContext } from "./CommunityChannelSessionContext";
import { useCommunityThemeScope } from "./useCommunityThemeScope";
import { CommunityMemoryGraphPreview } from "./CommunityMemoryGraphPreview";
import type { CommunityPresenceSummary } from "../../../../shared/communityTypes";
import { createCloudCommunityPolynetLiveClient, subscribeCloudCommunityPolynetOverview, type CloudCommunityPolynetOverview } from "../../../../shared/cloudCommunityPolynetGateway";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";

type Page = FunctionReturnType<typeof api.communityChannelParticipants.listChannelRoster>;

// The side panel shows a short list, online people first, and "View all" opens
// the full directory as a panel from the right.
export const ROSTER_SIDE_PANEL_LIMIT = 10;

// The memory card's one-line agent status, in plain words. A run that failed
// on AI funding says so, because "Error" alone gives the owner nothing to act on.
// The stored reason can carry a prefix ("Uncaught Error: founder_inference_…").
// Members never see the failure: it's the owner's to fix, so they see "Resting".
export function memoryAgentStatus(overview: Pick<CloudCommunityPolynetOverview, "agent">, options: { canManage?: boolean } = {}): string {
  const state = overview.agent.activity_state || overview.agent.status;
  if (state === "error" && options.canManage === false) return "Resting";
  if (state === "error") {
    return /\bfounder_inference_/.test(overview.agent.recent_runs[0]?.stop_reason ?? "")
      ? "Couldn't run: AI usage isn't set up or has run out"
      : "Couldn't run last time";
  }
  const labels: Record<string, string> = { running: "Working", resting: "Resting", updated_directory: "Updated memory", not_started: "Not started yet" };
  return labels[state] ?? state.replace(/_/g, " ").replace(/\b\w/g, value => value.toUpperCase());
}

function trapTab(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== "Tab") return;
  const controls = Array.from(container?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') ?? [])
    .filter(element => element.getClientRects().length > 0);
  const first = controls[0], last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

type RosterProps = {
  // The community's Members page: the full directory (search, join requests,
  // auto-join) shown in the page as member cards instead of in a dialog.
  page?: boolean;
  memberDetailOpen?: boolean;
  narrowOpen?: boolean;
  onCloseNarrow?: () => void;
  joinReview?: ComponentProps<typeof CommunityJoinRequestReview>;
  admission?: CommunityAdmissionControl;
  /** Shown below the members list in the side panel, never in the directory. */
  footer?: ReactNode;
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
  if (props.page) return <RosterSurface {...props} channelId={undefined} narrowOpen={false} onCloseNarrow={undefined} directory />;
  return <ChannelRosterSidebar {...props} />;
}

function ChannelRosterSidebar(props: RosterProps) {
  const [membersOpen, setMembersOpen] = useState(false);
  const [channel, setChannel] = useState(props.channelId);
  if (channel !== props.channelId) {
    setChannel(props.channelId);
    setMembersOpen(false);
  }
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
  const agentName = useCommunityAgentProfile()?.name || "Community agent";
  const themeScope = useCommunityThemeScope();
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
  const [onlineOnly, setOnlineOnly] = useState(false);
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
  const [memory, setMemory] = useState<CloudCommunityPolynetOverview | null>(null);
  const [memoryError, setMemoryError] = useState(false);
  const [memoryRetry, setMemoryRetry] = useState(0);
  // The workspace identity resets memory; credential renewal only revalidates it.
  useEffect(() => {
    setMemoryError(false);
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
    } catch { setMemory(null); setMemoryError(true); }
    return () => { disposed = true; stop?.(); close?.(); };
  }, [scope?.session, scope?.communityId, memoryRetry, props.directory]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);
  // Reset channel-private state before commit, not in an effect after old rows paint.
  // Community memory stays mounted because its authorization scope did not change.
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
    membersHasMore: searching ? searchResult.hasMore && !searchResult.paused : props.directory ? !complete : false,
    isLoadingMembers: searching ? false : !pages.length,
    isLoadingMoreMembers: searching ? searchResult.loading : loadingMore,
    membersLoadError: searching ? searchResult.error : error,
    onLoadMoreMembers: () => { if (searching) searchResult.loadMore(); else { setLoadingMore(true); paginationRef.current?.loadMore(); } },
  }, searching ? searchResult.progress : pages.length);
  const rosterMembers = [...new Map(pages.flatMap(page => page.page).map(member => [member.user_id, member])).values()];
  const members = searching ? searchResult.rows.map(member => ({
    user_id: member.user_id, role: member.role, co_creator: member.co_creator,
    membership_id: member.id.startsWith("owner:") ? undefined : member.id,
    membership_created_at: member.created_at,
    profile: member, last_seen_at: null, active_until: null,
  })) : rosterMembers;
  const selectedMember = props.memberSettings.canManageMembers
    ? members.find(member => member.membership_id === selectedMembershipId && member.role !== "owner") : undefined;
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
  // Rows the side panel shows, online first, up to the limit.
  let sideRowsLeft = props.directory ? Infinity : ROSTER_SIDE_PANEL_LIMIT;
  const onlineCount = members.filter(member => status(member) === "online").length;
  // The roster loads a page at a time, so a count shows only once it's whole.
  const peopleTotal = complete ? String(rosterMembers.length) : "";
  const settings = <CommunityMemberSettingsDialog {...props.memberSettings}
    member={selectedMember ? { ...selectedMember.profile, id: selectedMember.membership_id!, user_id: selectedMember.user_id, role: selectedMember.role, co_creator: selectedMember.co_creator, created_at: selectedMember.membership_created_at } : null}
    onClose={() => setSelectedMembershipId(null)} />;
  const content = <><aside className={props.page ? "members-directory-content members-page" : props.directory ? "members-directory-content" : "community-context-panel channel-roster-panel"} aria-label={props.directory ? "Community members" : "Channel people and agents"}
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
    {/* The Online list below names who's here, so no separate face row (it read as a second, nameless "R"). */}
    <WebCommunityCreators communityId={scope?.communityId} onOpenProfile={props.onOpenProfile} variant="rail" getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} onMessageUser={props.onMessageUser} currentUserId={props.currentUserId} />
    <div className="community-context-memory">
      <div className="community-context-memory-head"><div className="community-context-section">Memory{memory ? ` · ${memory.memory.total_visible_nodes}${memory.memory.node_counts_are_lower_bound ? "+" : ""}` : ""}</div></div>
      {memoryError ? <div role="status">Could not load memory. <button type="button" onClick={() => setMemoryRetry(value => value + 1)}>Retry</button></div>
        : memory ? <div className="community-context-memory-summary">
          <div className="community-context-memory-preview"><CommunityMemoryGraphPreview overview={memory} /></div>
          <div className="community-context-memory-status"><span>{memoryAgentStatus(memory, { canManage: props.memberSettings.canManageMembers })}</span></div>
        </div> : <div className="community-context-memory-summary" aria-label="Loading memory"><div className="community-context-memory-preview web-skeleton-block" /><div className="community-context-memory-loading-status web-skeleton-row" /></div>}
    </div></> : null}
    <div className="community-context-members" ref={membersViewportRef} onScroll={handleMembersScroll}>
      {rebuilding ? <p role="status">Updating members…</p> : null}
      {error ? <p role="status">Channel roster unavailable. <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p>
        : !ready ? <p role="status">Loading channel roster…</p> : <>
          {!props.directory ? <><h3 className="community-context-section">Agents · {pages[0].agents.length}</h3>
          {pages[0].agents.length ? <div className="community-context-agent-list">
            {pages[0].agents.map(agent => <div className="community-context-member" key={agent.key}>
              <ActorAvatar seed={agent.key} label={agentName} className="community-context-member-avatar"
                getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
              <span className="community-context-member-copy"><span className="community-context-member-name">{agentName}</span></span>
            </div>)}
          </div> : <p className="community-context-members-status">No agents in this channel.</p>}</> : null}
        </>}
          {props.directory ? <div className="community-context-members-total">
            <h3 className="community-context-section">People{!error && ready && complete ? ` — ${rosterMembers.length}` : ""}</h3>
            <CommunityAutoJoinControl admission={props.admission} />
          </div> : !ready || error || !firstPresenceGroup ? <div className="community-context-members-total">
            <button type="button" className="members-view-all" onClick={props.onOpenMembers}>View all</button>
          </div> : null}
          {props.directory && !searching && ready && !error ? <div className="members-directory-filter" role="group" aria-label="Show members">
            <button type="button" aria-pressed={!onlineOnly} onClick={() => setOnlineOnly(false)}>All{peopleTotal ? <span>{peopleTotal}</span> : null}</button>
            <button type="button" aria-pressed={onlineOnly} onClick={() => setOnlineOnly(true)}>Online<span>{onlineCount}</span></button>
          </div> : null}
          {props.directory ? <>{props.admission?.canManage && props.admission.error ? <div role="alert" className="community-context-admission-status">{props.admission.error}</div> : null}
          {props.joinReview ? <CommunityJoinRequestReview {...props.joinReview} /> : null}
          <label className="community-dm-recipient-search community-dm-inbox-search">
            <Search aria-hidden="true" />
            <input ref={searchRef} type="search" aria-label="Search community members" placeholder="Search community members" value={search} maxLength={128} onChange={event => setSearch(event.target.value)} />
          </label>
          </> : null}
      {(searching || (!error && ready)) ? <>
          {(["online", "offline", "unknown"] as const).map(group => {
            const groupRows = members.filter(member => status(member) === group);
            if (!groupRows.length || (props.directory && onlineOnly && !searching && group !== "online")) return null;
            if (sideRowsLeft <= 0) return null;
            const rows = groupRows.slice(0, sideRowsLeft);
            sideRowsLeft -= rows.length;
            const heading = <h4 className="community-context-section" title="Online status reflects activity in this community">{searching ? "Community matches" : group === "unknown" ? "Presence unavailable" : group === "online" ? "Online" : "Offline"} · {groupRows.length}{!searching && !complete ? "+" : ""}</h4>;
            return <Fragment key={group}>
              {heading}
              {rows.map(member => {
                const name = member.profile.display_name || "Member";
                const lastActive = group === "online" ? "Last active: now"
                  : member.last_seen_at === null ? "Last active: unavailable"
                  : `Last active: ${formatRelativeTimeFromIso(new Date(member.last_seen_at).toISOString())}`;
                return <div key={member.user_id} className={`community-context-member${group === "offline" ? " is-offline" : ""}`}>
                  <button type="button" className="community-context-member-trigger" aria-label={`Open ${name}'s profile`} aria-description={lastActive} onClick={() => props.onOpenProfile?.(member.user_id)}>
                    <span className="community-context-member-avatar" style={!member.profile.avatar_url ? { backgroundColor: props.getAvatarColor(member.user_id), color: AVATAR_INITIALS_INK } : undefined}>
                      <UserAvatar className="community-context-member-avatar-media" readyClassName="has-image"
                        name={name} imageUrl={member.profile.avatar_url}
                        focusX={member.profile.avatar_focus_x} focusY={member.profile.avatar_focus_y} zoom={member.profile.avatar_zoom}
                        alt="" aria-hidden={true} fallback={<span>{props.getInitials(name)}</span>} />
                      {group === "online" ? <span className="community-context-member-dot" aria-hidden="true" /> : null}
                    </span>
                    <span className="community-context-member-copy"><span className={`community-context-member-name${member.role === "owner" || member.role === "admin" ? " is-admin" : ""}`}>{name}</span></span>
                  </button>
                  <span className="community-context-member-last-active" aria-hidden="true">{lastActive.replace("Last active: ", "")}</span>
                  {props.onMessageUser && member.user_id !== props.currentUserId ? <button type="button" className="community-context-member-action" aria-label={`Message ${name}`} title="Direct message" onClick={() => props.onMessageUser?.(member.user_id)}><MessageCircle size={16} strokeWidth={1.9} aria-hidden="true" /></button> : null}
                  {props.memberSettings.canManageMembers && member.membership_id && member.role !== "owner" ? <button type="button" className="community-context-member-action" aria-label={`Open settings for ${name}`} title="Member settings" onClick={() => setSelectedMembershipId(member.membership_id!)}><MoreHorizontal size={16} strokeWidth={1.9} aria-hidden="true" /></button> : null}
                </div>;
              })}
            </Fragment>;
          })}
          {!searching && !members.length && complete ? <p>No people in this channel.</p> : null}
          {props.directory && onlineOnly && !searching && complete && !onlineCount ? <p className="community-context-members-status">No one is online right now.</p> : null}
          {searching ? <div className="community-context-members-footer" role="status" ref={loadMoreSentinelRef}>
            {searchResult.loading ? "Searching members…" : searchResult.error ?? `${members.length} matches${searchResult.hasMore ? " so far" : ""}`}
            {!searchResult.loading && searchResult.error ? <button type="button" className="btn-secondary" onClick={searchResult.loadMore}>Retry search</button> : null}
            {!searchResult.loading && !searchResult.error && searchResult.paused ? <><span> Search paused to limit scanning.</span> <button type="button" className="btn-secondary" onClick={searchResult.continueSearch}>Continue search</button></> : null}
          </div> : !props.directory ? members.length ? <button type="button" className="members-view-all members-view-all-footer" onClick={props.onOpenMembers}>
            {peopleTotal ? `View all ${peopleTotal} ${rosterMembers.length === 1 ? "member" : "members"}` : "View all members"}
          </button> : null : <div className="community-context-members-footer" ref={loadMoreSentinelRef}>
            {complete ? `Showing ${onlineOnly ? onlineCount : members.length} of ${members.length}` : "Loading more..."}
          </div>}
        </> : null}
    </div>
    {!props.directory ? props.footer : null}
  </aside>
  </>;
  // The chat shell isolates its stacking context beneath the community rail.
  // Keep overlays outside that shell, as the directory already does below.
  if (!props.directory || props.page) return <>{content}{selectedMember ? createPortal(settings, document.body) : null}</>;
  // The drawer is portaled out of the page, so it carries the community's look along.
  // Keep search and pagination mounted while the existing profile inspector is open.
  return <>{themeScope.marker}{createPortal(themeScope.scope(<><div className="modal-overlay members-directory-overlay" style={props.memberDetailOpen ? { display: "none" } : undefined} onMouseDown={props.onCloseMembers}>
    <section ref={dialogRef} className="modal members-directory-modal members-directory-drawer" role="dialog" aria-modal="true"
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
  }}>{settings}</div></>), document.body)}</>;
}
