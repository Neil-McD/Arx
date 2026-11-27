import { Fragment, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";

import { formatPlanPrice } from "../../../../../shared/accountCommerce";
import { formatAiCredits } from "../../../../../shared/agentRoiSummary";
import {
  POLYNET_COMMUNITY_PLATFORM_FEE_BPS,
  POLYNET_FOUNDER_TIER_CATALOG,
  type FounderPlanTier,
} from "../../../../../shared/founderPlan";
import { rememberLandingPlanChoice } from "../../../../../shared/landingPlanChoice";
import { StableFramedMedia } from "../../../../../shared/StableFramedMedia";
import { FeatureSection, StatementFigures } from "./LandingScenes";
// The real app's kit is heavy, so the preview loads after the hero paints.
const RealAppPreview = lazy(() => import("./RealAppPreview").then((module) => ({ default: module.RealAppPreview })));
const GuideScene = lazy(() => import("./GuideScene").then((module) => ({ default: module.GuideScene })));
const BrainScene = lazy(() => import("./BrainScene").then((module) => ({ default: module.BrainScene })));
const ChiefScene = lazy(() => import("./ChiefScene").then((module) => ({ default: module.ChiefScene })));
const BoardScene = lazy(() => import("./BoardScene").then((module) => ({ default: module.BoardScene })));
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";
import { buildPolynetMcpSetupForOrigin } from "../../../../../shared/polynetMcpSetup";
import { Copy } from "lucide-react";
import { HarnessStack } from "./HarnessStack";

type JoinProps = { onJoin: () => void };

// The prices and included AI credits come from the same numbers checkout charges.
const dollars = (baseUnits: number) => `$${baseUnits / 100}`;
const GUIDE = POLYNET_FOUNDER_TIER_CATALOG.guide;
const CHIEF = POLYNET_FOUNDER_TIER_CATALOG.chief_of_staff;
export const LANDING_OFFER_LINE =
  `Free to build · Guide ${dollars(GUIDE.monthlyPriceBaseUnits)}/mo · Chief of Staff ${dollars(CHIEF.monthlyPriceBaseUnits)}/mo`;
export const FEE = `${POLYNET_COMMUNITY_PLATFORM_FEE_BPS / 100}%`;

type Plan = { tier: FounderPlanTier | null; name: string; line: string; price: string; per: string; points: string[]; ai: string | null; note?: string; button: string; lit?: boolean };
export const LANDING_PLANS: Plan[] = [
  {
    tier: null, name: "Free", line: "Run your community", price: "$0", per: "/ month", ai: null, button: "Start free",
    points: [
      "Unlimited members",
      "Channels, courses, events and pods",
      "Members board with automatic checkpoints",
      "Paid memberships and weekly digest emails",
      "Connect your own Claude or ChatGPT",
    ],
  },
  {
    tier: "guide", name: GUIDE.label, line: "It answers and remembers", price: dollars(GUIDE.monthlyPriceBaseUnits), per: "/ month per community",
    button: `Start with ${GUIDE.label}`,
    ai: `${formatAiCredits(GUIDE.includedCostMicros, { unit: false })} AI credits included each month`,
    points: [
      "Everything in Free",
      "A private guide for every member",
      "Replies when tagged in channels",
      "Community brain that keeps what's learned",
    ],
  },
  {
    tier: "chief_of_staff", name: CHIEF.label, line: "It helps run the place", price: dollars(CHIEF.monthlyPriceBaseUnits), per: "/ month per community", lit: true,
    button: `Start with ${CHIEF.label}`,
    note: "Less than a few hours of a community manager's time, every month.",
    ai: `${formatAiCredits(CHIEF.includedCostMicros, { unit: false })} AI credits included each month · optional boosts under your cap`,
    points: [
      "Everything in Guide",
      "Daily morning brief for you",
      "Proactive member check-ins & welcomes",
      "Reply drafts & auto-replies for unanswered questions",
      "AI working your Members board",
    ],
  },
];

export const INCLUDED: Array<[string, string]> = [
  ["Channels and messages", "Group channels, threaded replies, direct messages and a calm inbox."],
  ["Courses and knowledge", "Publish lessons, see who's progressing, attach notes and files."],
  ["Members board", "Track every member from day one to real results, with checkpoints that tick themselves and optional Auto-move."],
  ["Events and pods", "One-off or recurring sessions with reminders, plus private rooms and calls for cohorts and small groups."],
  ["Paid memberships", "Charge for access, with payouts straight to you through Stripe."],
  ["Works with your own AI", "Connect Claude or ChatGPT. It acts inside your permissions."],
];

export const QUESTIONS: Array<[string, string]> = [
  ["Is the Free plan really free?", "Yes. Unlimited members, courses, channels, pods, events and the Members board, with no time limit. You pay only if you turn on Guide or Chief of Staff, or when you sell memberships."],
  ["How far do AI credits go?", "A typical member question or reply uses just a few credits. 3,000 credits on Guide covers hundreds of answers a month, and 20,000 credits on Chief of Staff covers daily briefs, proactive member check-ins and active discussions for a growing community."],
  ["What happens at the monthly credit limit?", "The AI pauses until your next billing cycle. You never get a surprise bill. On Chief of Staff you can turn on optional $30 boosts (+20,000 credits), under a monthly cap you set."],
  ["How does charging members work?", `Connect Stripe once and set your community to free, approval-only or paid. Payouts go to your account, less a ${FEE} Polynet fee and Stripe's processing fee.`],
  ["Can I change plans later?", "Yes. Plans are month to month per community. Start free and move up or down whenever you like."],
];

// Funnel step: which door a visitor used, and from where on the page. A plan
// button also remembers the plan, so it is offered first once the community
// exists; every other door starts free.
export function trackStart(placement: string, onJoin: () => void, tier: FounderPlanTier | null = null) {
  return () => {
    captureProductAnalyticsEvent("start_community_clicked", { placement, ...(tier ? { plan_tier: tier } : {}) });
    rememberLandingPlanChoice(tier);
    onJoin();
  };
}

function trackFind(placement: string) {
  return () => captureProductAnalyticsEvent("find_community_clicked", { placement });
}

// Named in the Terms and on the server-rendered public pages (apps/web/publicPages.ts).
const OPERATOR_NAME = "EXECUTIVEINTELLIGENCE LLC";
const SUPPORT_EMAIL = "support@polynet.ai";

// "See it live": Polynet's own community, open to look around before signing up.
const LIVE_COMMUNITY_PATH = "/c/polynet";

// The Polynet mark on its graphite tile, as the tab icon draws it. Same
// geometry as scripts/generate_brand_icons.mjs.
const MARK_NODES: Record<string, [number, number, number]> = {
  a: [133, 148, 34], hub: [258, 205, 62], c: [382, 98, 34], d: [440, 268, 40], e: [304, 378, 34], f: [72, 295, 34],
};
const MARK_LINKS: Array<[string, string]> = [
  ["a", "hub"], ["a", "f"], ["f", "hub"], ["hub", "c"], ["c", "d"], ["hub", "d"], ["hub", "e"], ["e", "d"],
];
function Mark(props: { size: number }) {
  return (
    <svg className="mark" viewBox="12 -2 488 488" width={props.size} height={props.size} aria-hidden="true">
      <rect x="12" y="-2" width="488" height="488" rx="107" fill="#15161A" />
      <g transform="translate(256 242) scale(1.0157) translate(-259 -238)" fill="#B9A2FF" stroke="#B9A2FF">
        {MARK_LINKS.map(([from, to]) => (
          <line key={`${from}-${to}`} x1={MARK_NODES[from][0]} y1={MARK_NODES[from][1]} x2={MARK_NODES[to][0]} y2={MARK_NODES[to][1]} strokeWidth="26" strokeLinecap="round" />
        ))}
        {Object.entries(MARK_NODES).map(([id, [cx, cy, r]]) => <circle key={id} cx={cx} cy={cy} r={r} stroke="none" />)}
      </g>
    </svg>
  );
}

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Polynet home">
      <Mark size={28} />
      <span>Polynet</span>
    </a>
  );
}

