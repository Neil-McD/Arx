// Pods (docs/specs/pods-v0.md): a pod's own right column, in place of a
// channel's. In order: who is asking to join (hosts); the guide's brief; the
// next call; what the pod knows; who is in it (Manage opens how each person
// is in, for the people who manage it). What the pod is for and the viewer's own
// membership (paying, leaving, a payment problem, Leave pod) open from two
// links at the foot.
import { Fragment, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CommunityChannelSessionContext } from "../components/CommunityChannelSessionContext";
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
import { Btn, KitApp, Rail, Sec, cx } from "./kit";
import { BriefPart, usePlaceBriefRead } from "./KitBrief";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { useLiveAnswer } from "../../../../shared/liveQuery";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { KitPodCall } from "./KitPodCall";
import { KitPodKnowledge } from "./KitPodKnowledge";
import { PanelAction, PanelLine, PanelPart, PanelPeople, usePanelSettled } from "./KitPanel";
import { askForPodPagePreview, forgetPod, goToPodsPath, rememberPod } from "./podMemory";

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
  const scope = useContext(CommunityChannelSessionContext);
  const asMember = Boolean(scope?.memberPreview);
  const pod = asMember
    ? { ...props.pod, can_manage: false, can_edit: false, requests: [] }
    : props.pod;
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ scope: "requests" | "people"; message: string } | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // The people part, opened to how each person is in.
  const [managing, setManaging] = useState(false);
  useEffect(() => {
    if (asMember) { setEditing(null); setManaging(false); setActionError(null); }
  }, [asMember]);
  // Your membership (paying, leaving, payment problem) starts open when a
  // payment needs attention, and toggles from the foot for enrolled members.
  const [membershipOpen, setMembershipOpen] = useState(() => pod.my_membership?.state === "payment_problem");
  const act = async (key: string, scope: "requests" | "people", work: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setActionError(null);
    try { await work(); props.onChanged(); }
    catch {
      setActionError({
        scope,
        message: scope === "requests" ? "Couldn't update that request. Try again." : "Couldn't update host status. Try again.",
      });
    } finally { setBusy(null); }
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
      if (result.left === "now") { forgetPod(); goToPodsPath(); }
      else props.onChanged();
    } catch (failure) {
      // A pod their plan includes goes with the plan.
      setLeaveError(String((failure as Error)?.message ?? "").includes("community_pod_seat_from_plan")
        ? "This pod comes with your plan. It ends when the plan does." : "Couldn't leave. Try again.");
    } finally { setBusy(null); }
  };

  const { brief, settled: briefSettled } = usePlaceBriefRead(props.session, props.communityId, pod.channel_id);
  // Layout before data: the parts draw once the brief above them has
  // answered, so they aren't drawn and then pushed down by it.
  const settled = usePanelSettled(briefSettled);
  const [now] = useState(() => Date.now());
  const mine = pod.my_membership;
  const paid = Boolean(mine && mine.state !== "added");

  // The panel's parts, in order (mock: "Right panels, second pass"): who is
  // asking to join (hosts), the guide's brief, the next call, what the pod
  // knows, who is in it. What the pod is and the viewer's own membership are
  // looked at rarely: two links at the foot open them in place. Each part
  // keeps its own key, so one coming or going never resets a draft in
  // another.
  const people = pod.members.map((member) => ({ id: member.user_id, name: member.name, avatarUrl: member.avatar_url ?? null }));
  const parts = ([
    ["requests", pod.can_manage && pod.requests.length ? (
      <div className={cx("needs")}>
        {pod.requests.map((request) => (
          <div key={request.user_id} className={cx("need")}>
            <span className={cx("t")}><b>{request.name}</b> {request.status === "waitlist" ? "is on the waitlist" : "asked to join"}</span>
            <Btn small go disabled={Boolean(busy)} onClick={() => void act(`yes:${request.user_id}`, "requests", () => decideCloudPodRequest({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, userId: request.user_id, approve: true }))}>Add</Btn>
            <Btn small txt disabled={Boolean(busy)} onClick={() => void act(`no:${request.user_id}`, "requests", () => decideCloudPodRequest({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, userId: request.user_id, approve: false }))}>Decline</Btn>
          </div>
        ))}
        {actionError?.scope === "requests" ? <p className={cx("bad")} role="alert">{actionError.message}</p> : null}
      </div>
    ) : null],
    ["brief", brief ? <BriefPart brief={brief} now={now} /> : null],
    ["call", pod.next_call || pod.can_manage ? (
      <KitPodCall session={props.session} communityId={props.communityId} pod={pod} onChanged={props.onChanged} />
    ) : null],
    ["knowledge", <KitPodKnowledge session={props.session} communityId={props.communityId} channelId={pod.channel_id} asMember={asMember} />],
    ["people", (
      // Everyone sees who is in it. Those who manage it open how each person
      // is in (paying, leaving, a payment problem) and, to edit, the host switch.
      <PanelPart label="In this pod" fact={String(pod.members.length)}
        action={pod.can_manage && pod.members.length ? <PanelAction expanded={managing} onClick={() => { setActionError(null); setManaging(!managing); }}>{managing ? "Done" : "Manage"}</PanelAction> : null}>
        {!pod.members.length ? <PanelLine dim>No one yet</PanelLine> : managing ? pod.members.map((member) => (
          <div key={member.user_id} className={cx("ln")}>
            <span className={cx("av s")} title={member.name}>
              <UserAvatar
                className="community-dm-kit-avatar"
                readyClassName="has-image"
                name={member.name}
                imageUrl={member.avatar_url ?? null}
                alt=""
                fallback={<span>{member.name.trim().charAt(0).toUpperCase() || "?"}</span>}
              />
            </span>
            <span className={cx("t")}>{member.name}{member.is_host ? " · host" : ""}</span>
            {member.payment ? <em>{memberTag(member.payment)}</em> : null}
            {pod.can_edit ? (
              <PanelAction disabled={Boolean(busy)} onClick={() => void act(`host:${member.user_id}`, "people", () => setCloudPodHost({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, userId: member.user_id, host: !member.is_host }))}>
                {member.is_host ? "Not host" : "Make host"}
              </PanelAction>
            ) : null}
          </div>
        )) : <PanelPeople people={people} max={5} />}
        {actionError?.scope === "people" ? <p className={cx("bad")} role="alert">{actionError.message}</p> : null}
      </PanelPart>
    )],
    ["about", (
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
                  <Btn small onClick={() => setEditing({
                    purpose: pod.purpose, whatYouGet: pod.what_you_get.join("\n"), listed: pod.visibility === "listed",
                    seats: pod.seats ? String(pod.seats) : "", price: pod.price ? String(Math.round(pod.price.amount_base_units / 100)) : "",
                  })}>Edit</Btn>
                ) : null}
                {pod.visibility === "listed" && pod.slug ? (
                  <Btn small onClick={() => {
                    void navigator.clipboard?.writeText(podLink(pod.slug)).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined);
                  }}>{copied ? "Copied" : "Copy link"}</Btn>
                ) : null}
                {pod.slug ? <Btn small onClick={() => { askForPodPagePreview(pod.slug); goToPodsPath(pod.slug); }}>See it as members do</Btn> : null}
              </div>
            ) : null}
          </>
        )}
      </Sec>
    )],
    ["membership", membershipOpen && mine ? (
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
            <Btn small onClick={() => setConfirmLeave(true)}>Leave pod</Btn>
          </div>
        )}
      </Sec>
    ) : null],
  ] as Array<[string, ReactNode]>).filter(([, part]) => Boolean(part));

  return (
    <KitApp view="wins" part="rail">
      <Rail index={1} label="About this pod">
        {settled ? parts.map(([key, part]) => <Fragment key={key}>{part}</Fragment>) : null}
        {mine ? (
          <div className={cx("railfoot")}>
            <button type="button" aria-expanded={membershipOpen} onClick={() => setMembershipOpen((open) => !open)}>Your membership</button>
          </div>
        ) : null}
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
    try {
      const next = await fetchCloudPod({ session, communityId, channelId });
      setPod(next);
      // In a pod: "Pods" in the left column comes back here.
      if (next?.slug) rememberPod(next.slug);
    } catch { setPod(null); }
  }, [session, communityId, channelId]);
  useEffect(() => { void load(); }, [load]);
  // Live (shared/liveQuery.ts): someone joining, leaving or asking, or a
  // call being planned, shows without a reload.
  const subject = session ? resolveAuthSubject(session as AuthSessionLike) : null;
  useLiveAnswer<CloudPodDetail>(session, "communityPods:getPod",
    subject && communityId && channelId ? { authSubject: subject, communityId, channelId } : null,
    (next) => { setPod(next); if (next?.slug) rememberPod(next.slug); });
  return { pod, reload: load };
}
