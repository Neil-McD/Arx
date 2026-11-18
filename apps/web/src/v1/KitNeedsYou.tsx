// Design system v1, Home's one list: what needs this person now. For a host,
// "Needs you": people asking to join (answered in place), then what was
// noticed (a question nobody answered, new members who haven't posted,
// people stalling on a lesson). For a member, "For you": saying hello, the
// lesson they are on, the event that is near. The three most important show;
// the rest stack behind "N more". Work done through an agent is never here.
// Empty, the list isn't drawn.
import { useState, type ReactNode } from "react";
import { BookOpen, CalendarDays, ChevronDown, MessageCircleQuestion, MessageSquare, UserPlus, Users } from "lucide-react";
import type { CommunityAdmissionJoinRequest } from "../components/CommunityJoinRequestReview";
import { Btn, cx } from "./kit";

// How many rows show before "N more".
export const HOME_THINGS_SHOWN = 3;
// How many people an opened join row shows before "Show all".
export const NEEDS_YOU_JOIN_SHOWN = 3;

export type NeedsYouJoinReview = {
  requests: CommunityAdmissionJoinRequest[];
  decidingId: string | null;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
};

export type HomeThingIcon = "question" | "people" | "lesson" | "event" | "hello";

// One row: what it is, one button that does the thing, and (for what was
// noticed) "Not now".
export type HomeThing = {
  key: string;
  icon: HomeThingIcon;
  title: string;
  detail: string;
  action: string;
  // The one thing to do first gets the filled button.
  strong?: boolean;
  onAction: () => void;
  onNotNow?: () => void;
};

export function homeThingsCount(args: { joinRequests: number; things: number }): number {
  return (args.joinRequests > 0 ? 1 : 0) + args.things;
}

export function joinRowTitle(count: number): string {
  return count === 1 ? "1 person asked to join" : `${count} people asked to join`;
}

export function joinRowNames(names: Array<string | null>, total: number): string {
  const shown = names.slice(0, NEEDS_YOU_JOIN_SHOWN).map((name) => name ?? "Someone");
  const rest = total - shown.length;
  if (shown.length === 0) return "Nobody joins until you say yes.";
  if (rest > 0) return `${shown.join(", ")} and ${rest} more.`;
  if (shown.length === 1) return `${shown[0]}.`;
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}.`;
}

const ICONS: Record<HomeThingIcon, ReactNode> = {
  question: <MessageCircleQuestion size={16} strokeWidth={1.7} />,
  people: <Users size={16} strokeWidth={1.7} />,
  lesson: <BookOpen size={16} strokeWidth={1.7} />,
  event: <CalendarDays size={16} strokeWidth={1.7} />,
  hello: <MessageSquare size={16} strokeWidth={1.7} />,
};

// `side`: the row's buttons, to the right of its words (under them on a phone).
function Row(props: { icon: ReactNode; title: string; detail: string; open?: boolean; onToggle?: () => void; side?: ReactNode; children?: ReactNode }) {
  const text = (
    <>
      <span className={cx("nicon")} aria-hidden="true">{props.icon}</span>
      <span className={cx("ntext")}><b>{props.title}</b><span>{props.detail}</span></span>
    </>
  );
  return (
    <div className={cx("nrow")}>
      {props.onToggle ? (
        <button type="button" className={cx("nhead")} aria-expanded={props.open === true} onClick={props.onToggle}>
          {text}<ChevronDown className={cx("nchev", props.open && "up")} size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : <div className={cx("nhead")}>{text}{props.side ? <span className={cx("nside")}>{props.side}</span> : null}</div>}
      {props.children}
    </div>
  );
}

export function NeedsYou(props: {
  label: string;
  join: NeedsYouJoinReview | null;
  // The count when the people themselves aren't loaded (the row then links out).
  joinCount: number;
  onShowAllJoinRequests: () => void;
  things: HomeThing[];
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const requests = props.join?.requests ?? [];
  const waiting = props.join ? requests.length : props.joinCount;
  const total = homeThingsCount({ joinRequests: waiting, things: props.things.length });
  if (total === 0) return null;

  const rows: ReactNode[] = [];
  if (waiting > 0) {
    rows.push(
      <Row key="join" icon={<UserPlus size={16} strokeWidth={1.7} />} title={joinRowTitle(waiting)}
        detail={joinRowNames(requests.map((request) => request.displayName), waiting)}
        open={open} onToggle={props.join ? () => setOpen(!open) : undefined}
        side={props.join ? undefined : <Btn small go onClick={props.onShowAllJoinRequests}>Review</Btn>}>
        {!props.join ? null : open ? (
          <div className={cx("nopen")}>
            {requests.slice(0, NEEDS_YOU_JOIN_SHOWN).map((request) => (
              <div key={request.id} className={cx("nperson")}>
                <span className={cx("nface")} aria-hidden="true">
                  {request.avatarUrl ? <img src={request.avatarUrl} alt="" /> : (request.displayName ?? "S").trim().charAt(0).toUpperCase()}
                </span>
                <span className={cx("ntext")}>
                  <b>{request.displayName ?? "Someone"}</b>
                  <span>Asked {request.createdAtLabel}</span>
                </span>
                <span className={cx("nbtns")}>
                  <Btn small txt disabled={props.join!.decidingId === request.id} onClick={() => props.join!.onDecline(request.id)}>Decline</Btn>
                  <Btn small disabled={props.join!.decidingId === request.id} onClick={() => props.join!.onApprove(request.id)}>
                    {props.join!.decidingId === request.id ? "…" : "Approve"}
                  </Btn>
                </span>
              </div>
            ))}
            {requests.length > NEEDS_YOU_JOIN_SHOWN ? (
              <button type="button" className={cx("nmore")} onClick={props.onShowAllJoinRequests}>
                {requests.length - NEEDS_YOU_JOIN_SHOWN} more · Show all
              </button>
            ) : null}
          </div>
        ) : null}
      </Row>,
    );
  }
  for (const thing of props.things) {
    rows.push(
      <Row key={thing.key} icon={ICONS[thing.icon]} title={thing.title} detail={thing.detail} side={<>
        {thing.onNotNow ? <Btn small txt onClick={thing.onNotNow}>Not now</Btn> : null}
        <Btn small go={thing.strong} onClick={thing.onAction}>{thing.action}</Btn>
      </>} />,
    );
  }
  const hiddenCount = Math.max(0, rows.length - HOME_THINGS_SHOWN);
  return (
    <section className={cx("nyou")} aria-label={props.label}>
      <h3>{props.label} <i>{total}</i></h3>
      <div className={cx("nlist")}>
        {all ? rows : rows.slice(0, HOME_THINGS_SHOWN)}
        {hiddenCount > 0 ? (
          <button type="button" className={cx("nstack")} aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `${hiddenCount} more`}<ChevronDown className={cx("nchev", all && "up")} size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  );
}