// The hero's backdrop: a night sky in two layers, from the top bar down
// behind the product preview. As the page scrolls the sky moves slower than
// the page (the far layer slowest), which gives the hero depth.
function skyLayer(count: number, seed: number, rMin: number, rMax: number): Array<[number, number, number]> {
  let state = seed;
  const next = () => { state = (state * 9301 + 49297) % 233280; return state / 233280; };
  return Array.from({ length: count }, () => [Math.round(next() * 1440), Math.round(next() * 2400), +(rMin + next() * (rMax - rMin)).toFixed(2)]);
}
const FAR_STARS = skyLayer(110, 7, 0.45, 0.95);
const NEAR_STARS = skyLayer(42, 31, 0.8, 1.45);
// How much of the page's scroll each layer follows back: the far sky nearly stays put.
const SKY_DEPTH = { far: 0.78, near: 0.55 };

function StarField() {
  const far = useRef<SVGSVGElement | null>(null);
  const near = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const y = Math.min(window.scrollY, 2400);
      if (far.current) far.current.style.transform = `translate3d(0, ${y * SKY_DEPTH.far}px, 0)`;
      if (near.current) near.current.style.transform = `translate3d(0, ${y * SKY_DEPTH.near}px, 0)`;
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(place); };
    place();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (frame) window.cancelAnimationFrame(frame); };
  }, []);
  const layer = (ref: typeof far, stars: Array<[number, number, number]>, className: string) => (
    <svg ref={ref} className={`stars ${className}`} viewBox="0 0 1440 2400" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <g fill="#DFE6FF">
        {stars.map(([cx, cy, r], index) => (
          <circle key={index} className={index % 5 === 0 ? "star-twinkle" : undefined} style={index % 5 === 0 ? { animationDelay: `-${index * 0.37}s` } : undefined} cx={cx} cy={cy} r={r} />
        ))}
      </g>
    </svg>
  );
  return (
    <>
      {layer(far, FAR_STARS, "stars-far")}
      {layer(near, NEAR_STARS, "stars-near")}
    </>
  );
}

