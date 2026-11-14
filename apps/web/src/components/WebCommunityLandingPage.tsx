// A community's landing page, /c/<slug> (Neil, Nov 13; mock: "Community
// landing page"). It replaces sending visitors to the community's site: the
// page sells the community and lets people in, right here in the app. Every
// section comes from what the community already has, and an empty one is left
// out. The join card is the only thing that acts: Join (open), Ask to join
// (approval), or a plan, paid cash first (Stripe, then one sign-in).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelCommunityJoinRequestFromLanding,
  fetchCommunityLanding,
  finishCommunityLandingCheckout,
  joinCommunityFromLanding,
  recordCommunityLandingVisit,
  startCommunityLandingCheckout,
  type CommunityLandingPage,
  type CommunityLandingPlan,
} from "../../../../shared/cloudCommunityLandingGateway";
import "./WebCommunityLandingPage.css";

type Props = { communitySlug: string; session: unknown | null };

type Phase =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "paid_signed_out" }
  | { kind: "finishing" }
  | { kind: "joined" }
  // Stripe hasn't confirmed yet after a minute: the payment may still go
  // through, so nothing is promised; they can check again.
  | { kind: "still_confirming" }
  // Stripe says this checkout didn't complete (expired or not paid).
  | { kind: "checkout_expired" };

const CHECKOUT_SECRET_KEY = (sessionId: string) => `polynet.checkout.${sessionId}`;
const VISITOR_KEY = "polynet.visitor";

function readStored(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStored(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* private window: the email match still claims the payment */ }
}

function visitorKey(): string {
  const existing = readStored(VISITOR_KEY);
  if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
  const fresh = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 32).padEnd(16, "0");
  writeStored(VISITOR_KEY, fresh);
  return fresh;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "·";
}

