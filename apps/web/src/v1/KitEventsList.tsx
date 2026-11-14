// Design system v1: Events (Nov 14 mock). One list: the next event as a card,
// then Later and Past. A host adds an event in the page (KitEventForm), not in
// a pop-up, and cancelling asks in the row, not in a browser box. The right
// column is the event you picked: when, where, what to know, and for a host
// whether it shows on the public page.
//
// Nobody is asked whether they are coming (Neil, Nov 14: not needed yet). Who came and
// recaps are not shown either: calls happen off Polynet, so it can't know.
import { useState, type ReactNode } from "react";
import type { CloudCommunityEvent } from "../../../../shared/cloudCommunityEventsGateway";
import { eventDateBlock, eventDayWord, eventRepeatWord, featuredEventLabel } from "../components/communityEventsList";
import { Btn, cx, Icon, KitApp, Rail, Sec, Sep } from "./kit";

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
  // The add-or-change box while it is open, and which event it is changing.
  form: ReactNode | null;
  editingId: string | null;
  onNew: () => void;
  onEdit: (event: CloudCommunityEvent) => void;
  onCancel: (event: CloudCommunityEvent) => Promise<unknown> | void;
  onSetPublic: (event: CloudCommunityEvent, isPublic: boolean) => Promise<unknown> | void;
  // Where the right column's content goes (the page's rail).
  renderRail: (rail: ReactNode) => ReactNode;
}) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const featured = props.featured;
  const label = featured ? featuredEventLabel(featured, props.now) : null;
  const all = [featured, ...props.comingUp, ...props.past].filter((event): event is CloudCommunityEvent => Boolean(event));
  const picked = all.find((event) => event.id === pickedId) ?? featured ?? all[0] ?? null;
  const isPast = (event: CloudCommunityEvent) => props.past.some((row) => row.id === event.id);
  const isSeries = (event: CloudCommunityEvent) => event.recurrence_frequency !== "none";

  const cancel = async (event: CloudCommunityEvent) => {
    setBusy(event.id);
    try { await props.onCancel(event); } finally { setBusy(null); setAsking(null); }
  };
  const setPublic = async (event: CloudCommunityEvent, isPublic: boolean) => {
    setBusy(event.id);
    try { await props.onSetPublic(event, isPublic); } finally { setBusy(null); }
  };

  // Edit and Cancel, or the question Cancel asks, in the same place.
  const manage = (event: CloudCommunityEvent) => {
    if (!props.canManage) return null;
    if (asking === event.id) return (
      <span className={cx("evask")} role="group" aria-label={`Cancel ${event.title}`}>
        <span>{isSeries(event) ? "Cancel every date?" : "Cancel it?"}</span>
        <button type="button" className={cx("btn sm no")} disabled={busy === event.id} onClick={() => void cancel(event)}>{busy === event.id ? "Cancelling" : "Yes, cancel"}</button>
        <Btn txt small onClick={() => setAsking(null)}>Keep</Btn>
      </span>
    );
    return (
      <>
        <Btn txt small onClick={() => props.onEdit(event)}>Edit</Btn>
        <Btn txt small onClick={() => setAsking(event.id)}>Cancel</Btn>
      </>
    );
  };
  const name = (event: CloudCommunityEvent) => (
    <button type="button" className={cx("evname")} aria-pressed={picked?.id === event.id} onClick={() => setPickedId(event.id)}>
      {event.title}{event.pod_name ? <span className={cx("podtag")}>{event.pod_name}</span> : null}
    </button>
  );

  const pickedTime = picked ? props.timeLabel(picked) : null;
  const pickedPlace = picked ? eventPlaceWord(picked) : "";
  const pickedRepeat = picked ? eventRepeatWord(picked) : null;
  const rail = (
    <KitApp view="events" host={props.canManage} part="rail" className="kit-page-rail">
      <Rail index={4} label="This event">
        {picked && pickedTime ? (
          <>
            <Sec label={isPast(picked) ? "Past" : picked.id === featured?.id ? "Next" : "Later"}>
              <h3>{picked.title}</h3>
              <p>{eventDayWord(picked.starts_at, props.now)} · {pickedTime.primary}</p>
              {pickedTime.secondary ? <p className={cx("sub")}>{pickedTime.secondary}</p> : null}
              {pickedRepeat ? <p className={cx("sub")}>Repeats {pickedRepeat}</p> : null}
              {pickedPlace ? <p className={cx("sub")}>{pickedPlace}</p> : null}
              {picked.pod_name ? <p className={cx("sub")}>Only people in {picked.pod_name} see it.</p> : null}
            </Sec>
            {picked.description_md ? (
              <>
                <Sep />
                <Sec label="What to know"><p style={{ whiteSpace: "pre-wrap" }}>{picked.description_md}</p></Sec>
              </>
            ) : null}
            {props.canManage && !picked.pod_channel_id && !isPast(picked) ? (
              <>
                <Sep />
                <div className={cx("evswitch")}>
                  <span>On {props.communityName ?? "the community"}'s public page<small>Visitors see the name, day and place. The link to join stays with members.</small></span>
                  <button type="button" role="switch" aria-checked={picked.visibility === "public"} aria-label="Show on the public page" disabled={busy === picked.id}
                    className={cx("evsw", picked.visibility === "public" && "on")} onClick={() => void setPublic(picked, picked.visibility !== "public")}><i /></button>
                </div>
              </>
            ) : null}
          </>
        ) : (
          <Sec><p>{props.canManage ? "Add an event and it shows here: when it is, where, and who can see it." : "Nothing is planned yet."}</p></Sec>
        )}
      </Rail>
    </KitApp>
  );

  return (
    <>
      <KitApp view="events" host={props.canManage} part="flow">
        <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
          {props.form ?? (props.canManage ? (
            <button type="button" className={cx("evaddrow")} onClick={props.onNew}>
              <Icon name="plus" />Add an event<span>Try "Office hours every Tuesday 3pm"</span>
            </button>
          ) : null)}
          {featured && label ? (
            <>
              <span className={cx("lab")} style={{ display: "block", marginTop: props.canManage || props.form ? 26 : 0 }}>Next</span>
              <div className={cx("card", props.editingId === featured.parent_event_id && "evdim")} style={{ marginTop: 10, maxWidth: "none" }} id={`community-event-${featured.id}`}>
                <div className={cx("meta")}>
                  {label.live ? <span className={cx("livepill")}><i />{label.text}</span> : <span>{label.text}</span>}
                  <span title={props.timeLabel(featured).secondary ?? undefined}>{[label.live ? `${eventDayWord(featured.starts_at, props.now)}, ${eventClock(featured.starts_at)}` : eventClock(featured.starts_at), eventRepeatWord(featured), eventPlaceWord(featured)].filter(Boolean).join(" · ")}</span>
                </div>
                <h2>{name(featured)}</h2>
                {featured.description_md ? <p className={cx("say")}>{featured.description_md}</p> : null}
                <div className={cx("acts")} style={{ flexWrap: "wrap", rowGap: 12 }}>
                  {featured.url ? <a className={cx("btn go")} href={featured.url} target="_blank" rel="noreferrer">{label.live ? "Join now" : "Join when it starts"}</a> : null}
                  <a className={cx("btn")} href={props.calendarUrl(featured)} target="_blank" rel="noreferrer">Add to calendar</a>
                  <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>{manage(featured)}</span>
                </div>
              </div>
            </>
          ) : (
            <p className={cx("lead")} style={{ marginTop: props.canManage || props.form ? 26 : 0 }}><span className={cx("aura")}><Icon name="spark" /></span>{props.canManage ? "Nothing is planned yet. Add the first one above." : "Nothing is planned yet."}</p>
          )}
          {props.comingUp.length ? (
            <>
              <span className={cx("lab")} style={{ display: "block", marginTop: 30 }}>Later</span>
              <div className={cx("list")} style={{ marginTop: 8 }}>
                {props.comingUp.map((event) => {
                  const block = eventDateBlock(event.starts_at, false);
                  return (
                    <div key={event.id} className={cx("erow", props.editingId === event.parent_event_id && "evdim")} id={`community-event-${event.id}`}>
                      <div className={cx("date")}><b>{block.number}</b><span>{block.word}</span></div>
                      <div><b>{name(event)}</b><span className={cx("s")} title={props.timeLabel(event).secondary ?? undefined}>{[eventDayWord(event.starts_at, props.now), eventClock(event.starts_at), eventRepeatWord(event), eventPlaceWord(event)].filter(Boolean).join(" · ")}</span></div>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {manage(event)}
                        {asking === event.id ? null : <a className={cx("btn sm")} href={props.calendarUrl(event)} target="_blank" rel="noreferrer">Add to calendar</a>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
          {props.past.length ? (
            <>
              <span className={cx("lab")} style={{ display: "block", marginTop: 30 }}>Past</span>
              <div className={cx("list")} style={{ marginTop: 8 }}>
                {props.past.map((event) => {
                  const block = eventDateBlock(event.starts_at, true);
                  return (
                    <div key={event.id} className={cx("erow")}>
                      <div className={cx("date past")}><b>{block.number}</b><span>{block.word}</span></div>
                      <div><b>{name(event)}</b><span className={cx("s")}>{[eventClock(event.starts_at), eventPlaceWord(event)].filter(Boolean).join(" · ")}</span></div>
                      <span />
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </KitApp>
      {props.renderRail(rail)}
    </>
  );
}