// The top bar's Product menu: what Polynet is made of, each entry a place
// that exists today (a home page section or a public page).
const PRODUCT_MENU: Array<Array<[string, string, string]>> = [
  [
    ["The guide", "Answers your members from your courses and past posts", "/#guide"],
    ["Community brain", "What your community learns, kept and connected", "/#brain"],
    ["Chief of Staff", "Morning briefs, member check-ins and reply drafts", "/#chief-of-staff"],
    ["Members board", "See every member's progress and who needs a nudge", "/#members-board"],
  ],
  [
    ["Community home", "Channels, messages, courses, events and pods", "/pricing#included"],
    ["Paid memberships", "Charge for access, with payouts straight to you", "/pricing#included"],
    ["Your own AI", "Bring Claude or ChatGPT into your community", "/ai"],
  ],
];
const PRODUCT_MENU_LINKS: Array<[string, string]> = [
  ["See it live", LIVE_COMMUNITY_PATH],
  ["Communities", "/discover"],
  ["Pricing", "/pricing"],
];

// The Resources menu: where to learn Polynet and get help.
const RESOURCES_MENU: Array<[string, string, string]> = [
  ["Use your own AI", "Connect Claude, ChatGPT or Cursor to your communities", "/ai"],
  ["The Polynet community", "Ask questions and learn alongside other builders", LIVE_COMMUNITY_PATH],
];
const RESOURCES_MENU_LINKS: Array<[string, string]> = [
  ["Questions", "/pricing#questions"],
  ["Contact support", `mailto:${SUPPORT_EMAIL}`],
  ["Terms", "/terms"],
  ["Privacy", "/privacy"],
];

