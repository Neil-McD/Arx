import { Fragment, useContext, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
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

export function ChannelRosterPanel(props: {
  communityName: string;
  presenceSummary?: CommunityPresenceSummary | null;
  isLoadingPresence?: boolean;
  channelId?: string;
  onOpenProfile?: (id: string) => void;
  getAvatarColor: (id: string) => string;
  getInitials: (name: string) => string;
}) {
  const scope = useContext(CommunityChannelSessionContext);
  const [pages, setPages] = useState<Page[]>([]);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(false);
  const [budget, setBudget] = useState(1);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [memory, setMemory] = useState<CloudCommunityPolynetOverview | null>(null);
  const [memoryError, setMemoryError] = useState(false);
  const [memoryRetry, setMemoryRetry] = useState(0);
  useEffect(() => {
    setMemory(null); setMemoryError(false);
    if (!scope) return;
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
  }, [scope?.session, scope?.communityId, memoryRetry]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setPages([]); setComplete(false); setError(false);
    if (!scope) return;
    let close: (() => void) | undefined;
    let stop: (() => void) | undefined;
    try {
      const live = createCloudCommunityChatLiveClient({ session: scope.session });
      close = live.close;
      stop = subscribeCommunityPages<Page>({
        sections: ["shared"], maxPages: budget,
        watch: (_section, cursor) => live.client.watchQuery(api.communityChannelParticipants.listChannelRoster, {
          authSubject: live.authSubject, communityId: scope.communityId as Id<"communities">,
          channelId: props.channelId as Id<"communityChannels"> | undefined,
          paginationOpts: { numItems: 50, cursor },
        }),
        onUpdate: (next, done) => { setPages(next); setComplete(done); setError(false); },
        onError: () => { setPages([]); setError(true); },
      });
    } catch { setError(true); }
    return () => { stop?.(); close?.(); };
  }, [scope?.session, scope?.communityId, props.channelId, budget, retry]);
  const members = [...new Map(pages.flatMap(page => page.page).map(member => [member.user_id, member])).values()];
  const status = (member: typeof members[number]) => member.last_seen_at === null ? "unknown"
    : communityPresenceLeaseIsActive({ lastSeenAt: member.last_seen_at, activeUntil: member.active_until ?? undefined }, now) ? "online" : "offline";
  const ready = pages.length > 0;
  return <aside className="community-context-panel channel-roster-panel" aria-label="Channel people and agents">
    <div className="community-context-rail-head"><span className="community-context-rail-name">{props.communityName}</span></div>
    <CommunityPresenceFacepile faces={props.presenceSummary?.online_faces} onlineCount={props.presenceSummary?.online_count}
      onlineCountCapped={Boolean(props.presenceSummary?.online_count_capped)} isLoading={props.isLoadingPresence} />
    <div className="community-context-memory">
      <div className="community-context-memory-head"><div className="community-context-section">Memory{memory ? ` — ${memory.memory.total_visible_nodes}${memory.memory.node_counts_are_lower_bound ? "+" : ""}` : ""}</div></div>
      {memoryError ? <div role="status">Could not load memory. <button type="button" onClick={() => setMemoryRetry(value => value + 1)}>Retry</button></div>
        : memory ? <div className="community-context-memory-summary">
          <div className="community-context-memory-preview"><CommunityMemoryGraphPreview overview={memory} /></div>
          <div className="community-context-memory-status"><span>{(memory.agent.activity_state || memory.agent.status).replace(/_/g, " ").replace(/\b\w/g, value => value.toUpperCase())}</span></div>
        </div> : <div className="community-context-memory-summary" aria-label="Loading memory"><div className="community-context-memory-preview web-skeleton-block" /><div className="community-context-memory-loading-status web-skeleton-row" /></div>}
    </div>
    <div className="community-context-members">
      {error ? <p role="status">Channel roster unavailable. <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p>
        : !ready ? <p role="status">Loading channel roster…</p> : <>
          <h3 className="community-context-section">Agents — {pages[0].agents.length}</h3>
          {pages[0].agents.length ? <div className="community-context-member"><span className="community-context-member-avatar"><Sparkles size={18} aria-hidden="true" /></span><span className="community-context-member-copy"><span className="community-context-member-name">Community agent</span></span></div> : <p className="community-context-members-status">No agents in this channel.</p>}
          <h3 className="community-context-section">People{complete ? ` — ${members.length}` : ""}</h3>
          {(["online", "offline", "unknown"] as const).map(group => {
            const rows = members.filter(member => status(member) === group);
            if (!rows.length) return null;
            return <Fragment key={group}>
              <h4 className="community-context-section" title="Online status reflects activity in this community">{group === "unknown" ? "Presence unavailable" : group === "online" ? "Online" : "Offline"} — {rows.length}{!complete ? " loaded" : ""}</h4>
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
                </div>;
              })}
            </Fragment>;
          })}
          {!members.length ? <p>{complete ? "No people in this channel." : "No people in this page."}</p> : null}
          {!complete ? <button type="button" onClick={() => setBudget(value => value + 1)}>Load more</button> : null}
        </>}
    </div>
  </aside>;
}
