// Design system v1, the host's Home: "Needs you". One list of what came
// forward on its own and waits on the host: people asking to join, and the
// oldest question nobody has answered. Work done through an agent (the guide
// in the composer, your own AI) is never here; it is approved where you are
// working. A row opens in place. Empty, the list isn't drawn.
import { useState, type ReactNode } from "react";
import { ChevronDown, MessageCircleQuestion, UserPlus } from "lucide-react";
import type { CommunityAdmissionJoinRequest } from "../components/CommunityJoinRequestReview";
import { Btn, cx } from "./kit";

// How many people an opened join row shows before "Show all".
export const NEEDS_YOU_JOIN_SHOWN = 3;

export type NeedsYouJoinReview = {
  requests: CommunityAdmissionJoinRequest[];
  decidingId: string | null;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
};

export type NeedsYouQuestion = { title: string; detail: string; action: string; onAction: () => void };

export function needsYouCount(args: { joinRequests: number; question: boolean }): number {
  return (args.joinRequests > 0 ? 1 : 0) + (args.question ? 1 : 0);
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

function Row(props: { icon: ReactNode; title: string; detail: string; note?: string; open?: boolean; onToggle?: () => void; children?: ReactNode }) {
  const text = (
    <>
      <span className={cx("nicon")} aria-hidden="true">{props.icon}</span>
      <span className={cx("ntext")}><b>{props.title}</b><span>{props.detail}</span>{props.note ? <small>{props.note}</small> : null}</span>
    </>
  );
  return (
    <div className={cx("nrow")}>
      {props.onToggle ? (
        <button type="button" className={cx("nhead")} aria-expanded={props.open === true} onClick={props.onToggle}>
          {text}<ChevronDown className={cx("nchev", props.open && "up")} size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : <div className={cx("nhead")}>{text}</div>}
      {props.children}
    </div>
  );
}

export function NeedsYou(props: {
  join: NeedsYouJoinReview | null;
  // The count when the people themselves aren't loaded (the row then links out).
  joinCount: number;
  onShowAllJoinRequests: () => void;
  question: NeedsYouQuestion | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (key: string) => () => setOpen((current) => (current === key ? null : key));
  const requests = props.join?.requests ?? [];
  const waiting = props.join ? requests.length : props.joinCount;
  const total = needsYouCount({ joinRequests: waiting, question: Boolean(props.question) });
  if (total === 0) return null;
  return (
    <section className={cx("nyou")} aria-label="Needs you">
      <h3>Needs you <i>{total}</i></h3>
      <div className={cx("nlist")}>
        {waiting > 0 ? (
          <Row icon={<UserPlus size={16} strokeWidth={1.7} />} title={joinRowTitle(waiting)}
            detail={joinRowNames(requests.map((request) => request.displayName), waiting)}
            open={open === "join"} onToggle={props.join ? toggle("join") : undefined}>
            {!props.join ? (
              <div className={cx("nacts")}><Btn small go onClick={props.onShowAllJoinRequests}>Review</Btn></div>
            ) : open === "join" ? (
              <div className={cx("nopen")}>
                {requests.slice(0, NEEDS_YOU_JOIN_SHOWN).map((request) => (
                  <div key={request.id} className={cx("nperson")}>
                    <span className={cx("nface")} aria-hidden="true">
                      {request.avatarUrl ? <img src={request.avatarUrl} alt="" /> : (request.displayName ?? "S").trim().charAt(0).toUpperCase()}
                    </span>
                    <span className={cx("ntext")}>
                      <b>{request.displayName ?? "Someone"}</b>
                      <span>{request.message ? `“${request.message}”` : `Asked ${request.createdAtLabel}`}</span>
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
          </Row>
        ) : null}
        {props.question ? (
          <Row icon={<MessageCircleQuestion size={16} strokeWidth={1.7} />} title={props.question.title} detail={props.question.detail}>
            <div className={cx("nacts")}><Btn small onClick={props.question.onAction}>{props.question.action}</Btn></div>
          </Row>
        ) : null}
      </div>
    </section>
  );
}