// Only one top bar menu is ever open: opening one shuts the other at once,
// instead of letting it linger through its closing delay on top of the new
// one (Neil, Nov 26: they overlapped when moving from Product to Resources).
let shutOpenMenu: (() => void) | null = null;

// A top bar menu. It opens on hover or click; leaving waits a moment before
// closing, so crossing the gap between the button and the panel (or cutting a
// corner) never drops it. Escape, clicking elsewhere or tabbing out closes.
function NavMenu(props: { label: string; id: string; narrow?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && wrap.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);
  const leaving = useRef<number | null>(null);
  const stay = () => {
    if (leaving.current !== null) window.clearTimeout(leaving.current);
    leaving.current = null;
  };
  const close = () => { stay(); setOpen(false); };
  const closeSoon = () => {
    stay();
    leaving.current = window.setTimeout(() => { leaving.current = null; setOpen(false); }, 220);
  };
  const shut = useRef(close);
  shut.current = close;
  const shutThis = useRef(() => shut.current()).current;
  const show = () => {
    stay();
    if (shutOpenMenu && shutOpenMenu !== shutThis) shutOpenMenu();
    shutOpenMenu = shutThis;
    setOpen(true);
  };
  useEffect(() => () => { stay(); if (shutOpenMenu === shutThis) shutOpenMenu = null; }, [shutThis]);
  return (
    <div
      className="menu"
      ref={wrap}
      onMouseEnter={show}
      onMouseLeave={closeSoon}
      onBlur={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) close(); }}
    >
      {/* Hovering has already opened it by the time a click lands, so a click
          only ever opens. */}
      <button type="button" className={open ? "menu-button open" : "menu-button"} aria-expanded={open} aria-controls={props.id} onClick={show}>{props.label}</button>
      {open ? <div className={props.narrow ? "menu-panel narrow" : "menu-panel"} id={props.id}>{props.children(close)}</div> : null}
    </div>
  );
}

function ProductMenu() {
  return (
    <NavMenu label="Product" id="product-menu">
      {(close) => (
        <>
          <div className="menu-grid">
            {PRODUCT_MENU.map((column, index) => (
              <div key={index}>
                {column.map(([title, text, href]) => (
                  <a key={title} href={href} onClick={close}><b>{title}</b><span>{text}</span></a>
                ))}
              </div>
            ))}
            <div className="menu-plain">
              {PRODUCT_MENU_LINKS.map(([title, href]) => <a key={title} href={href} onClick={close}>{title}</a>)}
            </div>
          </div>
          <div className="menu-foot">
            <span><b>New</b> Three plans: Free, Guide and Chief of Staff</span>
            <a href="/pricing" onClick={close}>See pricing →</a>
          </div>
        </>
      )}
    </NavMenu>
  );
}

// On a phone or narrow window the top-bar links don't fit, so one menu button
// opens them all on a full-screen panel, in big type, grouped like the footer.
const PHONE_MENU: Array<[string, Array<[string, string]>]> = [
  ["Product", PRODUCT_MENU.flat().map(([title, , href]) => [title, href] as [string, string])],
  ["Polynet", [["Communities", "/discover"], ["Pricing", "/pricing"], ["See it live", LIVE_COMMUNITY_PATH]]],
  ["Resources", [["The Polynet community", LIVE_COMMUNITY_PATH], ["Questions", "/pricing#questions"], ["Contact support", `mailto:${SUPPORT_EMAIL}`]]],
];

function MenuIcon(props: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {props.open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 7h14M3 13h14" />}
    </svg>
  );
}

