// Pods (docs/specs/pods-v0.md): one page for every pod, never rows in the
// left column. Builders see all pods and start new ones; a member sees the
// pods they are in, then listed pods they could join, from the outside only.
// Each pod also has its own address (/c/:slug/pods/:podSlug): its room for
// someone in it, its outside page for anyone else who may see it.
import { useCallback, useEffect, useState } from "react";
import { CommunityPageHeader, CommunityPageRail } from "./CommunityPageHeader";
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
  type CloudPodPage,
  type CloudPodPrice,
} from "../../../../shared/cloudCommunityPodsGateway";
import { Btn, cx, Icon, KitApp, Sec } from "../v1/kit";

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

// The pod's own page: what it is, what you get, its hosts, price and seats,
// and the one button. Never who is in it or what is said.
function PodPage(props: WebCommunityPodsSectionProps & { podSlug: string }) {
  const [page, setPage] = useState<CloudPodPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!props.communityId) return;
    try {
      const session = await props.ensureSession(props.session);
      if (!session) return;
      const next = await fetchCloudPodPage({ session, communityId: props.communityId, podSlug: props.podSlug, asMember: props.asMember });
      // In the pod: straight into its room.
      if (next.kind === "inside") { props.onNavigate({ kind: "room", slug: next.slug }); return; }
      setPage(next);
    } catch { setPage({ kind: "not_found" }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.communityId, props.podSlug, props.asMember]);
  useEffect(() => { void load(); }, [load]);
  usePodPaymentReturn(props, setNotice, load);

  const back = <button type="button" className={cx("link")} onClick={() => props.onNavigate({ kind: "pods" })}>← Pods</button>;
  if (!page) return <div className="community-panel community-pods-panel"><CommunityPageHeader title="Pods"><div className="resources-header">Pods</div></CommunityPageHeader></div>;
  if (page.kind !== "outside") {
    return (
      <div className="community-panel community-pods-panel">
        <CommunityPageHeader title="Pods"><div className="resources-header">Pods</div></CommunityPageHeader>
        <KitApp view="events" part="flow">
          <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
            {back}
            <p className={cx("lead")}>This pod isn't here.</p>
            <p className={cx("sub")}>It may be private, or it may have closed.</p>
          </div>
        </KitApp>
      </div>
    );
  }
  const full = page.seats_left === 0;
  const status = page.checkout_open ? "Finishing your payment…"
    : page.my_request === "pending" ? "Asked · the host will reply"
      : page.my_request === "waitlist" ? "On the waitlist" : null;
  const join = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { if ((await joinOrAsk(props, page)) === "asked") await load(); }
    catch (failure) { setError(joinErrorText(failure, Boolean(page.price))); await load(); }
    finally { setBusy(false); }
  };
  return (
    <div className="community-panel community-pods-panel">
      <CommunityPageHeader title={page.name}><div className="resources-header">{page.name}</div></CommunityPageHeader>
      <KitApp view="events" host={page.can_edit} part="flow">
        <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
          {back}
          <div className={cx("podpage")}>
            <span className={cx("podname")}><Icon name={page.can_enter ? "users" : "lock"} />{page.name}</span>
            {page.purpose ? <p className={cx("lead")}>{page.purpose}</p> : null}
            {page.what_you_get.length ? (
              <Sec label="What you get">
                <ul className={cx("podget")}>{page.what_you_get.map((line) => <li key={line}>{line}</li>)}</ul>
              </Sec>
            ) : null}
            {page.hosts.length ? <p className={cx("sub")}>Hosted by {page.hosts.join(" and ")}</p> : null}
            <p className={cx("podmeta")}>
              {[page.price ? `+${formatPodPrice(page.price)} on top of your membership` : "Free for members",
                page.seats_left === null ? null : full ? "Full" : `${page.seats_left} ${page.seats_left === 1 ? "seat" : "seats"} left`].filter(Boolean).join(" · ")}
            </p>
            {notice ? <p className={cx("sub")} role="status">{notice}</p> : null}
            {error ? <p className={cx("bad")} role="alert">{error}</p> : null}
            <div className={cx("acts")}>
              {page.can_enter ? (
                <Btn go small onClick={() => props.onNavigate({ kind: "room", slug: page.slug })}>Open the pod</Btn>
              ) : status ? (
                <span className={cx("podask")}>{status}</span>
              ) : page.price && full ? (
                <span className={cx("podask")}>Full</span>
              ) : (
                <Btn go small disabled={busy} onClick={() => void join()}>
                  {busy && page.price ? "Opening checkout…" : page.price ? `Join · ${formatPodPrice(page.price)}` : full ? "Join the waitlist" : "Ask to join"}
                </Btn>
              )}
            </div>
            {page.can_edit ? (
              <p className={cx("sub2")}>This is what members see. Edit it from the pod's right column.{page.visibility === "hidden" ? " It's hidden, so only its members know it's here." : ""}</p>
            ) : null}
          </div>
        </div>
      </KitApp>
      <CommunityPageRail label="Pods">
        <KitApp view="events" host={page.can_edit} part="rail">
          <Sec label="What a pod is">
            <p className={cx("sub")}>A small group with a purpose and closer time with its hosts. Only the people in a pod can see inside it.</p>
          </Sec>
        </KitApp>
      </CommunityPageRail>
    </div>
  );
}

