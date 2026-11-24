// Pods (docs/specs/pods-v0.md): one page for every pod, never rows in the
// left column. Builders see all pods and start new ones; a member sees the
// pods they are in, then listed pods they could join, from the outside only.
// The pod shown is read from the address (podShown): /pods/<pod> shows that
// pod, its landing page for someone who can enter it (its brief, next call,
// what it knows, who is in it, and the way in) or its pitch for anyone else.
// /pods on a wide screen shows the pod they were last in, else the first, in
// the right column. Picking a pod is a step to its address. On a narrow
// screen there is no right column: a card opens the pod's room, and
// /pods/<pod> is the pod's page.
import { useCallback, useEffect, useState } from "react";
import { CommunityPageHeader, CommunityPageRail } from "./CommunityPageHeader";
import { PanelBlockSkeleton, PodGridSkeleton } from "./WebLoadingSkeleton";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { useLiveQuery } from "../../../../shared/liveQuery";
import {
  confirmCloudPodCheckout,
  fetchCloudCommunityPods,
  fetchCloudPodPage,
  formatPodPrice,
  requestToJoinCloudPod,
  startCloudPodCheckout,
  saveCloudPodDetails,
  type CloudCommunityPod,
  type CloudOutsidePod,
  type CloudPlanOffer,
  type CloudPodPage,
  type CloudPodPrice,
} from "../../../../shared/cloudCommunityPodsGateway";
import { changeCloudMyCommunityPlan } from "../../../../shared/cloudCommunityPlanChangeGateway";
import { Btn, cx, Icon, KitApp, Rail, usePhoneLayout } from "../v1/kit";
import { KitPodLanding } from "../v1/KitPodLanding";
import { PanelLine, PanelPart, PanelPeople } from "../v1/KitPanel";
import { podShown, recallPod, takePodPagePreview } from "../v1/podMemory";
import { podRhythmText } from "../v1/KitPodCall";
import { KitBrainMap } from "../v1/KitBrainMap";
import { brainCanDrawMap, type BrainMap } from "../../../../shared/communityBrain";
import { StableFramedMedia } from "../../../../shared/StableFramedMedia";
import { roomDot, type RoomAttention } from "../../../../shared/podsAttentionDot";

export type WebCommunityPodsSectionProps = {
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
  communityId: string | null;
  communityName: string;
  // "View as a member" shows a builder only the pods they are in.
  asMember: boolean;
  // The pod's own page when the address names one.
  podSlug: string | null;
  onNavigate: (to: { kind: "pods" } | { kind: "pod"; slug: string } | { kind: "room"; slug: string }) => void;
  // Creates the pod's invite-only room (the channels controller's createChannel).
  createRoom: (name: string, accessMode: "all_members" | "restricted") => Promise<{ id: string; slug: string } | null>;
  // Each room's live attention by slug (the left column's channel dots), so a
  // pod with something new carries the same dot as the Pods row.
  roomAttention?: Record<string, RoomAttention>;
};

