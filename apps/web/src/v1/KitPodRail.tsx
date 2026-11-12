// Pods (docs/specs/pods-v0.md): a pod's own right column, in place of a
// channel's. What it is for; the viewer's own membership (paying, leaving, a
// payment problem) and Leave pod; who is asking to join; who is in it and, for
// the people who manage it, how each person is in.
import { useCallback, useEffect, useState } from "react";
import {
  decideCloudPodRequest,
  fetchCloudPod,
  formatPodDate,
  formatPodPrice,
  leaveCloudPod,
  saveCloudPodDetails,
  saveCloudPodPrice,
  setCloudPodHost,
  type CloudPodDetail,
} from "../../../../shared/cloudCommunityPodsGateway";
import { Btn, KitApp, Rail, Sec, Sep, cx } from "./kit";

type Draft = { purpose: string; whatYouGet: string; listed: boolean; seats: string; price: string };

function memberTag(payment: NonNullable<CloudPodDetail["members"][number]["payment"]>): string {
  if (payment.state === "paying") return "Paying";
  if (payment.state === "leaving") return payment.until ? `Leaving ${formatPodDate(payment.until)}` : "Leaving";
  if (payment.state === "payment_problem") return "Payment problem";
  return "Added by a host";
}

// The pod's own address, for hosts to share.
function podLink(slug: string): string {
  const community = window.location.pathname.split("/")[2] ?? "";
  return `${window.location.origin}/c/${community}/pods/${slug}`;
}

