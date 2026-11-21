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

// The read behind the part: the events of the coming two weeks, live
// (shared/liveQuery.ts): an event added, moved or cancelled anywhere shows at
// once. The window moves by the hour, so the subscription isn't remade on
// every draw. data undefined: not answered yet.
export function useNextEventRead(session: unknown, communityId: string, now: number): { data: unknown; settled: boolean } {
  const hour = Math.floor(now / 3_600_000) * 3_600_000;
  const subject = session ? resolveAuthSubject(session as AuthSessionLike) : null;
  const { data, error } = useLiveQuery<unknown>(session, "communityEvents:listCommunityEvents", subject ? {
    authSubject: subject,
    communityId,
    startIso: new Date(hour - 6 * 3_600_000).toISOString(),
    endIso: new Date(hour + LOOKAHEAD_MS + 3_600_000).toISOString(),
    includeCancelled: false,
    overlap: true,
    limit: 50,
  } : null);
  return { data, settled: data !== undefined || Boolean(error) };
}

export function KitNextEvent(props: {
  session: unknown;
  communityId: string;
  now: number;
  onOpenEvents: () => void;
}) {
  const { data } = useNextEventRead(props.session, props.communityId, props.now);
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
      <PanelNext title={event.title} sub={sub} onClick={props.onOpenEvents} ariaLabel={`Open ${event.title} in Events`}
        action={label.live && event.url ? <a className={cx("btn go")} href={event.url} target="_blank" rel="noreferrer">Join</a> : null} />
    </PanelPart>
  );
}