function activeLabel(iso: string | null, now: number): string {
  if (!iso) return "No messages yet";
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return minutes <= 1 ? "Active just now" : `Active ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Active ${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Active yesterday" : `Active ${days} days ago`;
}

// The same dot as a channel's row: new messages, or the accent one for a tag.
function PodDot(props: { attention: RoomAttention | undefined }) {
  const dot = roomDot(props.attention);
  if (dot === "none") return null;
  return <span className={`nav-item-dot${dot === "mention" ? " is-mention" : ""}`} role="img" aria-label={dot === "mention" ? "You were tagged" : "New messages"} />;
}

function seatsLabel(pod: CloudCommunityPod): string {
  return pod.seats ? `${pod.members} of ${pod.seats} seats` : `${pod.members} ${pod.members === 1 ? "member" : "members"}`;
}

const POD_PAYMENT_KEY = "polynet_pod_payment";

// Back from Stripe: ask Polynet to check with Stripe now (its notice may not
// have arrived). Only Stripe's answer grants; this just asks sooner.
function usePodPaymentReturn(props: WebCommunityPodsSectionProps, setNotice: (text: string | null) => void, reload: () => Promise<void>) {
  useEffect(() => {
    let paymentId: string | null = null;
    try {
      paymentId = window.sessionStorage.getItem(POD_PAYMENT_KEY);
      if (paymentId) window.sessionStorage.removeItem(POD_PAYMENT_KEY);
    } catch { paymentId = null; }
    if (!paymentId) return;
    const id = paymentId;
    setNotice("Finishing your payment…");
    void (async () => {
      try {
        const session = await props.ensureSession(props.session);
        const result = session ? await confirmCloudPodCheckout({ session, paymentId: id }) : { status: "pending" };
        setNotice(result.status === "active" || result.status === "cancel_at_period_end" || result.status === "past_due"
          ? "You're in."
          : result.status === "pending" ? "If you paid, your pod will appear here in a moment." : null);
      } catch { setNotice("If you paid, your pod will appear here in a moment."); }
      await reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Join a paid pod (Stripe's checkout; access comes from Stripe's confirmation)
// or ask to join a free one. Shared by the Pods page and a pod's own page.
async function joinOrAsk(props: WebCommunityPodsSectionProps, pod: { channel_id: string; price: CloudPodPrice }): Promise<"checkout" | "asked"> {
  const session = await props.ensureSession(props.session);
  if (!session || !props.communityId) throw new Error("auth_subject_required");
  if (pod.price) {
    const here = window.location.origin + window.location.pathname;
    const { checkout_url, payment_id } = await startCloudPodCheckout({
      session, communityId: props.communityId, channelId: pod.channel_id, successUrl: here, cancelUrl: here,
    });
    // Remembered in this tab so the page can check with Stripe on return
    // (the address is rewritten on load, so a marker in it would be lost).
    try { window.sessionStorage.setItem(POD_PAYMENT_KEY, payment_id); } catch { /* the notice still grants */ }
    window.location.assign(checkout_url);
    return "checkout";
  }
  await requestToJoinCloudPod({ session, communityId: props.communityId, channelId: pod.channel_id });
  return "asked";
}

function joinErrorText(failure: unknown, paid: boolean): string | null {
  const code = String((failure as Error)?.message ?? "");
  if (code.includes("community_pod_full")) return "That pod just filled up.";
  if (code.includes("community_checkout_unavailable")) return "This pod can't take payments right now.";
  return paid ? "Checkout couldn't start. Try again." : "Couldn't send that. Try again.";
}

// Wide enough for the right column (design-v1.css shows it from 1024px).
// Narrower, a picked pod takes the page's place, with a way back.
function useWideRail(): boolean {
  const query = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia?.(query).matches === true);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setWide(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return wide;
}

const planPrice = (plan: CloudPlanOffer) => {
  const value = plan.amount_base_units / Math.pow(10, plan.currency_decimals);
  const digits = Number.isInteger(value) ? 0 : 2;
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }) + "/month";
};

// What a pod knows, as its shape only (convex/communityBrain.ts
// getPodBrainShape): dots and how they hang together, never a name or a word.
function PodShape(props: { session: unknown; communityId: string | null | undefined; channelId: string }) {
  const subject = props.session ? resolveAuthSubject(props.session as AuthSessionLike) : null;
  const { data } = useLiveQuery<BrainMap>(props.session, "communityBrain:getPodBrainShape",
    subject && props.communityId ? { authSubject: subject, communityId: props.communityId, podChannelId: props.channelId } : null);
  const [now] = useState(() => Date.now());
  if (!data || !brainCanDrawMap(data)) return null;
  return <div className={cx("brainmini")}><KitBrainMap map={data} size="panel" now={now} /></div>;
}

// A pod's pitch, for someone not in it: what it is, what you get, its hosts,
// how you get in (a plan that includes it, its own price, or asking), and the
// one button. Never who is in it or what is said. On the Pods page it fills
// the right column (on a narrow screen, the page itself).
function PodPitch(props: WebCommunityPodsSectionProps & { podSlug: string; inline: boolean; reloadKey: number; preview: boolean; onChanged?: () => void; onPreviewInside?: () => void }) {
  const [page, setPage] = useState<CloudPodPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // The builder or a host asked to see the page as members do.
  const preview = props.preview;
  const load = useCallback(async () => {
    if (!props.communityId) return;
    try {
      const session = await props.ensureSession(props.session);
      if (!session) return;
      const next = await fetchCloudPodPage({ session, communityId: props.communityId, podSlug: props.podSlug, asMember: props.asMember, preview });
      setPage(next);
    } catch { setPage({ kind: "not_found" }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.communityId, props.podSlug, props.asMember]);
  useEffect(() => { setError(null); setNote(null); void load(); }, [load, props.reloadKey]);

  const isPhone = usePhoneLayout();
  const back = props.inline && !isPhone
    ? <button type="button" className={cx("link")} onClick={() => props.onNavigate({ kind: "pods" })}>← Pods</button>
    : null;
  if (!page) return <PanelBlockSkeleton label="Loading pod…" />;
  // Someone who can enter it (it joined them since the list loaded): the way in.
  if (page.kind === "inside") {
    return (
      <div className={cx(props.inline ? "podpage land" : "land")}>
        {back}
        <p className={cx("lead")}>You're in this pod.</p>
        <div className={cx("joinbar")}><Btn go onClick={() => props.onNavigate({ kind: "room", slug: page.slug })}>Open the pod</Btn></div>
      </div>
    );
  }
  if (page.kind !== "outside") {
    return (
      <div className={cx(props.inline ? "podpage" : "podpage podpitch")}>
        {back}
        <p className={cx("lead")}>This pod isn't here.</p>
        <p className={cx("sub")}>It may be private, or it may have closed.</p>
      </div>
    );
  }
  const full = page.seats_left === 0;
  const plans = page.included_with ?? [];
  const status = page.checkout_open ? "Finishing your payment…"
    : page.my_request === "pending" ? "Asked · the host will reply"
      : page.my_request === "waitlist" ? "On the waitlist" : null;
  const join = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { if ((await joinOrAsk(props, page)) === "asked") { await load(); props.onChanged?.(); } }
    catch (failure) { setError(joinErrorText(failure, Boolean(page.price))); await load(); }
    finally { setBusy(false); }
  };
  // A pod that comes with a plan: move to that plan (the plan change), and its pod follows.
  const switchTo = async (plan: CloudPlanOffer) => {
    if (busy || !props.communityId) return;
    setBusy(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) return;
      const result = await changeCloudMyCommunityPlan({ session, communityId: props.communityId, plan: plan.key });
      setNote(result.status === "payment_problem"
        ? "Your payment didn't go through, so your plan hasn't changed. Update your card and try again."
        : `Moving you to ${plan.name}. Once the payment is confirmed, you're in ${page.name}.`);
    } catch (failure) {
      setError(String((failure as Error)?.message ?? "").includes("already_on_plan") ? "You're already on that plan." : "Couldn't change your plan just now. Try again.");
    } finally { setBusy(false); }
  };
  const price = plans.length ? `Included with ${plans.map((plan) => plan.name).join(" or ")}`
    : page.price ? `+${formatPodPrice(page.price)}` : "Free for members";
  const seats = page.seats_left === null || plans.length ? null : full ? "Full" : `${page.seats_left} left`;
  const rhythm = page.rhythm ? podRhythmText(page.rhythm) : null;
  const way = page.can_enter ? (
    <Btn go onClick={() => props.onNavigate({ kind: "room", slug: page.slug })}>Open the pod</Btn>
  ) : status ? (
    <span className={cx("podask")}>{status}</span>
  ) : plans.length ? (
    page.can_switch_plan ? (
      <>
        {plans.map((plan) => (
          <Btn key={plan.key ?? "base"} go disabled={busy} onClick={() => void switchTo(plan)}>
            {busy ? "Changing…" : `Switch to ${plan.name} · ${planPrice(plan)}`}
          </Btn>
        ))}
      </>
    ) : (
      <span className={cx("podask")}>Comes with {plans.map((plan) => plan.name).join(" or ")}</span>
    )
  ) : page.price && full ? (
    <span className={cx("podask")}>Full</span>
  ) : (
    <>
      <Btn go disabled={busy} onClick={() => void join()}>
        {busy && page.price ? "Opening checkout…" : page.price ? `Join · ${formatPodPrice(page.price)}` : full ? "Join the waitlist" : "Ask to join"}
      </Btn>
      {page.price ? <small>On top of your membership. Leave any time.</small> : full ? null : <small>The host reviews each request.</small>}
    </>
  );
  return (
    <div className={cx(props.inline ? "podpage land" : "land")}>
      {back}
      {page.cover?.url ? (
        <StableFramedMedia className="pod-cover" imageClassName="pod-cover-img" imageUrl={page.cover.url}
          frame={{ focusX: page.cover.focus_x, focusY: page.cover.focus_y, zoom: 1 }} alt="" aria-hidden />
      ) : null}
      <header>
        <h2>{page.name}</h2>
        {page.purpose ? <p className={cx("land-p")}>{page.purpose}</p> : null}
        {page.what_you_get.length ? <ul className={cx("podget")}>{page.what_you_get.map((line) => <li key={line}>{line}</li>)}</ul> : null}
      </header>
      {page.about_md?.trim() ? <div className="pod-about">{page.about_md.trim().split(/\n{2,}/).map((part, index) => <p key={index}>{part}</p>)}</div> : null}
      <PanelPart label="The way in">
        {rhythm ? <PanelLine>{rhythm}</PanelLine> : null}
        <PanelLine fact={price}>Price</PanelLine>
        {seats ? <PanelLine fact={seats}>Seats</PanelLine> : null}
      </PanelPart>
      {page.knows ? (
        <PanelPart label="What this pod knows" fact="for its members">
          <PodShape session={props.session} communityId={props.communityId} channelId={page.channel_id} />
          <PanelLine>{page.knows >= 99 ? "99+" : page.knows} {page.knows === 1 ? "thing" : "things"} learned</PanelLine>
        </PanelPart>
      ) : null}
      {page.hosts.length ? (
        <PanelPart label="Hosted by">
          <PanelPeople
            names={page.hosts}
            people={page.host_people?.length
              ? page.host_people.map((host) => ({ id: host.user_id, name: host.name, avatarUrl: host.avatar_url ?? null }))
              : undefined}
          />
        </PanelPart>
      ) : null}
      {note ? <p className={cx("sub")} role="status">{note}</p> : null}
      {error ? <p className={cx("bad")} role="alert">{error}</p> : null}
      <div className={cx("joinbar")}>
        {way}
        {props.onPreviewInside ? <Btn small onClick={props.onPreviewInside}>Preview inside as a member</Btn> : null}
      </div>
      {page.can_edit ? (
        <p className={cx("sub2")}>This is what members who aren't in it see. Edit it from the pod's right column.{page.visibility === "hidden" ? " It's hidden, so only its members know it's here." : ""}</p>
      ) : null}
    </div>
  );
}

