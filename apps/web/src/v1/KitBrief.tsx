// Design system v1: the guide's brief, the first part of every right panel
// (Home's, a pod's): what's happening in the place, written by the guide
// (shared/communityBriefs.ts). A summary of one to three sentences, the
// channels it came from, and when it was written. A long one folds to three
// lines with More. With no brief it draws nothing, so each panel shows its
// own fallback.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { briefAge, type BriefView } from "../../../../shared/communityBriefs";
import type { PlaceBriefView } from "../../../../shared/cloudCommunityBriefsGateway";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { useLiveQuery } from "../../../../shared/liveQuery";
import { cx, Icon } from "./kit";

// The place's brief, live (shared/liveQuery.ts): it stays on screen across
// pages and updates when the guide writes a new one. null: nothing to show;
// a panel never fails for want of a brief.
export function usePlaceBrief(session: unknown, communityId: string | null, podChannelId?: string | null, enabled = true): BriefView | null {
  const subject = session ? resolveAuthSubject(session as AuthSessionLike) : null;
  const { data } = useLiveQuery<PlaceBriefView>(session, "communityBriefs:getPlaceBrief",
    subject && communityId && enabled ? { authSubject: subject, communityId, ...(podChannelId ? { podChannelId } : {}) } : null);
  return enabled ? data?.brief ?? null : null;
}

export function BriefPart(props: {
  brief: BriefView;
  now: number;
  // Opens a channel the brief came from. Missing: no channels shown
  // (inside a pod, the reader is already in its room).
  onOpenChannel?: (channel: { slug: string; name: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  // Folded, the text is cut at three lines; More shows only when that cut
  // actually hides something.
  const [long, setLong] = useState(false);
  const text = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const node = text.current;
    if (node && !open) setLong(node.scrollHeight > node.clientHeight + 1);
  }, [props.brief.summary, open]);
  useEffect(() => { setOpen(false); }, [props.brief.summary]);
  const age = briefAge(props.brief.updated_at, props.now);
  return (
    <div className={cx("brief")}>
      <span className={cx("gl")}><Icon name="spark" />Your guide{age ? <em>{age}</em> : null}</span>
      <p ref={text} className={open ? undefined : cx("fold")}>{props.brief.summary}</p>
      {long || open ? (
        <button type="button" className={cx("brief-more")} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Less" : "More"}</button>
      ) : null}
      {props.onOpenChannel && props.brief.channels.length ? (
        <span className={cx("brief-from")}>
          {props.brief.channels.map((channel) => (
            <button key={channel.slug} type="button" title={`Open #${channel.name}`} onClick={() => props.onOpenChannel!(channel)}>#{channel.name}</button>
          ))}
        </span>
      ) : null}
    </div>
  );
}
