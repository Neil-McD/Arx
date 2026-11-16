// Design system v1: the next thing to do in Home's right column: the next
// event in the coming two weeks (so a call on Thursday is there on Monday,
// not only on the day); with nothing planned it draws nothing. It reads the same expanded event list as the Events
// page, so a weekly call that began weeks ago still shows, and says the same
// things about it as the Events page.
import { useMemo } from "react";
import type { CloudCommunityEvent } from "../../../../shared/cloudCommunityEventsGateway";
import { coerceGatewayRows } from "../../../../shared/cloudGateway";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { useLiveQuery } from "../../../../shared/liveQuery";
import { eventRepeatWord, featuredEventLabel, splitCommunityEvents } from "../components/communityEventsList";
import { eventClock, eventPlaceWord } from "./KitEventsList";
import { cx } from "./kit";
import { PanelAction, PanelNext, PanelPart } from "./KitPanel";

const LOOKAHEAD_MS = 14 * 86_400_000;

export function KitNextEvent(props: {
  session: unknown;
  communityId: string;
  now: number;
  onOpenEvents: () => void;
}) {
  // Live (shared/liveQuery.ts): an event added, moved or cancelled anywhere
  // shows here at once. The window moves by the hour, so the subscription
  // isn't remade on every draw.
  const hour = Math.floor(props.now / 3_600_000) * 3_600_000;
  const subject = props.session ? resolveAuthSubject(props.session as AuthSessionLike) : null;
  const { data } = useLiveQuery<unknown>(props.session, "communityEvents:listCommunityEvents", subject ? {
    authSubject: subject,
    communityId: props.communityId,
    startIso: new Date(hour - 6 * 3_600_000).toISOString(),
    endIso: new Date(hour + LOOKAHEAD_MS + 3_600_000).toISOString(),
    includeCancelled: false,
    overlap: true,
    limit: 50,
  } : null);
  const event = useMemo(
    () => (data === undefined ? undefined : splitCommunityEvents(coerceGatewayRows<CloudCommunityEvent>(data), props.now).featured),
    // Which event is next changes as time passes: read again each minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, Math.floor(props.now / 60_000)],
  );

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