export function PhoneMenu(props: { onJoin: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    // The page behind stays put while the menu is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className="phone-menu">
      <button type="button" className="phone-menu-button" aria-expanded={open} aria-controls="phone-menu" aria-label="Open menu" onClick={() => setOpen(true)}>
        <MenuIcon open={false} />
      </button>
      {open ? (
        <div className="phone-menu-panel" id="phone-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="phone-menu-bar">
            <Brand />
            <button type="button" className="phone-menu-button" aria-label="Close menu" onClick={close}><MenuIcon open /></button>
          </div>
          {PHONE_MENU.map(([group, links]) => (
            <div className="phone-menu-group" key={group}>
              <span>{group}</span>
              {links.map(([title, href]) => (
                <a key={`${group}-${title}`} href={href} onClick={() => { if (href === "/discover") trackFind("phone_menu")(); close(); }}>{title}</a>
              ))}
            </div>
          ))}
          <div className="phone-menu-foot">
            <a href="/login">Sign in</a>
            <button className="cta" type="button" onClick={() => { close(); trackStart("phone_menu", props.onJoin)(); }}>Start a community</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ResourcesMenu() {
  return (
    <NavMenu label="Resources" id="resources-menu" narrow>
      {(close) => (
        <div className="menu-grid two">
          <div>
            {RESOURCES_MENU.map(([title, text, href]) => (
              <a key={title} href={href} onClick={close}><b>{title}</b><span>{text}</span></a>
            ))}
          </div>
          <div className="menu-plain">
            {RESOURCES_MENU_LINKS.map(([title, href]) => <a key={title} href={href} onClick={close}>{title}</a>)}
          </div>
        </div>
      )}
    </NavMenu>
  );
}

// Header and footer shared by every public page.
export function PublicFrame(props: { onJoin: () => void; children: ReactNode }) {
  return (
    <div className="pn-landing">
      <div className="page">
        <header className="topbar">
          <Brand />
          <nav className="topbar-links" aria-label="Site">
            <ProductMenu />
            <ResourcesMenu />
            <a href="/discover" onClick={trackFind("header")}>Communities</a>
            <a href="/pricing">Pricing</a>
          </nav>
          <nav aria-label="Account">
            <a href="/login">Sign in</a>
            <button className="cta cta-small" type="button" onClick={trackStart("header", props.onJoin)}>
              <span className="long">Start a community</span><span className="short" aria-hidden="true">Start</span>
            </button>
            <PhoneMenu onJoin={props.onJoin} />
          </nav>
        </header>

        <main>{props.children}</main>

        <footer className="footer">
          <div className="footer-cols">
            <div className="footer-identity">
              <Brand />
              <span>Communities that think.</span>
            </div>
            <nav aria-label="Product">
              <b>Product</b>
              {PRODUCT_MENU.flat().map(([title, , href]) => <a key={title} href={href}>{title}</a>)}
            </nav>
            <nav aria-label="Polynet">
              <b>Polynet</b>
              <a href="/pricing">Pricing</a>
              <a href="/discover" onClick={trackFind("footer")}>Communities</a>
              <a href={LIVE_COMMUNITY_PATH}>See it live</a>
              <a href="/login">Sign in</a>
            </nav>
            <nav aria-label="Resources">
              <b>Resources</b>
              <a href="/ai">Use your own AI</a>
              <a href={LIVE_COMMUNITY_PATH}>The Polynet community</a>
              <a href="/pricing#questions">Questions</a>
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </nav>
            <nav aria-label="Legal">
              <b>Legal</b>
              <a href="/terms">Terms</a>
              <a href="/privacy">Privacy</a>
            </nav>
          </div>
          <div className="footer-base">
            <span>© 2026 Polynet. Operated by {OPERATOR_NAME}.</span>
            <button type="button" onClick={trackStart("footer", props.onJoin)}>Start a community →</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// The three plans. A plan button remembers the plan, so it is offered first
// once the community exists.
export function PlanCards(props: { onJoin: () => void; placement: string }) {
  return (
    <div className="cards three plans">
      {LANDING_PLANS.map((plan) => (
        <article className={plan.lit ? "card plan lit" : "card plan"} key={plan.name}>
          <header>
            <h3>{plan.name}{plan.lit ? <span className="recommended">Recommended</span> : null}</h3>
            <p>{plan.line}</p>
          </header>
          <p className="price"><strong>{plan.price}</strong> {plan.per}</p>
          <ul>
            {plan.points.map((point) => <li key={point}>{point}</li>)}
            {plan.ai ? <li className="ai">{plan.ai}</li> : null}
          </ul>
          {plan.note ? <p className="plan-note">{plan.note}</p> : null}
          <button className={plan.lit ? "cta" : "cta-secondary"} type="button" onClick={trackStart(`${props.placement}_${plan.name.toLowerCase().replace(/\s+/g, "_")}`, props.onJoin, plan.tier)}>{plan.button}</button>
        </article>
      ))}
    </div>
  );
}

// Pricing, the questions and the six "included" items moved to /pricing;
// links people saved to their old places on the home page follow them there.
const MOVED_TO_PRICING: Record<string, string> = {
  "#pricing": "/pricing",
  "#pricing-title": "/pricing",
  "#questions": "/pricing#questions",
  "#questions-title": "/pricing#questions",
  "#included": "/pricing#included",
  "#included-title": "/pricing#included",
};
export function movedToPricing(hash: string): string | null {
  return MOVED_TO_PRICING[hash] ?? null;
}

// Sections fade in once as they come into view. Without the observer (or with
// motion turned down) everything is simply there.
// `late` changes when a section arrives after the first draw, so that
// section is watched too and never stays hidden.
function useReveal(late: unknown) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const seen = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-in", "1");
        seen.unobserve(entry.target);
      }
    }, { threshold: 0.12 });
    root.setAttribute("data-anim", "1");
    root.querySelectorAll("[data-rv]:not([data-in])").forEach((node) => seen.observe(node));
    return () => {
      seen.disconnect();
      root.removeAttribute("data-anim");
    };
  }, [late]);
  return ref;
}

