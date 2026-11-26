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
import {
  earlierCancelledOccurrencesForEvent,
  eventDayWord,
  eventRepeatWord,
  featuredEventLabel,
  splitCommunityEvents,
} from "../components/communityEventsList";
import { eventClock, eventPlaceWord } from "./KitEventsList";
import { cx } from "./kit";
import { PanelAction, PanelNext, PanelPart } from "./KitPanel";

const LOOKAHEAD_MS = 14 * 86_400_000;

// The read behind the part: the live events of the coming two weeks, live
// (shared/liveQuery.ts): an event added, moved or cancelled anywhere shows at
// once. Keeps includeCancelled: false so high cancellation volume can never
// exhaust the overlap limit and hide a live upcoming event.
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
  const hour = Math.floor(props.now / 3_600_000) * 3_600_000;
  const subject = props.session ? resolveAuthSubject(props.session as AuthSessionLike) : null;
  // Separate non-overlap read for upcoming cancelled occurrences so cancellation
  // volume can never cause the primary live next-event query to fail.
  const { data: withCancelledData } = useLiveQuery<unknown>(
    props.session,
    "communityEvents:listCommunityEvents",
    subject
      ? {
          authSubject: subject,
          communityId: props.communityId,
          startIso: new Date(hour - 6 * 3_600_000).toISOString(),
          endIso: new Date(hour + LOOKAHEAD_MS + 3_600_000).toISOString(),
          includeCancelled: true,
          overlap: false,
          limit: 200,
        }
      : null,
  );
  const liveSplit = useMemo(
    () => (data === undefined ? undefined : splitCommunityEvents(coerceGatewayRows<CloudCommunityEvent>(data), props.now)),
    // Which event is next changes as time passes: read again each minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, Math.floor(props.now / 60_000)],
  );
  const cancelledList = useMemo(
    () =>
      withCancelledData === undefined
        ? []
        : splitCommunityEvents(coerceGatewayRows<CloudCommunityEvent>(withCancelledData), props.now).cancelled,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [withCancelledData, Math.floor(props.now / 60_000)],
  );

  const event = liveSplit?.featured ?? null;
  const label = event ? featuredEventLabel(event, props.now) : null;
  const earlierCancelled = event ? earlierCancelledOccurrencesForEvent(event, cancelledList) : [];
  const nextCancelledOnly = !event ? cancelledList[0] ?? null : null;

  if (!event || !label) {
    if (!nextCancelledOnly) return null;
    const cancelledSub = [
      eventDayWord(nextCancelledOnly.starts_at, props.now),
      eventClock(nextCancelledOnly.starts_at),
      nextCancelledOnly.cancellation_note?.trim() || null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <PanelPart label="Next up" fact="Cancelled" action={<PanelAction onClick={props.onOpenEvents}>All events</PanelAction>}>
        <PanelNext
          title={nextCancelledOnly.title}
          sub={cancelledSub}
          onClick={props.onOpenEvents}
          ariaLabel={`Open cancelled ${nextCancelledOnly.title} in Events`}
        />
      </PanelPart>
    );
  }
  const sub = [label.live ? null : eventClock(event.starts_at), eventRepeatWord(event), eventPlaceWord(event)].filter(Boolean).join(" · ");
  const formatCancelledDay = (startsAtIso: string) => {
    const word = eventDayWord(startsAtIso, props.now);
    return /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(word) ? `This ${word}` : word;
  };
  const cancelledNotice =
    earlierCancelled.length === 1
      ? formatCancelledDay(earlierCancelled[0]!.starts_at)
      : earlierCancelled.length >= 2
        ? `${formatCancelledDay(earlierCancelled[0]!.starts_at)} & ${eventDayWord(earlierCancelled[1]!.starts_at, props.now)}${earlierCancelled.length > 2 ? ` (+${earlierCancelled.length - 2})` : ""}`
        : null;
  return (
    <PanelPart label="Next up" fact={label.live ? null : label.text} action={<PanelAction onClick={props.onOpenEvents}>All events</PanelAction>}>
      {label.live ? <span className={cx("livepill")}><i />{label.text}</span> : null}
      <PanelNext title={event.title} sub={sub} onClick={props.onOpenEvents} ariaLabel={`Open ${event.title} in Events`}
        action={label.live && event.url ? <a className={cx("btn go")} href={event.url} target="_blank" rel="noreferrer">Join</a> : null} />
      {cancelledNotice ? (
        <button type="button" className={cx("nx-cancel")} onClick={props.onOpenEvents}>
          <span className={cx("evtag bad")}>Cancelled</span>
          <span>{cancelledNotice}</span>
        </button>
      ) : null}
    </PanelPart>
  );
}
