import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

import { formatPlanPrice } from "../../../../../shared/accountCommerce";
import { listCloudDiscoverCommunities } from "../../../../../shared/cloudDiscoverGateway";
import type { DiscoverCommunitySnapshot } from "../../../../../shared/communityTypes";
import {
  POLYNET_COMMUNITY_PLATFORM_FEE_BPS,
  POLYNET_FOUNDER_TIER_CATALOG,
  type FounderPlanTier,
} from "../../../../../shared/founderPlan";
import { rememberLandingPlanChoice } from "../../../../../shared/landingPlanChoice";
import { StableFramedMedia } from "../../../../../shared/StableFramedMedia";
import { brainScene, chiefScene, FeatureSection, guideScene, StatementFigures } from "./LandingScenes";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";

type JoinProps = { onJoin: () => void };

// The prices and included AI come from the same numbers checkout charges.
const dollars = (baseUnits: number) => `$${baseUnits / 100}`;
const aiDollars = (micros: number) => `$${micros / 1_000_000}`;
const GUIDE = POLYNET_FOUNDER_TIER_CATALOG.guide;
const CHIEF = POLYNET_FOUNDER_TIER_CATALOG.chief_of_staff;
export const LANDING_OFFER_LINE =
  `Free to build · Guide ${dollars(GUIDE.monthlyPriceBaseUnits)}/mo · Chief of Staff ${dollars(CHIEF.monthlyPriceBaseUnits)}/mo`;
export const FEE = `${POLYNET_COMMUNITY_PLATFORM_FEE_BPS / 100}%`;

type Plan = { tier: FounderPlanTier | null; name: string; line: string; price: string; per: string; points: string[]; ai: string | null; note?: string; button: string; lit?: boolean };
export const LANDING_PLANS: Plan[] = [
  {
    tier: null, name: "Free", line: "Run your community", price: "$0", per: "/ month", ai: null, button: "Start free",
    points: ["Unlimited members", "Channels, messages, courses, events and pods", "Paid memberships and weekly digest emails", "Connect your own Claude or ChatGPT"],
  },
  {
    tier: "guide", name: GUIDE.label, line: "It answers and remembers", price: dollars(GUIDE.monthlyPriceBaseUnits), per: "/ month per community",
    button: `Start with ${GUIDE.label}`,
    ai: `${aiDollars(GUIDE.includedCostMicros)} of AI included each month`,
    points: ["Everything in Free", "A private guide for every member", "Replies when tagged in channels", "A community brain that keeps what's learned"],
  },
  {
    tier: "chief_of_staff", name: CHIEF.label, line: "It helps run the place", price: dollars(CHIEF.monthlyPriceBaseUnits), per: "/ month per community", lit: true,
    button: `Start with ${CHIEF.label}`,
    note: "Less than a few hours of a community manager's time, every month.",
    ai: `${aiDollars(CHIEF.includedCostMicros)} of AI included each month; add more if you need it`,
    points: ["Everything in Guide", "A morning brief for you", "Member check-ins and win-backs", "Reply drafts for unanswered questions"],
  },
];

export const INCLUDED: Array<[string, string]> = [
  ["Channels and messages", "Group channels, threaded replies and a calm inbox."],
  ["Courses and knowledge", "Publish lessons, see who's progressing, attach notes and files."],
  ["Events", "One-off or recurring sessions, with reminders."],
  ["Pods", "Give cohorts or small groups their own room and calls."],
  ["Paid memberships", "Charge for access, with payouts straight to you through Stripe."],
  ["Works with your own AI", "Connect Claude or ChatGPT. It acts inside your permissions."],
];