// The hero's second button (Neil, Nov 27): set Polynet up from your own AI.
// It copies the official setup prompt (shared/polynetMcpSetup.ts) for this
// site's MCP address; pasted into Claude, ChatGPT, Codex, Cursor and the rest,
// it adds Polynet and walks you through signing in. Without a clipboard, it
// opens the page that explains the setup.
function CopySetupPrompt() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    captureProductAnalyticsEvent("setup_prompt_copied", { placement: "hero" });
    try {
      await navigator.clipboard.writeText(buildPolynetMcpSetupForOrigin(window.location.origin).setupBundle);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2600);
    } catch {
      window.location.assign("/ai");
    }
  };
  return (
    <button type="button" className="cta-setup" onClick={() => { void copy(); }} aria-live="polite">
      <Copy size={14} aria-hidden="true" />{copied ? "Copied. Paste it into your AI" : "Copy setup prompt"}
    </button>
  );
}

export function ConversionLanding({ onJoin }: JoinProps) {
  const reveal = useReveal(null);

  useEffect(() => {
    const moved = movedToPricing(window.location.hash);
    if (moved) {
      window.location.replace(moved);
      return;
    }
    captureProductAnalyticsEvent("home_viewed");
  }, []);

  return (
    <PublicFrame onJoin={onJoin}>
      <div ref={reveal} className="landing-body">
        <section className="hero" aria-labelledby="hero-title">
          <StarField />
          <div className="hero-text">
            <h1 id="hero-title">A normal community forgets.<br /><b>Yours will think.</b></h1>
            <p className="subhead">Give your people a home with its own AI. It answers them, remembers them, and helps you run the place.</p>
            <div className="doors">
              <button className="cta" type="button" onClick={trackStart("hero", onJoin)}>Start a community</button>
              <CopySetupPrompt />
            </div>
            <HarnessStack />
            <p className="microcopy">{LANDING_OFFER_LINE}</p>
          </div>
          {/* The product sits inside the hero, so the night sky runs down behind it. */}
          <div className="product" id="how" aria-label="The product" role="region" data-rv>
            <Suspense fallback={<div className="rp rp-wait" aria-hidden="true" />}>
              <RealAppPreview />
            </Suspense>
          </div>
        </section>

        <StatementFigures />

        <FeatureSection id="guide" title={["An answer for every", "member, at any hour."]} sceneLabel="Try the guide: pick a member's question, read the answer, and see the lesson, channel or event it points to"
          live={<Suspense fallback={<div className="gsc-wait" />}><GuideScene /></Suspense>}
          features={["A private guide for every member", "Replies when tagged in a channel", "Points to the lesson, channel or event it means"]}>
          Members ask the same questions again and again, and every one lands on you. Polynet gives each member a private guide. It answers from your courses, notes and past discussions, at any hour, and points to the lesson, channel or event where the answer lives.
        </FeatureSection>

        <FeatureSection id="brain" title={["Every good answer,", "kept and found again."]} sceneLabel="Try the community brain: click a node or something it learned, see the posts it came from, and correct or remove it"
          live={<Suspense fallback={<div className="gsc-wait" />}><BrainScene /></Suspense>}
          features={["A map of what your community knows", "Notes the guide writes from posts and conversations", "Every note shows where it came from", "Correct or remove any note"]}>
          A great answer gets posted once, sinks into an old thread, and the next member asks all over again. Polynet keeps it. The guide turns helpful answers into notes on one map, filed under your lessons, so what one member figures out, the next one finds.
        </FeatureSection>

        <FeatureSection id="chief-of-staff" title={["Catch members", "before they drift away."]} sceneLabel="Try the Chief of Staff: read the 8am brief, then send, edit or skip the check-in for a quiet member and the reply drafted for an unanswered question"
          live={<Suspense fallback={<div className="gsc-wait" />}><ChiefScene /></Suspense>}
          features={["A morning brief at 8am, when you turn it on", "Check-ins for quiet members", "Drafts for questions nobody answered", "Send, edit or skip", "Monthly AI credits you control"]}>
          In most communities you only find out someone's gone when they cancel. Polynet sees it early: the new member who never said hello, the one stuck halfway through a course, the regular who's gone quiet. Your chief of staff drafts the right nudge for each, and you send it, change it or skip it.
        </FeatureSection>

        <FeatureSection id="members-board" title={["See who's getting", "real results."]} sceneLabel="Try the members board: move a member on, filter who needs you, and see what the guide did on each card"
          live={<Suspense fallback={<div className="gsc-wait" />}><BoardScene /></Suspense>}
          features={["Every member's progress, stage by stage", "Checkpoints that tick themselves", "Wins logged on each member", "A green arrow when someone's ready to move on", "Optional Auto-move when every checkpoint is done", "Follow-ups drafted, or sent for the kinds you allow", "Board highlights in your morning brief"]}>
          Most hosts can't tell who's actually getting results until someone posts a win or cancels. The members board shows every member's path, from the day they join to the result your community promises. Checkpoints tick themselves as they post and finish lessons. When someone stalls, your chief of staff follows up and marks it on their card. When someone finishes a stage, a green arrow appears by their name: press it to move them on, or turn on Auto-move.
        </FeatureSection>

        <section className="plans-line" aria-labelledby="plans-line-title" data-rv>
          <div className="plans-line-head">
            <h2 id="plans-line-title">Free to build. Add an AI when you're ready.</h2>
            <a className="more" href="/pricing" onClick={() => captureProductAnalyticsEvent("compare_plans_clicked", { placement: "home" })}>Compare plans →</a>
          </div>
          <PlanCards onJoin={onJoin} placement="home" />
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <h2 id="closing-title">Your community is one name away.</h2>
          <button className="cta" type="button" onClick={trackStart("closing", onJoin)}>Start a community</button>
        </section>
      </div>
    </PublicFrame>
  );
}
