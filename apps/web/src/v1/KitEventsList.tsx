// Design system v1: Events in the mock's markup (docs/design/hifi-mock,
// Events). The next event as a card, Coming up with "I'll be there", and past
// events as a plain list. Hosts also get New event, Edit and Cancel. Who came
// and recaps are not shown: calls happen off Polynet, so it can't know yet.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { UserAvatar } from "../../../../shared/UserAvatar";
import {
  listCloudCommunityEventGoing,
  setCloudCommunityEventGoing,
  type CloudCommunityEvent,
  type CloudCommunityEventGoing,
} from "../../../../shared/cloudCommunityEventsGateway";
import { eventDateBlock, eventDayWord, featuredEventLabel } from "../components/communityEventsList";
import { Btn, cx, Icon, KitApp, Rail, Sec } from "./kit";

// "1:00 pm", as the mock has it (the reader's own time).
export function eventClock(startsAtIso: string): string {
  return new Date(startsAtIso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s+/g, " ").toLowerCase();
}

export const goingKey = (event: { parent_event_id: string; starts_at: string }) => `${event.parent_event_id}:${Date.parse(event.starts_at)}`;

// "Neil is hosting · 14 going", with only the parts that are known.
export function eventPeopleLine(going: Pick<CloudCommunityEventGoing, "host_name" | "count" | "count_capped"> | undefined): string {
  if (!going) return "";
  const host = going.host_name ? `${going.host_name.split(/\s+/)[0]} is hosting` : "";
  const count = going.count > 0 ? `${going.count}${going.count_capped ? "+" : ""} going` : "";
  return [host, count].filter(Boolean).join(" · ");
}

