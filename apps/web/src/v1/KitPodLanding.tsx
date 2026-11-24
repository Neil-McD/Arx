// Pods (docs/specs/pods-v0.md): the Pods page's right panel for a pod the
// viewer can enter: its landing page. What it is, then the panel's four
// parts (the guide's brief, the next call, what the pod knows, who is in it)
// and the way in. A pod they are not in shows its pitch instead
// (WebCommunityPodsSection's PodPitch).
import { useState } from "react";
import type { CloudPodDetail, CloudPodNote } from "../../../../shared/cloudCommunityPodsGateway";
import { formatMomentWhen } from "../../../../shared/communityHomeMoments";
import { Btn, cx } from "./kit";
import { PanelBrainMap, useBrainMap } from "./KitBrain";
import { BriefPart, usePlaceBriefRead } from "./KitBrief";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { useLiveQuery } from "../../../../shared/liveQuery";
import { PanelLine, PanelNext, PanelPart, PanelPeople, usePanelSettled } from "./KitPanel";
import { PanelBlockSkeleton } from "../components/WebLoadingSkeleton";

const REPEATS: Record<string, string> = { daily: "every day", weekly: "every week", monthly: "every month" };

export function KitPodLanding(props: {
  session: unknown;
  communityId: string;
  pod: { channel_id: string; name: string; purpose: string };
  onOpen: () => void;
}) {
  const [now] = useState(() => Date.now());
  const channelId = props.pod.channel_id;
  const { brief, settled: briefSettled } = usePlaceBriefRead(props.session, props.communityId, channelId);
  const { map: brain } = useBrainMap(props.session, props.communityId, channelId);
  // Single live stream (shared/liveQuery.ts): the pod detail and its notes
  // draw straight from the live subscription with 30s linger across switches.
  const subject = props.session ? resolveAuthSubject(props.session as AuthSessionLike) : null;
  const liveArgs = subject ? { authSubject: subject, communityId: props.communityId, channelId } : null;
  const detailRead = useLiveQuery<CloudPodDetail>(props.session, "communityPods:getPod", liveArgs);
  const notesRead = useLiveQuery<{ notes: CloudPodNote[] }>(props.session, "communityPodNotes:listPodNotes", liveArgs);
  const detail = detailRead.data ?? null;
  const notes = notesRead.data?.notes ?? [];
  const answered =
    (!liveArgs || detailRead.data !== undefined || Boolean(detailRead.error) ? 1 : 0)
    + (!liveArgs || notesRead.data !== undefined || Boolean(notesRead.error) ? 1 : 0);
  // Layout before data: the parts draw as one piece once they have all
  // answered, so none is drawn and then pushed down by one above it.
  const settled = usePanelSettled(briefSettled && answered >= 2);

  const call = detail?.next_call ?? null;
  const members = detail?.members ?? [];
  return (
    <div className={cx("land")}>
      <header>
        <h2>{props.pod.name}</h2>
        {props.pod.purpose ? <p className={cx("land-p")}>{props.pod.purpose}</p> : null}
      </header>
      {settled ? <>
      {brief ? <BriefPart brief={brief} now={now} /> : null}
      {call ? (
        <PanelPart label="Next call" fact={REPEATS[call.recurrence_frequency] ?? null}>
          <PanelNext title={formatMomentWhen(call.starts_at)} sub={call.title} />
        </PanelPart>
      ) : null}
      {notes.length ? (
        <PanelPart label="What this pod knows" fact={String(notes.length)}>
          {brain ? <PanelBrainMap map={brain} now={now} onOpen={props.onOpen} label={`Open ${props.pod.name}`} /> : null}
          <PanelLine>{notes.length} {notes.length === 1 ? "note" : "notes"} learned</PanelLine>
        </PanelPart>
      ) : null}
      {members.length ? (
        <PanelPart label="In this pod" fact={String(members.length)}>
          <PanelPeople people={members.map((member) => ({
            id: member.user_id,
            name: member.name,
            avatarUrl: member.avatar_url ?? null,
            avatarFocusX: member.avatar_focus_x,
            avatarFocusY: member.avatar_focus_y,
            avatarZoom: member.avatar_zoom,
          }))} />
        </PanelPart>
      ) : null}
      {/* The way in sits under the parts on a phone, so it draws with them. */}
      <div className={cx("joinbar")}>
        <Btn go onClick={props.onOpen}>Open the pod</Btn>
      </div>
      </> : <PanelBlockSkeleton label="Loading pod…" compact />}
    </div>
  );
}
