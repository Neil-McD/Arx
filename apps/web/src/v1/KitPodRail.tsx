// Pods (docs/specs/pods-v0.md): a pod's own right column, in place of a
// channel's. In order: who is asking to join (hosts); the guide's brief; the
// next call; what the pod knows; who is in it (Manage opens how each person
// is in, for the people who manage it). What the pod is for and the viewer's own
// membership (paying, leaving, a payment problem, Leave pod) open from two
// links at the foot.
import { Fragment, lazy, Suspense, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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
// Only the pod's hosts and the builder open its settings: loaded on demand.
const KitPodSettings = lazy(() => import("./KitPodSettings").then((module) => ({ default: module.KitPodSettings })));
import { podSettingsTabsFor, usePodSettingsTab } from "./podSettingsTabs";


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
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // The pod's settings window: open on a tab from the address (?settings=).
  const settings = usePodSettingsTab();
  const settingsTabs = podSettingsTabsFor(pod);
  useEffect(() => {
    if (asMember) { setActionError(null); if (settings.tab) settings.close(); }
  }, [asMember]); // eslint-disable-line react-hooks/exhaustive-deps
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
      // Everyone sees who is in it. Those who manage it open the pod's
      // settings on People: how each person is in, hosts, adding and removing.
      <PanelPart label="In this pod" fact={String(pod.members.length)}
        action={settingsTabs.includes("people") ? <PanelAction onClick={() => settings.open("people")}>Manage</PanelAction> : null}>
        {pod.members.length ? <PanelPeople people={people} max={5} /> : <PanelLine dim>No one yet</PanelLine>}
      </PanelPart>
    )],
    ["about", (
      <Sec label="About this pod">
        <p className={cx("sub")}>{pod.purpose || (pod.can_manage ? "Add what this pod is for." : "A small group with closer time with its hosts.")}</p>
        {pod.what_you_get.length ? (
          <ul className={cx("podget")}>{pod.what_you_get.map((line) => <li key={line}>{line}</li>)}</ul>
        ) : null}
        <span className={cx("sub2")}>
          {[pod.visibility === "listed" ? (pod.price ? "Listed: members can join" : "Listed: members can ask to join") : "Hidden: only its members know it's here",
            pod.price ? `${formatPodPrice(pod.price)} on top of membership` : null,
            pod.seats ? `${pod.members.length} of ${pod.seats} seats` : `${pod.members.length} ${pod.members.length === 1 ? "member" : "members"}`].filter(Boolean).join(" · ")}
        </span>
        {settingsTabs.length || (pod.can_manage && pod.visibility === "listed") ? (
          <div className={cx("acts")} style={{ marginTop: 10 }}>
            {settingsTabs.length ? <Btn small onClick={() => settings.open("pitch")}>Pod settings</Btn> : null}
            {pod.visibility === "listed" && pod.slug ? (
              <Btn small onClick={() => {
                void navigator.clipboard?.writeText(podLink(pod.slug)).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined);
              }}>{copied ? "Copied" : "Copy link"}</Btn>
            ) : null}
          </div>
        ) : null}
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
      {settings.tab && settingsTabs.length ? (
        <Suspense fallback={null}>
          <KitPodSettings session={props.session} communityId={props.communityId} pod={pod} tab={settings.tab}
            onTab={(tab) => settings.open(tab)} onClose={settings.close} onChanged={props.onChanged} />
        </Suspense>
      ) : null}
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
