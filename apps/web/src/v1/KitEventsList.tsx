// Design system v1: Events (Nov 16 mock). What's next first: the next event
// as a card, then Later as rows, then Past, folded while anything is coming
// up. Nothing sits beside the list until you pick an event: then the right
// column says when, where, what to know and who sees it, and holds what a
// host can do to it. A host adds an event with a button and a plain form in
// that same column (KitEventForm). Cancelling asks in the panel, never in a
// browser box.
//
// Nobody is asked whether they are coming (Neil, Nov 14 and Nov 15: not
// needed). Who came and recaps are not shown either: calls happen off
// Polynet, so it can't know.
import { useEffect, useState, type ReactNode } from "react";
import { CalendarPlus, ChevronDown, ChevronRight, MapPin, Plus, Repeat, Video, X } from "lucide-react";
import type { CloudCommunityEvent } from "../../../../shared/cloudCommunityEventsGateway";
import { useRouteDetail, writeRouteDetail } from "../../../../shared/routeDetails";
import { eventAddressKey, eventIdFromAddressKey } from "../../../../shared/webAppRouteState";
import { eventDateBlock, eventDayWord, eventRepeatWord, featuredEventLabel } from "../components/communityEventsList";
import { Btn, cx, Icon, KitApp, Rail, useMinWidth } from "./kit";
import { PanelPart } from "./KitPanel";

// "1:00 pm", as the mock has it (the reader's own time).
export function eventClock(startsAtIso: string): string {
  return new Date(startsAtIso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s+/g, " ").toLowerCase();
}

// "Online · Zoom", "The Foundry", or nothing when the host hasn't said.
export function eventPlaceWord(event: Pick<CloudCommunityEvent, "location_type" | "location_label">): string {
  if (event.location_type === "online") return event.location_label ? `Online · ${event.location_label}` : "Online";
  if (event.location_type === "physical") return event.location_label || "In person";
  return event.location_label || "";
}

