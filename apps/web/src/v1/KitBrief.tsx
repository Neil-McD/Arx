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
import { ChipCards, GuideVoice } from "../../../../shared/entityChipsUi";
import { renderChatInlineMarkdown } from "../../../../shared/chatInlineMarkdownUi";

// The place's brief, live (shared/liveQuery.ts): it stays on screen across
// pages and updates when the guide writes a new one. null: nothing to show;
// a panel never fails for want of a brief.
export function usePlaceBrief(session: unknown, communityId: string | null, podChannelId?: string | null, enabled = true): BriefView | null {
  return usePlaceBriefRead(session, communityId, podChannelId, enabled).brief;
}

// The same, with whether it has answered yet (settled: there is a brief, or
// it is known there is none), for a panel that draws once its parts are in.
export function usePlaceBriefRead(session: unknown, communityId: string | null, podChannelId?: string | null, enabled = true): { brief: BriefView | null; settled: boolean } {
  const subject = session ? resolveAuthSubject(session as AuthSessionLike) : null;
  const { data, error } = useLiveQuery<PlaceBriefView>(session, "communityBriefs:getPlaceBrief",
    subject && communityId && enabled ? { authSubject: subject, communityId, ...(podChannelId ? { podChannelId } : {}) } : null);
  return { brief: enabled ? data?.brief ?? null : null, settled: !enabled || data !== undefined || Boolean(error) };
}

// A brief's words, as the guide wrote them: a name it bolded becomes a chip
// (shared/entityChipsUi.tsx) when the reader can open that thing; everything
// else stays plain text, so the brief looks as it always has.
export function BriefText(props: { summary: string }) {
  return <GuideVoice>{renderChatInlineMarkdown(props.summary, { renderTextRun: (text) => text })}</GuideVoice>;
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
  // actually hides something. A brief that fits drops the fold altogether, so
  // nothing clips a chip's card.
  const [fit, setFit] = useState<"measuring" | "short" | "long">("measuring");
  const long = fit === "long";
  const text = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => { setFit("measuring"); }, [props.brief.summary]);
  useLayoutEffect(() => {
    const node = text.current;
    if (node && fit === "measuring") setFit(node.scrollHeight > node.clientHeight + 1 ? "long" : "short");
  }, [fit, props.brief.summary]);
  useEffect(() => { setOpen(false); }, [props.brief.summary]);
  const age = briefAge(props.brief.updated_at, props.now);
  return (
    <div className={cx("brief")}>
      <span className={cx("gl")}><Icon name="spark" />Your guide{age ? <em>{age}</em> : null}</span>
      {/* Folded, a chip opens nothing but its link: its card would be cut off. */}
      <p ref={text} className={open || fit === "short" ? undefined : cx("fold")}>
        <ChipCards on={open || fit === "short"}><BriefText summary={props.brief.summary} /></ChipCards>
      </p>
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
