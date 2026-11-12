// Pod calls (docs/specs/pods-v0.md, slice 3a): the pod's next call in its
// right column, with its link and "I'm going"; hosts schedule or cancel it.
// A pod call is an event only the pod can see.
import { useCallback, useEffect, useState } from "react";
import {
  cancelCloudCommunityEvent,
  listCloudCommunityEventGoing,
  saveCloudCommunityEvent,
  setCloudCommunityEventGoing,
} from "../../../../shared/cloudCommunityEventsGateway";
import type { CloudPodDetail } from "../../../../shared/cloudCommunityPodsGateway";
import { formatMomentWhen } from "../../../../shared/communityHomeMoments";
import { Btn, Sec, cx } from "./kit";

type Repeat = "none" | "weekly" | "monthly";
const REPEAT_WORD: Record<string, string> = { daily: "Every day", weekly: "Every week", monthly: "Every month" };

export function podRhythmText(rhythm: { recurrence_frequency: string; next_starts_at: string } | null): string | null {
  if (!rhythm) return null;
  const when = formatMomentWhen(rhythm.next_starts_at);
  const repeats = REPEAT_WORD[rhythm.recurrence_frequency];
  return repeats ? `Meets ${repeats.toLowerCase()} · next ${when}` : `Next call ${when}`;
}

export function KitPodCall(props: { session: unknown; communityId: string; pod: CloudPodDetail; onChanged: () => void }) {
  const { pod } = props;
  const call = pod.next_call;
  const [going, setGoing] = useState<{ mine: boolean; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [draft, setDraft] = useState<{ title: string; when: string; repeat: Repeat; url: string }>({ title: "", when: "", repeat: "weekly", url: "" });
  const [error, setError] = useState<string | null>(null);
  const occurrence = call ? Date.parse(call.starts_at) : 0;

  const loadGoing = useCallback(async () => {
    if (!call) { setGoing(null); return; }
    try {
      const rows = await listCloudCommunityEventGoing({ session: props.session, communityId: props.communityId, items: [{ eventId: call.event_id, occurrenceStartsAt: occurrence }] });
      setGoing({ mine: Boolean(rows[0]?.mine), count: rows[0]?.count ?? 0 });
    } catch { setGoing(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.event_id, occurrence, props.communityId]);
  useEffect(() => { void loadGoing(); }, [loadGoing]);

  const toggleGoing = async () => {
    if (!call || busy) return;
    setBusy(true);
    try {
      await setCloudCommunityEventGoing({ session: props.session, communityId: props.communityId, eventId: call.event_id, occurrenceStartsAt: occurrence, going: !going?.mine });
      await loadGoing();
    } catch { /* stays as it was */ } finally { setBusy(false); }
  };

  const schedule = async () => {
    const startsAt = new Date(draft.when);
    if (busy) return;
    if (!draft.when || Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now()) { setError("Pick a day and time in the future."); return; }
    const url = draft.url.trim();
    setBusy(true);
    setError(null);
    try {
      await saveCloudCommunityEvent({
        session: props.session, eventId: null,
        payload: {
          community_id: props.communityId, pod_channel_id: pod.channel_id,
          title: draft.title.trim() || `${pod.name} call`,
          starts_at: startsAt.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          recurrence_frequency: draft.repeat, recurrence_interval: 1,
          location_type: url ? "online" : "tbd", url: url || null,
        },
      });
      setScheduling(false);
      setDraft({ title: "", when: "", repeat: "weekly", url: "" });
      props.onChanged();
    } catch (failure) {
      setError(String((failure as Error)?.message ?? "").includes("url") ? "That link doesn't look right." : "Couldn't schedule it. Try again.");
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!call || busy) return;
    setBusy(true);
    try { await cancelCloudCommunityEvent({ session: props.session, eventId: call.event_id }); props.onChanged(); }
    catch { /* stays */ } finally { setBusy(false); }
  };

  if (!call && !pod.can_manage) return null;
  return (
    <Sec label={call ? "Next call" : "Pod call"}>
      {call ? (
        <>
          <p className={cx("sub")}><b>{call.title}</b></p>
          <span className={cx("sub2")}>{[formatMomentWhen(call.starts_at), REPEAT_WORD[call.recurrence_frequency]].filter(Boolean).join(" · ")}</span>
          <div className={cx("acts")} style={{ marginTop: 8 }}>
            {call.url ? <a className={cx("link")} href={call.url} target="_blank" rel="noreferrer noopener">Join the call</a> : null}
            <Btn small txt disabled={busy} onClick={() => void toggleGoing()}>
              {going?.mine ? `Going ✓${going.count > 1 ? ` · ${going.count} going` : ""}` : going?.count ? `I'm going · ${going.count} going` : "I'm going"}
            </Btn>
            {pod.can_manage ? <Btn small txt disabled={busy} onClick={() => void cancel()}>Cancel call</Btn> : null}
          </div>
        </>
      ) : scheduling ? (
        <div className={cx("podform")} style={{ marginTop: 0 }}>
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={`${pod.name} call`} aria-label="Call title" maxLength={80} />
          <input type="datetime-local" value={draft.when} onChange={(event) => setDraft({ ...draft, when: event.target.value })} aria-label="Day and time" />
          <label className={cx("podform-seats")}>
            Repeats
            <select value={draft.repeat} onChange={(event) => setDraft({ ...draft, repeat: event.target.value as Repeat })} aria-label="Repeats">
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
              <option value="none">Just once</option>
            </select>
          </label>
          <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="Call link (Zoom, Meet…)" aria-label="Call link" inputMode="url" />
          {error ? <p className={cx("bad")} role="alert">{error}</p> : null}
          <div className={cx("acts")}>
            <Btn go small disabled={busy} onClick={() => void schedule()}>{busy ? "Saving…" : "Schedule"}</Btn>
            <Btn txt small onClick={() => { setScheduling(false); setError(null); }}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <>
          <p className={cx("sub")}>Give the pod its rhythm: a call only its members see.</p>
          <div className={cx("acts")} style={{ marginTop: 8 }}><Btn small txt onClick={() => setScheduling(true)}>Schedule a call</Btn></div>
        </>
      )}
    </Sec>
  );
}