function eventDay(iso: string): { weekday: string; day: string; time: string } {
  const at = new Date(iso);
  return {
    weekday: at.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase(),
    day: String(at.getDate()),
    time: at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

// What went wrong, in the page's own words (the server's codes).
function joinErrorText(error: unknown, name: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("community_user_blocked")) return `You can't join ${name}.`;
  if (message.includes("plan_unavailable") || message.includes("price_point")) return "That plan isn't on sale any more. Choose another.";
  if (message.includes("checkout_unavailable") || message.includes("temporarily_unavailable")) return "Checkout is busy right now. Try again in a minute.";
  if (message.includes("already")) return "You're already in.";
  if (message.includes("account_setup")) return `Finish setting up your Polynet account to join ${name}.`;
  return "That didn't work. Try again.";
}

function planPrice(plan: CommunityLandingPlan): string {
  return `${plan.price}/${plan.billing_period === "annual" ? "year" : "month"}`;
}

function loginHref(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function WebCommunityLandingPage(props: Props) {
  const slug = props.communitySlug.toLowerCase();
  const [page, setPage] = useState<CommunityLandingPage | null | "missing" | "unreachable">(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [planIndex, setPlanIndex] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  // Bumped by "Check again" to re-run the finish after a slow confirmation.
  const [finishAttempt, setFinishAttempt] = useState(0);
  const autoActed = useRef(false);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const checkoutParam = params.get("checkout");
  const returnSessionId = checkoutParam && /^chk_[a-f0-9]{32}$/.test(checkoutParam) ? checkoutParam : null;
  const intent = params.get("intent");

  const load = useCallback(async () => {
    try {
      const next = await fetchCommunityLanding(props.session, slug);
      setPage(next ?? "missing");
      return next;
    } catch {
      setPage((current) => (current && typeof current === "object" ? current : "unreachable"));
      return null;
    }
  }, [props.session, slug]);

  useEffect(() => { void load(); }, [load]);

  const data = page && typeof page === "object" ? page : null;

  useEffect(() => {
    if (data) document.title = `${data.community.name} · Polynet`;
  }, [data?.community.name]);

  // A visit, for the founder's Analytics (not members, not the owner).
  const countedVisit = useRef(false);
  useEffect(() => {
    if (!data || countedVisit.current || data.is_owner || data.viewer?.state === "member") return;
    countedVisit.current = true;
    void recordCommunityLandingVisit(slug, visitorKey()).catch(() => undefined);
  }, [data, slug]);

  const openCommunity = useCallback(() => {
    window.location.assign(`/c/${encodeURIComponent(slug)}/home`);
  }, [slug]);

  // Back from Stripe: signed out, the card asks them to sign in; signed in,
  // the membership finishes (Stripe's verified notice decides), then in.
  useEffect(() => {
    if (!returnSessionId || !data) return;
    if (!props.session) { setPhase({ kind: "paid_signed_out" }); return; }
    let cancelled = false;
    setPhase({ kind: "finishing" });
    const secret = readStored(CHECKOUT_SECRET_KEY(returnSessionId));
    const tryFinish = async (attempt: number) => {
      try {
        const result = await finishCommunityLandingCheckout(props.session, { communitySlug: slug, sessionId: returnSessionId, buyerSecret: secret });
        if (cancelled) return;
        if (result.status === "joined") {
          writeStored(CHECKOUT_SECRET_KEY(returnSessionId), null);
          setPhase({ kind: "joined" });
          window.setTimeout(openCommunity, 900);
          return;
        }
        if (result.status === "pending") {
          if (attempt < 30) { window.setTimeout(() => void tryFinish(attempt + 1), 2000); return; }
          setPhase({ kind: "still_confirming" });
          return;
        }
        setPhase({ kind: "checkout_expired" });
      } catch {
        if (cancelled) return;
        if (attempt < 30) window.setTimeout(() => void tryFinish(attempt + 1), 2000);
        else setPhase({ kind: "still_confirming" });
      }
    };
    void tryFinish(0);
    return () => { cancelled = true; };
  }, [returnSessionId, Boolean(data), props.session, slug, openCommunity, finishAttempt]);

  const join = useCallback(async () => {
    if (!data) return;
    if (!props.session) { window.location.assign(loginHref(`/c/${slug}?intent=join`)); return; }
    setPhase({ kind: "busy" }); setError(null);
    try {
      await joinCommunityFromLanding(props.session, slug);
      const next = await load();
      if (next?.viewer?.state === "member") { setPhase({ kind: "joined" }); window.setTimeout(openCommunity, 600); return; }
      setPhase({ kind: "idle" });
    } catch (joinError) {
      setError(joinErrorText(joinError, data.community.name));
      setPhase({ kind: "idle" });
    }
  }, [data, props.session, slug, load, openCommunity]);

  const cancelRequest = useCallback(async () => {
    if (!props.session) return;
    setPhase({ kind: "busy" }); setError(null);
    try { await cancelCommunityJoinRequestFromLanding(props.session, slug); await load(); }
    catch (cancelError) { setError(joinErrorText(cancelError, data?.community.name ?? "")); }
    setPhase({ kind: "idle" });
  }, [props.session, slug, load, data?.community.name]);

  const checkout = useCallback(async () => {
    if (!data) return;
    const plan = data.plans[planIndex] ?? data.plans[0];
    if (!plan) return;
    setPhase({ kind: "busy" }); setError(null);
    try {
      const started = await startCommunityLandingCheckout(props.session, {
        communitySlug: slug,
        billingPeriod: plan.billing_period === "annual" ? "annual" : "monthly",
        plan: plan.plan,
      });
      if (started.buyer_secret) writeStored(CHECKOUT_SECRET_KEY(started.session_id), started.buyer_secret);
      window.location.assign(started.checkout_url);
    } catch (checkoutError) {
      setError(joinErrorText(checkoutError, data.community.name));
      setPhase({ kind: "idle" });
    }
  }, [data, planIndex, props.session, slug]);

  // Signed in to join (intent=join): do it once they're back.
  useEffect(() => {
    if (autoActed.current || intent !== "join" || !data || !props.session) return;
    if (data.viewer?.state !== "visitor" || data.viewer.setup_required) return;
    if (data.gate !== "join" && data.gate !== "request_access") return;
    autoActed.current = true;
    void join();
  }, [intent, data, props.session, join]);

  if (page === null) return <div className="cl-page cl-loading" aria-busy="true" />;
  if (page === "missing" || page === "unreachable") {
    return (
      <div className="cl-page">
        <div className="cl-empty">
          <h1>{page === "missing" ? "Community not found" : "Couldn't reach Polynet"}</h1>
          <p>{page === "missing" ? "This community doesn't exist or isn't open any more." : "Check your connection and try again."}</p>
          {page === "unreachable" ? <button type="button" className="cl-primary" onClick={() => window.location.reload()}>Try again</button> : <a className="cl-secondary" href="/">Go to Polynet</a>}
        </div>
      </div>
    );
  }

  const c = data!.community;
  const viewer = data!.viewer;
  const hereNow = `/c/${slug}${window.location.search}`;
  const joinCard = renderJoinCard();
  const showOwnerNote = data!.is_owner && (!c.about || !c.banner_url || !c.one_liner);

  function renderJoinCard() {
    const d = data!;
    const name = d.community.name;
    const footer = d.terms_url ? (
      <p className="cl-fine">By joining you agree to the <a href={d.terms_url}>Terms</a>{d.privacy_url ? <> and <a href={d.privacy_url}>Privacy policy</a></> : null}.</p>
    ) : null;
    const signInLine = !d.signed_in ? <p className="cl-signin">Already a member? <a href={loginHref(`/c/${slug}`)}>Sign in</a></p> : null;
    const errorLine = error ? <p className="cl-error" role="alert">{error}</p> : null;

    if (phase.kind === "joined") return <Card title="You're in" note={`Opening ${name}…`} />;
    if (phase.kind === "finishing") return <Card title={<><span className="cl-spin" aria-hidden="true" />Finishing your membership…</>} note="This takes a few seconds. You'll go straight in." />;
    if (phase.kind === "paid_signed_out") {
      return (
        <Card title="Almost there" note="Sign in with the email you paid with to finish joining. Your membership starts as soon as Stripe confirms the payment.">
          <a className="cl-primary" href={loginHref(hereNow)}>Sign in to finish</a>
        </Card>
      );
    }
    if (phase.kind === "still_confirming") {
      return (
        <Card title="Still confirming your payment" note="Stripe hasn't confirmed it yet. Your membership starts as soon as it does; your email receipt is the record.">
          <button type="button" className="cl-primary" onClick={() => setFinishAttempt((n) => n + 1)}>Check again</button>
        </Card>
      );
    }
    if (phase.kind === "checkout_expired") {
      return (
        <Card title="That checkout didn't complete" note="Stripe didn't finish this payment. You can start again.">
          <button type="button" className="cl-primary" onClick={() => { setPhase({ kind: "idle" }); window.history.replaceState({}, "", `/c/${slug}`); }}>Try again</button>
        </Card>
      );
    }
    if (viewer?.state === "member") {
      return (
        <Card title={d.is_owner ? "Your community" : "You're a member"} note={d.is_owner ? "This is the page people see when you share your link." : null}>
          <button type="button" className="cl-primary" onClick={openCommunity}>Open community</button>
        </Card>
      );
    }
    if (viewer?.state === "blocked") return <Card title={`You can't join ${name}`} note={null} />;
    if (!d.available) return <Card title={`Join ${name}`} note={`${name} isn't taking new members right now.`} />;
    if (viewer?.setup_required) {
      return <Card title={`Join ${name}`} note={`Finish setting up your Polynet account to join ${name}.`}><a className="cl-primary" href={`/onboarding?community=${encodeURIComponent(slug)}`}>Finish setup</a></Card>;
    }
    if (viewer?.state === "pending") {
      return (
        <Card title={<><span className="cl-dot is-wait" aria-hidden="true" />Request sent</>} note="You're waiting for the host to let you in. We'll email you when they do.">
          <button type="button" className="cl-secondary" disabled={phase.kind === "busy"} onClick={() => void cancelRequest()}>{phase.kind === "busy" ? "Cancelling…" : "Cancel request"}</button>
          {errorLine}
        </Card>
      );
    }
    if (viewer?.state === "denied" && !viewer.can_request_again) {
      const until = viewer.reapply_at ? new Date(viewer.reapply_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
      return <Card title="Not this time" note={until ? `The host declined your request. You can ask again on ${until}.` : "The host declined your request."} />;
    }

    if (d.gate === "checkout") {
      if (d.plans.length === 0) return <Card title={`Join ${name}`} note={`${name} isn't taking payments right now. Check back soon.`} />;
      const chosen = d.plans[planIndex] ?? d.plans[0];
      return (
        <Card title={`Join ${name}`} note={null}>
          {d.plans.length > 1 ? (
            <fieldset className="cl-plans">
              <legend>Choose a plan</legend>
              {d.plans.map((plan, index) => (
                <label key={`${plan.plan ?? "base"}:${plan.billing_period}`} className={index === planIndex ? "is-on" : ""}>
                  <input type="radio" name="cl-plan" checked={index === planIndex} onChange={() => setPlanIndex(index)} />
                  <span className="cl-plan-name">{plan.title}{plan.billing_period === "annual" ? " · yearly" : ""}</span>
                  <span className="cl-plan-price">{planPrice(plan)}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="cl-price">{chosen.price}<span>/{chosen.billing_period === "annual" ? "year" : "month"}</span></div>
          )}
          <button type="button" className="cl-primary" disabled={phase.kind === "busy"} onClick={() => void checkout()}>
            {phase.kind === "busy" ? "Opening checkout…" : `Join for ${planPrice(chosen)}`}
          </button>
          <p className="cl-fine">You pay with Stripe{d.signed_in ? "" : ", then sign in with one tap"}. Cancel anytime.</p>
          {errorLine}
          {footer}
          {signInLine}
        </Card>
      );
    }
    const asks = d.gate === "request_access";
    return (
      <Card title={`Join ${name}`} note={asks ? "The host reviews each request. You'll hear back by email." : `Free to join.${c.member_count > 1 ? ` ${c.member_count.toLocaleString()} members.` : ""}`}>
        <button type="button" className="cl-primary" disabled={phase.kind === "busy"} onClick={() => void join()}>
          {phase.kind === "busy" ? (asks ? "Sending…" : "Joining…") : asks ? (viewer?.state === "denied" ? "Ask again" : "Ask to join") : "Join"}
        </button>
        {!d.signed_in ? <p className="cl-fine">You'll sign in with one tap.</p> : null}
        {errorLine}
        {footer}
        {signInLine}
      </Card>
    );
  }

  const steps = data!.gate === "checkout"
    ? ["Choose a plan and pay with Stripe.", "Sign in with one tap, using the same email.", "You're in. Cancel anytime from Settings."]
    : data!.gate === "request_access"
      ? ["Sign in with one tap.", "Ask to join. The host reviews it.", "You're in once they say yes."]
      : ["Sign in with one tap.", "Join.", "You're in."];
  const hasInside = c.courses.length > 0 || data!.events.length > 0 || Boolean(data!.guide) || Boolean(data!.app);
  const paidPlans = data!.gate === "checkout" ? data!.plans.filter((plan) => plan.billing_period !== "annual") : [];
  const aboutLong = (c.about ?? "").length > 600;

  return (
    <div className="cl-page">
      <header className="cl-top">
        <a href="/" className="cl-brand">Polynet</a>
        {!data!.signed_in ? <a href={loginHref(`/c/${slug}`)} className="cl-top-signin">Sign in</a> : null}
      </header>

      <section className="cl-cover">
        <div className={`cl-banner${c.banner_url ? "" : " is-plain"}`}>
          {c.banner_url ? <img src={c.banner_url} alt="" /> : null}
        </div>
        <div className="cl-logo">
          {c.avatar_url ? <img src={c.avatar_url} alt="" /> : <span>{initials(c.name)}</span>}
        </div>
      </section>

      <main className="cl-main">
          <div className="cl-head">
            <h1>{c.name}</h1>
            {c.one_liner ? <p className="cl-oneliner">{c.one_liner}</p> : null}
            <div className="cl-facts">
              {data!.host ? (
                <span className="cl-fact">
                  <span className="cl-face" aria-hidden="true">{data!.host.avatar_url ? <img src={data!.host.avatar_url} alt="" /> : initials(data!.host.name)}</span>
                  Hosted by {data!.host.name}
                </span>
              ) : null}
              <span className="cl-fact">{c.member_count > 1 ? `${c.member_count.toLocaleString()} members` : "Just started"}</span>
              {data!.guide ? <span className="cl-fact is-guide">Has a guide</span> : null}
            </div>
          </div>

          <aside className="cl-card-slot" aria-label="Join">{joinCard}</aside>

        <div className="cl-body">
          {showOwnerNote ? (
            <div className="cl-owner-note">
              <strong>Only you see this</strong>
              <p>Your page fills in as your community grows. Add a one-liner, an about and a banner in Settings; courses, events and your guide show up here on their own.</p>
              <a href={`/c/${slug}/settings`}>Open Settings</a>
            </div>
          ) : null}

          {c.about ? (
            <section className="cl-section">
              <h2>About</h2>
              <p className={`cl-about${aboutLong && !aboutOpen ? " is-clipped" : ""}`}>{c.about}</p>
              {aboutLong ? <button type="button" className="cl-link" onClick={() => setAboutOpen((open) => !open)}>{aboutOpen ? "Show less" : "Read more"}</button> : null}
            </section>
          ) : null}

          {hasInside ? (
            <section className="cl-section">
              <h2>What's inside</h2>
              <div className="cl-tiles">
                {c.courses.length ? (
                  <div className="cl-tile">
                    <div className="cl-tile-label">Courses</div>
                    {c.courses.map((course) => (
                      <div key={course.title} className="cl-row"><span>{course.title}</span><span className="cl-dim">{course.lessons} {course.lessons === 1 ? "lesson" : "lessons"}</span></div>
                    ))}
                  </div>
                ) : null}
                {data!.events.length ? (
                  <div className="cl-tile">
                    <div className="cl-tile-label">Coming up</div>
                    {data!.events.map((event) => {
                      const when = eventDay(event.starts_at);
                      return (
                        <div key={`${event.title}:${event.starts_at}`} className="cl-event">
                          <span className="cl-date"><span>{when.weekday}</span><b>{when.day}</b></span>
                          <span>{event.title}<span className="cl-sub">{[when.time, event.place, event.repeats ? `repeats ${event.repeats}` : null].filter(Boolean).join(" · ")}</span></span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {data!.guide ? (
                  <div className="cl-tile is-guide">
                    <div className="cl-tile-label">The guide</div>
                    <p>Members can ask the community's guide anything it knows{data!.guide.notes > 0 ? `, from its courses, conversations and ${data!.guide.notes.toLocaleString()} saved ${data!.guide.notes === 1 ? "note" : "notes"}` : ""}.</p>
                  </div>
                ) : null}
                {data!.app ? (
                  <a className="cl-tile is-app" href={data!.app.url} target="_blank" rel="noreferrer">
                    <span className="cl-app-mark" aria-hidden="true">{initials(data!.app.name)}</span>
                    <span className="cl-app-text"><span>{data!.app.name} <span className="cl-dim">· the community's app</span></span><span className="cl-dim">Members sign in with the same account.</span></span>
                    <span className="cl-dim">{data!.app.host}</span>
                  </a>
                ) : null}
              </div>
            </section>
          ) : null}

          {data!.host ? (
            <section className="cl-section">
              <h2>Your host</h2>
              <div className="cl-host">
                <span className="cl-face is-big" aria-hidden="true">{data!.host.avatar_url ? <img src={data!.host.avatar_url} alt="" /> : initials(data!.host.name)}</span>
                <div><div className="cl-host-name">{data!.host.name}</div>{data!.host.bio ? <p>{data!.host.bio}</p> : null}</div>
              </div>
            </section>
          ) : null}

          {paidPlans.length > 1 ? (
            <section className="cl-section">
              <h2>Plans</h2>
              <div className="cl-plan-cards">
                {paidPlans.map((plan) => (
                  <div key={plan.plan ?? "base"} className="cl-plan-card">
                    <div className="cl-plan-title">{plan.title}</div>
                    <div className="cl-price">{plan.price}<span>/month</span></div>
                    {plan.includes.length ? <div className="cl-dim">Includes {plan.includes.join(", ")}</div> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {data!.available && viewer?.state !== "member" ? (
            <section className="cl-section">
              <h2>How joining works</h2>
              <ol className="cl-steps">{steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
            </section>
          ) : null}
        </div>
      </main>

      <footer className="cl-foot">
        <span>A community on Polynet</span>
        <span>{data!.terms_url ? <a href={data!.terms_url}>Terms</a> : null}{data!.privacy_url ? <a href={data!.privacy_url}>Privacy</a> : null}</span>
      </footer>
    </div>
  );
}

function Card(props: { title: React.ReactNode; note: string | null; children?: React.ReactNode }) {
  return (
    <div className="cl-card">
      <div className="cl-card-title">{props.title}</div>
      {props.note ? <p className="cl-card-note">{props.note}</p> : null}
      {props.children}
    </div>
  );
}
