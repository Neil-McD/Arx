// Design system v1: Home's right column. Three things, in this order:
// Today (an event that is on today, a few lines on what is going on, and the
// day's counts), who is online now, and the community's memory. The same for
// a host and a member; a host's Today also says what is waiting for them.
import { useEffect, useState } from "react";
import type { CloudCommunityHomeSnapshot } from "../../../../shared/cloudCommunityAdminGateway";
import type { CommunityPresenceSummary } from "../../../../shared/communityTypes";
import { todayCounts, todayLines, type TodayLine } from "../../../../shared/communityHomeToday";
import { fetchCommunityNotes } from "../../../../shared/cloudCommunityNotesGateway";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { cx, Sec, Sep, TextLink } from "./kit";
import { KitMemoryMap } from "./KitMemoryMap";
import { KitNextEvent } from "./KitNextEvent";
import { noteIsNew } from "./KitKnowledgeNotes";

function hereLine(presence: CommunityPresenceSummary | null | undefined): string {
  const faces = presence?.online_faces ?? [];
  const count = presence?.online_count ?? faces.length;
  if (count <= 0) return "No one else is here right now.";
  const names = faces.map((face) => String(face.display_name ?? "").trim().split(/\s+/)[0]).filter(Boolean).slice(0, 2);
  const more = count - names.length;
  const capped = presence?.online_count_capped ? "+" : "";
  if (!names.length) return `${count}${capped} here now`;
  if (more <= 0) return `${names.join(" and ")} ${names.length === 1 ? "is" : "are"} here`;
  return `${names.join(", ")} and ${more}${capped} more here`;
}

export function KitHomeRail(props: {
  session: unknown;
  communityId: string;
  audience: "host" | "member";
  snapshot: CloudCommunityHomeSnapshot;
  presence?: CommunityPresenceSummary | null;
  now: number;
  onOpenEvents: () => void;
  onOpenChannelByName: (name: string) => void;
  onOpenMembers: () => void;
  onOpenKnowledge?: () => void;
}) {
  const [memory, setMemory] = useState<{ total: number; more: boolean; fresh: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchCommunityNotes({ session: props.session, communityId: props.communityId, limit: 50 })
      .then((view) => {
        if (cancelled) return;
        setMemory({ total: view.notes.length, more: view.has_more, fresh: view.notes.filter((note) => noteIsNew(note, props.now)).length });
      })
      .catch(() => { if (!cancelled) setMemory(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.session, props.communityId]);

  const lines = todayLines(props.snapshot, props.audience);
  const counts = todayCounts(props.snapshot);
  const open = (line: TodayLine) => {
    if (!line.target) return undefined;
    const target = line.target;
    return () => (target.kind === "channel" ? props.onOpenChannelByName(target.name) : props.onOpenMembers());
  };
  const faces = props.presence?.online_faces ?? [];

  return (
    <>
      <KitNextEvent session={props.session} communityId={props.communityId} now={props.now} onOpenEvents={props.onOpenEvents} todayOnly />
      <Sec label="Today">
        <ul className={cx("today")}>
          {lines.map((line, index) => {
            const onOpen = open(line);
            return (
              <li key={index}>
                {onOpen
                  ? <button type="button" className={cx("today-line")} onClick={onOpen}><b>{line.text}</b>{line.meta ? <em>{line.meta}</em> : null}</button>
                  : <span className={cx("today-line")}><b>{line.text}</b>{line.meta ? <em>{line.meta}</em> : null}</span>}
              </li>
            );
          })}
        </ul>
        {counts ? <span className={cx("sub")}>{counts}</span> : null}
      </Sec>
      <Sep />
      <Sec label="Online now">
        <div className={cx("here-row")}>
          {faces.length ? (
            <span className={cx("stack")}>
              {faces.slice(0, 5).map((face) => (
                <span key={face.user_id} className={cx("av s")} title={face.display_name ?? undefined}>
                  <UserAvatar className="community-dm-kit-avatar" readyClassName="has-image" name={face.display_name ?? "Member"} imageUrl={face.avatar_url} alt=""
                    fallback={<span>{(face.initials ?? face.display_name ?? "?").charAt(0).toUpperCase()}</span>}
                    fallbackStyle={face.avatar_color ? { backgroundColor: face.avatar_color } : undefined} />
                </span>
              ))}
            </span>
          ) : null}
          <span className={cx("sub2")}>{hereLine(props.presence)}</span>
        </div>
      </Sec>
      <Sep />
      <Sec label="Community memory">
        <button type="button" className={cx("kmini", "kmini-btn")} onClick={props.onOpenKnowledge} aria-label="Open Knowledge" disabled={!props.onOpenKnowledge}>
          <KitMemoryMap />
        </button>
        <div className={cx("kline")}>
          <span>{memory ? `${memory.total}${memory.more ? "+" : ""} ${memory.total === 1 && !memory.more ? "note" : "notes"}${memory.fresh ? ` · ${memory.fresh} learned this week` : ""}` : " "}</span>
          {props.onOpenKnowledge ? <TextLink onClick={props.onOpenKnowledge}>Open</TextLink> : null}
        </div>
      </Sec>
    </>
  );
}