// "Tomorrow · in 21 hours", "Thursday · in 3 days": how soon, in words.
export function eventSoonWord(startsAtIso: string, now: number): string {
  const day = eventDayWord(startsAtIso, now);
  const minutes = Math.round((Date.parse(startsAtIso) - now) / 60000);
  if (minutes <= 0) return day;
  if (minutes < 60) return `${day} · in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${day} · in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return days < 14 ? `${day} · in ${days} days` : day;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
// The page says once that times are yours, so a time doesn't repeat it.
const yours = (primary: string) => primary.replace(/\s*·\s*your time$/i, "");

export function KitEventsList(props: {
  featured: CloudCommunityEvent | null;
  comingUp: CloudCommunityEvent[];
  past: CloudCommunityEvent[];
  now: number;
  canManage: boolean;
  communityName: string | null;
  // The reader's time first, then the event's own when they differ.
  timeLabel: (event: CloudCommunityEvent) => { primary: string; secondary: string | null };
  calendarUrl: (event: CloudCommunityEvent) => string;
  // The add-or-change form while it is open, and which event it is changing.
  form: ReactNode | null;
  editingId: string | null;
  onNew: () => void;
  onEdit: (event: CloudCommunityEvent) => void;
  onCancel: (event: CloudCommunityEvent) => Promise<unknown> | void;
  onSetPublic: (event: CloudCommunityEvent, isPublic: boolean) => Promise<unknown> | void;
  // Where the right column's content goes (the page's rail).
  renderRail: (rail: ReactNode) => ReactNode;
}) {
  // The event picked is part of the address (/events/<event>): a refresh,
  // Back and a link keep it; picking one is a step back can return from.
  const pickedId = eventIdFromAddressKey(useRouteDetail("event"));
  const setPickedId = (id: string | null) => writeRouteDetail("event", id ? eventAddressKey(id) : null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pastOpen, setPastOpen] = useState(false);

  const featured = props.featured;
  const label = featured ? featuredEventLabel(featured, props.now) : null;
  const upcoming = [featured, ...props.comingUp].filter((event): event is CloudCommunityEvent => Boolean(event));
  const all = [...upcoming, ...props.past];
  const picked = all.find((event) => event.id === pickedId) ?? null;
  const isPast = (event: CloudCommunityEvent) => props.past.some((row) => row.id === event.id);
  const isSeries = (event: CloudCommunityEvent) => event.recurrence_frequency !== "none";
  // An event that is gone (cancelled, or not in the months shown) is simply
  // not shown; the address is left alone, since the list may still be loading.
  useEffect(() => { setAsking(false); }, [pickedId]);
  // Escape puts down what was picked (the form has its own).
  useEffect(() => {
    if (!pickedId || props.form) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) setPickedId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickedId, props.form]);

  const cancel = async (event: CloudCommunityEvent) => {
    setBusy(event.id);
    try { await props.onCancel(event); } finally { setBusy(null); setAsking(false); }
  };
  const setPublic = async (event: CloudCommunityEvent, isPublic: boolean) => {
    setBusy(event.id);
    try { await props.onSetPublic(event, isPublic); } finally { setBusy(null); }
  };
  const pick = (event: CloudCommunityEvent) => setPickedId(event.id === pickedId ? null : event.id);
  const placeIcon = (event: CloudCommunityEvent) => event.location_type === "online" ? <Video size={14} aria-hidden="true" /> : <MapPin size={14} aria-hidden="true" />;
  const tags = (event: CloudCommunityEvent) => (
    <>
      {eventRepeatWord(event) ? <span className={cx("evtag")}><Repeat size={11} aria-hidden="true" />{capital(eventRepeatWord(event)!)}</span> : null}
      {event.pod_name ? <span className={cx("evtag pod")}>{event.pod_name}</span> : null}
      {props.canManage && event.visibility === "public" && !event.pod_channel_id && !isPast(event) ? <span className={cx("evtag pub")}>On the public page</span> : null}
    </>
  );
  const joinLabel = (event: CloudCommunityEvent) => featuredEventLabel(event, props.now).live ? "Join now" : "Join when it starts";

  // The event you picked.
  const pickedTime = picked ? props.timeLabel(picked) : null;
  const detail = picked && pickedTime ? (
    <div className={cx("evp")}>
      <button type="button" className={cx("evp-x")} aria-label="Close" onClick={() => setPickedId(null)}><X size={16} strokeWidth={1.8} aria-hidden="true" /></button>
      <header>
        <span className={cx("lab")}>{isPast(picked) ? "Past" : eventSoonWord(picked.starts_at, props.now)}</span>
        <h2>{picked.title}</h2>
        <p className={cx("evp-when")}>{eventDayWord(picked.starts_at, props.now)} · {yours(pickedTime.primary)}</p>
        {pickedTime.secondary ? <p className={cx("evp-also")}>{pickedTime.secondary}</p> : null}
        <div className={cx("evp-tags")}>{tags(picked)}</div>
      </header>
      {eventPlaceWord(picked) ? (
        <PanelPart label="Where"><div className={cx("ln")}>{placeIcon(picked)}<span className={cx("t")}>{eventPlaceWord(picked)}</span></div></PanelPart>
      ) : null}
      {picked.description_md ? (
        <PanelPart label="What to know"><p className={cx("evp-say")}>{picked.description_md}</p></PanelPart>
      ) : null}
      <PanelPart label="Who sees it">
        <div className={cx("ln")}><span className={cx("t")}>{picked.pod_name ? `Only people in ${picked.pod_name}` : `Everyone in ${props.communityName ?? "the community"}`}</span></div>
        {props.canManage && !picked.pod_channel_id && !isPast(picked) ? (
          <div className={cx("evswitch")}>
            <span>On the public page<small>Visitors see the name, day and place. The link to join stays with members.</small></span>
            <button type="button" role="switch" aria-checked={picked.visibility === "public"} aria-label="Show on the public page" disabled={busy === picked.id}
              className={cx("evsw", picked.visibility === "public" && "on")} onClick={() => void setPublic(picked, picked.visibility !== "public")}><i /></button>
          </div>
        ) : null}
      </PanelPart>
      {!isPast(picked) ? (
        <div className={cx("evp-foot")}>
          {picked.url ? <a className={cx("btn go")} href={picked.url} target="_blank" rel="noreferrer">{joinLabel(picked)}</a> : null}
          <a className={cx(picked.url ? "btn" : "btn go")} href={props.calendarUrl(picked)} target="_blank" rel="noreferrer"><CalendarPlus size={15} aria-hidden="true" />Add to calendar</a>
          {props.canManage ? (
            asking ? (
              <div className={cx("evp-ask")} role="group" aria-label={`Cancel ${picked.title}`}>
                <span>{isSeries(picked) ? "Cancel every date of this event?" : "Cancel this event?"}</span>
                <div className={cx("two")}>
                  <button type="button" className={cx("btn no")} disabled={busy === picked.id} onClick={() => void cancel(picked)}>{busy === picked.id ? "Cancelling…" : "Yes, cancel it"}</button>
                  <button type="button" className={cx("btn")} onClick={() => setAsking(false)}>Keep it</button>
                </div>
              </div>
            ) : (
              <div className={cx("two")}>
                <button type="button" className={cx("btn")} onClick={() => props.onEdit(picked)}>Edit</button>
                <button type="button" className={cx("btn no")} onClick={() => setAsking(true)}>Cancel event</button>
              </div>
            )
          ) : null}
          <span className={cx("evp-note")}>A reminder email goes out the day before.</span>
        </div>
      ) : null}
    </div>
  ) : null;

  // The right column holds the form while a host is adding or changing an
  // event, else the event picked, else nothing. Narrower than 1024px there
  // is no column, so it takes the list's place, with a way back.
  const wide = useMinWidth(1024);
  const side = props.form ?? detail;
  const rail = side ? (
    <KitApp view="events" host={props.canManage} part="rail" className="kit-page-rail">
      <Rail index={4} label={props.form ? "Event" : "This event"}>{side}</Rail>
    </KitApp>
  ) : null;
  if (!wide && side) {
    return (
      <KitApp view="events" host={props.canManage} part="flow">
        <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
          {props.form ? null : <button type="button" className={cx("btn sm txt")} style={{ marginLeft: -10 }} onClick={() => setPickedId(null)}><Icon name="back" />Events</button>}
          <div className={cx("evlayer")}>{side}</div>
        </div>
      </KitApp>
    );
  }

  const row = (event: CloudCommunityEvent, past: boolean) => {
    const block = eventDateBlock(event.starts_at, past);
    const dim = props.editingId === event.parent_event_id;
    return (
      <button key={event.id} type="button" className={cx("evrow", pickedId === event.id && "on", dim && "evdim")} id={`community-event-${event.id}`} aria-pressed={pickedId === event.id} onClick={() => pick(event)}>
        <span className={cx(past ? "evday sm past" : "evday sm")}><b>{block.number}</b><span>{block.word}</span></span>
        <span className={cx("evrow-t")}>
          <b>{event.title}{tags(event)}</b>
          <small title={props.timeLabel(event).secondary ?? undefined}>{[past ? null : eventDayWord(event.starts_at, props.now), eventClock(event.starts_at), eventPlaceWord(event)].filter(Boolean).join(" · ")}</small>
        </span>
        <ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" className={cx("evrow-go")} />
      </button>
    );
  };
  const last = props.past[0] ?? null;
  const showPast = pastOpen || upcoming.length === 0;
  const featuredBlock = featured ? eventDateBlock(featured.starts_at, false) : null;

  return (
    <>
      <KitApp view="events" host={props.canManage} part="flow">
        <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
          <div className={cx("evtop")}>
            <div>
              <p className={cx("evlead")}>{upcoming.length ? `${upcoming.length} coming up.` : props.canManage ? "Nothing is planned yet." : "Nothing is planned right now."}</p>
              <p className={cx("sub")} style={{ margin: "4px 0 0" }}>{upcoming.length ? "Times are in your time zone." : props.canManage ? "Add the first one and members get an email the day before." : "You'll get an email the day before the next one."}</p>
            </div>
            {/* One form at a time: a second would replace what is being saved. */}
            {props.canManage ? <button type="button" className={cx(props.form ? "btn" : "btn go")} disabled={Boolean(props.form)} onClick={props.onNew}><Plus size={14} aria-hidden="true" />Add an event</button> : null}
          </div>

          {featured && label && featuredBlock ? (
            <>
              <span className={cx("lab")} style={{ display: "block", marginTop: 28 }}>Next</span>
              <div className={cx("evnext", pickedId === featured.id && "on", props.editingId === featured.parent_event_id && "evdim")} id={`community-event-${featured.id}`}>
                <span className={cx("evday")}><b>{featuredBlock.number}</b><span>{featuredBlock.word}</span></span>
                <div>
                  {label.live ? <span className={cx("livepill")}><i />{label.text}</span> : <span className={cx("evsoon")}><i />{eventSoonWord(featured.starts_at, props.now)}</span>}
                  <h2>{featured.title}{tags(featured)}</h2>
                  <p className={cx("evnext-when")} title={props.timeLabel(featured).secondary ?? undefined}>{eventDayWord(featured.starts_at, props.now)} · {yours(props.timeLabel(featured).primary)}</p>
                  {eventPlaceWord(featured) ? <p className={cx("evnext-where")}>{placeIcon(featured)}{eventPlaceWord(featured)}</p> : null}
                  {featured.description_md ? <p className={cx("evnext-say")}>{featured.description_md}</p> : null}
                  <div className={cx("evnext-acts")}>
                    {featured.url ? <a className={cx("btn go")} href={featured.url} target="_blank" rel="noreferrer">{label.live ? "Join now" : "Join when it starts"}</a> : null}
                    <a className={cx(featured.url ? "btn" : "btn go")} href={props.calendarUrl(featured)} target="_blank" rel="noreferrer"><CalendarPlus size={15} aria-hidden="true" />Add to calendar</a>
                    <Btn onClick={() => pick(featured)}>Details</Btn>
                  </div>
                </div>
              </div>
            </>
          ) : last && !props.canManage ? (
            // Nothing coming for a member: the page still says something true.
            <div className={cx("evquiet")}>
              <h3>Last time: {last.title}</h3>
              <p>{[new Date(last.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }), eventPlaceWord(last)].filter(Boolean).join(" · ")}</p>
            </div>
          ) : null}

          {props.comingUp.length ? (
            <>
              <span className={cx("evsect")}><span className={cx("lab")}>Later</span><em>{props.comingUp.length}</em></span>
              <div className={cx("evrows")}>{props.comingUp.map((event) => row(event, false))}</div>
            </>
          ) : null}

          {props.past.length ? (
            <>
              <span className={cx("evsect")}>
                <span className={cx("lab")}>Past</span><em>{props.past.length}</em>
                {upcoming.length ? (
                  <button type="button" className={cx("evmore")} aria-expanded={showPast} onClick={() => setPastOpen(!pastOpen)}>{showPast ? "Hide" : "Show"}<ChevronDown size={14} aria-hidden="true" style={showPast ? { transform: "rotate(180deg)" } : undefined} /></button>
                ) : null}
              </span>
              {showPast ? <div className={cx("evrows")}>{props.past.map((event) => row(event, true))}</div> : null}
            </>
          ) : null}
        </div>
      </KitApp>
      {wide && rail ? props.renderRail(rail) : null}
    </>
  );
}
