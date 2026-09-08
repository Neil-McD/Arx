import { useContext, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { createCloudCommunityChatLiveClient } from "../../../../shared/cloudCommunityChatGateway";
import { subscribeCommunityPages } from "../../../../shared/subscribeCommunityPages";
import { communityPresenceLeaseIsActive, COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS } from "../../../../shared/communityPresenceContract";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { CommunityChannelSessionContext } from "./CommunityChannelSessionContext";

type Page = FunctionReturnType<typeof api.communityChannelParticipants.listChannelRoster>;

export function ChannelRosterPanel(props: {
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
    <div className="community-context-rail">
      {error ? <p role="status">Channel roster unavailable. <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p>
        : !ready ? <p role="status">Loading channel roster…</p> : <>
          <h3>Agents · {pages[0].agents.length}</h3>
          {pages[0].agents.length ? <div className="community-context-member"><Sparkles size={20} aria-hidden="true" /><span>Community agent</span></div> : <p>No agents in this channel.</p>}
          <h3>People{complete ? ` · ${members.length}` : ""}</h3>
          <p className="channel-roster-hint">Channel access · online in this community</p>
          {(["online", "offline", "unknown"] as const).map(group => {
            const rows = members.filter(member => status(member) === group);
            if (!rows.length) return null;
            return <section key={group} aria-label={group === "unknown" ? "Presence unavailable" : group}>
              <h4>{group === "unknown" ? "Presence unavailable" : group === "online" ? "Online" : "Offline"} · {rows.length}{!complete ? " loaded" : ""}</h4>
              {rows.map(member => {
                const name = member.profile.display_name || "Member";
                return <div key={member.user_id} className="community-context-member">
                  <button type="button" className="community-context-member-trigger" aria-label={`Open ${name}'s profile`} onClick={() => props.onOpenProfile?.(member.user_id)}>
                    <span className="community-interaction-avatar-presence">
                      <UserAvatar className="community-interaction-avatar" readyClassName="has-image" fallbackClassName="community-interaction-avatar-fallback"
                        fallbackStyle={{ backgroundColor: props.getAvatarColor(member.user_id) }} name={name} imageUrl={member.profile.avatar_url}
                        focusX={member.profile.avatar_focus_x} focusY={member.profile.avatar_focus_y} zoom={member.profile.avatar_zoom}
                        alt="" aria-hidden={true} fallback={<span>{props.getInitials(name)}</span>} />
                      {group === "online" ? <span className="community-interaction-online-dot" aria-hidden="true" /> : null}
                    </span>
                    <span className="community-context-member-copy"><span className="community-context-member-name">{name}</span></span>
                  </button>
                </div>;
              })}
            </section>;
          })}
          {!members.length ? <p>{complete ? "No people in this channel." : "No people in this page."}</p> : null}
          {!complete ? <button type="button" onClick={() => setBudget(value => value + 1)}>Load more</button> : null}
        </>}
    </div>
  </aside>;
}
