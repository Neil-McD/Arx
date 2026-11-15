// Pods (docs/specs/pods-v0.md): the Pods page's right panel for a pod the
// viewer can enter: its landing page. What it is, then the panel's four
// parts (the guide's brief, the next call, what the pod knows, who is in it)
// and the way in. A pod they are not in shows its pitch instead
// (WebCommunityPodsSection's PodPitch).
import { useEffect, useState } from "react";
import { fetchCloudPod, fetchCloudPodNotes, formatPodDate, type CloudPodDetail, type CloudPodNote } from "../../../../shared/cloudCommunityPodsGateway";
import { formatMomentWhen } from "../../../../shared/communityHomeMoments";
import { Btn, cx } from "./kit";
import { BriefPart, usePlaceBrief } from "./KitBrief";
import { PanelLearned, PanelNext, PanelPart, PanelPeople } from "./KitPanel";

const REPEATS: Record<string, string> = { daily: "every day", weekly: "every week", monthly: "every month" };
const LEARNED_SHOWN = 3;

export function KitPodLanding(props: {
  session: unknown;
  communityId: string;
  pod: { channel_id: string; name: string; purpose: string };
  onOpen: () => void;
}) {
  const [detail, setDetail] = useState<CloudPodDetail | null>(null);
  const [notes, setNotes] = useState<CloudPodNote[]>([]);
  const [now] = useState(() => Date.now());
  const channelId = props.pod.channel_id;
  const brief = usePlaceBrief(props.session, props.communityId, channelId);
  useEffect(() => {
    setDetail(null);
    setNotes([]);
    if (!props.session) return;
    let live = true;
    const call = { session: props.session, communityId: props.communityId, channelId };
    // Each part is drawn from what loads; one that doesn't is simply absent.
    fetchCloudPod(call).then((next) => { if (live) setDetail(next); }).catch(() => undefined);
    fetchCloudPodNotes(call).then((next) => { if (live) setNotes(next.notes); }).catch(() => undefined);
    return () => { live = false; };
  }, [props.session, props.communityId, channelId]);

  const call = detail?.next_call ?? null;
  const members = detail?.members ?? [];
  const latest = [...notes].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, LEARNED_SHOWN);
  return (
    <div className={cx("land")}>
      <header>
        <h2>{props.pod.name}</h2>
        {props.pod.purpose ? <p className={cx("land-p")}>{props.pod.purpose}</p> : null}
      </header>
      {brief ? <BriefPart brief={brief} now={now} /> : null}
      {call ? (
        <PanelPart label="Next call" fact={REPEATS[call.recurrence_frequency] ?? null}>
          <PanelNext title={formatMomentWhen(call.starts_at)} sub={call.title} />
        </PanelPart>
      ) : null}
      {latest.length ? (
        <PanelPart label="What this pod knows" fact={String(notes.length)}>
          {latest.map((note) => <PanelLearned key={note.slug} title={note.title} when={formatPodDate(note.updated_at)} />)}
        </PanelPart>
      ) : null}
      {members.length ? (
        <PanelPart label="In this pod" fact={String(members.length)}>
          <PanelPeople names={members.map((member) => member.name)} />
        </PanelPart>
      ) : null}
      <div className={cx("joinbar")}>
        <Btn go onClick={props.onOpen}>Open the pod</Btn>
      </div>
    </div>
  );
}