export function KitEventsList(props: {
  featured: CloudCommunityEvent | null;
  comingUp: CloudCommunityEvent[];
  past: CloudCommunityEvent[];
  now: number;
  canManage: boolean;
  going: { session: unknown; communityId: string } | null;
  timeLabel: (event: CloudCommunityEvent) => string;
  calendarUrl: (event: CloudCommunityEvent) => string;
  onNew: () => void;
  onEdit: (event: CloudCommunityEvent) => void;
  onCancel: (event: CloudCommunityEvent) => void;
  getAvatarColor?: (id: string) => string;
  // Where the right column's content goes (the page's rail).
  renderRail: (rail: ReactNode) => ReactNode;
}) {
  const upcoming = useMemo(() => [props.featured, ...props.comingUp].filter((event): event is CloudCommunityEvent => Boolean(event)), [props.featured, props.comingUp]);
  const [going, setGoing] = useState<Map<string, CloudCommunityEventGoing>>(() => new Map());
  const [saving, setSaving] = useState<string | null>(null);
  const itemsKey = upcoming.map(goingKey).join("|");

  const load = useCallback(async () => {
    if (!props.going || upcoming.length === 0) return;
    try {
      const rows = await listCloudCommunityEventGoing({
        session: props.going.session, communityId: props.going.communityId,
        items: upcoming.map((event) => ({ eventId: event.parent_event_id, occurrenceStartsAt: Date.parse(event.starts_at) })),
      });
      setGoing(new Map(rows.map((row) => [`${row.event_id}:${row.occurrence_starts_at}`, row])));
    } catch {
      // The page still works without counts; "I'll be there" retries on click.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.going?.session, props.going?.communityId, itemsKey]);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (event: CloudCommunityEvent) => {
    if (!props.going || saving) return;
    const key = goingKey(event);
    const next = !going.get(key)?.mine;
    setSaving(key);
    try {
      await setCloudCommunityEventGoing({ session: props.going.session, communityId: props.going.communityId, eventId: event.parent_event_id, occurrenceStartsAt: Date.parse(event.starts_at), going: next });
      await load();
    } finally {
      setSaving(null);
    }
  };

  const goingButton = (event: CloudCommunityEvent) => {
    if (!props.going) return null;
    const mine = Boolean(going.get(goingKey(event))?.mine);
    return (
      <button type="button" className={cx("btn sm", mine && "on")} aria-pressed={mine} disabled={saving === goingKey(event)} onClick={() => void toggle(event)}>
        {mine ? <><Icon name="check" />Going</> : "I'll be there"}
      </button>
    );
  };
  const manage = (event: CloudCommunityEvent) => props.canManage ? (
    <>
      <Btn txt small onClick={() => props.onEdit(event)}>Edit</Btn>
      <Btn txt small onClick={() => props.onCancel(event)}>Cancel</Btn>
    </>
  ) : null;
  const recurrence = (event: CloudCommunityEvent) => (event.recurrence_frequency !== "none" ? event.recurrence_frequency : null);

  const featured = props.featured;
  const label = featured ? featuredEventLabel(featured, props.now) : null;
  const featuredGoing = featured ? going.get(goingKey(featured)) : undefined;
  const mine = upcoming.filter((event) => going.get(goingKey(event))?.mine);

  const rail = (
    <KitApp view="events" host={props.canManage} part="rail" className="events-kit-rail">
      <Rail index={4} label="Your events">
        <Sec label="You're going to">
          {mine.length ? mine.slice(0, 6).map((event, index) => (
            <div key={event.id} className={cx("src")} style={index ? { marginTop: -8 } : undefined}>
              <Icon name="cal" />{event.title}<em>{eventDayWord(event.starts_at, props.now).toLowerCase()}</em>
            </div>
          )) : <p>{upcoming.length ? "Nothing yet. Say you'll be there and it shows here." : "Nothing is planned yet."}</p>}
        </Sec>
      </Rail>
    </KitApp>
  );

  return (
    <>
      <KitApp view="events" host={props.canManage} part="flow">
        <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
          {featured && label ? (
            <div className={cx("card")} style={{ marginTop: 0, maxWidth: "none" }} id={`community-event-${featured.id}`}>
              <div className={cx("meta")}>
                {label.live ? <span className={cx("livepill")}><i />{label.text}</span> : <span>{label.text}</span>}
                <span title={props.timeLabel(featured)}>{[label.live ? `${eventDayWord(featured.starts_at, props.now)}, ${eventClock(featured.starts_at)}` : eventClock(featured.starts_at), recurrence(featured)].filter(Boolean).join(" · ")}</span>
              </div>
              <h2>{featured.title}</h2>
              {featured.description_md ? <p className={cx("say")}>{featured.description_md}</p> : null}
              <div className={cx("acts")} style={{ flexWrap: "wrap", rowGap: 12 }}>
                {featured.url ? <a className={cx("btn go")} href={featured.url} target="_blank" rel="noreferrer">{label.live ? "Join" : "Join when it starts"}</a> : null}
                {goingButton(featured)}
                <a className={cx("btn")} href={props.calendarUrl(featured)} target="_blank" rel="noreferrer">Add to calendar</a>
                {manage(featured)}
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                  {featuredGoing?.faces.length ? (
                    <span className={cx("stack")}>
                      {featuredGoing.faces.map((face) => (
                        <span key={face.user_id} className={cx("av xs")}>
                          <UserAvatar className="community-dm-kit-avatar" readyClassName="has-image" name={face.name} imageUrl={face.avatar_url} alt=""
                            fallback={<span>{face.name.charAt(0).toUpperCase()}</span>} fallbackStyle={props.getAvatarColor ? { backgroundColor: props.getAvatarColor(face.user_id) } : undefined} />
                        </span>
                      ))}
                    </span>
                  ) : null}
                  <span className={cx("sub2")}>{eventPeopleLine(featuredGoing)}</span>
                </span>
              </div>
            </div>
          ) : (
            <p className={cx("lead")} style={{ marginTop: 0 }}><span className={cx("aura")}><Icon name="spark" /></span>Nothing is planned yet.</p>
          )}
          <div style={{ display: "flex", alignItems: "center", marginTop: 34 }}>
            <span className={cx("lab")}>Coming up</span>
            {props.canManage ? <button type="button" className={cx("btn sm newev")} onClick={props.onNew}><Icon name="plus" />New event</button> : null}
          </div>
          <div className={cx("list")} style={{ marginTop: 8 }}>
            {props.comingUp.map((event) => {
              const block = eventDateBlock(event.starts_at, false);
              return (
                <div key={event.id} className={cx("erow")} id={`community-event-${event.id}`}>
                  <div className={cx("date")}><b>{block.number}</b><span>{block.word}</span></div>
                  <div><b>{event.title}</b><span className={cx("s")} title={props.timeLabel(event)}>{[eventClock(event.starts_at), recurrence(event), eventPeopleLine(going.get(goingKey(event)))].filter(Boolean).join(" · ")}</span></div>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>{manage(event)}{goingButton(event)}</span>
                </div>
              );
            })}
            {props.comingUp.length === 0 ? <p className={cx("none")} style={{ fontSize: 13, padding: "10px 0" }}>{featured ? "Nothing else is planned yet." : props.canManage ? "Add the first one." : "Your host hasn't planned anything yet."}</p> : null}
          </div>
          {props.past.length ? (
            <>
              <span className={cx("lab")} style={{ display: "block", marginTop: 30 }}>Past</span>
              <div className={cx("list")} style={{ marginTop: 8 }}>
                {props.past.map((event) => {
                  const block = eventDateBlock(event.starts_at, true);
                  return (
                    <div key={event.id} className={cx("erow")}>
                      <div className={cx("date past")}><b>{block.number}</b><span>{block.word}</span></div>
                      <div><b>{event.title}</b><span className={cx("s")}>{eventClock(event.starts_at)}</span></div>
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
