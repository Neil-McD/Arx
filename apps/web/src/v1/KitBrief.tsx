// Design system v1: the guide's brief, the first part of every right panel
// (Home's, a pod's): what's happening in the place, written by the guide
// (shared/communityBriefs.ts). A summary of one to three sentences, the
// channels it came from, and when it was written. Builders (a pod's hosts
// for its own) can take it down until the next one. With no brief it draws
// nothing, so each panel shows its own fallback.
import { useCallback, useEffect, useState } from "react";
import { briefAge, type BriefView } from "../../../../shared/communityBriefs";
import { fetchPlaceBrief, hidePlaceBrief } from "../../../../shared/cloudCommunityBriefsGateway";
import { Btn, cx, Icon } from "./kit";

// The place's brief, loaded once per place. null: nothing to show.
export function usePlaceBrief(session: unknown, communityId: string | null, podChannelId?: string | null, enabled = true) {
  const [state, setState] = useState<{ brief: BriefView | null; canHide: boolean }>({ brief: null, canHide: false });
  useEffect(() => {
    setState({ brief: null, canHide: false });
    if (!communityId || !enabled) return;
    let live = true;
    fetchPlaceBrief({ session, communityId, podChannelId })
      .then((view) => { if (live) setState({ brief: view.brief, canHide: view.can_hide }); })
      // A panel never fails for want of a brief.
      .catch(() => undefined);
    return () => { live = false; };
  }, [session, communityId, podChannelId, enabled]);
  const hide = useCallback(async () => {
    if (!communityId) return;
    await hidePlaceBrief({ session, communityId, podChannelId });
    setState({ brief: null, canHide: false });
  }, [session, communityId, podChannelId]);
  return { ...state, hide };
}

export function BriefPart(props: {
  brief: BriefView;
  now: number;
  // Opens a channel the brief came from. Missing: no channels shown
  // (inside a pod, the reader is already in its room).
  onOpenChannel?: (channel: { slug: string; name: string }) => void;
  onHide?: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [hiding, setHiding] = useState(false);
  const age = briefAge(props.brief.updated_at, props.now);
  return (
    <div className={cx("brief")}>
      <span className={cx("gl")}><Icon name="spark" />Your guide{age ? <em>{age}</em> : null}</span>
      <p>{props.brief.summary}</p>
      {props.onOpenChannel && props.brief.channels.length ? (
        <span className={cx("brief-from")}>
          {props.brief.channels.map((channel) => (
            <button key={channel.slug} type="button" title={`Open #${channel.name}`} onClick={() => props.onOpenChannel!(channel)}>#{channel.name}</button>
          ))}
        </span>
      ) : null}
      {props.onHide ? (
        <div className={cx("brief-acts")}>
          {confirming ? (
            <>
              <span>Hide it until the guide's next brief?</span>
              <Btn small disabled={hiding} onClick={() => {
                if (hiding) return;
                setHiding(true);
                void props.onHide!().catch(() => undefined).finally(() => { setHiding(false); setConfirming(false); });
              }}>{hiding ? "Hiding…" : "Hide"}</Btn>
              <Btn small txt onClick={() => setConfirming(false)}>Keep</Btn>
            </>
          ) : <Btn small txt onClick={() => setConfirming(true)}>Hide</Btn>}
        </div>
      ) : null}
    </div>
  );
}
