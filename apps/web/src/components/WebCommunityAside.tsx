import { useEffect, useState } from "react";
import { CalendarDays, Check, Link2, Users } from "lucide-react";
import type { CommunityLayoutAsideBlock } from "../../../../shared/communityLayout";
import { listCloudCommunityEvents, type CloudCommunityEvent } from "../../../../shared/cloudCommunityEventsGateway";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { WebCommunityCreators } from "./WebCommunityCreators";
import { communityJoinUrl, useWebCommunityFrame } from "../controllers/useWebCommunityFrame";
import { WebCommunityPodsCard, type WebCommunityPodsFrame } from "./WebCommunityPods";

// Blocks a layout can place beside the chat page. Each reads data Polynet
// already has: the community's own profile and its events.

const UPCOMING_EVENTS_WINDOW_DAYS = 60;
const UPCOMING_EVENTS_LIMIT = 3;

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("");
}

export function WebCommunityCard() {
  const frame = useWebCommunityFrame();
  const [copied, setCopied] = useState(false);
  const community = frame.community;
  if (!community) return null;
  const joinUrl = communityJoinUrl(community.slug);
  const invite = async () => {
    if (!joinUrl || !frame.onCopyJoinLink) return;
    await frame.onCopyJoinLink(joinUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <section className="community-aside-card community-card-block" aria-label={`About ${community.name}`}>
      {community.banner_url ? (
        <div className="community-card-block-banner">
          <img
            src={community.banner_url}
            alt=""
            style={{ objectPosition: `${(community.banner_focus_x ?? 0.5) * 100}% ${(community.banner_focus_y ?? 0.5) * 100}%` }}
          />
        </div>
      ) : null}
      <div className="community-card-block-body">
        <div className="community-card-block-identity">
          <UserAvatar
            className="community-card-block-avatar"
            readyClassName="has-image"
            imageClassName="community-card-block-avatar-image"
            fallbackClassName="community-card-block-avatar-fallback"
            name={community.name}
            imageUrl={community.avatar_url}
            focusX={community.avatar_focus_x ?? 0.5}
            focusY={community.avatar_focus_y ?? 0.5}
            zoom={community.avatar_zoom ?? 1}
            fallback={<span>{initials(community.name)}</span>}
            alt=""
            aria-hidden={true}
          />
          <h2 className="community-card-block-name">{community.name}</h2>
        </div>
        {community.one_liner ? <p className="community-card-block-description">{community.one_liner}</p> : null}
        <WebCommunityCreators communityId={community.id} onShowChat={() => frame.onSelectTab("chat")} />
        {typeof frame.memberCount === "number" ? (
          <button type="button" className="community-card-block-stat" onClick={() => frame.onSelectTab("members")}>
            <Users size={16} aria-hidden="true" />
            <strong>{frame.memberCount.toLocaleString()}</strong> {frame.memberCount === 1 ? "member" : "members"}
          </button>
        ) : null}
        {frame.canInvite && joinUrl && frame.onCopyJoinLink ? (
          <button type="button" className="community-card-block-invite settings-primary-action" onClick={() => void invite()}>
            {copied ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
            {copied ? "Invite link copied" : "Invite people"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function formatEventStart(event: CloudCommunityEvent): { day: string; month: string; time: string } {
  const start = new Date(event.starts_at);
  return {
    day: start.toLocaleDateString(undefined, { day: "numeric" }),
    month: start.toLocaleDateString(undefined, { month: "short" }),
    time: start.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }),
  };
}

export function WebCommunityUpcomingEvents() {
  const frame = useWebCommunityFrame();
  const communityId = frame.community?.id ?? null;
  const session = frame.session;
  const [events, setEvents] = useState<CloudCommunityEvent[] | null>(null);

  useEffect(() => {
    if (!communityId || !session) return;
    let cancelled = false;
    const now = new Date();
    const end = new Date(now.getTime() + UPCOMING_EVENTS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    listCloudCommunityEvents({ session, communityId, startIso: now.toISOString(), endIso: end.toISOString(), overlap: true, limit: 20 })
      .then((rows) => {
        if (cancelled) return;
        const upcoming = rows
          .filter((event) => event.status === "live")
          .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
          .slice(0, UPCOMING_EVENTS_LIMIT);
        setEvents(upcoming);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [communityId, session]);

  if (!communityId || !session) return null;
  return (
    <section className="community-aside-card community-upcoming-events" aria-label="Upcoming events">
      <div className="community-aside-card-header">
        <h2>Upcoming events</h2>
        <button type="button" className="community-aside-link" onClick={() => frame.onSelectTab("events")}>See all</button>
      </div>
      {events === null ? (
        <div className="community-interaction-loading web-skeleton-pill" aria-hidden="true" />
      ) : events.length === 0 ? (
        <p className="community-aside-empty">
          <CalendarDays size={16} aria-hidden="true" /> Nothing scheduled yet.
        </p>
      ) : (
        <ul className="community-upcoming-events-list">
          {events.map((event) => {
            const start = formatEventStart(event);
            return (
              <li key={`${event.id}:${event.starts_at}`}>
                <button type="button" className="community-upcoming-event" onClick={() => frame.onSelectTab("events")}>
                  <span className="community-upcoming-event-date" aria-hidden="true">
                    <span>{start.month}</span>
                    <strong>{start.day}</strong>
                  </span>
                  <span className="community-upcoming-event-text">
                    <span className="community-upcoming-event-title">{event.title}</span>
                    <span className="community-upcoming-event-time">{start.time}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function WebCommunityAside({ blocks, pods }: { blocks: CommunityLayoutAsideBlock[]; pods?: WebCommunityPodsFrame | null }) {
  const showPods = Boolean(pods && pods.place === "aside" && (pods.pods.length > 0 || pods.createPod));
  if (blocks.length === 0 && !showPods) return null;
  return (
    <aside className="community-aside" aria-label="Community sidebar">
      {showPods ? <WebCommunityPodsCard pods={pods!} /> : null}
      {blocks.map((block) =>
        block === "community_card" ? <WebCommunityCard key={block} /> : <WebCommunityUpcomingEvents key={block} />,
      )}
    </aside>
  );
}