export function WebCommunityPodsSection(props: WebCommunityPodsSectionProps) {
  if (props.podSlug) return <PodPage {...props} podSlug={props.podSlug} />;
  return <PodsList {...props} />;
}

function PodsList(props: WebCommunityPodsSectionProps) {
  const [state, setState] = useState<{ canManage: boolean; pods: CloudCommunityPod[]; outside: CloudOutsidePod[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", purpose: "", listed: true, seats: "" });
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = Date.now();

  const load = useCallback(async () => {
    if (!props.communityId) return;
    try {
      const session = await props.ensureSession(props.session);
      if (!session) return;
      const result = await fetchCloudCommunityPods({ session, communityId: props.communityId, asMember: props.asMember });
      setState({ canManage: result.can_manage, pods: result.pods, outside: result.outside });
      setFailed(false);
    } catch { setFailed(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.communityId, props.asMember]);
  useEffect(() => { void load(); }, [load]);

  usePodPaymentReturn(props, setNotice, load);

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

  const ask = async (pod: CloudOutsidePod) => {
    if (asking || !props.communityId) return;
    setAsking(pod.channel_id);
    setError(null);
    try {
      if ((await joinOrAsk(props, pod)) === "asked") await load();
    } catch (failure) {
      setError(joinErrorText(failure, Boolean(pod.price)));
      await load();
    } finally { setAsking(null); }
  };

  const canManage = Boolean(state?.canManage);
  const pods = state?.pods ?? [];
  const outside = state?.outside ?? [];
  const lead = !state ? " " : canManage
    ? (pods.length ? `${pods.length} ${pods.length === 1 ? "pod" : "pods"} in ${props.communityName}.` : "Start your first pod.")
    : (pods.length ? "Your pods." : outside.length ? "Pods you can join." : "No pods to join yet.");

  return (
    <div className="community-panel community-pods-panel">
      <CommunityPageHeader title="Pods"><div className="resources-header">Pods</div></CommunityPageHeader>
      <KitApp view="events" host={canManage} part="flow">
        <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
          <p className={cx("lead")} style={{ marginTop: 0 }}>{lead}</p>
          {notice ? <p className={cx("sub")} role="status">{notice}</p> : null}
          {failed ? <p className={cx("sub")} role="alert">Pods couldn't load. <button type="button" className={cx("link")} onClick={() => void load()}>Try again</button></p> : null}
          {pods.length || canManage ? (
            <div className={cx("podgrid")}>
              {pods.map((pod) => (
                <button key={pod.channel_id} type="button" className={cx("podcard")} onClick={() => props.onNavigate(pod.is_member && !pod.can_manage ? { kind: "room", slug: pod.slug } : { kind: "pod", slug: pod.slug })}>
                  <span className={cx("podname")}><Icon name="users" />{pod.name}</span>
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
                    <div key={pod.channel_id} className={cx("podcard podout")}>
                      <button type="button" className={cx("podname podlink")} onClick={() => props.onNavigate({ kind: "pod", slug: pod.slug })}><Icon name="lock" />{pod.name}</button>
                      <span className={cx("podpurpose")}>{pod.purpose}</span>
                      {price ? <span className={cx("podprice")}>+{price} on top of your membership</span> : null}
                      <span className={cx("podmeta")}>
                        {[pod.hosts.length ? `Hosted by ${pod.hosts.join(" and ")}` : null,
                          pod.seats_left === null ? null : full ? "Full" : `${pod.seats_left} ${pod.seats_left === 1 ? "seat" : "seats"} left`].filter(Boolean).join(" · ")}
                      </span>
                      {status ? <span className={cx("podask")}>{status}</span> : pod.price && full ? (
                        <span className={cx("podask")}>Full</span>
                      ) : (
                        <Btn small go={Boolean(pod.price)} disabled={asking === pod.channel_id} onClick={() => void ask(pod)}>
                          {asking === pod.channel_id && pod.price ? "Opening checkout…" : pod.price ? "Join" : full ? "Join the waitlist" : "Ask to join"}
                        </Btn>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </KitApp>
      <CommunityPageRail label="Pods">
        <KitApp view="events" host={canManage} part="rail">
          <Sec label="What a pod is">
            <p className={cx("sub")}>
              {canManage
                ? "A small group with a purpose and closer time with you. Listed pods show members what they'd get and let them ask to join; hidden ones only their members know about."
                : "A small group with a purpose and closer time with its hosts. Only the people in a pod can see inside it."}
            </p>
          </Sec>
        </KitApp>
      </CommunityPageRail>
    </div>
  );
}
