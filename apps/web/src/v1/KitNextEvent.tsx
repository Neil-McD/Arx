// Design system v1: the next thing to do in Home's right column: the next
// event in the coming two weeks (so a call on Thursday is there on Monday,
// not only on the day); with nothing planned it draws nothing. It reads the same expanded event list as the Events
// page, so a weekly call that began weeks ago still shows, and says the same
// things about it as the Events page.
import { useEffect, useState } from "react";
import { listCloudCommunityEvents, type CloudCommunityEvent } from "../../../../shared/cloudCommunityEventsGateway";
import { eventRepeatWord, featuredEventLabel, splitCommunityEvents } from "../components/communityEventsList";
import { eventClock, eventPlaceWord } from "./KitEventsList";
import { onCommunityEventsChanged } from "../../../../shared/communityEventsChanged";
import { cx } from "./kit";
import { PanelAction, PanelNext, PanelPart } from "./KitPanel";

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
  // Nothing planned: the part is not drawn.
  if (!event || !label) return null;
  const sub = [label.live ? null : eventClock(event.starts_at), eventRepeatWord(event), eventPlaceWord(event)].filter(Boolean).join(" · ");
  return (
    <PanelPart label="Next up" fact={label.live ? null : label.text} action={<PanelAction onClick={props.onOpenEvents}>All events</PanelAction>}>
      {label.live ? <span className={cx("livepill")}><i />{label.text}</span> : null}
      <PanelNext title={event.title} sub={sub}
        action={label.live && event.url ? <a className={cx("btn go")} href={event.url} target="_blank" rel="noreferrer">Join</a> : null} />
    </PanelPart>
  );
}
