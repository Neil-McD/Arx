import { useEffect, useRef, useState } from "react";
import { AtSign, Bell, BookOpen, CalendarClock, MessageSquare, UserPlus } from "lucide-react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import type { CommunityActivityEvent } from "../../../../shared/communityTypes";
import { formatRelativeTime } from "./communityInteractionFeed";

// The bell in the top tab bar: what happened in this community, from data
// Polynet already records. Channels where the member was mentioned come first
// (the same mention markers the side column shows), then the community's
// activity: new members, new lessons, events about to start and agent posts.
// The dot clears when the member opens the list; when they last looked is kept
// in this browser only.

type MentionChannel = { id: string; slug: string; name: string };

const LAST_SEEN_PREFIX = "polynet:community-notifications-seen:";

function readLastSeen(communityId: string): number {
  try {
    return Number(window.localStorage.getItem(LAST_SEEN_PREFIX + communityId)) || 0;
  } catch {
    return 0;
  }
}

function writeLastSeen(communityId: string, value: number) {
  try {
    window.localStorage.setItem(LAST_SEEN_PREFIX + communityId, String(value));
  } catch {
    /* private window: the dot just comes back next time */
  }
}

// Joins in a row read as one line ("4 new members joined"), so a busy day
// doesn't fill the list with identical rows.
type ActivityRow = { event: CommunityActivityEvent; count: number };

function groupJoins(events: CommunityActivityEvent[]): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const event of events) {
    const last = rows[rows.length - 1];
    if (last && last.event.type === "member_joined" && event.type === "member_joined") last.count += 1;
    else rows.push({ event, count: 1 });
  }
  return rows;
}

function describe(event: CommunityActivityEvent, count: number): { text: string; tab: CommunityTab; icon: typeof Bell } {
  const title = event.target_title?.trim() || null;
  switch (event.type) {
    case "member_joined":
      return { text: count > 1 ? `${count} new members joined` : "A new member joined", tab: "members", icon: UserPlus };
    case "resource_added":
      return { text: title ? `New in the classroom: ${title}` : "New in the classroom", tab: "resources", icon: BookOpen };
    case "event_soon":
      return { text: title ? `${title} starts soon` : "An event starts soon", tab: "events", icon: CalendarClock };
    case "event_starting":
      return { text: title ? `${title} is starting` : "An event is starting", tab: "events", icon: CalendarClock };
    default:
      return { text: title ? `New post: ${title}` : "New post", tab: "chat", icon: MessageSquare };
  }
}

export function WebCommunityNotificationsMenu(props: {
  communityId: string | null;
  events: CommunityActivityEvent[];
  mentionChannels: MentionChannel[];
  onSelectTab: (tab: CommunityTab) => void;
  onSelectChannel: (slug: string) => void;
  /** "bar": Channels' top-right bar, beside Messages; Classroom's tab bar is the default. */
  placement?: "top" | "bar";
}) {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);
  // While the list is open, items newer than the previous visit stay marked.
  const [highlightSince, setHighlightSince] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const communityId = props.communityId;

  useEffect(() => {
    setLastSeen(communityId ? readLastSeen(communityId) : 0);
  }, [communityId]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const events = [...props.events].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 20);
  const unseen = events.filter((event) => Date.parse(event.created_at) > lastSeen).length + props.mentionChannels.length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && communityId) {
      const now = Date.now();
      writeLastSeen(communityId, now);
      setHighlightSince(lastSeen);
      setLastSeen(now);
    }
  };

  const go = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="community-top-nav-menu" ref={rootRef}>
      <button
        type="button"
        className={props.placement === "bar"
          ? `icon-button community-display-bar-button community-notifications-bar-button${open ? " active" : ""}`
          : `community-top-nav-icon${open ? " is-open" : ""}`}
        aria-label={unseen > 0 ? `Notifications, ${unseen} new` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <Bell size={20} strokeWidth={2} aria-hidden="true" />
        {unseen > 0 ? <span className="community-top-nav-icon-badge">{unseen > 99 ? "99+" : unseen}</span> : null}
      </button>
      {open ? (
        <div className="community-notifications-panel" role="dialog" aria-label="Notifications">
          <div className="community-notifications-head">Notifications</div>
          {props.mentionChannels.length === 0 && events.length === 0 ? (
            <p className="community-notifications-empty">Nothing new yet.</p>
          ) : (
            <>
            {props.mentionChannels.length > 0 ? <div className="community-notifications-group">Mentions</div> : null}
            <ul className="community-notifications-list">
              {props.mentionChannels.map((channel) => (
                <li key={`mention:${channel.id}`}>
                  <button type="button" className="community-notification is-unseen" onClick={() => go(() => props.onSelectChannel(channel.slug))}>
                    <span className="community-notification-icon" aria-hidden="true"><AtSign size={16} /></span>
                    <span className="community-notification-text">You were mentioned in {channel.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            {events.length > 0 ? <div className="community-notifications-group">Activity</div> : null}
            <ul className="community-notifications-list">
              {groupJoins(events).map(({ event, count }) => {
                const view = describe(event, count);
                const Icon = view.icon;
                const isUnseen = Date.parse(event.created_at) > highlightSince;
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      className={`community-notification${isUnseen ? " is-unseen" : ""}`}
                      onClick={() => go(() => props.onSelectTab(view.tab))}
                    >
                      <span className="community-notification-icon" aria-hidden="true"><Icon size={16} /></span>
                      <span className="community-notification-text">{view.text}</span>
                      <span className="community-notification-time">{formatRelativeTime(event.created_at)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