export function WebCommunityPodsSection(props: WebCommunityPodsSectionProps) {
  return <PodsList {...props} />;
}

function PodsList(props: WebCommunityPodsSectionProps) {
  const [fallbackState, setFallbackState] = useState<{
    scope: string;
    canManage: boolean;
    pods: CloudCommunityPod[];
    outside: CloudOutsidePod[];
    previewPods: CloudCommunityPod[];
  } | null>(null);
  const [retryFailedScope, setRetryFailedScope] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", purpose: "", listed: true, seats: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const wide = useWideRail();
  const isPhone = usePhoneLayout();
  const now = Date.now();

  // Single live stream (shared/liveQuery.ts): pods, outside offers, and
  // host-preview pods draw directly from the live subscription with 30s
  // linger across tab switches — no duplicate one-shot HTTP read on mount.
  const podsSubject = props.session ? resolveAuthSubject(props.session as AuthSessionLike) : null;
  const scopeKey = `${podsSubject ?? ""}:${props.communityId ?? ""}:${props.asMember ? "member" : "default"}`;
  const livePods = useLiveQuery<{ can_manage?: boolean; pods?: CloudCommunityPod[]; outside?: CloudOutsidePod[] }>(
    props.session,
    "communityPods:listCommunityPods",
    props.communityId && podsSubject
      ? { authSubject: podsSubject, communityId: props.communityId, ...(props.asMember ? { asMember: true } : {}) }
      : null,
  );
  // Hosts in "View as a member" always see the outside-member Pods page, and
  // can click straight into any of their pods to inspect the inside member view.
  const liveManagerPods = useLiveQuery<{ can_manage?: boolean; pods?: CloudCommunityPod[]; outside?: CloudOutsidePod[] }>(
    props.session,
    "communityPods:listCommunityPods",
    props.asMember && props.communityId && podsSubject
      ? { authSubject: podsSubject, communityId: props.communityId }
      : null,
  );

  const liveState = livePods.data !== undefined
    ? {
        canManage: Boolean(livePods.data?.can_manage),
        pods: Array.isArray(livePods.data?.pods) ? livePods.data.pods : [],
        outside: Array.isArray(livePods.data?.outside) ? livePods.data.outside : [],
      }
    : null;
  const scopedFallback = fallbackState && fallbackState.scope === scopeKey ? fallbackState : null;
  const state = liveState ?? scopedFallback;
  const previewPods = liveManagerPods.data !== undefined
    ? (props.asMember && liveManagerPods.data?.can_manage && Array.isArray(liveManagerPods.data?.pods)
        ? liveManagerPods.data.pods.map((pod) => ({ ...pod, can_manage: false, waiting: 0 }))
        : [])
    : (scopedFallback?.previewPods ?? []);
  const failed = Boolean(!state && (retryFailedScope === scopeKey || livePods.error));

  const bumpPitchReload = useCallback(async () => {
    setReloadKey((key) => key + 1);
  }, []);

  const retryLoad = useCallback(async () => {
    if (!props.communityId) return;
    try {
      const session = await props.ensureSession(props.session);
      if (!session) return;
      const [result, managerResult] = await Promise.all([
        fetchCloudCommunityPods({ session, communityId: props.communityId, asMember: props.asMember }),
        props.asMember
          ? fetchCloudCommunityPods({ session, communityId: props.communityId, asMember: false }).catch(() => null)
          : Promise.resolve(null),
      ]);
      setFallbackState({
        scope: scopeKey,
        canManage: result.can_manage,
        pods: result.pods,
        outside: result.outside,
        previewPods:
          props.asMember && managerResult?.can_manage
            ? managerResult.pods.map((pod) => ({ ...pod, can_manage: false, waiting: 0 }))
            : [],
      });
      setRetryFailedScope(null);
      setReloadKey((key) => key + 1);
    } catch { setRetryFailedScope(scopeKey); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.communityId, props.asMember, scopeKey]);

  usePodPaymentReturn(props, setNotice, bumpPitchReload);

  // The pod they were last in is the one shown first (read once per visit),
  // and a builder's "see it as members do" is for the pod in the address.
  const [recalled] = useState(() => recallPod());
  const [previewSlug] = useState(() => (props.podSlug && takePodPagePreview(props.podSlug) ? props.podSlug : null));

  const create = async () => {
    const name = draft.name.trim();
    if (!name || saving || !props.communityId) return;
    setSaving(true);
    setError(null);
    try {
      const created = await props.createRoom(name, "restricted");
      const room = created ? { id: String(created.id), slug: String(created.slug) } : null;
      if (!room) { setError("The pod couldn't be created. Try again."); return; }
      const session = await props.ensureSession(props.session);
      const seats = Number(draft.seats);
      if (session) {
        await saveCloudPodDetails({
          session, communityId: props.communityId, channelId: room.id,
          purpose: draft.purpose.trim(), visibility: draft.listed ? "listed" : "hidden",
          ...(Number.isFinite(seats) && seats > 0 ? { seats } : {}),
        }).catch(() => undefined);
      }
      setCreating(false);
      setDraft({ name: "", purpose: "", listed: true, seats: "" });
      props.onNavigate({ kind: "room", slug: room.slug });
    } catch {
      setError("The pod couldn't be created. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const canManage = Boolean(state?.canManage);
  const pods = state?.pods ?? [];
  const outside = state?.outside ?? [];
  const hiddenPreviewPods = props.asMember
    ? previewPods.filter((p) => p.visibility === "hidden" && !pods.some((m) => m.channel_id === p.channel_id))
    : [];
  // In Member View, a hidden pod isn't shown to outside members at all —
  // never leave its inside landing panel open on the right.
  const isHiddenPodInAddress = Boolean(
    props.asMember && props.podSlug && hiddenPreviewPods.some((p) => p.slug === props.podSlug),
  );
  // The pod shown is read from the address and the lists (podShown).
  const shown = isHiddenPodInAddress
    ? null
    : podShown({
        podSlug: props.podSlug,
        mine: state ? pods.map((pod) => pod.slug) : null,
        outside: outside.map((pod) => pod.slug),
        recalled,
        wide,
        preview: Boolean(props.podSlug && previewSlug === props.podSlug),
      });
  const selected = shown?.slug ?? null;
  const selectedMine = shown?.kind === "landing"
    ? (pods.find((pod) => pod.slug === shown.slug) ?? null)
    : null;
  // Picking a pod is a step to its address; with no right column, a pod you're
  // in opens its room.
  const pick = (pod: CloudCommunityPod) => {
    if (!wide) { props.onNavigate({ kind: "room", slug: pod.slug }); return; }
    if (props.podSlug !== pod.slug) props.onNavigate({ kind: "pod", slug: pod.slug });
  };
  const canPreviewShownInside = Boolean(
    props.asMember && shown?.kind === "pitch"
    && previewPods.some((p) => p.slug === shown.slug),
  );
  const shownPage = (inline: boolean) => !shown ? null : selectedMine && props.communityId ? (
    <KitPodLanding session={props.session} communityId={props.communityId} pod={selectedMine}
      onOpen={() => props.onNavigate({ kind: "room", slug: selectedMine.slug })} />
  ) : (
    <PodPitch {...props} podSlug={shown.slug} inline={inline} reloadKey={reloadKey} preview={shown.kind === "pitch" && previewSlug === shown.slug}
      onChanged={() => void bumpPitchReload()} onPreviewInside={canPreviewShownInside ? () => props.onNavigate({ kind: "room", slug: shown.slug }) : undefined} />
  );
  const lead = !state ? " " : canManage
    ? (pods.length ? `${pods.length} ${pods.length === 1 ? "pod" : "pods"} in ${props.communityName}.` : "Start your first pod.")
    : (pods.length ? "Your pods." : outside.length ? "Pods you can join." : "No pods to join yet.");

  // A narrow screen has no right column: the pod in the address is the page.
  if (props.podSlug && !wide) {
    return (
      <div className="community-panel community-pods-panel">
        <CommunityPageHeader title="Pods" back={isPhone ? { label: "Back to Pods", onBack: () => props.onNavigate({ kind: "pods" }) } : null}><div className="resources-header">Pods</div></CommunityPageHeader>
        <KitApp view="events" host={canManage} part="flow">
          <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
            {notice ? <p className={cx("sub")} role="status">{notice}</p> : null}
            {/* The pitch carries its own way back; the landing page and a
                failed or loading list need one here on narrow desktop (phones
                use the top bar's Back arrow). */}
            {!isPhone && shown?.kind !== "pitch" ? <button type="button" className={cx("link")} onClick={() => props.onNavigate({ kind: "pods" })}>← Pods</button> : null}
            {failed ? <p className={cx("sub")} role="alert">Pods couldn't load. <button type="button" className={cx("link")} onClick={() => void retryLoad()}>Try again</button></p> : null}
            {!state && !failed && !shown ? <PanelBlockSkeleton label="Loading pod…" /> : null}
            {shownPage(true)}
          </div>
        </KitApp>
      </div>
    );
  }

  return (
    <div className="community-panel community-pods-panel">
      <CommunityPageHeader title="Pods"><div className="resources-header">Pods</div></CommunityPageHeader>
      <KitApp view="events" host={canManage} part="flow">
        <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
          <p className={cx("lead")} style={{ marginTop: 0 }}>{lead}</p>
          {notice ? <p className={cx("sub")} role="status">{notice}</p> : null}
          {failed ? <p className={cx("sub")} role="alert">Pods couldn't load. <button type="button" className={cx("link")} onClick={() => void retryLoad()}>Try again</button></p> : null}
          {!state && !failed ? <PodGridSkeleton /> : null}
          {pods.length || canManage ? (
            <div className={cx("podgrid")}>
              {pods.map((pod) => (
                <button key={pod.channel_id} type="button" className={cx(selected === pod.slug ? "podcard podsel" : "podcard")} aria-current={selected === pod.slug ? "true" : undefined}
                  onClick={() => pick(pod)} onDoubleClick={() => props.onNavigate({ kind: "room", slug: pod.slug })}>
                  <span className={cx("podname")}><Icon name="users" />{pod.name}<PodDot attention={props.roomAttention?.[pod.slug]} /></span>
                  <span className={cx("podpurpose")}>{pod.purpose || (pod.can_manage ? "Add what this pod is for." : "")}</span>
                  {pod.can_manage && pod.waiting ? <span className={cx("podask")}>{pod.waiting} asking to join</span> : null}
                  <span className={cx("podmeta")}>
                    {[canManage ? (pod.visibility === "listed" ? "Listed" : "Hidden") : null, canManage && pod.price ? formatPodPrice(pod.price) : null, seatsLabel(pod), activeLabel(pod.last_active_at, now)].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))}
              {canManage && !creating ? (
                <button type="button" className={cx("podcard podnew")} onClick={() => setCreating(true)}><Icon name="plus" />New pod</button>
              ) : null}
            </div>
          ) : null}
          {canManage && creating ? (
            <div className={cx("card podform")}>
              <div className={cx("meta")}><span>New pod</span></div>
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Name, e.g. Founders pod" aria-label="Pod name" maxLength={60} autoFocus />
              <textarea value={draft.purpose} onChange={(event) => setDraft({ ...draft, purpose: event.target.value })} placeholder="What is this pod for? One sentence." aria-label="What the pod is for" rows={2} maxLength={280} />
              <div className={cx("podform-row")}>
                <label className={cx("podform-check")}>
                  <input type="checkbox" checked={draft.listed} onChange={(event) => setDraft({ ...draft, listed: event.target.checked })} />
                  Listed: members can see it and ask to join
                </label>
                <label className={cx("podform-seats")}>
                  Seats
                  <input value={draft.seats} onChange={(event) => setDraft({ ...draft, seats: event.target.value.replace(/[^0-9]/g, "") })} placeholder="No limit" aria-label="Seats" inputMode="numeric" />
                </label>
              </div>
              {error ? <p className={cx("bad")} role="alert">{error}</p> : null}
              <div className={cx("acts")}>
                <Btn go small disabled={!draft.name.trim() || saving} onClick={() => void create()}>{saving ? "Creating…" : "Create pod"}</Btn>
                <Btn txt small onClick={() => { setCreating(false); setError(null); }}>Cancel</Btn>
              </div>
            </div>
          ) : null}
          {error && !creating ? <p className={cx("bad")} role="alert">{error}</p> : null}
          {outside.length ? (
            <>
              {pods.length ? <span className={cx("lab")} style={{ display: "block", marginTop: 32 }}>Pods you can join</span> : null}
              <div className={cx("podgrid")}>
                {outside.map((pod) => {
                  const full = pod.seats_left === 0;
                  const price = formatPodPrice(pod.price);
                  const status = pod.my_request === "pending" ? "Asked · the host will reply"
                    : pod.my_request === "waitlist" ? "On the waitlist" : null;
                  return (
                    <button key={pod.channel_id} type="button" className={cx(selected === pod.slug ? "podcard podout podsel" : "podcard podout")} aria-current={selected === pod.slug ? "true" : undefined}
                      onClick={() => { if (props.podSlug !== pod.slug) props.onNavigate({ kind: "pod", slug: pod.slug }); }}>
                      {pod.cover?.url ? (
                        <StableFramedMedia className="pod-card-cover" imageClassName="pod-cover-img" imageUrl={pod.cover.url}
                          frame={{ focusX: pod.cover.focus_x, focusY: pod.cover.focus_y, zoom: 1 }} alt="" aria-hidden loading="lazy" />
                      ) : null}
                      <span className={cx("podname")}><Icon name="lock" />{pod.name}</span>
                      <span className={cx("podpurpose")}>{pod.purpose}</span>
                      {pod.included_with?.length ? <span className={cx("podprice")}>Included with {pod.included_with.join(" or ")}</span>
                        : price ? <span className={cx("podprice")}>+{price} on top of your membership</span> : null}
                      <span className={cx("podmeta")}>
                        {[pod.hosts.length ? `Hosted by ${pod.hosts.join(" and ")}` : null,
                          pod.seats_left === null ? null : full ? "Full" : `${pod.seats_left} ${pod.seats_left === 1 ? "seat" : "seats"} left`].filter(Boolean).join(" · ")}
                      </span>
                      {status ? <span className={cx("podask")}>{status}</span> : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
          {hiddenPreviewPods.length > 0 ? (
            <div className={cx("podhidden-note")}>
              <span>{hiddenPreviewPods.length} hidden {hiddenPreviewPods.length === 1 ? "pod isn't" : "pods aren't"} shown to outside members.</span>
              <div className={cx("acts")} style={{ marginTop: 0 }}>
                {hiddenPreviewPods.map((pod) => (
                  <button key={pod.channel_id} type="button" className={cx("btn sm")} onClick={() => props.onNavigate({ kind: "room", slug: pod.slug })}>
                    Preview {pod.name} inside
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </KitApp>
      {/* The right column is the picked pod's landing page. */}
      {selected ? (
        <CommunityPageRail label="Pods">
          {/* The kit's own rail, as on Events and Knowledge: its padding, its
              rhythm, and never wider than the column. */}
          <KitApp view="events" host={canManage} part="rail" className="kit-page-rail">
            <Rail index={4} label="This pod">
            {shownPage(false)}
            </Rail>
          </KitApp>
        </CommunityPageRail>
      ) : null}
    </div>
  );
}