export function KitPodRail(props: { session: unknown; communityId: string; pod: CloudPodDetail; onChanged: () => void }) {
  const { pod } = props;
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const act = async (key: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try { await work(); props.onChanged(); } catch { /* the column reloads as it was */ } finally { setBusy(null); }
  };

  const save = async () => {
    if (!editing || busy) return;
    setBusy("edit");
    setEditError(null);
    try {
      await saveCloudPodDetails({
        session: props.session, communityId: props.communityId, channelId: pod.channel_id,
        purpose: editing.purpose, visibility: editing.listed ? "listed" : "hidden", seats: Number(editing.seats) || 0,
        whatYouGet: editing.whatYouGet.split("\n"),
      });
      const cents = (Number(editing.price) || 0) * 100;
      if (cents !== (pod.price?.amount_base_units ?? 0)) {
        await saveCloudPodPrice({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, amountBaseUnits: cents });
      }
      setEditing(null);
      props.onChanged();
    } catch (error) {
      const code = String((error as Error)?.message ?? "");
      setEditError(code.includes("community_checkout_unavailable")
        ? "To charge for a pod, connect Stripe in Manage first."
        : code.includes("community_pod_price_invalid") ? "Use a price from $1 to $10,000 a month." : "Couldn't save. Try again.");
    } finally { setBusy(null); }
  };

  const leave = async () => {
    if (busy) return;
    setBusy("leave");
    setLeaveError(null);
    try {
      const result = await leaveCloudPod({ session: props.session, communityId: props.communityId, channelId: pod.channel_id });
      setConfirmLeave(false);
      // Out now: the room closes, so back to Pods.
      if (result.left === "now") window.location.assign(window.location.pathname.replace(/\/chat\/.*$/, "/pods"));
      else props.onChanged();
    } catch { setLeaveError("Couldn't leave. Try again."); } finally { setBusy(null); }
  };

  const mine = pod.my_membership;
  const paid = Boolean(mine && mine.state !== "added");

  return (
    <KitApp view="wins" part="rail">
      <Rail index={1} label="About this pod">
        <Sec label="About this pod">
          {editing ? (
            <div className={cx("podform")} style={{ marginTop: 0 }}>
              <textarea value={editing.purpose} onChange={(event) => setEditing({ ...editing, purpose: event.target.value })} placeholder="What is this pod for? One sentence." aria-label="What the pod is for" rows={3} maxLength={280} autoFocus />
              <textarea value={editing.whatYouGet} onChange={(event) => setEditing({ ...editing, whatYouGet: event.target.value })} placeholder={"What you get, one per line\nWeekly call with the host\nFeedback on your work"} aria-label="What you get, one per line" rows={4} />
              <label className={cx("podform-check")}>
                <input type="checkbox" checked={editing.listed} onChange={(event) => setEditing({ ...editing, listed: event.target.checked })} />
                Listed: members can see it and join or ask to
              </label>
              <label className={cx("podform-seats")}>
                Seats
                <input value={editing.seats} onChange={(event) => setEditing({ ...editing, seats: event.target.value.replace(/[^0-9]/g, "") })} placeholder="No limit" aria-label="Seats" inputMode="numeric" />
              </label>
              <label className={cx("podform-seats")}>
                Price $
                <input value={editing.price} onChange={(event) => setEditing({ ...editing, price: event.target.value.replace(/[^0-9]/g, "") })} placeholder="Free" aria-label="Monthly price in dollars" inputMode="numeric" />
                <span>/month, on top of membership</span>
              </label>
              {editError ? <p className={cx("bad")} role="alert">{editError}</p> : null}
              <div className={cx("acts")}>
                <Btn go small disabled={Boolean(busy)} onClick={() => void save()}>{busy === "edit" ? "Saving…" : "Save"}</Btn>
                <Btn txt small onClick={() => { setEditing(null); setEditError(null); }}>Cancel</Btn>
              </div>
            </div>
          ) : (
            <>
              <p className={cx("sub")}>{pod.purpose || (pod.can_edit ? "Add what this pod is for." : "A small group with closer time with its hosts.")}</p>
              {pod.what_you_get.length ? (
                <ul className={cx("podget")}>{pod.what_you_get.map((line) => <li key={line}>{line}</li>)}</ul>
              ) : null}
              <span className={cx("sub2")}>
                {[pod.visibility === "listed" ? (pod.price ? "Listed: members can join" : "Listed: members can ask to join") : "Hidden: only its members know it's here",
                  pod.price ? `${formatPodPrice(pod.price)} on top of membership` : null,
                  pod.seats ? `${pod.members.length} of ${pod.seats} seats` : `${pod.members.length} ${pod.members.length === 1 ? "member" : "members"}`].filter(Boolean).join(" · ")}
              </span>
              {pod.can_edit || (pod.can_manage && pod.visibility === "listed") ? (
                <div className={cx("acts")} style={{ marginTop: 10 }}>
                  {pod.can_edit ? (
                    <Btn small txt onClick={() => setEditing({
                      purpose: pod.purpose, whatYouGet: pod.what_you_get.join("\n"), listed: pod.visibility === "listed",
                      seats: pod.seats ? String(pod.seats) : "", price: pod.price ? String(Math.round(pod.price.amount_base_units / 100)) : "",
                    })}>Edit</Btn>
                  ) : null}
                  {pod.visibility === "listed" && pod.slug ? (
                    <Btn small txt onClick={() => {
                      void navigator.clipboard?.writeText(podLink(pod.slug)).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined);
                    }}>{copied ? "Copied" : "Copy link"}</Btn>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </Sec>
        {mine ? (
          <>
            <Sep />
            <Sec label="Your membership">
              <p className={cx("sub")}>
                {mine.state === "added" ? "You're in."
                  : mine.state === "leaving" ? `Leaving · access until ${formatPodDate(mine.until) || "the end of this period"}.`
                    : mine.state === "payment_problem" ? "Your last payment didn't go through. Update your card in Settings → Billing to keep your place."
                      : `${formatPodPrice({ amount_base_units: mine.amount_base_units, currency: mine.currency })} · renews ${formatPodDate(mine.until) || "monthly"}.`}
              </p>
              {mine.state === "leaving" ? null : confirmLeave ? (
                <div className={cx("podleave")}>
                  <span className={cx("sub2")}>
                    {paid ? `You'll keep access until ${formatPodDate(mine.until) || "the end of this period"}, then you're out. No more charges.` : "You'll leave the pod now."}
                  </span>
                  {leaveError ? <p className={cx("bad")} role="alert">{leaveError}</p> : null}
                  <span className={cx("acts")}>
                    <Btn small disabled={Boolean(busy)} onClick={() => void leave()}>{busy === "leave" ? "Leaving…" : "Leave pod"}</Btn>
                    <Btn small txt onClick={() => setConfirmLeave(false)}>Stay</Btn>
                  </span>
                </div>
              ) : (
                <div className={cx("acts")} style={{ marginTop: 8 }}>
                  <Btn small txt onClick={() => setConfirmLeave(true)}>Leave pod</Btn>
                </div>
              )}
            </Sec>
          </>
        ) : null}
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
              <span>
                {member.name}{member.is_host ? <em> · host</em> : null}
                {member.payment ? <span className={cx("podtag")}>{memberTag(member.payment)}</span> : null}
              </span>
              {pod.can_edit ? (
                <span className={cx("podreq-acts")}>
                  <Btn small txt disabled={Boolean(busy)} onClick={() => void act(`host:${member.user_id}`, () => setCloudPodHost({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, userId: member.user_id, host: !member.is_host }))}>
                    {member.is_host ? "Not host" : "Make host"}
                  </Btn>
                </span>
              ) : null}
            </div>
          )) : <p className={cx("sub")}>No one yet.</p>}
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
