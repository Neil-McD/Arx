// Design system v1: the next thing to do in Home's right column: the next
// event in the coming two weeks (so a call on Thursday is there on Monday,
// not only on the day). It reads the same expanded event list as the Events
// page, so a weekly call that began weeks ago still shows, and says the same
// things about it as the Events page.
import { useEffect, useState } from "react";
import { listCloudCommunityEvents, type CloudCommunityEvent } from "../../../../shared/cloudCommunityEventsGateway";
import { eventRepeatWord, featuredEventLabel, splitCommunityEvents } from "../components/communityEventsList";
import { eventClock, eventPlaceWord } from "./KitEventsList";
import { onCommunityEventsChanged } from "../../../../shared/communityEventsChanged";
import { cx, TextLink } from "./kit";

const LOOKAHEAD_MS = 14 * 86_400_000;

export function KitNextEvent(props: {
  session: unknown;
  communityId: string;
  now: number;
  onOpenEvents: () => void;
}) {
  const [event, setEvent] = useState<CloudCommunityEvent | null | undefined>(undefined);
  // Bumped when an event is added, changed or cancelled anywhere in the app.
  const [changed, setChanged] = useState(0);
  useEffect(() => onCommunityEventsChanged(() => setChanged((count) => count + 1)), []);
  useEffect(() => {
    let cancelled = false;
    const start = new Date(props.now - 6 * 3_600_000).toISOString();
    const end = new Date(props.now + LOOKAHEAD_MS).toISOString();
    listCloudCommunityEvents({ session: props.session, communityId: props.communityId, startIso: start, endIso: end, overlap: true, limit: 50 })
      .then((events) => { if (!cancelled) setEvent(splitCommunityEvents(events, props.now).featured); })
      .catch(() => { if (!cancelled) setEvent(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.session, props.communityId, changed]);

  const label = event ? featuredEventLabel(event, props.now) : null;
  return (
    <div className={cx("rz")}>
        {event && label ? (
          <>
            {label.live ? <span className={cx("livepill")}><i />{label.text}</span> : <span className={cx("lab")}>Next up · {label.text}, {eventClock(event.starts_at)}</span>}
            <h3>{event.title}</h3>
            <p>{[eventRepeatWord(event), eventPlaceWord(event)].filter(Boolean).join(" · ")}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {label.live && event.url ? <a className={cx("btn go")} style={{ height: 32, fontSize: 13 }} href={event.url} target="_blank" rel="noreferrer">Join</a> : null}
              <button type="button" className={cx("btn txt")} style={{ height: 32, fontSize: 13 }} onClick={props.onOpenEvents}>All events</button>
            </div>
          </>
        ) : (
          <>
            <span className={cx("lab")}>Next up</span>
            <p>{event === undefined ? " " : "Nothing planned in the next two weeks."}</p>
            <TextLink style={{ marginTop: 2 }} onClick={props.onOpenEvents}>All events</TextLink>
          </>
        )}
    </div>
  );
}
