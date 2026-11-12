// Pods (docs/specs/pods-v0.md, slice 2a): a pod's own right column, in place
// of a channel's. What it is for, its hosts, its members and, for the people
// who manage it, who is asking to join.
import { useCallback, useEffect, useState } from "react";
import { decideCloudPodRequest, fetchCloudPod, saveCloudPodDetails, setCloudPodHost, type CloudPodDetail } from "../../../../shared/cloudCommunityPodsGateway";
import { Btn, KitApp, Rail, Sec, Sep, cx } from "./kit";

export function KitPodRail(props: { session: unknown; communityId: string; pod: CloudPodDetail; onChanged: () => void }) {
  const { pod } = props;
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ purpose: string; listed: boolean; seats: string } | null>(null);
  const act = async (key: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try { await work(); props.onChanged(); } catch { /* the list reloads as it was */ } finally { setBusy(null); }
  };
  return (
    <KitApp view="wins" part="rail">
      <Rail index={1} label="About this pod">
        <Sec label="About this pod">
          {editing ? (
            <div className={cx("podform")} style={{ marginTop: 0 }}>
              <textarea value={editing.purpose} onChange={(event) => setEditing({ ...editing, purpose: event.target.value })} placeholder="What is this pod for? One sentence." aria-label="What the pod is for" rows={3} maxLength={280} autoFocus />
              <label className={cx("podform-check")}>
                <input type="checkbox" checked={editing.listed} onChange={(event) => setEditing({ ...editing, listed: event.target.checked })} />
                Listed: members can see it and ask to join
              </label>
              <label className={cx("podform-seats")}>
                Seats
                <input value={editing.seats} onChange={(event) => setEditing({ ...editing, seats: event.target.value.replace(/[^0-9]/g, "") })} placeholder="No limit" aria-label="Seats" inputMode="numeric" />
              </label>
              <div className={cx("acts")}>
                <Btn go small disabled={Boolean(busy)} onClick={() => void act("edit", async () => {
                  await saveCloudPodDetails({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, purpose: editing.purpose, visibility: editing.listed ? "listed" : "hidden", seats: Number(editing.seats) || 0 });
                  setEditing(null);
                })}>{busy === "edit" ? "Saving…" : "Save"}</Btn>
                <Btn txt small onClick={() => setEditing(null)}>Cancel</Btn>
              </div>
            </div>
          ) : (
            <>
              <p className={cx("sub")}>{pod.purpose || (pod.can_edit ? "Add what this pod is for." : "A small group with closer time with its hosts.")}</p>
              <span className={cx("sub2")}>
                {[pod.visibility === "listed" ? "Listed: members can ask to join" : "Hidden: only its members know it's here",
                  pod.seats ? `${pod.members.length} of ${pod.seats} seats` : `${pod.members.length} ${pod.members.length === 1 ? "member" : "members"}`].join(" · ")}
              </span>
              {pod.can_edit ? (
                <div className={cx("acts")} style={{ marginTop: 10 }}>
                  <Btn small txt onClick={() => setEditing({ purpose: pod.purpose, listed: pod.visibility === "listed", seats: pod.seats ? String(pod.seats) : "" })}>Edit</Btn>
                </div>
              ) : null}
            </>
          )}
        </Sec>
        {pod.can_manage && pod.requests.length ? (
          <>
            <Sep />
            <Sec label={`Asking to join · ${pod.requests.length}`}>
              {pod.requests.map((request) => (
                <div key={request.user_id} className={cx("podreq")}>
                  <span>{request.name}{request.status === "waitlist" ? <em> · waitlist</em> : null}</span>
                  <span className={cx("podreq-acts")}>
                    <Btn small go disabled={Boolean(busy)} onClick={() => void act(`yes:${request.user_id}`, () => decideCloudPodRequest({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, userId: request.user_id, approve: true }))}>Add</Btn>
                    <Btn small txt disabled={Boolean(busy)} onClick={() => void act(`no:${request.user_id}`, () => decideCloudPodRequest({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, userId: request.user_id, approve: false }))}>Decline</Btn>
                  </span>
                </div>
              ))}
            </Sec>
          </>
        ) : null}
        <Sep />
        <Sec label="In this pod">
          {pod.members.length ? pod.members.map((member) => (
            <div key={member.user_id} className={cx("podreq")}>
              <span>{member.name}{member.is_host ? <em> · host</em> : null}</span>
              {pod.can_edit ? (
                <span className={cx("podreq-acts")}>
                  <Btn small txt disabled={Boolean(busy)} onClick={() => void act(`host:${member.user_id}`, () => setCloudPodHost({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, userId: member.user_id, host: !member.is_host }))}>
                    {member.is_host ? "Not host" : "Make host"}
                  </Btn>
                </span>
              ) : null}
            </div>
          )) : <p className={cx("sub")}>No one yet. Add people from the pod's settings.</p>}
        </Sec>
      </Rail>
    </KitApp>
  );
}

// Loads the pod for a room; null while it isn't one (a shared channel), so the
// channel's own column shows instead.
export function useCloudPod(session: unknown, communityId: string | null, channelId: string | null | undefined) {
  const [pod, setPod] = useState<CloudPodDetail | null>(null);
  const load = useCallback(async () => {
    if (!session || !communityId || !channelId) { setPod(null); return; }
    try { setPod(await fetchCloudPod({ session, communityId, channelId })); } catch { setPod(null); }
  }, [session, communityId, channelId]);
  useEffect(() => { void load(); }, [load]);
  return { pod, reload: load };
}
