// Design system v1: the next event in Home's right column (the mock's "Right
// now" for a member, "Next up" for the host). It reads the same expanded event
// list as the Events page, so a weekly call that began weeks ago still shows,
// and says the same things about it as the Events page.
import { useEffect, useState } from "react";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { listCloudCommunityEvents, type CloudCommunityEvent } from "../../../../shared/cloudCommunityEventsGateway";
import type { CommunityPresenceSummary } from "../../../../shared/communityTypes";
import { eventRepeatWord, featuredEventLabel, splitCommunityEvents } from "../components/communityEventsList";
import { eventClock, eventPlaceWord } from "./KitEventsList";
import { onCommunityEventsChanged } from "../../../../shared/communityEventsChanged";
import { cx, Sec, Sep, TextLink } from "./kit";

const LOOKAHEAD_MS = 14 * 86_400_000;

export function KitNextEvent(props: {
  session: unknown;
  communityId: string;
  now: number;
  onOpenEvents: () => void;
  presence?: CommunityPresenceSummary | null;
  // A member's column also says who is here now.
  showHere?: boolean;
  // Home: the next event in the coming two weeks (so a call on Thursday is
  // there on Monday, not only on the day), and nothing at all when there is
  // none.
  quietWhenNone?: boolean;
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
  if (props.quietWhenNone && !(event && label)) return null;
  const faces = props.presence?.online_faces ?? [];
  const hereCount = props.presence?.online_count ?? faces.length;
  return (
    <>
      <div className={cx("sec")}>
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
      {props.showHere && hereCount > 0 ? (
        <>
          <Sep />
          <Sec label="Here now">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className={cx("stack")}>
                {faces.slice(0, 5).map((face) => (
                  <span key={face.user_id} className={cx("av s")}>
                    <UserAvatar className="community-dm-kit-avatar" readyClassName="has-image" name={face.display_name ?? "Member"} imageUrl={face.avatar_url} alt=""
                      fallback={<span>{(face.initials ?? face.display_name ?? "?").charAt(0).toUpperCase()}</span>}
                      fallbackStyle={face.avatar_color ? { backgroundColor: face.avatar_color } : undefined} />
                  </span>
                ))}
              </span>
              <span className={cx("sub2")}>{hereCount}{props.presence?.online_count_capped ? "+" : ""} here now</span>
            </div>
          </Sec>
        </>
      ) : null}
    </>
  );
}