export const QUESTIONS: Array<[string, string]> = [
  ["Is the Free plan really free?", "Yes. Unlimited members, courses, channels, pods and events, with no time limit. You pay only if you turn on Guide or Chief of Staff, or when you sell memberships."],
  ["What happens at the monthly AI limit?", "The AI pauses until your next billing cycle. You never get a surprise bill. On Chief of Staff you can turn on prepaid boosts, under a monthly cap you set."],
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

// Visitors only see communities that look finished: a banner and a one-liner.
const SHOWCASE_LIMIT = 8;

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

// The hero's picture: the Earth's horizon at night, and lines of violet light
// spreading from one bright point (the community's AI) to its people.
const ARCS: Array<[string, number, number, number, number]> = [
  ["M720 690 Q560 470 300 792", 0.9, 300, 792, 4], ["M720 690 Q600 560 448 738", 0.6, 448, 738, 4],
  ["M720 690 Q650 660 590 764", 0.35, 590, 764, 3.6], ["M720 690 Q800 620 860 746", 0.45, 860, 746, 4],
  ["M720 690 Q900 520 1010 776", 0.75, 1010, 776, 4], ["M720 690 Q980 420 1178 834", 1.05, 1178, 834, 3.6],
  ["M720 690 Q680 770 662 832", 0.55, 662, 832, 3.4], ["M720 690 Q770 780 802 852", 0.65, 802, 852, 3.4],
];
const STARS: Array<[number, number, number]> = [
  [96, 84, 1.3], [212, 168, 0.8], [338, 62, 1.1], [470, 214, 0.7], [560, 96, 1.4], [842, 58, 1], [968, 182, 0.8], [1096, 88, 1.3],
  [1238, 150, 1], [1356, 72, 1.2], [60, 300, 0.8], [182, 392, 1], [1290, 320, 0.9], [1392, 430, 1.1], [1150, 262, 0.7], [284, 270, 0.7],
  [700, 40, 0.8], [1010, 330, 0.7], [420, 356, 0.7],
];
const CITY_LIGHTS: Array<[number, number, number]> = [
  [296, 792, 1.7], [308, 800, 1.1], [286, 806, 1], [318, 812, 1.3], [330, 796, 0.9], [446, 738, 1.6], [458, 748, 1.1], [436, 752, 1],
  [468, 742, 0.9], [452, 762, 1], [588, 764, 1.5], [600, 774, 1], [578, 778, 0.9], [610, 760, 0.9], [706, 700, 1.4], [738, 706, 1.1],
  [694, 716, 1], [748, 722, 1], [858, 746, 1.6], [872, 756, 1.1], [848, 760, 1], [882, 748, 0.9], [1008, 776, 1.5], [1022, 786, 1],
  [998, 790, 0.9], [1176, 834, 1.5], [1190, 842, 1], [660, 832, 1.2], [800, 852, 1.2], [520, 850, 1], [940, 868, 1], [380, 868, 1],
];

function OrbitScene() {
  return (
    <svg className="orbit" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <radialGradient id="pnEarth" gradientUnits="userSpaceOnUse" cx="560" cy="820" r="1000"><stop offset="0" stopColor="#172646" /><stop offset=".45" stopColor="#0B1326" /><stop offset="1" stopColor="#03050A" /></radialGradient>
        <radialGradient id="pnAtmo" gradientUnits="userSpaceOnUse" cx="720" cy="1780" r="1230"><stop offset=".912" stopColor="#6E8FFF" stopOpacity="0" /><stop offset=".922" stopColor="#8FB0FF" stopOpacity=".55" /><stop offset=".94" stopColor="#B9A2FF" stopOpacity=".22" /><stop offset="1" stopColor="#7C5CF0" stopOpacity="0" /></radialGradient>
        <linearGradient id="pnRim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9DB8FF" stopOpacity="0" /><stop offset=".3" stopColor="#BFD0FF" stopOpacity=".9" /><stop offset=".55" stopColor="#E4DAFF" /><stop offset=".8" stopColor="#9DB8FF" stopOpacity=".5" /><stop offset="1" stopColor="#9DB8FF" stopOpacity="0" /></linearGradient>
        <radialGradient id="pnHub" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#FFFFFF" /><stop offset=".18" stopColor="#E4DAFF" stopOpacity=".95" /><stop offset=".5" stopColor="#A78BFA" stopOpacity=".45" /><stop offset="1" stopColor="#7C5CF0" stopOpacity="0" /></radialGradient>
        <radialGradient id="pnHaze" gradientUnits="userSpaceOnUse" cx="720" cy="700" r="520"><stop offset="0" stopColor="#7C5CF0" stopOpacity=".34" /><stop offset=".6" stopColor="#7C5CF0" stopOpacity=".07" /><stop offset="1" stopColor="#7C5CF0" stopOpacity="0" /></radialGradient>
        <linearGradient id="pnFade" x1="0" y1="0" x2="0" y2="1"><stop offset=".8" stopColor="#08090A" stopOpacity="0" /><stop offset="1" stopColor="#08090A" /></linearGradient>
        <filter id="pnBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6" /></filter>
        <clipPath id="pnClip"><circle cx="720" cy="1780" r="1130" /></clipPath>
      </defs>
      <g fill="#DFE6FF">
        {STARS.map(([cx, cy, r], index) => (
          <circle key={index} className={index % 4 === 0 ? "orbit-star" : undefined} style={index % 4 === 0 ? { animationDelay: `-${index * 0.4}s` } : undefined} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      <circle cx="720" cy="700" r="520" fill="url(#pnHaze)" />
      <circle cx="720" cy="1780" r="1230" fill="url(#pnAtmo)" />
      <circle cx="720" cy="1780" r="1130" fill="url(#pnEarth)" />
      <circle cx="720" cy="1780" r="1131" fill="none" stroke="url(#pnRim)" strokeWidth="10" opacity=".5" filter="url(#pnBlur)" />
      <circle cx="720" cy="1780" r="1130.5" fill="none" stroke="url(#pnRim)" strokeWidth="1.6" />
      <g clipPath="url(#pnClip)" fill="#FFC98A" opacity=".82">
        {CITY_LIGHTS.map(([cx, cy, r], index) => <circle key={index} cx={cx} cy={cy} r={r} />)}
      </g>
      <g fill="none" stroke="#C4B5FD" strokeWidth="1.5" strokeLinecap="round">
        {ARCS.map(([d, delay], index) => <path key={index} className="orbit-arc" pathLength={1} style={{ animationDelay: `${delay}s` }} d={d} />)}
      </g>
      {/* Where each line lands is a person: a face-sized dot in a faint ring. */}
      <g fill="#EDE5FF">
        {ARCS.map(([, delay, cx, cy, r], index) => (
          <Fragment key={index}>
            <circle className="orbit-ring" style={{ animationDelay: `${delay + 1.3}s` }} cx={cx} cy={cy} r={r * 2.6} />
            <circle className="orbit-node" style={{ animationDelay: `${delay + 1.3}s` }} cx={cx} cy={cy} r={r * 1.5} />
          </Fragment>
        ))}
      </g>
      <circle className="orbit-hub" cx="720" cy="690" r="86" fill="url(#pnHub)" />
      <circle cx="720" cy="690" r="7.5" fill="#FFFFFF" />
      <rect width="1440" height="900" fill="url(#pnFade)" />
    </svg>
  );
}

// What the community knows, as the app draws it: clusters around a bright centre.
function BrainPicture(props: { small?: boolean }) {
  const spokes: Array<[number, number, Array<[number, number]>]> = [
    [130, 60, [[96, 38], [90, 72], [140, 28], [164, 46], [112, 94]]],
    [346, 64, [[320, 38], [358, 30], [384, 48], [382, 84], [326, 96]]],
    [222, 184, [[182, 170], [176, 200], [200, 216], [236, 218], [268, 206], [270, 176]]],
  ];
  return (
    <svg className={props.small ? "brain small" : "brain"} viewBox="60 14 380 216" role="img" aria-label="A map of what the community knows, in clusters around a glowing centre">
      <defs><radialGradient id={props.small ? "pnBrainS" : "pnBrain"} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#C2A9FF" stopOpacity=".75" /><stop offset="1" stopColor="#7C5CF0" stopOpacity="0" /></radialGradient></defs>
      <g fill="none" stroke="#3A3D46" strokeWidth="1.2">
        {spokes.map(([x, y, leaves], index) => (
          <Fragment key={index}>
            <line x1="240" y1="112" x2={x} y2={y} />
            {leaves.map(([lx, ly], leaf) => <line key={leaf} x1={x} y1={y} x2={lx} y2={ly} />)}
          </Fragment>
        ))}
        <path d="M240 112 Q352 162 416 150" />
      </g>
      <circle cx="240" cy="112" r="42" fill={`url(#${props.small ? "pnBrainS" : "pnBrain"})`} />
      <circle cx="240" cy="112" r="7.5" fill="#FFFFFF" />
      {spokes.map(([x, y, leaves], index) => (
        <Fragment key={index}>
          {leaves.map(([lx, ly], leaf) => <circle key={leaf} cx={lx} cy={ly} r="3.6" fill={index === 1 ? "#EEF0F4" : "#8A8F98"} />)}
          <circle cx={x} cy={y} r="6" fill="#EEF0F4" />
        </Fragment>
      ))}
      <circle cx="416" cy="150" r="4.5" fill="#C4B5FD" />
    </svg>
  );
}

function BriefCard(props: { action: ReactNode; line: string; big?: boolean }) {
  return (
    <>
      <span className="shot-eyebrow">Your guide · 9:24 am</span>
      <strong className={props.big ? "shot-hello big" : "shot-hello"}>Good morning.</strong>
      <span className="shot-text">{props.line}</span>
      <div className="shot-ask">
        <div><b>Check in with Josh</b><span>Quiet for 25 days · next call is Friday</span></div>
        <div className="shot-acts">{props.action}</div>
      </div>
    </>
  );
}

// The app itself, drawn small: left menu, the morning brief, the brain beside it.
function ProductShot() {
  return (
    <div className="shot" role="img" aria-label="Polynet's Home: the left menu, the guide's morning brief, and the community brain">
      <div className="shot-side" aria-hidden="true">
        <b>Polynet</b>
        <span className="on">Home</span><span>Inbox</span>
        <em>Channels</em><span># General</span><span># wins</span>
        <em>Community</em><span>Knowledge</span><span>Events</span><span>Members</span>
      </div>
      <div className="shot-main" aria-hidden="true">
        <BriefCard big line="Two people finished Start here. Dev asked about pricing overnight and got an answer. One person needs you." action={<i>Review</i>} />
        <div className="shot-box">Ask your guide anything</div>
      </div>
      <div className="shot-rail" aria-hidden="true">
        <em>The community brain</em>
        <BrainPicture small />
        <span>1 learned · 1 new this week</span>
      </div>
    </div>
  );
}

function Showcase(props: { communities: DiscoverCommunitySnapshot[] }) {
  if (props.communities.length === 0) return null;
  return (
    <section className="showcase" id="communities" aria-labelledby="showcase-title" data-rv>
      <div className="showcase-head">
        <h2 id="showcase-title" className="label">Communities on Polynet</h2>
        <a className="more" href="/discover" onClick={trackFind("home_showcase")}>See all communities →</a>
      </div>
      <div className="showcase-row">
        {props.communities.map((community) => (
          <a
            className="showcase-card"
            key={community.id}
            href={`/c/${community.slug}`}
            onClick={() => captureProductAnalyticsEvent("community_card_opened", { community_id: community.id, placement: "home" })}
          >
            <StableFramedMedia
              className="showcase-banner"
              imageUrl={community.banner_url}
              frame={{
                focusX: community.banner_focus_x,
                focusY: community.banner_focus_y,
                zoom: community.banner_zoom,
              }}
              alt=""
              loading="lazy"
              aria-hidden
            />
            <span className="showcase-body">
              <strong>{community.name}</strong>
              <span>{community.one_liner}</span>
              <em>{community.active_plan ? formatPlanPrice(community.active_plan) : "Free"}</em>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

// The top bar's Product menu: what Polynet is made of, each entry a place
// that exists today (a home page section or a public page).
const PRODUCT_MENU: Array<Array<[string, string, string]>> = [
  [
    ["The guide", "Answers your members from your courses and past posts", "/#guide"],
    ["Community brain", "What your community learns, kept and connected", "/#brain"],
    ["Chief of Staff", "Morning briefs, member check-ins and reply drafts", "/#chief-of-staff"],
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
  useEffect(() => stay, []);
  return (
    <div
      className="menu"
      ref={wrap}
      onMouseEnter={() => { stay(); setOpen(true); }}
      onMouseLeave={closeSoon}
      onBlur={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) close(); }}
    >
      {/* Hovering has already opened it by the time a click lands, so a click
          only ever opens. */}
      <button type="button" className={open ? "menu-button open" : "menu-button"} aria-expanded={open} aria-controls={props.id} onClick={() => setOpen(true)}>{props.label}</button>
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
            <button className="cta cta-small" type="button" onClick={trackStart("header", props.onJoin)}>Start a community</button>
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
// `late` changes when a section arrives after the first draw (the community
// showcase), so that section is watched too and never stays hidden.
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

export function ConversionLanding({ onJoin }: JoinProps) {
  const [communities, setCommunities] = useState<DiscoverCommunitySnapshot[]>([]);
  const reveal = useReveal(communities.length);
  const guide = guideScene();
  const brain = brainScene();
  const chief = chiefScene();

  useEffect(() => {
    const moved = movedToPricing(window.location.hash);
    if (moved) {
      window.location.replace(moved);
      return;
    }
    captureProductAnalyticsEvent("home_viewed");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listCloudDiscoverCommunities({ limit: 24 })
      .then((all) => {
        if (cancelled) return;
        setCommunities(
          all
            .filter((community) => community.banner_url && community.one_liner?.trim())
            .sort((a, b) => (Date.parse(b.last_active_at ?? "") || 0) - (Date.parse(a.last_active_at ?? "") || 0))
            .slice(0, SHOWCASE_LIMIT),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PublicFrame onJoin={onJoin}>
      <div ref={reveal} className="landing-body">
        <section className="hero" aria-labelledby="hero-title">
          <OrbitScene />
          <div className="hero-text">
            <h1 id="hero-title">A normal community forgets.<br /><b>Yours will think.</b></h1>
            <p className="subhead">Give your people a home with its own AI. It answers them, remembers them, and helps you run the place.</p>
            <div className="doors">
              <button className="cta" type="button" onClick={trackStart("hero", onJoin)}>Start a community</button>
              <a className="cta-quiet" href={LIVE_COMMUNITY_PATH} onClick={() => captureProductAnalyticsEvent("see_it_live_clicked", { placement: "hero" })}>See it live</a>
            </div>
            <p className="microcopy">{LANDING_OFFER_LINE}</p>
          </div>
        </section>

        <section className="product" id="how" aria-label="The product" data-rv>
          <ProductShot />
          <p className="caption">One workspace for your members, your courses, your events and your community's memory.</p>
        </section>

        <StatementFigures />

        <FeatureSection id="guide" plan="Guide" title={["Answers", "for every member"]} sceneLabel="A member asks the guide a question at night and gets an answer that points to a lesson" {...guide}
          features={["Private guide for each member", "Replies when tagged in channels", "Answers with their source", "Follow-ups in active threads"]}>
          Stop answering the same question twice. Every member gets a private guide that answers from your courses, notes and past discussions, at 2am, without you.
        </FeatureSection>

        <FeatureSection id="brain" plan="Guide · Community brain" title={["A memory", "that builds"]} sceneLabel="A map of what the community knows, beside a list of what it learned this week" {...brain}
          features={["Community brain map", "Learned from courses and posts", "Memory for each member", "Yours to read and correct"]}>
          Your best answers stop disappearing. Courses, notes and helpful answers connect into one memory you can see, so what one member solves, the next one finds.
        </FeatureSection>

        <FeatureSection id="chief-of-staff" plan="Chief of Staff" title={["Morning briefs", "and check-ins"]} sceneLabel="The morning brief, with a drafted check-in for a quiet member who is lit in the members list behind it" {...chief}
          features={["Morning brief", "Member check-ins", "Win-backs", "Reply drafts", "Approve, edit or skip", "Usage and limits"]}>
          Know who's slipping before they cancel. Your chief of staff checks in on quiet members and drafts replies to unanswered questions, then waits for your yes.
        </FeatureSection>

        <Showcase communities={communities} />

        <section className="plans-line" aria-labelledby="plans-line-title" data-rv>
          <div className="plans-line-head">
            <h2 id="plans-line-title">Free to build. Add an AI when you're ready.</h2>
            <a className="more" href="/pricing" onClick={() => captureProductAnalyticsEvent("compare_plans_clicked", { placement: "home" })}>Compare plans →</a>
          </div>
          <div className="plans-line-row">
            {LANDING_PLANS.map((plan) => (
              <a className={plan.lit ? "plans-line-item lit" : "plans-line-item"} href="/pricing" key={plan.name}>
                <b>{plan.name}{plan.lit ? <span className="recommended">Recommended</span> : null}</b>
                <span className="plans-line-price"><strong>{plan.price}</strong> / month</span>
                <span>{plan.line}</span>
              </a>
            ))}
          </div>
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <h2 id="closing-title">Your community is one name away.</h2>
          <button className="cta" type="button" onClick={trackStart("closing", onJoin)}>Start a community</button>
        </section>
      </div>
    </PublicFrame>
  );
}
